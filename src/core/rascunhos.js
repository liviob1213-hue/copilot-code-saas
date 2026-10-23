// ============================================================================
// rascunhos.js — o projeto gerado e AINDA NAO PUBLICADO
// ----------------------------------------------------------------------------
// Desde que publicar virou um botao, existe um intervalo em que o projeto ja
// foi criado mas ainda nao saiu do navegador. Nesse intervalo ele morava so na
// memoria da tela: bastava a pessoa sair da conversa e voltar para o trabalho
// sumir — e o SLOT dela ja tinha sido gasto.
//
// Aqui o rascunho passa a viver junto da conversa, com a chave sendo o id da
// sessao. Reabriu a conversa, o projeto esta la de novo, com a previa rodando.
//
// SOBRE TAMANHO: um projeto inteiro em texto ocupa espaco, e o localStorage do
// navegador e pequeno (uns 5 MB para TUDO que o app guarda). Por isso duas
// defesas: guardamos poucos rascunhos (os mais recentes) e recusamos salvar um
// que sozinho seja grande demais. Perder o rascunho mais antigo e aceitavel;
// estourar o armazenamento e derrubar chave de IA, projetos e historico junto
// nao e.
// ============================================================================

import * as store from "./storage.js";

/** Quantos rascunhos ficam guardados ao mesmo tempo (do mais novo pro mais velho). */
const MAX_RASCUNHOS = 3;

/** Teto por rascunho. Acima disso preferimos nao salvar a encher o armazenamento. */
const MAX_BYTES = 1_200_000;

async function todos() {
  try { return (await store.get("rascunhos")) || {}; } catch { return {}; }
}

/**
 * Guarda o rascunho desta conversa. Best-effort: se nao der, a geracao que
 * acabou de dar certo NAO pode falhar por causa disto.
 */
export async function guardarRascunho(sessionId, rascunho) {
  if (!sessionId || !rascunho?.files) return false;
  try {
    const registro = {
      files: rascunho.files,
      nome: rascunho.nome || "",
      brief: rascunho.brief || "",
      kind: rascunho.kind || "app",
      criadoEm: Date.now()
    };

    if (JSON.stringify(registro).length > MAX_BYTES) {
      console.warn("[rascunhos] projeto grande demais para guardar no navegador");
      return false;
    }

    const mapa = await todos();
    mapa[sessionId] = registro;

    // Mantem so os mais recentes.
    const ordenados = Object.entries(mapa).sort((a, b) => (b[1]?.criadoEm || 0) - (a[1]?.criadoEm || 0));
    const podado = {};
    for (const [id, r] of ordenados.slice(0, MAX_RASCUNHOS)) podado[id] = r;

    await store.set("rascunhos", podado);
    return true;
  } catch (e) {
    console.warn("[rascunhos] nao consegui guardar:", e);
    return false;
  }
}

/** O rascunho desta conversa, ou null. */
export async function lerRascunho(sessionId) {
  if (!sessionId) return null;
  const mapa = await todos();
  const r = mapa[sessionId];
  if (!r?.files || !Object.keys(r.files).length) return null;
  return r;
}

/** Publicou (ou descartou): o rascunho nao serve mais. */
export async function apagarRascunho(sessionId) {
  if (!sessionId) return;
  try {
    const mapa = await todos();
    if (!(sessionId in mapa)) return;
    delete mapa[sessionId];
    await store.set("rascunhos", mapa);
  } catch { /* nao vale derrubar nada por causa de limpeza */ }
}

/** Para a lista de conversas marcar quais tem projeto esperando. */
export async function idsComRascunho() {
  return Object.keys(await todos());
}
