// Roda o Worker fora da Cloudflare, com fetch falso, pra conferir as rotas.
//   node server/oauth-worker.test.mjs
//
// O objetivo principal nao e testar a rota nova da Vercel — e provar que
// acrescenta-la NAO mexeu no GitHub, no Supabase nem no /proxy, que ja estavam
// no ar funcionando.
const worker = (await import("./oauth-worker.js")).default;

// Os nomes sao os que existem no Worker de verdade. Repare que o Supabase usa
// SUPABASE_OAUTH_CLIENT_ID e o GitHub usa GITHUB_CLIENT_ID: a nomenclatura ja
// vinha misturada, e e por isso que a rota da Vercel aceita as duas formas.
const ENV = {
  GITHUB_CLIENT_ID: "gh_id", GITHUB_CLIENT_SECRET: "gh_segredo",
  SUPABASE_OAUTH_CLIENT_ID: "sb_id", SUPABASE_OAUTH_CLIENT_SECRET: "sb_segredo",
  VERCEL_CLIENT_ID: "oac_id", VERCEL_CLIENT_SECRET: "vc_segredo"
};

let capturado = null;
const realFetch = globalThis.fetch;
function fingir(resposta) {
  globalThis.fetch = async (url, init = {}) => {
    capturado = {
      url: String(url), method: init.method,
      headers: new Headers(init.headers || {}),
      corpo: typeof init.body === "string" ? init.body : null
    };
    return resposta();
  };
}
const jsonRes = (o, s = 200) => () => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

let falhas = 0;
function ok(cond, nome, extra = "") {
  if (!cond) falhas++;
  console.log(`${cond ? "ok   " : "FALHA"}  ${nome}${extra ? "\n          " + extra : ""}`);
}
const req = (url, init) => new Request(url, init);
const BASE = "https://copilot-oauth.victor-faridoff.workers.dev";

console.log("--- o que ja funcionava (nao pode ter mudado) ---");

// preflight
let r = await worker.fetch(req(BASE + "/", { method: "OPTIONS" }), ENV);
ok(r.ok && r.headers.get("access-control-allow-origin") === "*", "OPTIONS devolve CORS");
ok(r.headers.get("access-control-allow-headers") === "*, Authorization", "CORS mantem o Authorization explicito");

// teste de vida do CONECTAR.md
r = await worker.fetch(req(BASE + "/proxy"), ENV);
let b = await r.json();
ok(b.error === "missing_url", 'GET /proxy sem url devolve {"error":"missing_url"}');

// proxy encaminha host permitido preservando credenciais
fingir(jsonRes({ user: { username: "victor" } }));
r = await worker.fetch(req(BASE + "/proxy?url=" + encodeURIComponent("https://api.vercel.com/v2/user"), {
  headers: { authorization: "Bearer tok123", "x-api-key": "chave", origin: "http://localhost:5173" }
}), ENV);
ok(capturado.url === "https://api.vercel.com/v2/user", "proxy chama o destino certo");
ok(capturado.headers.get("authorization") === "Bearer tok123", "proxy preserva o authorization");
ok(capturado.headers.get("x-api-key") === "chave", "proxy preserva cabecalhos de IA (x-api-key)");
ok(!capturado.headers.get("origin"), "proxy remove o origin");
ok(r.headers.get("access-control-allow-origin") === "*", "proxy devolve CORS *");

// host fora da lista
r = await worker.fetch(req(BASE + "/proxy?url=" + encodeURIComponent("https://evil.example.com/x")), ENV);
b = await r.json();
ok(r.status === 403 && b.error === "host_nao_permitido", "proxy recusa host fora da lista");

// streaming: o streamComplete() em providers.js depende disto
let soltar = null;
const lento = new ReadableStream({
  start(c) {
    c.enqueue(new TextEncoder().encode("data: um\n\n"));
    soltar = () => { c.enqueue(new TextEncoder().encode("data: dois\n\n")); c.close(); };
  }
});
globalThis.fetch = async () => new Response(lento, { headers: { "content-type": "text/event-stream" } });
r = await worker.fetch(req(BASE + "/proxy?url=" + encodeURIComponent("https://api.groq.com/v1/chat")), ENV);
const leitor = r.body.getReader();
let p = await leitor.read();
ok(new TextDecoder().decode(p.value).includes("um"), "proxy entrega o 1o pedaco antes do stream fechar");
soltar();
p = await leitor.read();
ok(new TextDecoder().decode(p.value).includes("dois"), "proxy entrega o 2o pedaco (stream de verdade)");
ok(r.headers.get("content-type") === "text/event-stream", "proxy preserva o content-type do SSE");

// GitHub login — corpo em JSON (e assim que este Worker faz)
fingir(jsonRes({ access_token: "gho_x", refresh_token: "ghr_x", expires_in: 28800 }));
r = await worker.fetch(req(BASE + "/", { method: "POST", body: JSON.stringify({ code: "C1", redirect_uri: "http://localhost:5173/" }) }), ENV);
b = await r.json();
let enviado = JSON.parse(capturado.corpo);
ok(capturado.url === "https://github.com/login/oauth/access_token", "GitHub: endpoint certo");
ok(capturado.headers.get("accept") === "application/json", "GitHub: accept json");
ok(enviado.client_secret === "gh_segredo" && enviado.code === "C1" && enviado.redirect_uri === "http://localhost:5173/", "GitHub: corpo completo");
ok(b.access_token === "gho_x" && b.expires_in === 28800, "GitHub: devolve token e validade");

// GitHub sem redirect_uri (fluxo da extensao) — o campo tem que ser OMITIDO
fingir(jsonRes({ access_token: "gho_y" }));
await worker.fetch(req(BASE + "/", { method: "POST", body: JSON.stringify({ code: "C9" }) }), ENV);
ok(!("redirect_uri" in JSON.parse(capturado.corpo)), "GitHub: omite redirect_uri quando nao veio");

// GitHub renovacao + propagacao do erro que desconecta
fingir(jsonRes({ error: "bad_refresh_token" }));
r = await worker.fetch(req(BASE + "/", { method: "POST", body: JSON.stringify({ grant_type: "refresh_token", refresh_token: "ghr_x" }) }), ENV);
b = await r.json();
enviado = JSON.parse(capturado.corpo);
ok(enviado.grant_type === "refresh_token" && enviado.refresh_token === "ghr_x", "GitHub: renovacao manda o refresh_token");
ok(b.error === "bad_refresh_token", "GitHub: repassa bad_refresh_token (o app usa pra desconectar)");

// Supabase com PKCE e Basic auth
fingir(jsonRes({ access_token: "sb_x", refresh_token: "sb_r", expires_in: 3600 }));
r = await worker.fetch(req(BASE + "/", { method: "POST", body: JSON.stringify({ provider: "supabase", code: "C2", redirect_uri: "http://localhost:5173/", code_verifier: "V" }) }), ENV);
let f = new URLSearchParams(capturado.corpo);
ok(capturado.url === "https://api.supabase.com/v1/oauth/token", "Supabase: endpoint certo");
ok(capturado.headers.get("authorization") === "Basic " + Buffer.from("sb_id:sb_segredo").toString("base64"), "Supabase: credenciais no Basic auth");
ok(f.get("grant_type") === "authorization_code" && f.get("code_verifier") === "V", "Supabase: grant + code_verifier (PKCE)");
ok(!capturado.corpo.includes("sb_segredo"), "Supabase: segredo NAO vai no corpo");

// Supabase renovacao
fingir(jsonRes({ access_token: "sb_y" }));
await worker.fetch(req(BASE + "/", { method: "POST", body: JSON.stringify({ provider: "supabase", refresh_token: "sb_r" }) }), ENV);
f = new URLSearchParams(capturado.corpo);
ok(f.get("grant_type") === "refresh_token" && f.get("refresh_token") === "sb_r", "Supabase: renovacao certa");

// provedor desconhecido
r = await worker.fetch(req(BASE + "/", { method: "POST", body: JSON.stringify({ provider: "nada" }) }), ENV);
ok((await r.json()).error === "provider_desconhecido", "provedor desconhecido continua recusado");

console.log("\n--- a rota nova ---");

// Vercel: conta pessoal
fingir(jsonRes({ token_type: "Bearer", access_token: "vc_tok", installation_id: "icfg_1", user_id: "u1", team_id: null }));
r = await worker.fetch(req(BASE + "/", { method: "POST", body: JSON.stringify({ provider: "vercel", code: "C3", redirect_uri: "http://localhost:5173/" }) }), ENV);
b = await r.json();
f = new URLSearchParams(capturado.corpo);
ok(capturado.url === "https://api.vercel.com/v2/oauth/access_token", "Vercel: endpoint com /v2/", capturado.url);
ok(capturado.headers.get("content-type") === "application/x-www-form-urlencoded", "Vercel: corpo form-urlencoded (nao JSON)");
ok(f.get("client_id") === "oac_id" && f.get("client_secret") === "vc_segredo" && f.get("code") === "C3", "Vercel: corpo completo");
ok(f.get("redirect_uri") === "http://localhost:5173/", "Vercel: redirect_uri identico ao cadastrado");
ok(b.access_token === "vc_tok" && b.installation_id === "icfg_1", "Vercel: devolve token e installation_id");
ok(b.team_id === null && b.error === null, "Vercel: conta pessoal vem com team_id null e sem erro");

// Vercel: instalada num time
fingir(jsonRes({ token_type: "Bearer", access_token: "vc_tok2", installation_id: "icfg_2", user_id: "u1", team_id: "team_ABC" }));
r = await worker.fetch(req(BASE + "/", { method: "POST", body: JSON.stringify({ provider: "vercel", code: "C4" }) }), ENV);
b = await r.json();
ok(b.team_id === "team_ABC", "Vercel: preserva o team_id (o app precisa dele no ?teamId=)");

// Vercel: erro da API vira erro legivel
fingir(jsonRes({ error: "invalid_grant", error_description: "code expirado" }, 400));
b = await (await worker.fetch(req(BASE + "/", { method: "POST", body: JSON.stringify({ provider: "vercel", code: "velho" }) }), ENV)).json();
ok(b.error === "invalid_grant" && b.error_description === "code expirado", "Vercel: repassa o erro da API");

// Vercel: falha sem corpo de erro nao vira sucesso silencioso
fingir(jsonRes({}, 500));
b = await (await worker.fetch(req(BASE + "/", { method: "POST", body: JSON.stringify({ provider: "vercel", code: "x" }) }), ENV)).json();
ok(b.access_token === null && b.error === "http_500", "Vercel: resposta vazia com HTTP 500 vira error http_500");

// Vercel: sem code / sem segredo
b = await (await worker.fetch(req(BASE + "/", { method: "POST", body: JSON.stringify({ provider: "vercel" }) }), ENV)).json();
ok(b.error === "missing_code", "Vercel: sem code devolve missing_code");
b = await (await worker.fetch(req(BASE + "/", { method: "POST", body: JSON.stringify({ provider: "vercel", code: "C" }) }), { GITHUB_CLIENT_ID: "x" })).json();
ok(b.error === "vercel_nao_configurado", "Vercel: sem segredo devolve erro claro");

// Vercel: aceita o nome alternativo da variavel
b = await (await worker.fetch(req(BASE + "/status"), { VERCEL_OAUTH_CLIENT_ID: "a", VERCEL_OAUTH_CLIENT_SECRET: "b" })).json();
ok(b.segredos.vercel === true, "Vercel: aceita VERCEL_OAUTH_CLIENT_ID tambem");

// /status
b = await (await worker.fetch(req(BASE + "/status"), ENV)).json();
ok(b.segredos.github && b.segredos.supabase && b.segredos.vercel, "/status acha os tres");
ok(!JSON.stringify(b).includes("vc_segredo") && !JSON.stringify(b).includes("sb_segredo"), "/status NAO vaza valor de segredo");

// ===========================================================================
//  A CHAVE DA CASA (/casa)
//  -------------------------------------------------------------------------
//  Aqui o que interessa e: ninguem usa a nossa chave de IA sem um passe bom.
//  O passe e assinado pela Vercel (api/_lib.js) e conferido pelo Worker — por
//  isso o teste usa a MESMA funcao de assinatura do servidor de verdade, e nao
//  uma copia; copia esconde justamente o erro que importa (segredo diferente,
//  formato diferente).
// ===========================================================================
console.log("\n--- a chave da casa (/casa) ---");

process.env.PASSE_IA_SEGREDO = "segredo-de-teste";
const { assinarPasse } = await import("../api/_lib.js");

const ENV_CASA = {
  PASSE_IA_SEGREDO: "segredo-de-teste",
  IA_CASA_GEMINI_KEY: "chave_gemini",
  IA_CASA_OPENROUTER_KEY: "chave_or_1, chave_or_2",
  IA_CASA_GROQ_KEY: "chave_groq"
};

const pedidoCasa = (passe, corpo) => req(BASE + "/casa", {
  method: "POST",
  headers: passe ? { "x-passe-ia": passe, "content-type": "application/json" } : { "content-type": "application/json" },
  body: JSON.stringify(corpo)
});

// --- passe bom: a chamada sai, com a chave da casa no lugar certo ----------
fingir(jsonRes({ candidates: [] }));
let passe = assinarPasse({ usuarioId: "u1", provedor: "gemini", pago: false });
r = await worker.fetch(pedidoCasa(passe, { modelo: "gemini-flash-latest", corpo: { contents: [] } }), ENV_CASA);
ok(r.status === 200, "gemini: passe bom passa");
ok(capturado.url.includes("gemini-flash-latest:generateContent"), "gemini: modelo vai no endereco");
ok(capturado.url.includes("key=chave_gemini"), "gemini: usa a chave da casa");
ok(r.headers.get("access-control-allow-origin") === "*", "/casa devolve CORS");

fingir(jsonRes({ choices: [] }));
passe = assinarPasse({ usuarioId: "u1", provedor: "groq", pago: false });
r = await worker.fetch(pedidoCasa(passe, { modelo: "openai/gpt-oss-20b", corpo: { model: "openai/gpt-oss-20b" } }), ENV_CASA);
ok(r.status === 200 && capturado.headers.get("authorization") === "Bearer chave_groq", "groq: chave da casa vai no Authorization");
ok(!capturado.url.includes("chave_groq"), "groq: a chave NAO aparece no endereco");

// --- passe ruim: nada sai --------------------------------------------------
b = await (await worker.fetch(pedidoCasa("", { modelo: "gemini-flash-latest", corpo: {} }), ENV_CASA)).json();
ok(b.error === "passe_invalido", "sem passe: recusa");

b = await (await worker.fetch(pedidoCasa("lixo.lixo", { modelo: "gemini-flash-latest", corpo: {} }), ENV_CASA)).json();
ok(b.error === "passe_invalido", "passe malformado: recusa");

// Assinado com OUTRO segredo = passe de outra pessoa. Tem que ser recusado,
// senao qualquer um emitiria passes e gastaria a nossa chave.
process.env.PASSE_IA_SEGREDO = "segredo-errado";
const passeFalso = assinarPasse({ usuarioId: "u1", provedor: "gemini", pago: false });
process.env.PASSE_IA_SEGREDO = "segredo-de-teste";
b = await (await worker.fetch(pedidoCasa(passeFalso, { modelo: "gemini-flash-latest", corpo: {} }), ENV_CASA)).json();
ok(b.error === "passe_invalido", "passe assinado com outro segredo: recusa");

// Passe vencido (a validade e curta de proposito: 2 minutos).
const { createHmac } = await import("node:crypto");
const corpoVencido = Buffer.from(JSON.stringify({ u: "u1", p: "gemini", pg: false, exp: Date.now() - 1000 })).toString("base64url");
const vencido = `${corpoVencido}.${createHmac("sha256", "segredo-de-teste").update(corpoVencido).digest("base64url")}`;
b = await (await worker.fetch(pedidoCasa(vencido, { modelo: "gemini-flash-latest", corpo: {} }), ENV_CASA)).json();
ok(b.error === "passe_invalido", "passe vencido: recusa");

// Worker sem o segredo configurado: recusa tudo (nao empresta chave as cegas).
b = await (await worker.fetch(pedidoCasa(passe, { modelo: "openai/gpt-oss-20b", corpo: {} }), { IA_CASA_GROQ_KEY: "x" })).json();
ok(b.error === "casa_sem_segredo", "Worker sem PASSE_IA_SEGREDO: recusa");

// --- o provedor vem do PASSE, nunca do corpo -------------------------------
// Passe de groq + corpo pedindo outra coisa: continua groq. Sem isso, daria pra
// pedir um modelo caro depois de a Vercel ter autorizado o barato.
fingir(jsonRes({ choices: [] }));
passe = assinarPasse({ usuarioId: "u1", provedor: "groq", pago: false });
r = await worker.fetch(pedidoCasa(passe, { provedor: "gemini", modelo: "openai/gpt-oss-20b", corpo: {} }), ENV_CASA);
ok(capturado.url.includes("api.groq.com"), "o provedor sai do passe, nao do corpo");

// --- modelo tem que ser dos gratuitos --------------------------------------
passe = assinarPasse({ usuarioId: "u1", provedor: "openrouter", pago: false });
b = await (await worker.fetch(pedidoCasa(passe, { modelo: "anthropic/claude-opus-4", corpo: {} }), ENV_CASA)).json();
ok(b.error === "modelo_nao_permitido", "openrouter: modelo pago e recusado (so os :free)");

b = await (await worker.fetch(pedidoCasa(passe, { modelo: "", corpo: {} }), ENV_CASA)).json();
ok(b.error === "modelo_nao_permitido", "sem modelo: recusa");

passe = assinarPasse({ usuarioId: "u1", provedor: "gemini", pago: false });
b = await (await worker.fetch(pedidoCasa(passe, { modelo: "gemini-3-pro", corpo: {} }), ENV_CASA)).json();
ok(b.error === "modelo_nao_permitido", "gemini: modelo fora da familia flash e recusado");

// --- sem chave configurada: diz isso, em vez de dar erro feio --------------
passe = assinarPasse({ usuarioId: "u1", provedor: "mistral", pago: false });
b = await (await worker.fetch(pedidoCasa(passe, { modelo: "codestral-latest", corpo: {} }), ENV_CASA)).json();
ok(b.error === "casa_sem_chave" && b.provedor === "mistral", "provedor sem chave na casa: avisa qual");

// --- varias chaves: estourou o limite de uma, tenta a seguinte -------------
let chamadas = [];
globalThis.fetch = async (url, init = {}) => {
  chamadas.push(new Headers(init.headers || {}).get("authorization"));
  return chamadas.length === 1
    ? new Response("rate limit", { status: 429 })
    : new Response(JSON.stringify({ choices: [] }), { status: 200, headers: { "content-type": "application/json" } });
};
passe = assinarPasse({ usuarioId: "u1", provedor: "openrouter", pago: false });
r = await worker.fetch(pedidoCasa(passe, { modelo: "cohere/north-mini-code:free", corpo: {} }), ENV_CASA);
ok(r.status === 200, "openrouter: 429 na 1a chave, a 2a assume");
ok(chamadas.length === 2 && chamadas[0] === "Bearer chave_or_1" && chamadas[1] === "Bearer chave_or_2",
  "as chaves sao tentadas em ordem", JSON.stringify(chamadas));

// --- 503: o erro mais comum do OpenRouter gratuito tambem reveza -----------
// Antes, o revezamento so acontecia em 429/401/403. Como os modelos ":free"
// devolvem 503 quando a fila deles lota, cadastrar varias chaves nao adiantava
// nada justamente no caso que mais acontece.
chamadas = [];
globalThis.fetch = async (url, init = {}) => {
  chamadas.push(new Headers(init.headers || {}).get("authorization"));
  return chamadas.length === 1
    ? new Response("no instances available", { status: 503 })
    : new Response(JSON.stringify({ choices: [] }), { status: 200, headers: { "content-type": "application/json" } });
};
passe = assinarPasse({ usuarioId: "u1", provedor: "openrouter", pago: false });
r = await worker.fetch(pedidoCasa(passe, { modelo: "cohere/north-mini-code:free", corpo: {} }), ENV_CASA);
ok(r.status === 200, "openrouter: 503 na 1a chave, a 2a assume");
ok(chamadas.length === 2, "o 503 faz trocar de chave", JSON.stringify(chamadas));

// --- se TODAS as chaves falharem, o erro real chega ao app ----------------
// O app precisa do motivo verdadeiro para decidir trocar de PROVEDOR; se
// mascarassemos tudo como erro generico, o rodizio ficaria cego.
chamadas = [];
globalThis.fetch = async (url, init = {}) => {
  chamadas.push(new Headers(init.headers || {}).get("authorization"));
  return new Response("no instances available", { status: 503 });
};
r = await worker.fetch(pedidoCasa(passe, { modelo: "cohere/north-mini-code:free", corpo: {} }), ENV_CASA);
ok(r.status === 503, "todas as chaves fora: devolve o 503 de verdade");
ok(chamadas.length === 2, "tentou as duas antes de desistir", JSON.stringify(chamadas));

// --- /status conta as chaves da casa sem mostrar nenhuma -------------------
b = await (await worker.fetch(req(BASE + "/status"), { ...ENV, ...ENV_CASA })).json();
ok(b.segredos.passe_ia === true, "/status diz que o passe esta configurado");
ok(b.segredos.ia_da_casa.openrouter === 2 && b.segredos.ia_da_casa.mistral === 0,
  "/status conta quantas chaves de cada servico", JSON.stringify(b.segredos.ia_da_casa));
ok(!JSON.stringify(b).includes("chave_or_1") && !JSON.stringify(b).includes("segredo-de-teste"),
  "/status NAO vaza chave nem segredo do passe");

globalThis.fetch = realFetch;
console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos os casos passaram");
process.exit(falhas ? 1 : 0);
