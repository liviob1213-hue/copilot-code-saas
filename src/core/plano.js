// ============================================================================
// plano.js — o que cada pessoa pode fazer no app
// ----------------------------------------------------------------------------
// Le as tabelas `perfis` (plano de quem pagou) e `cotas` (limite gratis por
// e-mail normalizado) do Supabase das CONTAS. O SQL que cria as duas esta em
// supabase/contas.sql.
//
// REGRAS, EM PORTUGUES:
//
//   Plano gratis
//     - 1 site de cortesia usando a chave de IA DA CASA (a do dono do app).
//       Acontece uma vez por e-mail normalizado, na vida.
//     - 3 sites usando a chave de IA DA PESSOA.
//     - +1 slot a cada pessoa que entrar pelo link de convite E criar um site.
//       Ate 10 slots ganhos.
//     - NAO cria apps/SaaS. App com IA gratuita nao fica bom, entao prometer
//       isso no plano gratis so geraria decepcao.
//
//   Plano pago (mensal ou anual)
//     - Sites e apps, sem limite de quantidade.
//
// ATE ONDE A TRAVA SEGURA (seja honesto com isso):
//   O limite da CHAVE DA CASA e inquebravel: aquela chamada passa pelo nosso
//   servidor, que confere e recusa. Ja os limites de quem usa a PROPRIA chave
//   sao aplicados aqui no app — a chamada vai do navegador da pessoa direto
//   pro provedor de IA dela, entao nao existe servidor no meio pra barrar.
//   Para o publico do app isso segura de sobra; nao e, nem pode ser vendido
//   como, uma trava criptografica.
//
// SEM LOGIN CONFIGURADO, NADA TRAVA: se o Supabase das contas nao estiver
// ligado, tudo fica liberado e o app roda como sempre rodou.
// ============================================================================

import { clienteContas, authConfigurada } from "./auth.js";

export const LIMITE_SITES_CHAVE_PROPRIA = 3;
export const TETO_SLOTS_CONVITE = 10;

/** O que vale quando nao ha login configurado: tudo liberado. */
const TUDO_LIBERADO = Object.freeze({
  carregado: true,
  semLogin: true,
  plano: "ilimitado",
  pago: true,
  podeApps: true,
  cortesiaDisponivel: false,
  slotsTotal: Infinity,
  slotsUsados: 0,
  slotsRestantes: Infinity,
  podeCriarSite: true,
  codigoConvite: "",
  convitesCreditados: 0
});

/**
 * Busca perfil + cota da pessoa logada e devolve ja mastigado o que ela pode.
 * Nunca lanca: qualquer falha devolve o estado liberado, porque derrubar a
 * criacao de projeto por causa de uma consulta de plano seria pior do que
 * deixar passar.
 */
export async function carregarPlano(sessao) {
  if (!authConfigurada() || !sessao?.user?.id) return TUDO_LIBERADO;

  const sb = clienteContas();
  if (!sb) return TUDO_LIBERADO;

  try {
    const { data: perfil, error: e1 } = await sb
      .from("perfis")
      .select("plano, plano_expira_em, email_normalizado, codigo_convite")
      .eq("id", sessao.user.id)
      .maybeSingle();

    if (e1 || !perfil) return TUDO_LIBERADO;

    const { data: cota } = await sb
      .from("cotas")
      .select("usou_chave_da_casa, sites_criados, slots_ganhos")
      .eq("email_normalizado", perfil.email_normalizado)
      .maybeSingle();

    return montar(perfil, cota);
  } catch {
    return TUDO_LIBERADO;
  }
}

/** Diz se o plano pago ainda vale (expira_em nulo = nao vence). */
export function planoPagoValido(perfil) {
  if (!perfil || perfil.plano === "free") return false;
  if (!perfil.plano_expira_em) return true;
  return new Date(perfil.plano_expira_em).getTime() > Date.now();
}

function montar(perfil, cota) {
  const pago = planoPagoValido(perfil);
  const c = cota || { usou_chave_da_casa: false, sites_criados: 0, slots_ganhos: 0 };

  const ganhos = Math.min(Number(c.slots_ganhos || 0), TETO_SLOTS_CONVITE);
  const slotsTotal = LIMITE_SITES_CHAVE_PROPRIA + ganhos;
  const slotsUsados = Number(c.sites_criados || 0);

  return {
    carregado: true,
    semLogin: false,
    plano: perfil.plano,
    pago,
    // Apps so no pago. No gratis a pessoa ve a opcao, mas com cadeado —
    // esconder nao converte, mostrar bloqueado converte.
    podeApps: pago,
    // O site de cortesia com a chave da casa, uma vez na vida.
    cortesiaDisponivel: !pago && !c.usou_chave_da_casa,
    slotsTotal: pago ? Infinity : slotsTotal,
    slotsUsados,
    slotsRestantes: pago ? Infinity : Math.max(0, slotsTotal - slotsUsados),
    podeCriarSite: pago || slotsUsados < slotsTotal || (!c.usou_chave_da_casa),
    codigoConvite: perfil.codigo_convite || "",
    convitesCreditados: ganhos
  };
}

/** O link que a pessoa manda para ganhar slots. */
export function linkDeConvite(codigo) {
  if (!codigo) return "";
  return `${window.location.origin}/?convite=${encodeURIComponent(codigo)}`;
}

/**
 * Guarda o codigo de convite que veio na URL para usar depois do cadastro.
 * Fica no navegador porque o cadastro acontece em outra tela (e, no caso do
 * Google, depois de sair e voltar do site do Google).
 */
export function guardarConviteDaUrl() {
  try {
    const c = new URLSearchParams(window.location.search).get("convite");
    if (c) localStorage.setItem("copilot:convite", c.trim().toUpperCase());
  } catch { /* navegador sem localStorage: convite simplesmente nao conta */ }
}

export function conviteGuardado() {
  try { return localStorage.getItem("copilot:convite") || ""; } catch { return ""; }
}

export function limparConviteGuardado() {
  try { localStorage.removeItem("copilot:convite"); } catch { /* ignora */ }
}

/**
 * Avisa o servidor que esta pessoa entrou por um link de convite.
 *
 * Roda depois do login, uma vez: o codigo ficou guardado no navegador desde a
 * chegada pelo link. Quem decide se o convite vale e o servidor (/api/convite)
 * — aqui a gente so entrega o codigo junto com o token que prova quem esta
 * pedindo.
 *
 * NUNCA LANCA E NUNCA ATRAPALHA: se der qualquer problema, a pessoa entra
 * normalmente, so sem o bonus do convite. E se o problema foi de rede ou de
 * sessao, o codigo fica guardado e tentamos de novo na proxima abertura.
 */
export async function registrarConviteDoLink(sessao) {
  const codigo = conviteGuardado();
  if (!codigo || !authConfigurada()) return null;

  const token = sessao?.access_token;
  if (!token) return null;

  try {
    const r = await fetch("/api/convite", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigo })
    });

    // Servidor respondeu "aceitei" ou "recusei"? Assunto encerrado: tira o
    // codigo do navegador para nao ficar tentando a cada abertura do app. Só
    // 401 (sessao) e 5xx (deu errado agora) merecem outra tentativa depois.
    if (r.status !== 401 && r.status < 500) limparConviteGuardado();

    const dados = await r.json().catch(() => ({}));
    return dados?.ok ? dados : null;
  } catch {
    return null;   // sem internet: o codigo continua guardado
  }
}

/** Mensagem pronta para quando a pessoa esbarra num limite. */
export function motivoDoBloqueio(p, tipo) {
  if (!p || p.semLogin || p.pago) return "";
  if (tipo === "app") {
    return "Criar apps e SaaS faz parte do plano Pro. No plano grátis dá para criar sites — e eles saem bem.";
  }
  if (p.slotsRestantes <= 0 && !p.cortesiaDisponivel) {
    return "Você usou seus sites do plano grátis. Convide alguém para ganhar mais um, ou assine o Pro para criar sem limite.";
  }
  return "";
}
