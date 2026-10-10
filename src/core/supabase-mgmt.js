// Core do SaaS (standalone). Este arquivo E a fonte da verdade: edite aqui.
// Nao rode `npm run sync-core` sem revisar — ele sobrescreve com a versao da extensao.
import * as store from "./storage.js";
import { SUPABASE_OAUTH } from "./config.js";

// ===========================================================================
//  Cliente da Management API do Supabase.
//  A pessoa conecta a conta DELA — por OAuth (login "sem token") ou colando um
//  token pessoal. Nada sensivel passa por terceiros: o access_token fica local;
//  so a troca code->token passa pelo mini-proxy (que guarda o client_secret).
//  Permite listar projetos, executar SQL (criar tabelas/policies) e Edge Fns.
// ===========================================================================

const MGMT = "https://api.supabase.com/v1";

export function oauthConfigurado() {
  return Boolean(SUPABASE_OAUTH.clientId && SUPABASE_OAUTH.workerUrl);
}

// ---- OAuth (PKCE) -----------------------------------------------------------
function base64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomToken(len = 32) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return base64url(arr);
}
async function pkceChallenge(verifier) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(hash));
}

// Renova o access_token usando o refresh_token (pelo Worker). Guarda os novos.
async function refreshAccessToken() {
  const sb = await store.get("supabase");
  if (!sb.refreshToken) { const e = new Error("Sessao do Supabase expirou. Conecte de novo."); e.supabaseAuth = true; throw e; }
  const res = await fetch(SUPABASE_OAUTH.workerUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "supabase", refresh_token: sb.refreshToken })
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) { const e = new Error("Nao consegui renovar a sessao do Supabase. Conecte de novo."); e.supabaseAuth = true; throw e; }
  const expiresAt = Date.now() + ((data.expires_in || 3600) * 1000);
  await store.patch("supabase", { token: data.access_token, refreshToken: data.refresh_token || sb.refreshToken, expiresAt });
  return data.access_token;
}

async function token() {
  const sb = await store.get("supabase");
  if (!sb.token) throw new Error("Supabase nao conectado. Conecte no painel (Entrar com Supabase).");
  // OAuth: renova antes de expirar (margem de 60s).
  if (sb.oauth && sb.expiresAt && Date.now() > sb.expiresAt - 60_000) {
    return await refreshAccessToken();
  }
  return sb.token;
}

async function mgmt(path, options = {}, _retried = false) {
  const res = await fetch(path.startsWith("http") ? path : MGMT + path, {
    ...options,
    headers: {
      authorization: `Bearer ${await token()}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 400);
    try { detail = JSON.parse(text).message || detail; } catch {}

    // O projeto ligado nao existe mais (apagado ou pausado no Supabase): a API
    // responde 404 "Resource has been removed". Sem este desligamento a extensao
    // continuava dizendo que o banco estava conectado (e vazio) para sempre, e a
    // IA mandava a pessoa "conectar" algo que ja estava conectado. Desfazemos o
    // vinculo aqui e devolvemos uma mensagem que a pessoa consegue entender.
    if (res.status === 404 && /\/projects\//.test(path)) {
      const ref = (path.match(/\/projects\/([^/]+)/) || [])[1] || "";
      const sb = await store.get("supabase");
      if (sb.projectRef && ref === sb.projectRef) {
        const nome = sb.projectName || sb.projectRef;
        await store.patch("supabase", { projectRef: "", projectName: "", url: "", anonKey: "" });
        const e = new Error(
          `O projeto Supabase ligado ("${nome}") nao existe mais: ele foi apagado ou pausado no Supabase. ` +
          "Escolha outro projeto na linha Supabase do painel; depois disso eu crio as tabelas na hora."
        );
        e.supabaseProjetoAusente = true;
        throw e;
      }
    }

    if (res.status === 401) {
      // Token OAuth pode ter expirado: renova uma vez e tenta de novo.
      const sb = await store.get("supabase");
      if (sb.oauth && sb.refreshToken && !_retried) {
        try { await refreshAccessToken(); } catch {}
        return mgmt(path, options, true);
      }
      const err = new Error("A sessao do Supabase nao foi aceita. Conecte de novo no painel.");
      err.supabaseAuth = true;
      throw err;
    }
    if (res.status === 429) throw new Error("Muitas requisicoes ao Supabase. Espere um minuto.");
    throw new Error(`Supabase ${res.status}: ${detail}`);
  }
  return text ? JSON.parse(text) : null;
}

// Login "sem token": abre a autorizacao do Supabase (PKCE), recebe o code,
// troca por access_token + refresh_token no Worker e guarda. Depois, o painel
// lista os projetos para a pessoa escolher qual conectar.
export async function startOAuthLogin() {
  const { clientId, workerUrl, authorizeUrl, scope } = SUPABASE_OAUTH;
  if (!clientId || !workerUrl) throw new Error("OAuth do Supabase nao configurado.");
  const redirectUri = chrome.identity.getRedirectURL();
  const verifier = randomToken(32);
  const codeChallenge = await pkceChallenge(verifier);
  const state = randomToken(16);

  let url = authorizeUrl +
    "?client_id=" + encodeURIComponent(clientId) +
    "&redirect_uri=" + encodeURIComponent(redirectUri) +
    "&response_type=code" +
    "&state=" + encodeURIComponent(state) +
    "&code_challenge=" + encodeURIComponent(codeChallenge) +
    "&code_challenge_method=S256";
  if (scope) url += "&scope=" + encodeURIComponent(scope);

  const redirectResponse = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  if (!redirectResponse) throw new Error("Login cancelado.");
  const u = new URL(redirectResponse);
  const erro = u.searchParams.get("error");
  if (erro) throw new Error("Supabase recusou: " + (u.searchParams.get("error_description") || erro));
  const code = u.searchParams.get("code");
  const retState = u.searchParams.get("state");
  if (!code) throw new Error("Nao recebi o code do Supabase. Confira a redirect URL do OAuth App.");
  if (retState !== state) throw new Error("State invalido — tente de novo.");

  let data;
  try {
    const res = await fetch(workerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "supabase", code, redirect_uri: redirectUri, code_verifier: verifier })
    });
    data = await res.json();
  } catch (e) {
    throw new Error("Nao consegui falar com o servidor de login. Confira a URL do Worker. (" + (e.message || e) + ")");
  }
  if (!data || !data.access_token) {
    throw new Error("Falha ao obter o token do Supabase: " + (data?.error_description || data?.error || "sem token"));
  }
  const expiresAt = Date.now() + ((data.expires_in || 3600) * 1000);
  await store.patch("supabase", {
    token: data.access_token,
    refreshToken: data.refresh_token || "",
    expiresAt,
    oauth: true
  });

  let username = "conta Supabase";
  try { const p = await validateToken(data.access_token); username = p.username || p.primary_email || username; } catch {}
  return { username };
}

/** Confere se o token vale, antes de depender dele. */
export async function validateToken(candidate) {
  const res = await fetch(`${MGMT}/profile`, { headers: { authorization: `Bearer ${candidate}` } });
  if (res.status === 401) throw new Error("Token recusado. Confira se copiou inteiro (comeca com sbp_).");
  if (!res.ok) throw new Error(`Supabase ${res.status} ao validar o token.`);
  return res.json();
}

/** Lista os projetos da conta, para a pessoa escolher qual usar. */
export async function listProjects() {
  const projs = await mgmt("/projects");
  return (projs || [])
    .map(p => ({ ref: p.id, name: p.name, region: p.region, status: p.status }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Busca URL e anon key do projeto — a pessoa nao precisa colar essas. */
export async function fetchProjectKeys(ref) {
  const url = `https://${ref}.supabase.co`;
  let anonKey = "";
  try {
    const keys = await mgmt(`/projects/${ref}/api-keys`);
    const anon = (keys || []).find(k => k.name === "anon" || k.tags === "anon");
    anonKey = anon?.api_key || "";
  } catch { /* a pessoa ainda pode colar manualmente depois */ }
  return { url, anonKey };
}

export async function connect(candidate) {
  const profile = await validateToken(candidate);
  await store.patch("supabase", { token: candidate });
  return { username: profile.username || profile.primary_email || "conta Supabase" };
}

export async function bindProject(ref, name) {
  const { url, anonKey } = await fetchProjectKeys(ref);
  await store.patch("supabase", { projectRef: ref, projectName: name, url, anonKey });
  return { ref, name, url, anonKey };
}

export async function disconnect() {
  await store.patch("supabase", { token: "", refreshToken: "", expiresAt: 0, oauth: false, projectRef: "", projectName: "", url: "", anonKey: "", keysCheckedAt: 0 });
}

export async function status() {
  const sb = await store.get("supabase");

  // Projeto ligado mas sem anon key (a busca falhou no bind, ou o projeto ja nao
  // existia na hora): tenta buscar de novo, no maximo uma vez a cada 5 minutos.
  // Sem a chave o front gerado nasce mudo — e se o projeto tiver sumido, esta
  // chamada e justamente a que desliga o vinculo e avisa a pessoa.
  if (sb.projectRef && !sb.anonKey && Date.now() - (sb.keysCheckedAt || 0) > 5 * 60_000) {
    await store.patch("supabase", { keysCheckedAt: Date.now() });
    try {
      const keys = await fetchProjectKeys(sb.projectRef);
      if (keys.anonKey) await store.patch("supabase", { anonKey: keys.anonKey, url: keys.url || sb.url });
    } catch { /* ou tenta de novo daqui a 5 min, ou ja desligou o vinculo */ }
  }

  const atual = await store.get("supabase");
  return {
    connected: Boolean(atual.token),
    projectRef: atual.projectRef || "",
    projectName: atual.projectName || "",
    url: atual.url || "",
    anonKey: atual.anonKey || "",
    hasAnonKey: Boolean(atual.anonKey)
  };
}

// ---- trava de seguranca: cria e altera, nunca destroi -----------------------

const PROIBIDO = [
  /\bdrop\s+(table|schema|database|column|type|function|trigger|policy|index|view)\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table\s+[\w".]+\s+drop\b/i
];

/** Analisa o SQL antes de rodar. Bloqueia comandos destrutivos. */
export function checarSql(sql) {
  const s = String(sql || "");
  if (!s.trim()) return { ok: false, motivo: "SQL vazio." };
  for (const re of PROIBIDO) {
    if (re.test(s)) {
      return { ok: false, motivo: "Comando que apaga dados foi bloqueado por seguranca. O assistente so cria e adiciona, nunca remove." };
    }
  }
  return { ok: true };
}

/** Roda SQL no banco do projeto ligado. Passa pela trava antes. */
export async function runSql(sql) {
  const sb = await store.get("supabase");
  if (!sb.projectRef) throw new Error("Nenhum projeto Supabase escolhido.");
  const check = checarSql(sql);
  if (!check.ok) { const e = new Error(check.motivo); e.blocked = true; throw e; }
  return mgmt(`/projects/${sb.projectRef}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query: sql })
  });
}

/** Lista as tabelas existentes, para a IA nao duplicar. */
export async function listTables() {
  const sb = await store.get("supabase");
  if (!sb.projectRef) return [];
  try {
    const rows = await mgmt(`/projects/${sb.projectRef}/database/query`, {
      method: "POST",
      body: JSON.stringify({
        query: `select table_name from information_schema.tables where table_schema='public' order by table_name;`,
        read_only: true
      })
    });
    return Array.isArray(rows) ? rows.map(r => r.table_name) : [];
  } catch (e) {
    // Projeto apagado: engolir o erro aqui faria a IA concluir "banco vazio".
    if (e?.supabaseProjetoAusente) throw e;
    return [];
  }
}

/** Descreve as colunas de uma tabela, para a IA escrever o front certo. */
export async function describeTable(nome) {
  const sb = await store.get("supabase");
  if (!sb.projectRef) return [];
  try {
    const rows = await mgmt(`/projects/${sb.projectRef}/database/query`, {
      method: "POST",
      body: JSON.stringify({
        query: `select column_name, data_type, is_nullable from information_schema.columns
                where table_schema='public' and table_name='${String(nome).replace(/'/g, "")}'
                order by ordinal_position;`,
        read_only: true
      })
    });
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

/** Publica (ou atualiza) uma Edge Function no projeto. */
export async function deployEdgeFunction(slug, code) {
  const sb = await store.get("supabase");
  if (!sb.projectRef) throw new Error("Nenhum projeto Supabase escolhido.");
  const nome = String(slug).replace(/[^a-z0-9-]/gi, "-").toLowerCase();

  // A API aceita criar; se ja existir, atualizamos com PATCH.
  const corpo = { slug: nome, name: nome, body: code, verify_jwt: false };
  try {
    return await mgmt(`/projects/${sb.projectRef}/functions`, {
      method: "POST",
      body: JSON.stringify(corpo)
    });
  } catch (err) {
    if (/already exists|duplicate|409/i.test(err.message)) {
      return mgmt(`/projects/${sb.projectRef}/functions/${nome}`, {
        method: "PATCH",
        body: JSON.stringify({ body: code, verify_jwt: false })
      });
    }
    throw err;
  }
}

export async function listFunctions() {
  const sb = await store.get("supabase");
  if (!sb.projectRef) return [];
  try {
    const fns = await mgmt(`/projects/${sb.projectRef}/functions`);
    return (fns || []).map(f => f.slug || f.name);
  } catch { return []; }
}

/**
 * Cria ou atualiza variaveis secretas do projeto (secrets das Edge Functions).
 * Ex.: a chave do Google Maps — fica guardada no Supabase, nunca no codigo.
 * pares: { NOME: valor, ... }
 */
export async function setSecrets(pares) {
  const sb = await store.get("supabase");
  if (!sb.projectRef) throw new Error("Nenhum projeto Supabase escolhido.");
  const body = Object.entries(pares || {}).map(([name, value]) => ({ name: String(name), value: String(value) }));
  if (!body.length) throw new Error("Nenhuma variavel para salvar.");
  return mgmt(`/projects/${sb.projectRef}/secrets`, { method: "POST", body: JSON.stringify(body) });
}
