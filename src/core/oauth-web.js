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
import { GITHUB_OAUTH, SUPABASE_OAUTH, VERCEL_OAUTH } from "./config.js";
import { validateToken } from "./github.js";
// Relogio unico cobrindo requisicao + leitura do corpo (ver net.js): este e o
// caminho de login REAL da versao web, e sem prazo um Worker lento deixava a
// pessoa olhando uma tela de "conectando" que nunca terminava.
import { fetchComCorpo, ehTimeout, PRAZO } from "./net.js";

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
export function vercelConfigurado() {
  return Boolean(VERCEL_OAUTH.slug && VERCEL_OAUTH.workerUrl);
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

/**
 * Vercel. Diferente do GitHub e do Supabase: nao existe uma tela generica de
 * "authorize" com client_id na URL. A Vercel chama isto de "external
 * installation flow" — manda-se a pessoa para a pagina da integracao, ela
 * escolhe a conta ou o time, e a Vercel devolve para o Redirect URL cadastrado
 * no console (NAO para um redirect_uri que a gente mande aqui).
 *
 * Por isso so vai o state na URL. E por isso tambem o Redirect URL do console
 * precisa bater com a origem onde o app roda: se o Vite subir em 5174 porque a
 * 5173 estava ocupada, a Vercel devolve na 5173 assim mesmo e o login se perde.
 */
export function startVercelLoginWeb() {
  const { slug } = VERCEL_OAUTH;
  const state = randomToken(16);
  savePending({ provider: "vercel", state, redirectUri: redirectUri() });
  window.location.assign(
    `https://vercel.com/integrations/${encodeURIComponent(slug)}/new` +
    `?state=${encodeURIComponent(state)}`
  );
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
    let data = {};
    try {
      const { text } = await fetchComCorpo(GITHUB_OAUTH.workerUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, redirect_uri: pending.redirectUri })
      }, PRAZO.oauth);
      try { data = JSON.parse(text); } catch {}
    } catch (e) {
      throw new Error(ehTimeout(e)
        ? "O servidor de login nao respondeu em " + Math.round(PRAZO.oauth / 1000) + "s. Tente conectar de novo."
        : "Nao consegui falar com o servidor de login (" + (e.message || e) + ").");
    }
    if (!data.access_token) throw new Error("Falha ao obter token do GitHub: " + (data.error_description || data.error || "sem token"));
    const perfil = await validateToken(data.access_token);
    // GitHub App devolve refresh_token + expires_in (~8h): guardar pra o app
    // renovar sozinho depois (github.js renovarTokenSePreciso) e a conexao
    // sobreviver ao fechamento/reabertura.
    await store.patch("github", {
      token: data.access_token,
      login: perfil.login,
      avatar: perfil.avatar,
      refreshToken: data.refresh_token || "",
      tokenExpiresAt: data.expires_in ? Date.now() + (Number(data.expires_in) - 60) * 1000 : 0
    });
    return { provider: "github", login: perfil.login, semRepo: perfil.semRepo };
  }

  if (pending.provider === "supabase") {
    let data = {};
    try {
      const { text } = await fetchComCorpo(SUPABASE_OAUTH.workerUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "supabase",
          code,
          redirect_uri: pending.redirectUri,
          code_verifier: pending.verifier
        })
      }, PRAZO.oauth);
      try { data = JSON.parse(text); } catch {}
    } catch (e) {
      throw new Error(ehTimeout(e)
        ? "O servidor de login nao respondeu em " + Math.round(PRAZO.oauth / 1000) + "s. Tente conectar de novo."
        : "Nao consegui falar com o servidor de login (" + (e.message || e) + ").");
    }
    if (!data.access_token) throw new Error("Falha ao obter token do Supabase: " + (data.error_description || data.error || "sem token"));
    await store.patch("supabase", {
      oauth: true,
      token: data.access_token,
      refreshToken: data.refresh_token || "",
      expiresAt: Date.now() + (Number(data.expires_in || 3600) * 1000)
    });
    return { provider: "supabase" };
  }

  if (pending.provider === "vercel") {
    let data = {};
    try {
      const { text } = await fetchComCorpo(VERCEL_OAUTH.workerUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "vercel", code, redirect_uri: pending.redirectUri })
      }, PRAZO.oauth);
      try { data = JSON.parse(text); } catch {}
    } catch (e) {
      throw new Error(ehTimeout(e)
        ? "O servidor de login nao respondeu em " + Math.round(PRAZO.oauth / 1000) + "s. Tente conectar de novo."
        : "Nao consegui falar com o servidor de login (" + (e.message || e) + ").");
    }
    if (!data.access_token) throw new Error("Falha ao obter o token da Vercel: " + (data.error_description || data.error || "sem token"));

    // O token entra no MESMO lugar onde o campo "colar token" sempre guardou.
    // E o que faz todo o vercel.js continuar funcionando sem saber se a pessoa
    // colou um token a mao ou clicou em Conectar.
    await store.patch("secrets", { VERCEL_TOKEN: data.access_token });

    // teamId: quando a integracao e instalada num TIME, a API da Vercel so
    // enxerga os recursos se cada chamada levar ?teamId=... Sem ele, as listas
    // voltam vazias e as escritas dao 403 sem explicar por que. Numa conta
    // pessoal vem null, e ai nao muda nada.
    await store.patch("vercel", {
      oauth: true,
      teamId: data.team_id || qs.get("teamId") || "",
      configurationId: data.installation_id || qs.get("configurationId") || ""
    });

    // A Vercel manda tambem um "next" para fechar o popup da instalacao. Aqui o
    // fluxo e de aba inteira, entao seguir o next so jogaria a pessoa de volta
    // para o site da Vercel — o token ja esta trocado, e ficamos no app.
    return { provider: "vercel" };
  }

  throw new Error("Provedor de login desconhecido.");
}
