// [gerado por sync-core.mjs] copia de ../../src/core — NAO edite aqui.
// Edite na extensao (src/core) e rode `npm run sync-core`.
// ============================================================================
//  Saldo REAL das APIs que expoem isso pela propria chave (BYOK, 100% local):
//   - DeepSeek: GET /user/balance
//   - OpenRouter: GET /credits (ou /auth/key)
//  Os demais provedores nao tem endpoint de saldo pela chave normal — para eles
//  a extensao mostra o gasto ESTIMADO (tokens x preco), calculado em storage.js.
// ============================================================================

import * as store from "./storage.js";

// DeepSeek: saldo disponivel na conta.
async function deepseekBalance(key) {
  const res = await fetch("https://api.deepseek.com/user/balance", {
    headers: { authorization: `Bearer ${key}`, accept: "application/json" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const info = (data.balance_infos || [])[0] || {};
  const remaining = Number(info.total_balance || 0);
  return {
    ok: data.is_available !== false,
    currency: info.currency || "USD",
    remaining,
    label: `${info.currency === "CNY" ? "¥" : "$"}${remaining.toFixed(2)} restante`
  };
}

// OpenRouter: creditos comprados menos usados.
async function openrouterBalance(key) {
  // Endpoint novo de creditos.
  try {
    const res = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { authorization: `Bearer ${key}` }
    });
    if (res.ok) {
      const d = (await res.json()).data || {};
      const remaining = Number(d.total_credits || 0) - Number(d.total_usage || 0);
      return { ok: true, currency: "USD", remaining, label: `$${remaining.toFixed(2)} restante` };
    }
  } catch { /* tenta o antigo */ }
  // Fallback: /auth/key (limite e uso da chave).
  const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
    headers: { authorization: `Bearer ${key}` }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = (await res.json()).data || {};
  if (d.limit == null) {
    return { ok: true, currency: "USD", remaining: null, label: `$${Number(d.usage || 0).toFixed(2)} usados (sem limite)` };
  }
  const remaining = Number(d.limit || 0) - Number(d.usage || 0);
  return { ok: true, currency: "USD", remaining, label: `$${remaining.toFixed(2)} restante` };
}

const FETCHERS = {
  deepseek: { secret: "DEEPSEEK_API_KEY", fn: deepseekBalance },
  openrouter: { secret: "OPENROUTER_API_KEY", fn: openrouterBalance }
};

/** Diz se este provedor expoe saldo real pela chave. */
export function temSaldoReal(providerId) {
  return Boolean(FETCHERS[providerId]);
}

/**
 * Busca o saldo real de um provedor (deepseek/openrouter). Retorna
 * { ok, currency, remaining, label } ou null se nao houver chave/endpoint.
 * Best-effort: nunca lanca (devolve { error } em caso de falha).
 */
export async function fetchBalance(providerId) {
  const f = FETCHERS[providerId];
  if (!f) return null;
  const key = await store.getSecret(f.secret);
  if (!key) return null;
  try {
    return await f.fn(key);
  } catch (e) {
    return { error: e.message || "falha ao consultar saldo" };
  }
}
