var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// github-oauth-worker.js
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  // "*" libera qualquer header custom no preflight (sem precisar listar um a um
  // a cada provedor novo). Authorization precisa vir explicito — o curinga "*"
  // nao cobre ele pela spec de CORS.
  "Access-Control-Allow-Headers": "*, Authorization",
  "Access-Control-Max-Age": "86400"
};
var PROXY_ALLOW = [
  /(^|\.)api\.vercel\.com$/i,
  /(^|\.)api\.supabase\.com$/i,
  // Provedores de IA que bloqueiam CORS no navegador (usados pelo SaaS web).
  /(^|\.)api\.deepseek\.com$/i,
  /(^|\.)api\.mistral\.ai$/i,
  /(^|\.)api\.groq\.com$/i,
  /(^|\.)openrouter\.ai$/i,
  /(^|\.)api\.x\.ai$/i
];
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...CORS }
  });
}
__name(json, "json");
async function trocaGithub(body, env) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return json({ error: "github_nao_configurado" }, 500);
  const ehRefresh = Boolean(body.refresh_token) && !body.code;
  if (!ehRefresh && !body.code) return json({ error: "missing_code" }, 400);
  const payload = ehRefresh ? {
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: body.refresh_token
  } : {
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    code: body.code,
    // O fluxo web (SaaS) envia redirect_uri no authorize; o GitHub exige o
    // MESMO valor aqui na troca. A extensao nao envia (fica undefined -> omitido).
    ...body.redirect_uri ? { redirect_uri: body.redirect_uri } : {}
  };
  let data;
  try {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/json", "accept": "application/json", "user-agent": "copilot-code-oauth" },
      body: JSON.stringify(payload)
    });
    data = await res.json();
  } catch (e) {
    return json({ error: "falha_ao_trocar", detail: String(e && e.message || e) }, 502);
  }
  return json({
    access_token: data.access_token || null,
    refresh_token: data.refresh_token || null,
    expires_in: data.expires_in || null,
    refresh_token_expires_in: data.refresh_token_expires_in || null,
    token_type: data.token_type || null,
    scope: data.scope || null,
    error: data.error || null,
    error_description: data.error_description || null
  });
}
__name(trocaGithub, "trocaGithub");
async function trocaSupabase(body, env) {
  if (!env.SUPABASE_OAUTH_CLIENT_ID || !env.SUPABASE_OAUTH_CLIENT_SECRET) return json({ error: "supabase_nao_configurado" }, 500);
  const form = new URLSearchParams();
  if (body.refresh_token) {
    form.set("grant_type", "refresh_token");
    form.set("refresh_token", body.refresh_token);
  } else if (body.code) {
    form.set("grant_type", "authorization_code");
    form.set("code", body.code);
    form.set("redirect_uri", body.redirect_uri || "");
    if (body.code_verifier) form.set("code_verifier", body.code_verifier);
  } else {
    return json({ error: "missing_code_or_refresh" }, 400);
  }
  const basic = btoa(env.SUPABASE_OAUTH_CLIENT_ID + ":" + env.SUPABASE_OAUTH_CLIENT_SECRET);
  let data;
  try {
    const res = await fetch("https://api.supabase.com/v1/oauth/token", {
      method: "POST",
      headers: { "authorization": "Basic " + basic, "content-type": "application/x-www-form-urlencoded", "accept": "application/json" },
      body: form.toString()
    });
    data = await res.json();
  } catch (e) {
    return json({ error: "falha_ao_trocar", detail: String(e && e.message || e) }, 502);
  }
  return json({
    access_token: data.access_token || null,
    refresh_token: data.refresh_token || null,
    expires_in: data.expires_in || null,
    token_type: data.token_type || null,
    error: data.error || null,
    error_description: data.error_description || data.msg || data.message || null
  });
}
__name(trocaSupabase, "trocaSupabase");
// =============================== NOVO ========================================
// Troca o code da Vercel por um token de integracao.
//
// Dois detalhes que derrubam quem copia do fluxo do GitHub acima:
//   1) o endereco tem /v2/  ->  https://api.vercel.com/v2/oauth/access_token
//   2) o corpo e form-urlencoded, NAO JSON (o do GitHub aqui e JSON)
//
// A resposta da Vercel vem assim:
//   { token_type, access_token, installation_id, user_id, team_id }
//
// team_id e o campo que importa alem do token: quando NAO e null, a integracao
// foi instalada num TIME, e dai pra frente toda chamada a API da Vercel precisa
// levar ?teamId=... O app guarda esse valor e o anexa sozinho.
//
// Nao existe refresh_token aqui: o token da Vercel e de vida longa. Quem revoga
// e o dono da conta, desinstalando a integracao no painel dela.
//
// Variaveis aceitas (as duas formas, porque o GitHub usa GITHUB_CLIENT_ID e o
// Supabase usa SUPABASE_OAUTH_CLIENT_ID — a nomenclatura ja estava misturada):
//   VERCEL_CLIENT_ID / VERCEL_CLIENT_SECRET
//   VERCEL_OAUTH_CLIENT_ID / VERCEL_OAUTH_CLIENT_SECRET
async function trocaVercel(body, env) {
  const clientId = env.VERCEL_CLIENT_ID || env.VERCEL_OAUTH_CLIENT_ID;
  const clientSecret = env.VERCEL_CLIENT_SECRET || env.VERCEL_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return json({ error: "vercel_nao_configurado" }, 500);
  if (!body.code) return json({ error: "missing_code" }, 400);

  const form = new URLSearchParams();
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);
  form.set("code", body.code);
  // Precisa ser IGUAL ao Redirect URL cadastrado no console da Vercel — ate a
  // barra no final conta.
  form.set("redirect_uri", body.redirect_uri || "");

  let data, status;
  try {
    const res = await fetch("https://api.vercel.com/v2/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "accept": "application/json" },
      body: form.toString()
    });
    status = res.status;
    data = await res.json();
  } catch (e) {
    return json({ error: "falha_ao_trocar", detail: String(e && e.message || e) }, 502);
  }
  return json({
    access_token: data.access_token || null,
    token_type: data.token_type || null,
    installation_id: data.installation_id || null,
    user_id: data.user_id || null,
    // Cuidado: null aqui significa "conta pessoal", que e diferente de ausente.
    team_id: data.team_id === void 0 ? null : data.team_id,
    error: data.error || (data.access_token ? null : "http_" + status) || null,
    error_description: data.error_description || data.message || null
  });
}
__name(trocaVercel, "trocaVercel");
// Diagnostico: diz quais segredos o Worker enxerga, sem revelar valor nenhum.
// Pode apagar esta funcao e a linha que a chama — nada do app depende dela.
function status(env) {
  return json({
    ok: true,
    segredos: {
      github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
      supabase: Boolean(env.SUPABASE_OAUTH_CLIENT_ID && env.SUPABASE_OAUTH_CLIENT_SECRET),
      vercel: Boolean(
        (env.VERCEL_CLIENT_ID || env.VERCEL_OAUTH_CLIENT_ID) &&
        (env.VERCEL_CLIENT_SECRET || env.VERCEL_OAUTH_CLIENT_SECRET)
      )
    }
  });
}
__name(status, "status");
// ============================= FIM DO NOVO ===================================
async function handleProxy(request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return json({ error: "missing_url" }, 400);
  let host;
  try {
    host = new URL(target).host;
  } catch {
    return json({ error: "url_invalida" }, 400);
  }
  if (!PROXY_ALLOW.some((re) => re.test(host))) return json({ error: "host_nao_permitido", host }, 403);
  const headers = new Headers(request.headers);
  ["host", "origin", "referer", "cf-connecting-ip", "cf-ipcountry", "x-forwarded-for"].forEach((h) => headers.delete(h));
  const init = { method: request.method, headers, redirect: "follow" };
  if (!["GET", "HEAD"].includes(request.method)) init.body = await request.arrayBuffer();
  let upstream;
  try {
    upstream = await fetch(target, init);
  } catch (e) {
    return json({ error: "falha_no_proxy", detail: String(e && e.message || e) }, 502);
  }
  const out = new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: upstream.headers });
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
}
__name(handleProxy, "handleProxy");
var github_oauth_worker_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    if (url.pathname.replace(/\/+$/, "").endsWith("/proxy")) return handleProxy(request);
    if (url.pathname.replace(/\/+$/, "").endsWith("/status")) return status(env);   // NOVO
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const provider = body && body.provider || "github";
    if (provider === "github") return trocaGithub(body, env);
    if (provider === "supabase") return trocaSupabase(body, env);
    if (provider === "vercel") return trocaVercel(body, env);   // NOVO
    return json({ error: "provider_desconhecido" }, 400);
  }
};
export {
  github_oauth_worker_default as default
};
//# sourceMappingURL=github-oauth-worker.js.map
