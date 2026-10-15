// Roda o Worker fora da Cloudflare, com fetch falso, pra conferir as rotas.
const worker = (await import("file:///C:/Users/victo/OneDrive/Documentos/copilot-code-saas/server/oauth-worker.js")).default;

const ENV = {
  GITHUB_CLIENT_ID: "gh_id", GITHUB_CLIENT_SECRET: "gh_segredo",
  SUPABASE_CLIENT_ID: "sb_id", SUPABASE_CLIENT_SECRET: "sb_segredo",
  VERCEL_CLIENT_ID: "oac_id", VERCEL_CLIENT_SECRET: "vc_segredo",
};

let capturado = null;
const realFetch = globalThis.fetch;
function fingir(resposta) {
  globalThis.fetch = async (url, init = {}) => {
    const corpo = init.body && typeof init.body === "string" ? init.body : null;
    capturado = { url: String(url), method: init.method, headers: new Headers(init.headers || {}), corpo };
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

// 1) preflight
let r = await worker.fetch(req(BASE + "/", { method: "OPTIONS" }), ENV);
ok(r.status === 204 && r.headers.get("access-control-allow-origin") === "*", "OPTIONS devolve 204 com CORS");

// 2) teste de vida do CONECTAR.md
r = await worker.fetch(req(BASE + "/proxy"), ENV);
let b = await r.json();
ok(b.error === "missing_url", 'GET /proxy sem url devolve {"error":"missing_url"}', JSON.stringify(b));

// 3) proxy repassa host permitido, com authorization
fingir(jsonRes({ user: { username: "victor" } }));
r = await worker.fetch(req(BASE + "/proxy?url=" + encodeURIComponent("https://api.vercel.com/v2/user"), {
  headers: { authorization: "Bearer tok123", "x-api-key": "chave", origin: "http://localhost:5173", host: "worker" }
}), ENV);
ok(capturado.url === "https://api.vercel.com/v2/user", "proxy chama o destino certo", capturado.url);
ok(capturado.headers.get("authorization") === "Bearer tok123", "proxy preserva o authorization");
ok(capturado.headers.get("x-api-key") === "chave", "proxy preserva cabecalhos de IA (x-api-key)");
ok(!capturado.headers.get("origin"), "proxy remove o origin (o destino recusaria)");
ok(r.headers.get("access-control-allow-origin") === "*", "proxy devolve CORS *");

// 4) host fora da lista
r = await worker.fetch(req(BASE + "/proxy?url=" + encodeURIComponent("https://evil.example.com/roubar")), ENV);
b = await r.json();
ok(r.status === 403 && b.error === "host_nao_permitido", "proxy recusa host fora da lista", JSON.stringify(b));

// 5) streaming: o corpo nao pode ser bufferizado (o streamComplete depende disso)
let soltou = null;
const lento = new ReadableStream({
  start(c) {
    c.enqueue(new TextEncoder().encode("data: um\n\n"));
    soltou = () => { c.enqueue(new TextEncoder().encode("data: dois\n\n")); c.close(); };
  }
});
globalThis.fetch = async () => new Response(lento, { headers: { "content-type": "text/event-stream", "content-encoding": "gzip", "content-length": "999" } });
r = await worker.fetch(req(BASE + "/proxy?url=" + encodeURIComponent("https://api.groq.com/v1/chat")), ENV);
const leitor = r.body.getReader();
const p1 = await leitor.read();                       // chega antes do fim do stream
ok(new TextDecoder().decode(p1.value).includes("um"), "proxy entrega o 1o pedaco antes do stream fechar");
soltou();
const p2 = await leitor.read();
ok(new TextDecoder().decode(p2.value).includes("dois"), "proxy entrega o 2o pedaco (stream de verdade)");
ok(r.headers.get("content-type") === "text/event-stream", "proxy preserva o content-type do SSE");
ok(!r.headers.get("content-encoding") && !r.headers.get("content-length"), "proxy remove content-encoding/length");

// 6) /status
r = await worker.fetch(req(BASE + "/status"), ENV);
b = await r.json();
ok(b.segredos.vercel.id && b.segredos.vercel.secret && b.segredos.github.id, "/status acha os segredos");
ok(!JSON.stringify(b).includes("vc_segredo"), "/status NAO vaza o valor do segredo");

// 7) GitHub login
fingir(jsonRes({ access_token: "gho_x", refresh_token: "ghr_x", expires_in: 28800 }));
r = await worker.fetch(req(BASE + "/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "C1", redirect_uri: "http://localhost:5173/" }) }), ENV);
b = await r.json();
let f = new URLSearchParams(capturado.corpo);
ok(capturado.url === "https://github.com/login/oauth/access_token", "GitHub: endpoint certo");
ok(capturado.headers.get("accept") === "application/json", "GitHub: accept json (senao volta querystring)");
ok(f.get("client_secret") === "gh_segredo" && f.get("code") === "C1" && f.get("redirect_uri") === "http://localhost:5173/", "GitHub: corpo completo");
ok(b.access_token === "gho_x", "GitHub: devolve o access_token pro app");

// 8) GitHub renovacao + propagacao do erro
fingir(jsonRes({ error: "bad_refresh_token" }));
r = await worker.fetch(req(BASE + "/", { method: "POST", body: JSON.stringify({ grant_type: "refresh_token", refresh_token: "ghr_x" }) }), ENV);
b = await r.json();
f = new URLSearchParams(capturado.corpo);
ok(f.get("grant_type") === "refresh_token" && f.get("refresh_token") === "ghr_x", "GitHub: renovacao manda o refresh_token");
ok(b.error === "bad_refresh_token", "GitHub: repassa bad_refresh_token (o app usa pra desconectar)");

// 9) Supabase com PKCE e Basic auth
fingir(jsonRes({ access_token: "sb_x", refresh_token: "sb_r", expires_in: 3600 }));
r = await worker.fetch(req(BASE + "/", { method: "POST", body: JSON.stringify({ provider: "supabase", code: "C2", redirect_uri: "http://localhost:5173/", code_verifier: "V" }) }), ENV);
f = new URLSearchParams(capturado.corpo);
ok(capturado.url === "https://api.supabase.com/v1/oauth/token", "Supabase: endpoint certo");
ok(capturado.headers.get("authorization") === "Basic " + Buffer.from("sb_id:sb_segredo").toString("base64"), "Supabase: credenciais no Basic auth");
ok(f.get("grant_type") === "authorization_code" && f.get("code_verifier") === "V", "Supabase: grant + code_verifier (PKCE)");
ok(!capturado.corpo.includes("sb_segredo"), "Supabase: segredo NAO vai no corpo");

// 10) Supabase renovacao
fingir(jsonRes({ access_token: "sb_y" }));
await worker.fetch(req(BASE + "/", { method: "POST", body: JSON.stringify({ provider: "supabase", refresh_token: "sb_r" }) }), ENV);
f = new URLSearchParams(capturado.corpo);
ok(f.get("grant_type") === "refresh_token" && f.get("refresh_token") === "sb_r", "Supabase: renovacao certa");

// 11) Vercel — a rota nova
fingir(jsonRes({ token_type: "Bearer", access_token: "vc_tok", installation_id: "icfg_1", user_id: "u1", team_id: null }));
r = await worker.fetch(req(BASE + "/", { method: "POST", body: JSON.stringify({ provider: "vercel", code: "C3", redirect_uri: "http://localhost:5173/" }) }), ENV);
b = await r.json();
f = new URLSearchParams(capturado.corpo);
ok(capturado.url === "https://api.vercel.com/v2/oauth/access_token", "Vercel: endpoint com /v2/", capturado.url);
ok(capturado.headers.get("content-type") === "application/x-www-form-urlencoded", "Vercel: corpo form-urlencoded (nao JSON)");
ok(f.get("client_id") === "oac_id" && f.get("client_secret") === "vc_segredo" && f.get("code") === "C3", "Vercel: corpo completo");
ok(f.get("redirect_uri") === "http://localhost:5173/", "Vercel: redirect_uri identico ao cadastrado");
ok(b.access_token === "vc_tok" && b.team_id === null, "Vercel: devolve access_token e team_id");

// 12) sem credenciais configuradas
r = await worker.fetch(req(BASE + "/", { method: "POST", body: JSON.stringify({ provider: "vercel", code: "C" }) }), { GITHUB_CLIENT_ID: "x" });
b = await r.json();
ok(b.error === "sem_credenciais", "sem segredo da Vercel: erro claro, nao 500 mudo", b.error_description);

// 13) apelidos de variavel
r = await worker.fetch(req(BASE + "/status"), { CLIENT_ID: "a", CLIENT_SECRET: "b" });
b = await r.json();
ok(b.segredos.github.id && b.segredos.github.secret, "aceita os apelidos CLIENT_ID/CLIENT_SECRET");

// 14) GET na raiz
r = await worker.fetch(req(BASE + "/"), ENV);
ok(r.status === 405, "GET na raiz responde 405 (e nao quebra)");

globalThis.fetch = realFetch;
console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos os casos passaram");
process.exit(falhas ? 1 : 0);
