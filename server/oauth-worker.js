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
// =========================== A CHAVE DA CASA =================================
// O plano gratuito deixa a pessoa criar um site por dia usando as NOSSAS chaves
// de IA gratuitas. Essas chaves moram aqui, no Worker, e nunca chegam ao
// navegador de ninguem.
//
// POR QUE AQUI, e nao na Vercel junto do resto do servidor:
//   - Quem decide SE a pessoa pode usar e a Vercel (/api/passe-ia): e la que
//     mora a chave do banco, que le o plano e gasta o slot do dia.
//   - Quem ESPERA a IA escrever o projeto e este Worker: escrever um site leva
//     minutos, e funcao de servidor tem prazo curto pra responder. O Worker
//     aguenta a espera e repassa a resposta em tempo real (streaming).
//
// O PASSE e o bilhete que liga os dois. A Vercel assina "o usuario X pode usar
// a chave da casa do provedor Y ate tal hora" e este Worker confere a
// assinatura antes de emprestar a chave. Os dois lados usam o MESMO segredo,
// na variavel PASSE_IA_SEGREDO. Sem ele, /casa recusa tudo.
//
// VARIAVEIS DESTE WORKER (Cloudflare -> Settings -> Variables and Secrets):
//   PASSE_IA_SEGREDO       <- o mesmo valor que esta na Vercel
//   IA_CASA_GEMINI_KEY
//   IA_CASA_OPENROUTER_KEY
//   IA_CASA_GROQ_KEY
//   IA_CASA_MISTRAL_KEY
//   IA_CASA_DEEPSEEK_KEY   <- opcional, e a unica PAGA: reserva para quando as
//                             gratuitas estiverem lotadas. Vazia = nao usada.
//
// Em todas elas da para colocar VARIAS chaves separadas por virgula: o Worker
// tenta uma por uma quando a anterior responde 429, 401, 403 ou 5xx.
// Cada uma aceita VARIAS chaves separadas por virgula: se a primeira estourar
// o limite do minuto, o Worker tenta a seguinte sozinho.
// =============================================================================

var CASA = {
  gemini: {
    env: "IA_CASA_GEMINI_KEY",
    // Modelo vai no ENDERECO e a chave tambem (o Gemini e assim).
    url: /* @__PURE__ */ __name((modelo, chave) =>
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(chave)}`, "urlGemini"),
    headers: /* @__PURE__ */ __name(() => ({ "content-type": "application/json" }), "hGemini"),
    // So a familia "flash", que e a gratuita. Sem esta trava, daria pra pedir
    // um modelo caro com a nossa chave.
    modeloOk: /^gemini-[a-z0-9.\-]*(flash|lite)[a-z0-9.\-]*$/i
  },
  openrouter: {
    env: "IA_CASA_OPENROUTER_KEY",
    url: /* @__PURE__ */ __name(() => "https://openrouter.ai/api/v1/chat/completions", "urlOpenrouter"),
    headers: /* @__PURE__ */ __name((chave) => ({ "content-type": "application/json", "authorization": "Bearer " + chave }), "hOpenrouter"),
    // SO modelos ":free". No OpenRouter a mesma chave acessa modelos pagos — sem
    // esta linha, um pedido com "anthropic/claude-opus" gastaria credito nosso.
    modeloOk: /:free$/i
  },
  groq: {
    env: "IA_CASA_GROQ_KEY",
    url: /* @__PURE__ */ __name(() => "https://api.groq.com/openai/v1/chat/completions", "urlGroq"),
    headers: /* @__PURE__ */ __name((chave) => ({ "content-type": "application/json", "authorization": "Bearer " + chave }), "hGroq"),
    modeloOk: /^[a-z0-9][a-z0-9._\/-]{0,80}$/i
  },
  mistral: {
    env: "IA_CASA_MISTRAL_KEY",
    url: /* @__PURE__ */ __name(() => "https://api.mistral.ai/v1/chat/completions", "urlMistral"),
    headers: /* @__PURE__ */ __name((chave) => ({ "content-type": "application/json", "authorization": "Bearer " + chave }), "hMistral"),
    // Os gratuitos: codestral, open-* e small. Fora disso, recusa.
    modeloOk: /^(codestral|open-|mistral-small|ministral)[a-z0-9.\-]*$/i
  },
  // A UNICA PAGA desta lista. Entra como reserva: quando as gratuitas estao
  // lotadas, e melhor gastar centavos do que entregar erro para alguem que
  // esta experimentando a ferramenta pela primeira vez.
  // Deixe IA_CASA_DEEPSEEK_KEY vazia e ela simplesmente nao e usada.
  deepseek: {
    env: "IA_CASA_DEEPSEEK_KEY",
    url: /* @__PURE__ */ __name(() => "https://api.deepseek.com/v1/chat/completions", "urlDeepseek"),
    headers: /* @__PURE__ */ __name((chave) => ({ "content-type": "application/json", "authorization": "Bearer " + chave }), "hDeepseek"),
    // Qualquer modelo deepseek MENOS os de visao: eles sao lentos e caros, e
    // este projeto ja apanhou de timeout com eles. Como aqui quem paga e a
    // casa, a trava impede um pedido com imagem de torrar o saldo.
    modeloOk: /^deepseek-(?!.*vision)[a-z0-9.\-]+$/i
  }
};

function deBase64url(texto) {
  const s = String(texto).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - s.length % 4) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
__name(deBase64url, "deBase64url");

/**
 * Confere o passe assinado pela Vercel. Devolve os dados do passe
 * ({ u: usuario, p: provedor, pg: pago, exp }) ou null se nao presta.
 */
async function lerPasse(passe, env) {
  if (!env.PASSE_IA_SEGREDO) return null;
  const partes = String(passe || "").split(".");
  if (partes.length !== 2 || !partes[0] || !partes[1]) return null;

  let chave, confere;
  try {
    chave = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.PASSE_IA_SEGREDO),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    confere = await crypto.subtle.verify(
      "HMAC", chave, deBase64url(partes[1]), new TextEncoder().encode(partes[0])
    );
  } catch {
    return null;
  }
  if (!confere) return null;

  let dados;
  try {
    dados = JSON.parse(new TextDecoder().decode(deBase64url(partes[0])));
  } catch {
    return null;
  }
  // Passe vencido nao vale. Validade curta (2 min) e o que mantem o gasto
  // honesto: cada chamada de IA passa pela Vercel antes, pra gastar a cota.
  if (!dados || !dados.exp || Number(dados.exp) < Date.now()) return null;
  if (!dados.p || !CASA[dados.p]) return null;
  return dados;
}
__name(lerPasse, "lerPasse");

/** As chaves daquele provedor, em ordem. Aceita varias separadas por virgula. */
function chavesDaCasa(env, provedor) {
  const bruto = env[CASA[provedor].env] || "";
  return String(bruto).split(",").map((c) => c.trim()).filter(Boolean);
}
__name(chavesDaCasa, "chavesDaCasa");

/**
 * /casa — empresta a chave da casa para UMA chamada de IA.
 *
 * Recebe: cabecalho x-passe-ia + corpo { modelo, corpo } (corpo = o pedido
 * pronto, do jeito que o provedor espera; quem monta e src/core/providers.js).
 * Devolve a resposta do provedor como ela veio, inclusive em streaming.
 */
async function handleCasa(request, env) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!env.PASSE_IA_SEGREDO) return json({ error: "casa_sem_segredo" }, 503);

  const passe = await lerPasse(request.headers.get("x-passe-ia"), env);
  if (!passe) return json({ error: "passe_invalido" }, 401);

  let pedido;
  try {
    pedido = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // O PROVEDOR VEM DO PASSE, nao do corpo: assim ninguem troca "groq" por
  // outra coisa depois de a Vercel ter autorizado.
  const provedor = passe.p;
  const meta = CASA[provedor];
  const modelo = String(pedido && pedido.modelo || "").trim();

  if (!modelo || !meta.modeloOk.test(modelo)) {
    return json({ error: "modelo_nao_permitido", provedor, modelo }, 403);
  }
  if (!pedido || typeof pedido.corpo !== "object" || !pedido.corpo) {
    return json({ error: "corpo_ausente" }, 400);
  }

  const chaves = chavesDaCasa(env, provedor);
  if (!chaves.length) return json({ error: "casa_sem_chave", provedor }, 503);

  // Tenta as chaves em ordem. Limite por minuto (429) e chave recusada (401/403)
  // valem a pena tentar na seguinte; o resto devolvemos como veio, pra o app
  // poder trocar de provedor com o motivo real na mao.
  let ultima = null;
  for (let i = 0; i < chaves.length; i++) {
    const chave = chaves[i];
    let upstream;
    try {
      upstream = await fetch(meta.url(modelo, chave), {
        method: "POST",
        headers: meta.headers(chave),
        body: JSON.stringify(pedido.corpo)
      });
    } catch (e) {
      ultima = json({ error: "falha_na_casa", detail: String(e && e.message || e) }, 502);
      continue;
    }

    // 429 = limite da chave; 401/403 = chave recusada; 408 e 5xx = o servico
    // tropecou. Em todos esses casos a chave SEGUINTE tem chance real de passar.
    //
    // O 5xx entrou aqui depois de um prejuizo concreto: os modelos ":free" do
    // OpenRouter vivem lotados e devolvem 503. Como o 503 nao estava na lista,
    // o revezamento parava na primeira chave — ou seja, cadastrar cinco chaves
    // nao adiantava nada justamente no erro mais comum.
    const vaiTentarOutra = i < chaves.length - 1 && (
      upstream.status === 429 ||
      upstream.status === 401 ||
      upstream.status === 403 ||
      upstream.status === 408 ||
      upstream.status >= 500
    );
    if (vaiTentarOutra) {
      // Larga o corpo da tentativa anterior antes de trocar, senao fica
      // conexao pendurada a cada chave que falha.
      if (ultima instanceof Response) { try { ultima.body?.cancel(); } catch { /* ja fechado */ } }
      ultima = upstream;
      continue;
    }

    const out = new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers
    });
    for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
    return out;
  }

  if (ultima instanceof Response) {
    const out = new Response(ultima.body, { status: ultima.status, headers: ultima.headers });
    for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
    return out;
  }
  return json({ error: "casa_indisponivel", provedor }, 503);
}
__name(handleCasa, "handleCasa");
// ======================= FIM DA CHAVE DA CASA ================================

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
      ),
      // A chave da casa so funciona com o segredo do passe E ao menos uma chave
      // de IA. Mostra quantas chaves chegaram de cada servico, nunca o valor.
      passe_ia: Boolean(env.PASSE_IA_SEGREDO),
      ia_da_casa: Object.keys(CASA).reduce((acc, p) => {
        acc[p] = chavesDaCasa(env, p).length;
        return acc;
      }, {})
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
    if (url.pathname.replace(/\/+$/, "").endsWith("/casa")) return handleCasa(request, env);   // chave da casa
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
