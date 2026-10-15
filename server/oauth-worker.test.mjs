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

globalThis.fetch = realFetch;
console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos os casos passaram");
process.exit(falhas ? 1 : 0);
