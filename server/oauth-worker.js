// ============================================================================
// oauth-worker.js — o Worker da Cloudflare que o SaaS usa
// ----------------------------------------------------------------------------
// Ele existe por dois motivos, e so por esses:
//
//  1) GUARDAR OS SEGREDOS. A troca de "code" por token exige o client_secret.
//     Se ele estivesse no site, qualquer pessoa abriria o navegador e o leria.
//     Entao o site manda so o code pra ca, e o segredo nunca sai daqui.
//
//  2) RESOLVER O CORS. O navegador bloqueia chamadas diretas a api.vercel.com,
//     api.supabase.com e a varias IAs — elas nao mandam os cabecalhos de CORS.
//     A rota /proxy refaz a chamada do lado do servidor e devolve com CORS *.
//
// Cole este arquivo inteiro em dash.cloudflare.com -> Workers & Pages ->
// copilot-oauth -> Edit code -> Deploy.
//
// ----------------------------------------------------------------------------
// ROTAS
//   GET  /status            quais segredos estao configurados (so true/false)
//   ANY  /proxy?url=<url>   repassa a chamada (e o CORS) pro destino
//   POST /                  troca/renova token de OAuth, conforme o corpo:
//       { code }                                           -> GitHub (login)
//       { grant_type:"refresh_token", refresh_token }      -> GitHub (renova)
//       { provider:"supabase", code, redirect_uri, code_verifier }
//       { provider:"supabase", refresh_token }
//       { provider:"vercel",   code, redirect_uri }        -> Vercel (login)
//
// ----------------------------------------------------------------------------
// VARIAVEIS (Settings -> Variables and Secrets -> tipo "Secret")
//   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
//   SUPABASE_CLIENT_ID / SUPABASE_CLIENT_SECRET
//   VERCEL_CLIENT_ID / VERCEL_CLIENT_SECRET      <- as novas
//
// Se no seu Worker elas tiverem outro nome, o codigo abaixo tambem aceita os
// apelidos mais comuns (GH_CLIENT_ID, CLIENT_SECRET...). Abra /status depois do
// deploy: ele diz exatamente quais ele conseguiu achar.
// ============================================================================

// Hosts que a rota /proxy aceita. E a MESMA lista de PROXIED_HOSTS em
// src/core/net.js — se adicionar um provedor de IA la, adicione aqui tambem,
// senao a chamada volta com "host_nao_permitido".
//
// Por que a lista existe: sem ela, este endereco vira um proxy aberto, e proxy
// aberto na internet e achado e usado por terceiros — gastando a sua cota da
// Cloudflare e colocando o seu dominio no meio de trafego que nao e seu.
const HOSTS_PERMITIDOS = [
  /(^|\.)api\.vercel\.com$/i,
  /(^|\.)api\.supabase\.com$/i,
  /(^|\.)api\.deepseek\.com$/i,
  /(^|\.)api\.mistral\.ai$/i,
  /(^|\.)api\.groq\.com$/i,
  /(^|\.)openrouter\.ai$/i,
  /(^|\.)api\.x\.ai$/i
];

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-max-age": "86400"
};

function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS }
  });
}

// Aceita o nome oficial da variavel ou apelidos, pra este arquivo cair no seu
// Worker sem voce ter que renomear nada.
function segredo(env, ...nomes) {
  for (const n of nomes) if (env[n]) return env[n];
  return "";
}
const credenciais = env => ({
  github: {
    id: segredo(env, "GITHUB_CLIENT_ID", "GH_CLIENT_ID", "CLIENT_ID"),
    secret: segredo(env, "GITHUB_CLIENT_SECRET", "GH_CLIENT_SECRET", "CLIENT_SECRET")
  },
  supabase: {
    id: segredo(env, "SUPABASE_CLIENT_ID", "SB_CLIENT_ID"),
    secret: segredo(env, "SUPABASE_CLIENT_SECRET", "SB_CLIENT_SECRET")
  },
  vercel: {
    id: segredo(env, "VERCEL_CLIENT_ID", "VC_CLIENT_ID"),
    secret: segredo(env, "VERCEL_CLIENT_SECRET", "VC_CLIENT_SECRET")
  }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Preflight do navegador (o content-type: application/json o dispara).
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === "/status") return rotaStatus(env);
    if (url.pathname === "/proxy") return rotaProxy(request, url);
    if (url.pathname === "/" || url.pathname === "") {
      if (request.method !== "POST") {
        return json({ error: "method_not_allowed", dica: "Use POST com o code, ou abra /status." }, 405);
      }
      return rotaOAuth(request, env);
    }
    return json({ error: "not_found", rota: url.pathname }, 404);
  }
};

// ---------------------------------------------------------------- /status ---
// Diagnostico sem vazar nada: so diz se achou cada segredo, nunca o valor.
function rotaStatus(env) {
  const c = credenciais(env);
  return json({
    ok: true,
    segredos: {
      github: { id: Boolean(c.github.id), secret: Boolean(c.github.secret) },
      supabase: { id: Boolean(c.supabase.id), secret: Boolean(c.supabase.secret) },
      vercel: { id: Boolean(c.vercel.id), secret: Boolean(c.vercel.secret) }
    },
    hostsPermitidos: HOSTS_PERMITIDOS.map(String)
  });
}

// ----------------------------------------------------------------- /proxy ---
async function rotaProxy(request, url) {
  const destino = url.searchParams.get("url");
  // Resposta usada como teste de vida no CONECTAR.md — nao mude este texto.
  if (!destino) return json({ error: "missing_url" }, 400);

  let alvo;
  try { alvo = new URL(destino); }
  catch { return json({ error: "url_invalida", destino }, 400); }

  if (!HOSTS_PERMITIDOS.some(re => re.test(alvo.host))) {
    return json({
      error: "host_nao_permitido",
      host: alvo.host,
      dica: "Adicione o host em HOSTS_PERMITIDOS neste Worker e em PROXIED_HOSTS (src/core/net.js)."
    }, 403);
  }

  // Repassa os cabecalhos do app (authorization, x-api-key, anthropic-version…)
  // e tira os que pertencem a ESTA conexao — mandar o host/origin original faz
  // o destino recusar, e o content-length deixa de bater se o corpo mudar.
  const cab = new Headers();
  for (const [k, v] of request.headers) {
    const nome = k.toLowerCase();
    if (nome === "host" || nome === "origin" || nome === "referer") continue;
    if (nome === "content-length" || nome === "connection") continue;
    if (nome.startsWith("cf-") || nome.startsWith("x-forwarded-")) continue;
    cab.set(k, v);
  }

  let resposta;
  try {
    resposta = await fetch(alvo.toString(), {
      method: request.method,
      headers: cab,
      // GET/HEAD nao tem corpo; o resto vai em stream, sem carregar na memoria.
      body: (request.method === "GET" || request.method === "HEAD") ? undefined : request.body,
      redirect: "follow"
    });
  } catch (e) {
    return json({ error: "falha_no_proxy", detalhe: String(e && e.message || e) }, 502);
  }

  // ATENCAO: o corpo volta em STREAM, de proposito. O streamComplete() em
  // src/core/providers.js le a resposta da IA aos poucos (res.body.getReader()).
  // Se aqui fizesse await resposta.text(), a geracao so apareceria no fim —
  // e um texto longo estouraria o limite de memoria do Worker.
  const saida = new Headers(resposta.headers);
  // O runtime ja entregou o corpo descomprimido e com outro tamanho: manter
  // estes cabecalhos faria o navegador tentar descomprimir de novo e falhar.
  saida.delete("content-encoding");
  saida.delete("content-length");
  saida.delete("transfer-encoding");
  // O CORS que vale e o nosso (o destino pode nem mandar, ou mandar restrito).
  for (const [k, v] of Object.entries(CORS)) saida.set(k, v);

  return new Response(resposta.body, { status: resposta.status, headers: saida });
}

// ------------------------------------------------------------------- / ------
async function rotaOAuth(request, env) {
  let corpo = {};
  try { corpo = await request.json(); }
  catch { return json({ error: "corpo_invalido", error_description: "Esperava JSON." }, 400); }

  const c = credenciais(env);
  const provider = String(corpo.provider || "github").toLowerCase();

  try {
    if (provider === "supabase") return await oauthSupabase(corpo, c.supabase);
    if (provider === "vercel") return await oauthVercel(corpo, c.vercel);
    return await oauthGithub(corpo, c.github);
  } catch (e) {
    return json({ error: "falha_na_troca", error_description: String(e && e.message || e) }, 502);
  }
}

function faltaCredencial(servico) {
  return json({
    error: "sem_credenciais",
    error_description: `O Worker nao tem o client id/secret ${servico}. Configure em Settings -> Variables and Secrets e confira em /status.`
  }, 500);
}

// --- GitHub -----------------------------------------------------------------
// Mesmo endpoint para login e renovacao; muda so o grant_type. O "accept:
// application/json" e obrigatorio: sem ele o GitHub responde em querystring.
async function oauthGithub(corpo, cred) {
  if (!cred.id || !cred.secret) return faltaCredencial("do GitHub");

  const form = new URLSearchParams({ client_id: cred.id, client_secret: cred.secret });
  if (corpo.grant_type === "refresh_token") {
    if (!corpo.refresh_token) return json({ error: "sem_refresh_token" }, 400);
    form.set("grant_type", "refresh_token");
    form.set("refresh_token", corpo.refresh_token);
  } else {
    if (!corpo.code) return json({ error: "sem_code" }, 400);
    form.set("code", corpo.code);
    // O fluxo web manda redirect_uri; o da extensao, nao. So envia se veio.
    if (corpo.redirect_uri) form.set("redirect_uri", corpo.redirect_uri);
  }

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: form.toString()
  });
  // Devolve a resposta do GitHub como veio: o app depende dos codigos de erro
  // dele (bad_refresh_token / invalid_grant) pra saber quando desconectar.
  return json(await res.json().catch(() => ({ error: "resposta_ilegivel_do_github" })), 200);
}

// --- Supabase ---------------------------------------------------------------
// Aqui o client id/secret vao no cabecalho Basic, nao no corpo (e o que a
// documentacao do Supabase manda). O corpo e form-urlencoded.
async function oauthSupabase(corpo, cred) {
  if (!cred.id || !cred.secret) return faltaCredencial("do Supabase");

  const form = new URLSearchParams();
  if (corpo.refresh_token && !corpo.code) {
    form.set("grant_type", "refresh_token");
    form.set("refresh_token", corpo.refresh_token);
  } else {
    if (!corpo.code) return json({ error: "sem_code" }, 400);
    form.set("grant_type", "authorization_code");
    form.set("code", corpo.code);
    if (corpo.redirect_uri) form.set("redirect_uri", corpo.redirect_uri);
    if (corpo.code_verifier) form.set("code_verifier", corpo.code_verifier);  // PKCE
  }

  const res = await fetch("https://api.supabase.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
      authorization: "Basic " + btoa(`${cred.id}:${cred.secret}`)
    },
    body: form.toString()
  });
  return json(await res.json().catch(() => ({ error: "resposta_ilegivel_do_supabase" })), 200);
}

// --- Vercel -----------------------------------------------------------------
// A novidade. Dois detalhes que derrubam quem copia do fluxo do GitHub:
//   1) o endereco tem /v2/  -> https://api.vercel.com/v2/oauth/access_token
//   2) o corpo e form-urlencoded, nao JSON
// A resposta vem assim:
//   { token_type, access_token, installation_id, user_id, team_id }
// O team_id importa: quando nao e null, a integracao foi instalada num TIME, e
// a partir dai toda chamada a API precisa levar ?teamId=... O app guarda esse
// valor e o vapi() em src/core/vercel.js o anexa sozinho.
//
// Nao ha refresh_token: o token da Vercel e de vida longa. Quem revoga e o dono
// da conta, desinstalando a integracao no painel da Vercel.
async function oauthVercel(corpo, cred) {
  if (!cred.id || !cred.secret) return faltaCredencial("da Vercel");
  if (!corpo.code) return json({ error: "sem_code" }, 400);

  const form = new URLSearchParams({
    client_id: cred.id,
    client_secret: cred.secret,
    code: corpo.code,
    // A Vercel exige que seja IGUAL ao Redirect URL cadastrado no console —
    // ate a barra no final conta.
    redirect_uri: corpo.redirect_uri || ""
  });

  const res = await fetch("https://api.vercel.com/v2/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: form.toString()
  });

  const dados = await res.json().catch(() => ({ error: "resposta_ilegivel_da_vercel" }));
  if (!res.ok && !dados.error) dados.error = `http_${res.status}`;
  return json(dados, 200);
}
