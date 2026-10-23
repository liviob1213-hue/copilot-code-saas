// ============================================================================
// net.js — camada de rede da versao WEB (resolve o CORS)
// ----------------------------------------------------------------------------
// Na extensao, o host_permissions do manifest fura o CORS: qualquer fetch para
// api.vercel.com / api.supabase.com funciona direto. Numa pagina web isso NAO
// existe — o navegador bloqueia essas chamadas (nao mandam os cabecalhos CORS).
//
// Solucao sem tocar no core: um "monkey-patch" no window.fetch que, para os
// hosts que o navegador bloqueia, reescreve a chamada para passar pelo Worker
// (que responde com CORS *). Todo o resto continua indo direto (GitHub, IAs que
// permitem browser). Assim os modulos copiados (vercel.js, supabase-mgmt.js)
// rodam SEM ALTERACAO — eles chamam fetch normal e nem sabem do proxy.
//
// Chame installProxy() UMA vez, no boot (main.jsx), antes de usar o core.
// ============================================================================

// Hosts que o navegador bloqueia por CORS e precisam passar pelo Worker.
// Adicione aqui qualquer provedor de IA que devolver erro de CORS no console
// (ex.: /api\.openai\.com/). GitHub (api.github.com) NAO precisa — tem CORS.
const PROXIED_HOSTS = [
  /(^|\.)api\.vercel\.com$/i,
  /(^|\.)api\.supabase\.com$/i,
  // IAs que bloqueiam CORS no navegador. Gemini (chave na URL) e Anthropic
  // (cabecalho direct-browser-access) funcionam direto, entao ficam de fora.
  /(^|\.)api\.deepseek\.com$/i,
  /(^|\.)api\.mistral\.ai$/i,
  /(^|\.)api\.groq\.com$/i,
  /(^|\.)openrouter\.ai$/i,
  /(^|\.)api\.x\.ai$/i
];

let installed = false;

export function installProxy(workerUrl) {
  if (installed) return;
  if (!workerUrl) {
    console.warn("[net] sem workerUrl: chamadas a Vercel/Supabase-Mgmt vao falhar por CORS.");
    return;
  }
  const proxyBase = workerUrl.replace(/\/+$/, "") + "/proxy?url=";
  const original = window.fetch.bind(window);

  window.fetch = (input, init) => {
    let url;
    try {
      url = typeof input === "string" ? input : (input && input.url) || "";
      const host = new URL(url, window.location.href).host;
      if (PROXIED_HOSTS.some(re => re.test(host))) {
        // O token vai no HEADER (Authorization), nunca na URL — o Worker so
        // recebe o destino no parametro ?url= e repassa os cabecalhos.
        return original(proxyBase + encodeURIComponent(url), init);
      }
    } catch { /* URL relativa/estranha: deixa passar direto */ }
    return original(input, init);
  };

  installed = true;
}

// ============================================================================
//  Timeout de verdade: fetch + leitura do corpo sob UM UNICO relogio
// ----------------------------------------------------------------------------
//  Nasceu em providers.js, depois de uma hora de tela travada. Vive aqui porque
//  TODO modulo que fala com a rede precisa dele: github.js, vercel.js,
//  supabase-mgmt.js e billing.js chamavam fetch sem signal nenhum, ou seja, sem
//  prazo algum — um servidor lento ou uma conexao meio aberta prendia a
//  interface no "pensando" para sempre, igual ao bug original.
// ============================================================================

/**
 * fetch + leitura do corpo sob UM UNICO relogio de timeout.
 *
 * O detalhe e sutil: o fetch resolve assim que os CABECALHOS chegam, mas o
 * corpo ainda vem depois. Se o relogio for desarmado nesse meio, um corpo que
 * para de fluir (ponte lenta, conexao meio aberta, servidor que abre a resposta
 * e nao termina) deixa o res.text() esperando PARA SEMPRE — sem erro, sem
 * timeout, e a interface fica "pensando" indefinidamente. Por isso o
 * clearTimeout so acontece no finally: o abort cobre a requisicao E a leitura
 * do corpo.
 *
 * Devolve { res, text }. Quem precisa de JSON usa JSON.parse(text) — chamar
 * res.json() depois nao funciona (o corpo ja foi consumido) e, de qualquer
 * forma, seria a mesma leitura sem relogio que causou o travamento.
 */
export async function fetchComCorpo(url, init, timeoutMs, { grupo = "" } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  if (grupo === "ia") emAndamentoIA.add(ctrl);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    return { res, text };
  } finally {
    clearTimeout(timer);
    if (grupo === "ia") emAndamentoIA.delete(ctrl);
  }
}

// ============================================================================
// PARAR A IA NO MEIO
// ----------------------------------------------------------------------------
// Sem isto, quem mandou um pedido errado (ou caiu numa IA lenta) so tinha uma
// saida: recarregar a pagina e perder a conversa. Esperar 8 minutos olhando
// para uma tela que voce ja sabe que nao quer e a pior sensacao que o app
// pode dar.
//
// Sao DUAS coisas, e as duas precisam existir:
//   1. abortar as chamadas que estao no ar agora;
//   2. levantar a bandeira de "foi cancelado", porque o rodizio de provedores
//      trata erro de rede como "este falhou, tenta o proximo" — sem a bandeira,
//      cancelar faria ele correr para a IA seguinte em vez de parar.
// ============================================================================

const emAndamentoIA = new Set();
let canceladoIA = false;

/** Comeca um trabalho novo de IA: baixa a bandeira do cancelamento anterior. */
export function comecarIA() {
  canceladoIA = false;
}

/**
 * Para quem cria o proprio AbortController (o caminho de streaming) e mesmo
 * assim precisa obedecer ao botao de cancelar.
 */
export function registrarCancelavelIA(ctrl) {
  emAndamentoIA.add(ctrl);
}

export function soltarCancelavelIA(ctrl) {
  emAndamentoIA.delete(ctrl);
}

/** Para tudo o que a IA esta fazendo agora. */
export function cancelarIA() {
  canceladoIA = true;
  for (const c of emAndamentoIA) { try { c.abort(); } catch { /* ja terminou */ } }
  emAndamentoIA.clear();
}

/** O rodizio consulta isto antes de tentar o proximo provedor. */
export function iaFoiCancelada() {
  return canceladoIA;
}

/** Erro de cancelamento: o app reconhece e mostra recado proprio, nao "falhou". */
export class CanceladoPeloUsuario extends Error {
  constructor() {
    super("Cancelado por você.");
    this.name = "CanceladoPeloUsuario";
  }
}

/** true quando o erro de rede veio do nosso relogio (e nao de queda de rede). */
export function ehTimeout(e) {
  return e?.name === "AbortError";
}

/**
 * Prazos por TIPO de chamada. A diferenca importa: uma consulta de saldo que
 * nao respondeu em 15s esta quebrada, enquanto subir vinte arquivos para o
 * GitHub pode levar bem mais que isso num upload lento e abortar seria perder
 * trabalho bom. Os numeros sao tetos de seguranca para destravar a interface,
 * nao metas de desempenho — por isso ficam folgados.
 */
export const PRAZO = {
  // Consulta curta de terceiro: saldo, perfil, validar token. Resposta e
  // pequena e imediata; mais de 15s aqui e servidor fora do ar.
  consulta: 15_000,
  // Troca de token em OAuth (vai pelo Worker). O usuario esta esperando na
  // tela de login, entao o teto e curto o suficiente para ele poder tentar de
  // novo, e longo o bastante para um cold start do Worker.
  oauth: 20_000,
  // Leitura de API (listar repos/projetos, ler arquivo, status de deploy). Vale
  // mais que uma consulta simples porque algumas paginas sao grandes.
  leitura: 30_000,
  // Escrita (criar repo, subir blob, criar commit, disparar deploy, rodar SQL,
  // publicar Edge Function). Sao as chamadas que carregam conteudo e as que
  // mais doem se forem cortadas cedo; 120s cobre upload ruim sem travar a tela.
  escrita: 120_000
};
