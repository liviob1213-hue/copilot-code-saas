// ============================================================================
// plano.js — o que cada pessoa pode fazer no app
// ----------------------------------------------------------------------------
// Le o saldo de slots direto do Supabase das CONTAS, pela funcao
// public.resumo_slots(). O SQL que cria tudo esta em supabase/contas.sql (as
// tabelas) e supabase/slots.sql (as regras e o saldo).
//
// POR QUE O SALDO VEM DO BANCO, PRONTO, e nao e calculado aqui: as mesmas
// regras valem pra autorizar no servidor e pra mostrar na tela. Calculando nos
// dois lugares, um dia um numero muda num lado e nao no outro — e a pessoa ve
// "1 site disponivel" e toma "acabaram seus sites".
//
// ---------------------------------------------------------------------------
// AS REGRAS, EM PORTUGUES
// ---------------------------------------------------------------------------
//   Plano gratis
//     - 1 SITE POR DIA com a NOSSA IA (a "chave da casa"). Renova sozinho todo
//       dia. Nao precisa de chave nenhuma: a pessoa entra e cria.
//     - SITES COM A CHAVE DELA vem de CONVITE: cada pessoa que entra pelo seu
//       link e cria um site de verdade te da +2 slots (ate 10).
//     - So APIs GRATUITAS (Gemini, OpenRouter, Groq, Mistral).
//     - NAO cria apps/SaaS. App com IA gratuita nao fica bom, entao prometer
//       isso no plano gratis so geraria decepcao.
//
//   Planos pagos — tres niveis, e o que muda entre eles e QUAIS IAs PAGAS a
//   pessoa pode ligar com a chave dela (a lista exata esta em planos.js):
//     Basico  R$ 24,97 -> DeepSeek
//     Pro     R$ 34,97 -> Claude e xAI Grok
//     Premium R$ 47    -> todas as pagas
//   Em TODOS eles: sites e apps sem limite de quantidade.
//
// ---------------------------------------------------------------------------
// ATE ONDE A TRAVA SEGURA (seja honesto com isso)
// ---------------------------------------------------------------------------
//   O que e INQUEBRAVEL: o teto de CHAMADAS da chave da casa. Toda chamada
//   passa pelo nosso servidor (/api/passe-ia), que confere o plano e conta no
//   banco antes de emprestar a chave. Ninguem fura isso pelo navegador.
//
//   O que e SO DE FACHADA (saiba disso): o "1 site por dia" e contado quando o
//   app avisa que um projeto saiu, e os slots de quem usa a PROPRIA chave sao
//   aplicados aqui no app mesmo — a chamada vai do navegador dela direto pro
//   provedor, sem servidor no meio pra barrar. Pra quem usa o app normalmente
//   os dois valem; pra quem mexer no navegador, o que segura de verdade e o
//   teto de chamadas. Para o publico do app isso basta, mas nao e, nem pode ser
//   vendido como, uma trava criptografica.
//
// SEM LOGIN CONFIGURADO, NADA TRAVA: se o Supabase das contas nao estiver
// ligado, tudo fica liberado e o app roda como sempre rodou.
// ============================================================================

import { clienteContas, authConfigurada } from "./auth.js";
import { configurarCasa } from "./casa.js";
import { planoDe, planoLibera } from "./planos.js";

/** O que vale quando nao ha login configurado: tudo liberado. */
const TUDO_LIBERADO = Object.freeze({
  carregado: true,
  semLogin: true,
  plano: "ilimitado",
  planoId: "premium",
  planoNome: "Premium",
  pago: true,
  podeApps: true,
  podeApisPagas: true,
  liberaProvedor: () => true,
  // chave da casa: desligada sem login (nao ha como saber de quem e a cota)
  casaDisponivel: false,
  casaNovoProjeto: false,
  casaRestantesHoje: 0,
  casaTotalDia: 0,
  chamadasRestantesHoje: 0,
  // slots com a chave da pessoa
  propriosTotal: Infinity,
  propriosUsados: 0,
  propriosRestantes: Infinity,
  slotsGanhos: 0,
  convitesPagos: 0,
  podeCriarSite: true,
  codigoConvite: ""
});

/**
 * Busca o saldo da pessoa logada e devolve ja mastigado o que ela pode.
 *
 * Nunca lanca: qualquer falha devolve o estado liberado, porque derrubar a
 * criacao de projeto por causa de uma consulta de plano seria pior do que
 * deixar passar. (A trava que segura dinheiro de verdade e a do servidor.)
 */
export async function carregarPlano(sessao) {
  if (!authConfigurada() || !sessao?.user?.id) {
    configurarCasa({ disponivel: false, permitePagas: true, permiteProvedorPago: () => true });
    return TUDO_LIBERADO;
  }

  const sb = clienteContas();
  if (!sb) {
    configurarCasa({ disponivel: false, permitePagas: true, permiteProvedorPago: () => true });
    return TUDO_LIBERADO;
  }

  try {
    const { data, error } = await sb.rpc("resumo_slots");

    // Funcao inexistente = supabase/slots.sql ainda nao foi rodado. Em vez de
    // travar todo mundo, voltamos ao modo "tudo liberado" (que e como o app
    // funcionava antes dos slots) e deixamos o recado no console.
    if (error || !data?.ok) {
      if (error) console.warn("[plano] nao consegui ler o saldo de slots:", error.message);
      configurarCasa({ disponivel: false, permitePagas: true, permiteProvedorPago: () => true });
      return TUDO_LIBERADO;
    }

    return montar(data);
  } catch {
    configurarCasa({ disponivel: false, permitePagas: true, permiteProvedorPago: () => true });
    return TUDO_LIBERADO;
  }
}

function montar(s) {
  const pago = s.pago === true;
  const casaRestantes = Number(s.casa_restantes_hoje || 0);
  const chamadasRestantes = Number(s.chamadas_restantes_hoje || 0);
  const propriosRestantes = Number(s.proprios_restantes || 0);

  // DUAS PERGUNTAS DIFERENTES, e confundi-las dava um bug feio:
  //
  //   casaDisponivel    -> a nossa IA ainda pode TRABALHAR hoje nesta conta?
  //                        E so o teto de chamadas. Vale pra EDITAR tambem.
  //   casaNovoProjeto   -> da pra COMECAR um projeto novo com ela?
  //                        Aqui entra o site do dia.
  //
  // Antes as duas eram a mesma coisa: a pessoa criava o site do dia com a nossa
  // IA, o saldo de sites zerava, e o "mude o titulo" logo depois respondia que
  // nao havia IA nenhuma ativa — no meio do trabalho que ela acabou de comecar.
  const casaDisponivel = chamadasRestantes > 0;
  const casaNovoProjeto = casaRestantes > 0 && chamadasRestantes > 0;

  const plano = planoDe(s.plano);

  const acesso = {
    carregado: true,
    semLogin: false,
    plano: s.plano || "free",
    planoId: plano.id,
    planoNome: plano.nome,
    pago,
    // Apps so no pago. No gratis a pessoa ve a opcao, mas com cadeado —
    // esconder nao converte, mostrar bloqueado converte.
    podeApps: pago && plano.podeApps,
    // Tem acesso a ALGUMA IA paga? (serve so pra decidir se vale mostrar o
    // convite generico; quem manda de verdade e o liberaProvedor abaixo)
    podeApisPagas: pago,
    // A pergunta que importa agora que existem tres niveis: ESTA IA paga, no
    // plano DESTA pessoa, pode? O Basico libera a DeepSeek e so; o Pro libera
    // Claude e xAI; o Premium libera tudo.
    liberaProvedor: (id) => pago && planoLibera(s.plano, id),

    casaDisponivel,
    casaNovoProjeto,
    casaRestantesHoje: casaRestantes,
    casaTotalDia: Number(s.casa_total_dia || 0),
    chamadasRestantesHoje: chamadasRestantes,

    propriosTotal: Number(s.proprios_total || 0),
    propriosUsados: Number(s.proprios_usados || 0),
    propriosRestantes,
    slotsGanhos: Number(s.slots_ganhos || 0),
    // Ganhos HOJE: so entram no saldo amanha. Precisam aparecer na tela,
    // senao o premio parece que nao veio e a pessoa abre chamado dizendo
    // que o convite dela nao pagou.
    slotsEsperando: Number(s.slots_esperando || 0),
    ganhosNoMes: Number(s.ganhos_no_mes || 0),
    tetoDoMes: Number(s.teto_do_mes || s.limites?.teto_slots_mes || 10),
    convitesPagos: Number(s.convites_pagos || 0),

    podeCriarSite: pago || casaNovoProjeto || propriosRestantes > 0,
    codigoConvite: s.codigo_convite || "",
    // Quanto vale cada convite, pra tela poder dizer o numero certo sem repetir
    // a regra: ele vem do banco (public.limites_dos_slots).
    slotsPorConvite: Number(s.limites?.slots_por_convite || 2)
  };

  // Liga/desliga a chave da casa no cerebro (providers.js). A partir daqui, uma
  // pessoa sem chave propria consegue gerar: a chamada vai pro servidor.
  configurarCasa({
    disponivel: casaDisponivel,
    permitePagas: pago,
    permiteProvedorPago: (id) => pago && planoLibera(s.plano, id)
  });

  return acesso;
}

/** Diz se o plano pago ainda vale (expira_em nulo = nao vence). */
export function planoPagoValido(perfil) {
  if (!perfil || perfil.plano === "free") return false;
  if (!perfil.plano_expira_em) return true;
  return new Date(perfil.plano_expira_em).getTime() > Date.now();
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
 * pedindo. O premio de quem INDICOU nao sai nessa hora: ele e pago quando esta
 * pessoa criar um projeto de verdade (/api/projeto-criado).
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

/**
 * Avisa o servidor que um projeto saiu. E isso que gasta o slot proprio e que
 * PAGA O CONVITE de quem indicou esta pessoa (+2 slots, uma vez na vida).
 *
 * Devolve o saldo novo (pra tela atualizar o contador) ou null. NUNCA LANCA: o
 * projeto da pessoa ja existe, e perder a contagem e menos grave do que mostrar
 * um erro em cima de um projeto que deu certo.
 */
export async function avisarProjetoCriado(sessao, { nome, tipo, chaveDaCasa }) {
  if (!authConfigurada()) return null;
  const token = sessao?.access_token;
  if (!token) return null;

  try {
    const r = await fetch("/api/projeto-criado", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ nome, tipo, chaveDaCasa })
    });
    const dados = await r.json().catch(() => ({}));
    return dados?.ok ? dados : null;
  } catch {
    return null;
  }
}

/**
 * Mensagem pronta para quando a pessoa esbarra num limite. O texto muda com o
 * motivo: quem pode destravar convidando ouve isso, e quem so precisa colar a
 * chave dela ouve aquilo. Mensagem generica aqui vira abandono.
 *
 * temChavePropria: a pessoa ja colou alguma chave de IA? (o App sabe; este
 * modulo nao). Sem ela, um saldo de slots proprios nao serve de nada ainda.
 */
export function motivoDoBloqueio(p, tipo, temChavePropria = true) {
  if (!p || p.semLogin || p.pago) return "";

  if (tipo === "app") {
    return "Criar apps e SaaS faz parte dos planos pagos, a partir de R$ 24,97 por mês. No plano grátis dá para criar sites — e eles saem bem.";
  }

  // Ainda tem site do dia com a nossa IA: pode criar, sem conversa.
  if (p.casaNovoProjeto) return "";

  // Tem slot proprio, mas falta a chave dela: o caminho e colar a chave.
  if (p.propriosRestantes > 0) {
    if (temChavePropria) return "";
    return "Seu site de hoje com a nossa IA já foi usado, mas você tem "
      + `${p.propriosRestantes} ${p.propriosRestantes === 1 ? "site" : "sites"} para criar com a sua própria chave. `
      + "Cole uma chave grátis em Conexões (Gemini, OpenRouter, Groq ou Mistral) e continue agora.";
  }

  return "Seu site de hoje com a nossa IA já foi usado — amanhã você ganha outro. "
    + `Para criar agora, convide alguém: cada pessoa que entrar pelo seu link e criar um site te dá ${p.slotsPorConvite || 2} sites. `
    + "Ou assine a partir de R$ 24,97 por mês e crie sem limite, com as IAs pagas.";
}
