// ============================================================================
// oauth-web.js — login "sem codigo" na versao WEB (substitui chrome.identity)
// ----------------------------------------------------------------------------
// A extensao usa chrome.identity.launchWebAuthFlow (abre janela, volta em
// <id>.chromiumapp.org). Na web o padrao e mais simples: redireciona a propria
// aba para a tela de autorizacao e volta para a origem do app com ?code=&state=.
// No boot, handleOAuthRedirect() detecta o retorno, troca o code por token no
// Worker e guarda igual a extensao (store.patch). O resto do core (github.js,
// supabase-mgmt.js) nao muda — so nao chamamos os startOAuthLogin() deles.
//
// >>> IMPORTANTE (cadastro no provedor):
//   GitHub  OAuth App  -> Authorization callback URL = a ORIGEM deste app
//                         (ex.: http://localhost:5173/ em dev, https://seudominio/ em prod)
//   Supabase OAuth App -> Redirect URI = a MESMA origem.
//   O client_secret continua SO no Worker. clientId/workerUrl sao os de config.js.
// ============================================================================

import * as store from "./storage.js";
import { GITHUB_OAUTH, SUPABASE_OAUTH } from "./config.js";
import { validateToken } from "./github.js";

const PENDING_KEY = "copilot:oauth_pending";
const redirectUri = () => window.location.origin + "/";

function randomToken(n = 32) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
}
function base64url(bytes) {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(digest);
}

function savePending(p) { sessionStorage.setItem(PENDING_KEY, JSON.stringify(p)); }
function readPending() {
  try { return JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null"); } catch { return null; }
}
function clearPending() { sessionStorage.removeItem(PENDING_KEY); }

export function githubConfigurado() {
  return Boolean(GITHUB_OAUTH.clientId && GITHUB_OAUTH.workerUrl);
}
export function supabaseConfigurado() {
  return Boolean(SUPABASE_OAUTH.clientId && SUPABASE_OAUTH.workerUrl);
}

// --- inicio dos fluxos (redireciona a aba) ----------------------------------

export function startGithubLoginWeb() {
  const { clientId, scope } = GITHUB_OAUTH;
  const state = randomToken(16);
  savePending({ provider: "github", state, redirectUri: redirectUri() });
  const url =
    "https://github.com/login/oauth/authorize" +
    "?client_id=" + encodeURIComponent(clientId) +
    "&redirect_uri=" + encodeURIComponent(redirectUri()) +
    "&scope=" + encodeURIComponent(scope) +
    "&state=" + encodeURIComponent(state);
  window.location.assign(url);
}

export async function startSupabaseLoginWeb() {
  const { clientId, authorizeUrl, scope } = SUPABASE_OAUTH;
  const state = randomToken(16);
  const verifier = randomToken(48);
  const challenge = await pkceChallenge(verifier);
  savePending({ provider: "supabase", state, verifier, redirectUri: redirectUri() });
  const url =
    authorizeUrl +
    "?response_type=code" +
    "&client_id=" + encodeURIComponent(clientId) +
    "&redirect_uri=" + encodeURIComponent(redirectUri()) +
    "&code_challenge=" + encodeURIComponent(challenge) +
    "&code_challenge_method=S256" +
    "&state=" + encodeURIComponent(state) +
    (scope ? "&scope=" + encodeURIComponent(scope) : "");
  window.location.assign(url);
}

// --- retorno (chamar no boot, antes de renderizar a UI) ---------------------
// Devolve { provider, login? } quando concluiu um login; null quando nao ha
// retorno pendente na URL. Lanca Error com mensagem amigavel em caso de falha.

export async function handleOAuthRedirect() {
  const qs = new URLSearchParams(window.location.search);
  const code = qs.get("code");
  const err = qs.get("error");
  const retState = qs.get("state");
  if (!code && !err) return null; // nao e um retorno de OAuth

  const pending = readPending();
  // Limpa a URL (tira ?code=...) para nao repetir a troca no F5.
  window.history.replaceState({}, document.title, window.location.pathname);
  clearPending();

  if (err) throw new Error("Autorizacao recusada: " + (qs.get("error_description") || err));
  if (!pending) throw new Error("Retorno de login sem contexto. Tente conectar de novo.");
  if (retState !== pending.state) throw new Error("State invalido — tente de novo.");

  if (pending.provider === "github") {
    const res = await fetch(GITHUB_OAUTH.workerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, redirect_uri: pending.redirectUri })
    });
    const data = await res.json().catch(() => ({}));
    if (!data.access_token) throw new Error("Falha ao obter token do GitHub: " + (data.error_description || data.error || "sem token"));
    const perfil = await validateToken(data.access_token);
    await store.patch("github", { token: data.access_token, login: perfil.login, avatar: perfil.avatar });
    return { provider: "github", login: perfil.login, semRepo: perfil.semRepo };
  }

  if (pending.provider === "supabase") {
    const res = await fetch(SUPABASE_OAUTH.workerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "supabase",
        code,
        redirect_uri: pending.redirectUri,
        code_verifier: pending.verifier
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!data.access_token) throw new Error("Falha ao obter token do Supabase: " + (data.error_description || data.error || "sem token"));
    await store.patch("supabase", {
      oauth: true,
      token: data.access_token,
      refreshToken: data.refresh_token || "",
      expiresAt: Date.now() + (Number(data.expires_in || 3600) * 1000)
    });
    return { provider: "supabase" };
  }

  throw new Error("Provedor de login desconhecido.");
}
