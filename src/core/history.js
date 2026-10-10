// Core do SaaS (standalone). Este arquivo E a fonte da verdade: edite aqui.
// Nao rode `npm run sync-core` sem revisar — ele sobrescreve com a versao da extensao.
// ============================================================================
// history.js — historico de conversas (COMPARTILHADO: extensao + SaaS)
// ----------------------------------------------------------------------------
// Usa store (storage.js), entao funciona igual nos dois:
//   - extensao: chrome.storage.local
//   - SaaS web: localStorage
// Nao precisa de banco de dados nenhum: e 100% local e sem manutencao. Quando o
// SaaS ganhar contas/nuvem, o Supabase entra so para SINCRONIZAR entre
// dispositivos — a estrutura de sessao aqui continua a mesma.
//
// Guardado na chave "sessions": um array de sessoes, mais recente primeiro.
// Cada sessao: { id, title, kind, repo, createdAt, updatedAt, messages: [...] }
// Cada mensagem: { role: "user"|"assistant", text, ts, meta? }
// ============================================================================

import * as store from "./storage.js";

const MAX_SESSIONS = 50;           // teto para o storage nao crescer sem limite
const MAX_MSGS_PER_SESSION = 200;  // conversas muito longas perdem as mais antigas
const MAX_TEXT = 20000;            // corta texto gigante (arquivo colado) por mensagem

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function all() {
  const s = await store.get("sessions");
  return Array.isArray(s) ? s : [];
}

/** Lista as sessoes SEM as mensagens (leve, para montar o menu lateral). */
export async function listSessions() {
  const list = await all();
  return list.map(({ messages, ...meta }) => ({ ...meta, count: messages ? messages.length : 0 }));
}

/** Sessao completa (com mensagens) por id. */
export async function getSession(id) {
  return (await all()).find(x => x.id === id) || null;
}

/** Cria uma sessao nova e devolve o id. */
export async function createSession({ title = "Nova conversa", kind = "app", repo = null } = {}) {
  const list = await all();
  const sess = { id: uid(), title, kind, repo, createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
  list.unshift(sess);
  while (list.length > MAX_SESSIONS) list.pop();
  await store.set("sessions", list);
  return sess.id;
}

/** Adiciona uma mensagem a uma sessao (e sobe ela para o topo do historico). */
export async function appendMessage(id, { role, text, meta }) {
  const list = await all();
  const idx = list.findIndex(x => x.id === id);
  if (idx === -1) return;
  const sess = list[idx];
  sess.messages.push({
    role,
    text: String(text || "").slice(0, MAX_TEXT),
    ts: Date.now(),
    ...(meta ? { meta } : {})
  });
  while (sess.messages.length > MAX_MSGS_PER_SESSION) sess.messages.shift();
  sess.updatedAt = Date.now();
  // Titulo automatico: primeira fala do usuario vira o nome da conversa.
  if ((!sess.title || sess.title === "Nova conversa") && role === "user" && text) {
    sess.title = String(text).replace(/\s+/g, " ").trim().slice(0, 48) || "Nova conversa";
  }
  if (idx > 0) { list.splice(idx, 1); list.unshift(sess); }
  await store.set("sessions", list);
}

export async function renameSession(id, title) {
  const list = await all();
  const sess = list.find(x => x.id === id);
  if (!sess) return;
  sess.title = String(title || "").slice(0, 80) || sess.title;
  sess.updatedAt = Date.now();
  await store.set("sessions", list);
}

/** Liga um repositorio (owner/name/branch/url) a sessao — para reabrir depois. */
export async function setSessionRepo(id, repo) {
  const list = await all();
  const sess = list.find(x => x.id === id);
  if (!sess) return;
  sess.repo = repo;
  sess.updatedAt = Date.now();
  await store.set("sessions", list);
}

export async function deleteSession(id) {
  const list = await all();
  await store.set("sessions", list.filter(x => x.id !== id));
}

export async function clearAll() {
  await store.set("sessions", []);
}
