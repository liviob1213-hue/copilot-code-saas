// ============================================================================
// storage.js — ADAPTADOR WEB (SaaS)
// ----------------------------------------------------------------------------
// Espelha EXATAMENTE a API do storage.js da extensao, mas troca
// chrome.storage.local por localStorage. Por isso os outros modulos do core
// (providers.js, agent.js, tools.js, site-generator.js) podem ser copiados da
// extensao SEM NENHUMA alteracao: eles importam "./storage.js" e recebem esta
// versao aqui.
//
// Regra de ouro do ecossistema: o "cerebro" (providers/agent/tools/gerador) NAO
// conhece chrome nem window. So o storage e os conectores (github/vercel/
// supabase) sao especificos de cada casca (extensao vs web).
// ============================================================================

import { SECRETS, PROVIDER_CATALOG, CATALOG_VERSION, PROVIDER_PRICES } from "./config.js";

const PREFIX = "copilot:"; // namespace no localStorage pra nao colidir com outras apps

// Serializa mutacoes (mesma garantia da extensao) pra duas abas nao
// sobrescreverem runtime/secrets com estado antigo.
let mutationQueue = Promise.resolve();
function enqueueMutation(task) {
  const operation = mutationQueue.then(task);
  mutationQueue = operation.catch(() => {});
  return operation;
}

function rawGet(key) {
  try {
    const s = localStorage.getItem(PREFIX + key);
    return s == null ? undefined : JSON.parse(s);
  } catch {
    return undefined;
  }
}
function rawSet(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    // Cota estourada ou modo privado: nao derruba o app.
    console.warn("[storage] falha ao gravar", key, e);
  }
}

const DEFAULTS = {
  secrets: { ...SECRETS },
  providers: PROVIDER_CATALOG.map((p, i) => ({
    id: p.id,
    enabled: true,
    priority: i,
    model: p.defaultModel
  })),
  runtime: {},
  github: {},
  supabase: {},
  vercel: {},
  extensionRepos: [], // no web: projetos criados PELO SaaS
  repoAuto: true,
  lovableRepos: [],   // sem uso no web (Lovable e so da extensao), mantido por compatibilidade
  previewUrls: {},
  projects: {},
  settings: {
    autoCommit: false,
    refreshPreviewAfterCommit: true,
    commitPrefix: "copilot:",
    dryRunFirst: true
  },
  usage: [],
  limites: {},
  sessions: [],       // historico de conversas (ver core/history.js) — 100% local
  modelsCache: {},    // { [providerId]: [modelos] } — resultado do "Buscar" (compartilhado)
  modelHealth: {}     // { [providerId]: { [model]: { status, detail, at } } } — health check
};

export async function get(key) {
  const v = rawGet(key);
  if (v === undefined) return structuredClone(DEFAULTS[key]);
  return v;
}

export async function set(key, value) {
  return enqueueMutation(async () => {
    rawSet(key, value);
    return value;
  });
}

export async function patch(key, partial) {
  return enqueueMutation(async () => {
    const current = await get(key);
    const next = Array.isArray(current) ? partial : { ...current, ...partial };
    rawSet(key, next);
    return next;
  });
}

export async function ensureDefaults() {
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (rawGet(k) === undefined) rawSet(k, structuredClone(v));
  }
  // Chaves de secrets novas entram sem apagar o que ja existe.
  const existingSecrets = rawGet("secrets");
  if (existingSecrets) {
    const merged = { ...existingSecrets };
    let changed = false;
    for (const [k, v] of Object.entries(SECRETS)) {
      if (!(k in merged)) { merged[k] = v; changed = true; }
    }
    if (changed) rawSet("secrets", merged);
  }

  // Migracao de catalogo (igual a extensao).
  const cv = rawGet("catalogVersion");
  if (cv !== CATALOG_VERSION) {
    const stored = rawGet("providers") || [];
    // 1) Mantem SO os provedores que ainda existem no catalogo (remove NVIDIA,
    //    Cerebras, OpenAI, etc. que sairam da lista) e preserva enabled/model.
    const byId = new Map(stored.map(c => [c.id, c]));
    const migrados = PROVIDER_CATALOG.map((meta, i) => {
      const antigo = byId.get(meta.id);
      let model = antigo?.model;
      // Se o modelo salvo nao existe mais no catalogo do provedor, volta pro padrao.
      if (!model || !meta.models.includes(model)) model = meta.defaultModel;
      return {
        id: meta.id,
        enabled: antigo ? antigo.enabled !== false : true,
        priority: i,                 // re-semeia a ordem: gratis antes de pagas
        model
      };
    });
    rawSet("providers", migrados);
    rawSet("catalogVersion", CATALOG_VERSION);
  }
}

export async function getSecret(name) {
  const secrets = await get("secrets");
  return (secrets[name] || "").trim();
}

// --- estado de revezamento (identico a extensao) ----------------------------

export async function markProviderFailure(providerId, reason, cooldownMs) {
  const runtime = await get("runtime");
  const entry = runtime[providerId] || { calls: 0, failures: 0 };
  entry.failures += 1;
  entry.lastError = reason;
  entry.lastErrorAt = Date.now();
  entry.cooldownUntil = Date.now() + cooldownMs;
  runtime[providerId] = entry;
  await set("runtime", runtime);
}

export async function markProviderSuccess(providerId, usage) {
  const runtime = await get("runtime");
  const entry = runtime[providerId] || { calls: 0, failures: 0 };
  entry.calls += 1;
  entry.lastOkAt = Date.now();
  entry.cooldownUntil = 0;
  entry.lastError = null;
  const tin = usage?.in || 0;
  const tout = usage?.out || 0;
  entry.tokens = (entry.tokens || 0) + (usage?.total || (tin + tout));
  entry.tokensIn = (entry.tokensIn || 0) + tin;
  entry.tokensOut = (entry.tokensOut || 0) + tout;
  try {
    const p = PROVIDER_PRICES[providerId];
    if (p) entry.costUsd = (entry.costUsd || 0) + (tin / 1e6) * p.in + (tout / 1e6) * p.out;
  } catch { /* estimativa e opcional */ }
  runtime[providerId] = entry;
  await set("runtime", runtime);
}

export async function resetSpend() {
  const runtime = await get("runtime");
  for (const id of Object.keys(runtime)) {
    const e = runtime[id];
    if (!e) continue;
    e.tokens = 0; e.tokensIn = 0; e.tokensOut = 0; e.costUsd = 0; e.calls = 0;
  }
  await set("runtime", runtime);
}

export async function clearCooldown(providerId) {
  const runtime = await get("runtime");
  if (runtime[providerId]) {
    runtime[providerId].cooldownUntil = 0;
    runtime[providerId].lastError = null;
    await set("runtime", runtime);
  }
}
