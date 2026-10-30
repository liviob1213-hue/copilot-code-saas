// ============================================================================
// _lib.js — pecas comuns das funcoes de servidor
// ----------------------------------------------------------------------------
// Arquivos comecados com "_" nao viram endereco na Vercel: isto aqui e so
// biblioteca, ninguem consegue chamar de fora.
//
// POR QUE ESTAS FUNCOES EXISTEM: o app e 100% navegador, e navegador nao
// guarda segredo. Tudo que precisa de uma chave secreta (mexer no plano de
// alguem, usar a chave de IA da casa) tem que acontecer aqui, no servidor.
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

/**
 * Cliente do Supabase com a chave service_role: passa por cima do RLS e pode
 * escrever plano e cota. ESTA CHAVE NUNCA PODE IR PRO NAVEGADOR — por isso o
 * nome dela nao comeca com VITE_.
 */
export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new Error("Faltam as variaveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(url, chave, { auth: { persistSession: false } });
}

/** Mesma normalizacao do banco (supabase/contas.sql), repetida aqui. */
export function normalizarEmail(e) {
  const inteiro = String(e || "").trim().toLowerCase();
  const arroba = inteiro.lastIndexOf("@");
  if (arroba < 1) return inteiro;
  const local = inteiro.slice(0, arroba);
  const dominio = inteiro.slice(arroba + 1);
  const semMais = local.split("+")[0];
  if (dominio === "gmail.com" || dominio === "googlemail.com") {
    return semMais.replace(/\./g, "") + "@gmail.com";
  }
  return semMais + "@" + dominio;
}

/** Le o corpo cru da requisicao. Precisa ser CRU para conferir a assinatura. */
export async function corpoCru(req) {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  const pedacos = [];
  for await (const p of req) pedacos.push(p);
  return Buffer.concat(pedacos).toString("utf8");
}

/**
 * Compara dois textos sem vazar, pelo tempo de resposta, quantos caracteres
 * batiam. Em conferencia de assinatura isso importa.
 */
export function iguaisEmTempoConstante(a, b) {
  const x = Buffer.from(String(a || ""), "utf8");
  const y = Buffer.from(String(b || ""), "utf8");
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

/**
 * Descobre quem esta chamando, pelo token do Supabase mandado no cabecalho
 * Authorization. Devolve o usuario ou null. Nunca confie num e-mail que vem
 * no corpo do pedido: so vale o que o token prova.
 */
export async function usuarioDoToken(req) {
  const cab = req.headers?.authorization || req.headers?.Authorization || "";
  const token = String(cab).replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    const { data, error } = await supabaseAdmin().auth.getUser(token);
    if (error) return null;
    return data?.user || null;
  } catch {
    return null;
  }
}

/** A lista de quem pode liberar acesso na mao (variavel ADMIN_EMAILS). */
export function ehAdmin(email) {
  const lista = String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => normalizarEmail(e))
    .filter(Boolean);
  if (!lista.length) return false;
  return lista.includes(normalizarEmail(email));
}

export function json(res, status, corpo) {
  res.status(status).setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(corpo));
}

// ============================================================================
//  O PASSE DA CHAVE DA CASA
// ----------------------------------------------------------------------------
//  As chaves de IA gratuitas da casa vivem no Cloudflare Worker, nao aqui.
//  POR QUE EM DOIS LUGARES, e nao tudo na Vercel:
//
//    - Quem decide SE a pessoa pode usar a chave da casa e aqui, porque e aqui
//      que mora a chave service_role do Supabase (a que le o plano e gasta o
//      slot). Essa decisao e rapida: uma consulta e pronto.
//    - Quem ESPERA a IA escrever o projeto e o Worker, porque escrever um site
//      leva minutos e funcao de servidor tem prazo curto pra responder. O
//      Worker aguenta a espera e vai repassando a resposta em tempo real.
//
//  O passe e o bilhete que liga os dois: este servidor assina "o usuario X
//  pode usar a chave da casa do provedor Y ate tal hora", e o Worker confere a
//  assinatura antes de emprestar a chave. Os dois lados usam o MESMO segredo
//  (variavel PASSE_IA_SEGREDO) — ele nunca sai de nenhum dos dois.
//
//  Validade curta de proposito (2 minutos): o passe vale UMA chamada de IA, e
//  cada chamada passa por aqui antes, gastando a cota. Uma janela curta mantem
//  o gasto honesto sem precisar de banco no Worker.
// ============================================================================

/** Os quatro servicos gratuitos que a casa empresta. */
export const PROVEDORES_DA_CASA = ["gemini", "openrouter", "groq", "mistral"];

export const PASSE_VALIDADE_MS = 2 * 60 * 1000;

function base64url(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Monta o passe assinado. Formato: <dados em base64>.<assinatura em base64>.
 * Devolve "" quando o segredo nao esta configurado — quem chama trata isso
 * como "chave da casa desligada" e manda a pessoa usar a chave dela.
 */
export function assinarPasse({ usuarioId, provedor, pago }) {
  const segredo = process.env.PASSE_IA_SEGREDO || "";
  if (!segredo) return "";
  const dados = {
    u: String(usuarioId),
    p: String(provedor),
    pg: Boolean(pago),
    exp: Date.now() + PASSE_VALIDADE_MS
  };
  const corpo = base64url(JSON.stringify(dados));
  const assinatura = base64url(
    crypto.createHmac("sha256", segredo).update(corpo).digest()
  );
  return `${corpo}.${assinatura}`;
}

export function casaConfigurada() {
  return Boolean(process.env.PASSE_IA_SEGREDO);
}

/**
 * Grava o plano de alguem pelo e-mail. Usado tanto pelo webhook da Kiwify
 * quanto pela liberacao manual.
 *
 * Se a pessoa AINDA NAO TEM CONTA, grava mesmo assim numa lista de espera
 * (tabela acessos_pendentes): no dia em que ela se cadastrar com aquele
 * e-mail, ja entra com o plano certo. Sem isso, quem paga antes de criar a
 * conta ficaria no plano gratis — o erro mais comum desse tipo de integracao.
 */
export async function definirPlanoPorEmail({ email, plano, expiraEm = null, origem }) {
  const sb = supabaseAdmin();
  const norm = normalizarEmail(email);
  if (!norm) return { ok: false, motivo: "e-mail vazio" };

  const { data: perfis, error } = await sb
    .from("perfis")
    .select("id, email")
    .eq("email_normalizado", norm);

  if (error) return { ok: false, motivo: error.message };

  if (perfis && perfis.length) {
    const { error: e2 } = await sb
      .from("perfis")
      .update({ plano, plano_expira_em: expiraEm, plano_origem: origem })
      .eq("email_normalizado", norm);
    if (e2) return { ok: false, motivo: e2.message };

    // A conta ficou com o plano CERTO agora, entao qualquer pagamento antigo
    // nesta lista de espera deixou de valer. Apagar e OBRIGATORIO: o banco
    // passou a aplicar o que esta guardado aqui sempre que a pessoa abre o app
    // (public.aplicar_acesso_pendente). Sem esta limpeza, um reembolso cortaria
    // o acesso e um pendente velho devolveria o plano na abertura seguinte.
    await sb.from("acessos_pendentes").delete().eq("email_normalizado", norm);

    return { ok: true, aplicado: "conta", quantas: perfis.length };
  }

  const { error: e3 } = await sb
    .from("acessos_pendentes")
    .upsert(
      { email_normalizado: norm, plano, plano_expira_em: expiraEm, origem },
      { onConflict: "email_normalizado" }
    );
  if (e3) return { ok: false, motivo: e3.message };
  return { ok: true, aplicado: "espera" };
}
