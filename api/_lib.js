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
