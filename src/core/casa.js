// ============================================================================
// casa.js — a "chave da casa": criar sem precisar de chave de IA nenhuma
// ----------------------------------------------------------------------------
// Este arquivo e SO DA VERSAO WEB (SaaS). A extensao nao tem chave da casa:
// la a pessoa sempre usa a chave dela.
//
// O QUE E A CHAVE DA CASA: as nossas APIs de IA gratuitas (Gemini, OpenRouter,
// Groq e Mistral). Todo mundo ganha 1 site por dia feito com elas — e com isso
// a pessoa cria o primeiro projeto no minuto em que entra no app, sem ter que
// abrir conta em provedor de IA nenhum.
//
// O CAMINHO DE UMA CHAMADA, DO INICIO AO FIM:
//   1. providers.js vai pedir algo pra IA e descobre que esta pessoa nao tem
//      chave propria desse servico. Em vez de pular, pergunta aqui.
//   2. Aqui a gente pede um PASSE pra /api/passe-ia (na Vercel). E la que o
//      plano e conferido e o slot do dia e gasto, no banco.
//   3. Com o passe na mao, a chamada e redirecionada pro Cloudflare Worker
//      (/casa), que guarda as chaves de verdade e repassa a resposta da IA.
//   4. A resposta volta no formato original do provedor, entao providers.js le
//      do mesmo jeito que leria se a chamada tivesse ido direto.
//
// A CHAVE NUNCA CHEGA AQUI. Nem no navegador de ninguem. Este arquivo so
// carrega bilhete; a chave fica no Worker.
//
// NADA QUEBRA SE NAO ESTIVER CONFIGURADO: sem login, sem o SQL rodado ou sem as
// variaveis, pedirPasse() devolve null e o app volta a exigir a chave da pessoa,
// exatamente como antes de a chave da casa existir.
// ============================================================================

import { sessaoAtual, authConfigurada } from "./auth.js";
import { GITHUB_OAUTH } from "./config.js";
import { registrarRegrasDoPlano } from "./providers.js";

/** Os quatro servicos que a casa empresta (iguais aos de api/_lib.js). */
// A ordem de uso NAO vem daqui (vem do PROVIDER_CATALOG): esta lista so diz
// QUAIS servicos a casa empresta. A deepseek e a unica paga -- entra como
// reserva e so e alcancada depois que todas as gratis falharem.
export const PROVEDORES_DA_CASA = ["cerebras", "mistral", "openrouter", "gemini", "groq", "deepseek"];

// --- estado, atualizado pelo App a cada leitura do plano ---------------------
let estado = {
  // A pessoa pode usar a chave da casa agora? (tem login e ainda tem site do dia)
  disponivel: false,
  // O plano dela deixa usar APIs PAGAS (Claude, DeepSeek, xAI)? So no plano pago.
  permitePagas: true,
  // Endereco do Worker. O padrao e o mesmo do OAuth; /api/passe-ia pode mandar
  // outro (variavel CASA_WORKER_URL) se um dia o endereco mudar.
  ponte: ""
};

// A proxima chamada comeca um PROJETO NOVO? Nela o servidor confere se ainda ha
// site do dia; as outras (corrigir, continuar, resumir) passam sem conferir, pra
// nao cortar ninguem no meio de um trabalho ja comecado. O slot e descontado
// quando o projeto SAI, em /api/projeto-criado.
let projetoNovoPendente = false;

// A geracao atual usou a chave da casa? O App pergunta isso no fim, pra avisar
// o servidor se o projeto gastou slot do dia ou slot proprio.
let usouCasaNestaGeracao = false;

// Quando a casa recusa ("acabou seu site de hoje"), nao vale perguntar de novo
// a cada chamada: guardamos o recado e esperamos um tempinho.
let bloqueioAte = 0;
let recadoDaCasa = "";

const ESPERA_APOS_RECUSA_MS = 60 * 1000;

/**
 * O App chama isto sempre que le o plano (ver src/core/plano.js). E o que liga
 * e desliga a chave da casa na pratica.
 */
export function configurarCasa({ disponivel = false, permitePagas = true } = {}) {
  estado.disponivel = Boolean(disponivel);
  estado.permitePagas = Boolean(permitePagas);
  // Plano novo lido = recado antigo nao vale mais (pode ter virado o dia, ou a
  // pessoa pode ter acabado de assinar).
  if (disponivel) { bloqueioAte = 0; recadoDaCasa = ""; }
}

/** Avisa que a proxima chamada de IA comeca um projeto novo. */
export function marcarProjetoNovo() {
  projetoNovoPendente = true;
  usouCasaNestaGeracao = false;
}

/** A geracao que acabou usou a chave da casa? (le e zera) */
export function consumirUsouCasa() {
  const usou = usouCasaNestaGeracao;
  usouCasaNestaGeracao = false;
  return usou;
}

/** O ultimo recado da casa ("seu site de hoje ja foi usado", etc). */
export function recadoDaCasaAgora() {
  return recadoDaCasa;
}

function baseDaPonte() {
  const base = (estado.ponte || GITHUB_OAUTH.workerUrl || "").replace(/\/+$/, "");
  return base ? `${base}/casa` : "";
}

/**
 * Pede o passe ao servidor. Devolve a string do passe, ou null quando a casa
 * nao esta disponivel (sem login, sem configuracao, cota do dia esgotada).
 * NUNCA LANCA: quem chama trata null como "nao da, usa a chave da pessoa".
 */
async function pedirPasse(provedorId) {
  if (!estado.disponivel || !authConfigurada()) return null;
  if (!PROVEDORES_DA_CASA.includes(provedorId)) return null;
  if (Date.now() < bloqueioAte) return null;

  let token = "";
  try { token = (await sessaoAtual())?.access_token || ""; } catch { token = ""; }
  if (!token) return null;

  const novoProjeto = projetoNovoPendente;

  try {
    const r = await fetch("/api/passe-ia", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ provedor: provedorId, novoProjeto })
    });
    const dados = await r.json().catch(() => ({}));

    if (!r.ok || !dados?.ok) {
      // Recusa (cota do dia, nao configurado) ou erro: guarda o recado e para
      // de insistir por um minuto, pra nao bater no servidor a cada chamada.
      recadoDaCasa = dados?.recado || dados?.erro || "";
      bloqueioAte = Date.now() + ESPERA_APOS_RECUSA_MS;
      return null;
    }

    if (dados.ponte) estado.ponte = dados.ponte;
    // O slot do dia so e cobrado uma vez por projeto: deu certo, baixa a marca.
    if (novoProjeto) projetoNovoPendente = false;
    usouCasaNestaGeracao = true;
    recadoDaCasa = "";
    return dados.passe || null;
  } catch {
    // Sem internet: nao e recusa, e so agora. Nao bloqueia.
    return null;
  }
}

/**
 * Converte um pedido JA MONTADO por providers.js num pedido pro Worker.
 * Devolve null quando a casa nao vai cobrir esta chamada.
 *
 * O corpo vai inteiro, do jeito que o provedor espera — quem sabe montar isso e
 * o buildRequest() do providers.js, e nao ha por que repetir essa logica aqui.
 * O endereco de verdade e a chave sao escolhidos pelo Worker, a partir do
 * provedor que esta escrito DENTRO do passe.
 */
async function prepararChamada(req, { provedorId, modelo }) {
  const alvo = baseDaPonte();
  if (!alvo) return null;
  const passe = await pedirPasse(provedorId);
  if (!passe) return null;

  return {
    url: alvo,
    headers: { "content-type": "application/json", "x-passe-ia": passe },
    body: { modelo, corpo: req.body }
  };
}

/**
 * Liga a casa no providers.js. Chamado uma vez no boot (src/main.jsx).
 *
 * providers.js e o "cerebro" compartilhado com a extensao, e ele nao conhece
 * nada de SaaS — por isso a ligacao e por registro, de fora pra dentro, em vez
 * de um import. Sem este registro, providers.js funciona como sempre.
 */
export function ligarChaveDaCasa() {
  registrarRegrasDoPlano({
    usaChaveDaCasa: () => estado.disponivel && Date.now() >= bloqueioAte,
    provedoresDaCasa: () => PROVEDORES_DA_CASA,
    permitePagas: () => estado.permitePagas,
    prepararCasa: prepararChamada,
    recado: () => recadoDaCasa
  });
}
