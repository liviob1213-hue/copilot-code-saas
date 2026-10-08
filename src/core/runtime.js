// ============================================================================
// runtime.js — orquestra os fluxos no SaaS (equivale aos handlers do
// service-worker da extensao, mas roda na propria pagina, sem chrome.runtime).
// Usa o MESMO core: site-generator (kits + logica) + github + vercel + storage.
//
// Convencao de historico: QUEM CHAMA cria a sessao e grava a mensagem do
// usuario; o runtime grava so a resposta do assistente (resultado).
// ============================================================================

import * as store from "./storage.js";
import * as gen from "./site-generator.js";
import * as github from "./github.js";
import * as vercel from "./vercel.js";
import * as history from "./history.js";
import * as sbmgmt from "./supabase-mgmt.js";
import { runAgent } from "./agent.js";
import { createWorkspace } from "./tools.js";
import { complete } from "./providers.js";
import { AGENT_LIMITS, PROVIDER_CATALOG } from "./config.js";

// Depois de gerar/editar, descobre se o app passou a precisar de uma chave de
// mapa que ainda NÃO está preenchida — pra pedir proativamente no chat.
function detectaChaveNecessaria(files) {
  const code = Object.values(files || {}).join("\n");
  const temMapbox = /VITE_MAPBOX_TOKEN|mapboxgl\.accessToken|api\.mapbox\.com/i.test(code);
  const jaTemMapbox = /\bpk\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/.test(code);
  if (temMapbox && !jaTemMapbox) return { label: "Mapbox", kind: "mapbox", prefix: "pk." };
  const temGmaps = /VITE_GOOGLE_MAPS_API_KEY|maps\.googleapis\.com/i.test(code);
  const jaTemGmaps = /\bAIza[0-9A-Za-z_\-]{20,}\b/.test(code);
  if (temGmaps && !jaTemGmaps) return { label: "Google Maps", kind: "gmaps", prefix: "AIza" };
  return null;
}

function extrairSql(text) {
  if (!text) return "";
  const m = String(text).match(/```sql\s*([\s\S]*?)```/i);
  return (m ? m[1] : text).trim();
}

// Descobre as tabelas e colunas lendo o código do app (supabase.from / select /
// order / eq / insert), SEM IA. É a rede de segurança quando a IA está fora.
function tipoColuna(nome) {
  if (/(_at$|^created$|^updated$|timestamp|hora|data|date|time)/i.test(nome)) return "timestamptz";
  if (/(lat|lng|lon|latitude|longitude)/i.test(nome)) return "double precision";
  if (/(numero|quantidade|qtd|total|nivel|lotacao|capacidade|ordem|posicao|count|idade|preco|valor)/i.test(nome)) return "numeric";
  return "text";
}
function inferirSqlLocal(files) {
  const code = Object.entries(files)
    .filter(([p]) => /\.(jsx?|tsx?)$/.test(p))
    .map(([, c]) => c).join("\n");
  const tabelas = {};
  const re = /\.from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)([\s\S]{0,240}?)(?=\.from\(|;|\n\s*\n|$)/g;
  let m;
  while ((m = re.exec(code))) {
    const t = m[1], chain = m[2];
    (tabelas[t] = tabelas[t] || new Set());
    const sel = chain.match(/\.select\(\s*['"]([^'"]+)['"]/);
    if (sel && sel[1].trim() !== "*") sel[1].split(",").forEach(c => { const col = c.trim().split(/[\s(]/)[0]; if (/^[a-z0-9_]+$/i.test(col)) tabelas[t].add(col); });
    const ord = chain.match(/\.order\(\s*['"]([a-z0-9_]+)['"]/i); if (ord) tabelas[t].add(ord[1]);
    for (const x of chain.matchAll(/\.eq\(\s*['"]([a-z0-9_]+)['"]/gi)) tabelas[t].add(x[1]);
    const ins = chain.match(/\.(?:insert|update)\(\s*\{([^}]*)\}/);
    if (ins) for (const x of ins[1].matchAll(/([a-z0-9_]+)\s*:/gi)) tabelas[t].add(x[1]);
  }
  const nomes = Object.keys(tabelas);
  if (!nomes.length) return { sql: "", nomes: [] };
  let sql = "";
  for (const t of nomes) {
    const cols = [...tabelas[t]].filter(c => !/^(id|created_at)$/i.test(c));
    sql += `create table if not exists public.${t} (\n  id uuid primary key default gen_random_uuid(),\n  created_at timestamptz default now()`;
    for (const c of cols) sql += `,\n  ${c} ${tipoColuna(c)}`;
    sql += `\n);\n`;
    sql += `alter table public.${t} enable row level security;\n`;
    // Política aberta (dev) idempotente — a "Blindar" aperta depois. Sem DROP (a trava bloqueia).
    sql += `do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='${t}' and policyname='${t}_all') then create policy "${t}_all" on public.${t} for all using (true) with check (true); end if; end $$;\n\n`;
  }
  return { sql, nomes };
}

// Gera o SQL das tabelas: tenta a IA (melhor qualidade) e, se falhar ou vier
// vazio, cai no determinístico (sem IA). Retorna { sql, nomes, viaIA }.
async function gerarSqlTabelas({ files, providerId }, onEvent) {
  // Determinístico primeiro: é instantâneo e não depende da IA.
  const local = inferirSqlLocal(files);
  if (local.sql) return { ...local, viaIA: false };
  try {
    onEvent({ type: "status", text: "Analisando o que seu app precisa no banco…" });
    const bruto = await gen.inferirSqlDoProjeto({ files, providerId });
    const sql = extrairSql(bruto);
    if (sql && /create\s+table/i.test(sql)) return { sql, nomes: [...sql.matchAll(/create\s+table[^(]*?([a-z0-9_]+)\s*\(/gi)].map(x => x[1]), viaIA: true };
  } catch { /* sem IA, sem problema */ }
  return { sql: "", nomes: [], viaIA: false };
}

// Se houver um projeto Supabase ligado, descobre o que o app precisa no banco e
// CRIA as tabelas de verdade (a trava de seguranca bloqueia qualquer DROP/DELETE).
async function criarTabelasSeConectado({ files, providerId }, onEvent) {
  const sb = await store.get("supabase");
  if (!sb.projectRef) return null;   // nenhum projeto escolhido
  try {
    const { sql, nomes } = await gerarSqlTabelas({ files, providerId }, onEvent);
    if (!sql) return null;
    onEvent({ type: "status", text: "Criando as tabelas no seu Supabase…" });
    await sbmgmt.runSql(sql);
    onEvent({ type: "notice", text: `Tabelas criadas/atualizadas no seu Supabase ✅ (${nomes.join(", ")})` });
    return sql;
  } catch (e) {
    onEvent({ type: "notice", text: "Não consegui criar as tabelas sozinho: " + e.message });
    return null;
  }
}

/**
 * Fluxo DEDICADO de "crie as tabelas" — não regenera o app (quase não usa IA):
 * lê o projeto, descobre o schema e cria no Supabase. Muito mais robusto quando
 * a IA está instável.
 */
export async function criarTabelas({ repo, providerId = "", sessionId = null }, onEvent = () => {}) {
  const sb = await store.get("supabase");
  if (!sb.projectRef) throw new Error("Escolha um projeto Supabase primeiro (Conexões → Supabase → Projeto).");
  const owner = repo.owner, name = repo.name, branch = repo.branch || "main";

  onEvent({ type: "status", text: "Lendo o seu app pra descobrir as tabelas…" });
  const files = await lerArquivosDoProjeto(owner, name, branch);

  const { sql, nomes } = await gerarSqlTabelas({ files, providerId }, onEvent);
  if (!sql) throw new Error("Não achei tabelas no código do app. Peça primeiro pra criar as telas que usam o banco.");

  onEvent({ type: "status", text: "Criando as tabelas no seu Supabase…" });
  await sbmgmt.runSql(sql);

  const texto = `Criei ${nomes.length} tabela(s) no seu Supabase: ${nomes.join(", ")}. Agora o app consegue ler e gravar dados (os erros 404 somem). As tabelas nascem abertas pra facilitar os testes — quando quiser, clique em Blindar pra deixar seguro.`;
  if (sessionId) await history.appendMessage(sessionId, { role: "assistant", text: texto });
  onEvent({ type: "notice", text: `Tabelas criadas ✅ (${nomes.join(", ")})` });
  return { nomes, texto };
}

// Explica, em portugues SIMPLES (para iniciante), o que foi feito. E o
// diferencial didatico: sai como uma mensagem no chat ao final.
async function resumirDidatico({ userMessage, files, mode, providerId }) {
  try {
    const nomes = Object.keys(files || {}).slice(0, 14).join(", ") || "alguns arquivos";
    const sys = "Voce e um professor paciente que fala com quem esta comecando a programar. Responda em portugues do Brasil, simples e curto, SEM jargao tecnico (nada de 'endpoint', 'deploy', 'componente' sem explicar). Fale como se explicasse para um amigo leigo.";
    const user =
      `Acabei de ${mode === "edit" ? "alterar" : "criar"} um projeto a partir deste pedido da pessoa: "${userMessage}".\n` +
      `Os arquivos que mexi foram: ${nomes}.\n\n` +
      `Em no maximo 5 frases curtas, explique para essa pessoa iniciante: (1) o que voce fez, (2) para que serve cada parte principal, ` +
      `e (3) termine com UMA sugestao do que ela pode pedir a seguir. Use palavras do dia a dia.`;
    const reply = await complete({ system: sys, messages: [{ role: "user", text: user }], tools: [], preferredProviderId: providerId }, () => {});
    return (reply.text || "").trim();
  } catch { return ""; }
}

// Monta o historico da conversa (so texto de usuario/assistente) para dar
// CONTINUIDADE: a IA entende o que ja foi pedido antes neste projeto.
async function historicoDaSessao(sessionId) {
  if (!sessionId) return [];
  try {
    const s = await history.getSession(sessionId);
    return (s?.messages || [])
      .filter(m => m.role === "user" || m.role === "assistant")
      .slice(0, -1)          // tira a mensagem atual (ja vai como userMessage)
      .slice(-8)             // ultimas 8 falas bastam de contexto
      .map(m => ({ role: m.role, text: m.text }));
  } catch { return []; }
}

// Prompt de blindagem — mesma ideia do botao "Blindar" da extensao: fecha
// brechas de vazamento de dados sem mudar o visual nem as funcoes.
export const BLINDAR_PROMPT =
  "Blinde este projeto contra vazamento de dados, SEM mudar o visual nem as funcionalidades. " +
  "Aplique: (1) RLS ligado em todas as tabelas com policies por usuario (auth.uid()); " +
  "(2) nunca exponha service_role no front — so a anon key; " +
  "(3) valide entradas e trate erros sem vazar detalhes internos; " +
  "(4) restrinja CORS ao dominio do app; " +
  "(5) remova chaves/segredos e console.log sensiveis do codigo do cliente. " +
  "Devolva os arquivos alterados e, se precisar, o SQL de RLS para eu aplicar.";

function objToFiles(obj) {
  return Object.entries(obj).map(([path, content]) => ({ path, content }));
}

function nomeDoPedido(texto) {
  const base = String(texto || "projeto").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "projeto";
  return `${base}-${Date.now().toString(36).slice(-4)}`;
}

/** Ha pelo menos uma chave de IA salva? (senao, nao da pra gerar nada) */
export async function temChaveIA() {
  const secrets = await store.get("secrets");
  // Deriva do catalogo, pra nunca ficar desatualizado quando a lista mudar.
  return PROVIDER_CATALOG.some(p => (secrets[p.secretKey] || "").trim());
}

async function temGithub() {
  const gh = await store.get("github");
  return Boolean(gh.token || (await store.getSecret("GITHUB_TOKEN")));
}

/**
 * Cria um projeto do zero: gera com a IA -> commita num repo novo -> (opcional)
 * publica na Vercel. Grava o resultado no historico (sessionId).
 */
/**
 * Monta um PLANO curto (sem codigo) a partir do pedido, para a pessoa aprovar
 * antes de construir. Usado so no PRIMEIRO comando de um projeto novo.
 */
export async function gerarPlano({ userMessage, kind = "app", providerId = "" }, onEvent = () => {}) {
  const tipo = kind === "site" ? "site / landing page" : "aplicativo (app)";
  const system =
    `Voce e um planejador de produto. A pessoa quer criar um ${tipo}. ` +
    `Escreva um PLANO curto e claro, em portugues do Brasil, para o que vai ser construido. ` +
    `NAO escreva codigo. Use secoes curtas com marcadores, nesta ordem:\n` +
    `Objetivo: (1-2 linhas)\n` +
    `Telas/Paginas: (as principais)\n` +
    `Funcionalidades: (o que a pessoa vai poder fazer)\n` +
    `Dados: (so se precisar de banco; senao omita)\n` +
    `Seja objetivo, no maximo ~14 linhas. Sem introducao nem despedida — comece direto no "Objetivo:".`;
  const r = await complete(
    { system, messages: [{ role: "user", text: userMessage }], tools: [], preferredProviderId: providerId },
    onEvent
  );
  return (r.text || "").trim();
}

export async function criarProjeto({ userMessage, kind = "app", providerId = "", deploy = true, sessionId = null, embedImages = [] }, onEvent = () => {}) {
  if (!(await temGithub())) throw new Error("Conecte o GitHub antes de criar um projeto (Conexoes).");

  const convHistory = await historicoDaSessao(sessionId);
  const sb = await store.get("supabase");
  const supaCtx = sb.url ? { url: sb.url, anonKey: sb.anonKey } : {};

  onEvent({ type: "status", text: "Pedindo pra IA escrever o código do seu projeto…" });
  const result = await gen.generateProject({ history: convHistory, userMessage, kind, mode: "create", providerId, supabase: supaCtx, embedImages, images: embedImages }, onEvent);

  const files = result.paginaUnica ? { "index.html": result.html } : result.files;
  if (!files || !Object.keys(files).length) throw new Error("A IA nao retornou arquivos. Tente de novo ou troque de modelo.");

  onEvent({ type: "status", text: "Criando o repositório no GitHub (onde seu código fica guardado)…" });
  const repo = await github.createRepoWithFiles({
    name: nomeDoPedido(userMessage),
    description: userMessage.slice(0, 120),
    privado: true,
    files: objToFiles(files)
  });

  const lista = await store.get("extensionRepos");
  const full = `${repo.owner}/${repo.name}`;
  if (!lista.includes(full)) { lista.push(full); await store.set("extensionRepos", lista); }

  // Cria as tabelas no Supabase, se houver um projeto ligado.
  await criarTabelasSeConectado({ files, providerId }, onEvent);

  let url = null;
  if (deploy) {
    try {
      onEvent({ type: "status", text: "Publicando na Vercel pra colocar no ar…" });
      const dep = await vercel.deploy(repo.owner, repo.name, repo.branch, p => onEvent({ type: "deploy", ...p }));
      url = typeof dep === "string" ? dep : (dep?.prodUrl || dep?.url || null);
      if (url) {
        const urls = await store.get("previewUrls");
        urls[full] = url; await store.set("previewUrls", urls);
      }
    } catch (e) {
      onEvent({ type: "notice", text: "Projeto criado no GitHub, mas o deploy da Vercel falhou: " + e.message });
    }
  }

  const pedirChave = detectaChaveNecessaria(files);
  let resumo;
  if (pedirChave) {
    resumo = `Criei o projeto usando o ${pedirChave.label} pro mapa. Pra ele funcionar, me manda aqui a sua chave do ${pedirChave.label} (começa com "${pedirChave.prefix}…"): quando colar, eu coloco no app e republico — sem mexer em arquivo.`;
  } else {
    onEvent({ type: "status", text: "Escrevendo um resumo do que foi feito…" });
    resumo = await resumirDidatico({ userMessage, files, mode: "create", providerId });
  }

  const repoInfo = { owner: repo.owner, name: repo.name, branch: repo.branch, url, brief: userMessage };
  if (sessionId) {
    await history.setSessionRepo(sessionId, repoInfo);
    await history.appendMessage(sessionId, {
      role: "assistant",
      text: resumo || `Projeto criado: ${repo.owner}/${repo.name}${url ? `\nNo ar: ${url}` : ""}`,
      meta: { repo: repoInfo, provider: result.provider, model: result.model }
    });
  }

  return { repo: repoInfo, url, provider: result.provider, model: result.model, files, resumo, pedirChave };
}

// Le os arquivos que a IA controla (src/, index.html, package.json), pulando o
// que e gerado/binario/grande. E o "projeto atual" que vai no modo edit.
async function lerArquivosDoProjeto(owner, name, branch) {
  const tree = await github.getTree(owner, name, branch);
  const alvo = tree.files.filter(f =>
    /^(src\/|index\.html$|package\.json$)/.test(f.path) &&
    !AGENT_LIMITS.ignorar.test(f.path) &&
    !AGENT_LIMITS.gerado.test(f.path) &&
    f.size < AGENT_LIMITS.maxFileBytes
  ).slice(0, 60);

  const files = {};
  let i = 0;
  async function worker() {
    while (i < alvo.length) {
      const f = alvo[i++];
      try { const r = await github.readFile(owner, name, branch, f.path); files[f.path] = r.content; } catch { /* pula arquivo ilegivel */ }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return files;
}

/**
 * Edita um projeto existente com o AGENTE (igual à extensão): lê o mapa de
 * arquivos, abre só o que precisa e muda CIRURGICAMENTE (read_file/write_file/
 * commit_changes). Nada de regenerar o projeto inteiro — por isso é rápido,
 * barato e NÃO quebra o app. Cria tabela no Supabase e salva imagem sozinho.
 */
export async function editarProjeto({ repo, userMessage, providerId = "", deploy = true, sessionId = null, embedImages = [] }, onEvent = () => {}) {
  const owner = repo.owner, name = repo.name, branch = repo.branch || "main";
  const convHistory = await historicoDaSessao(sessionId);
  const settings = await store.get("settings");
  const sb = await store.get("supabase");

  // Workspace do agente. dryRunFirst:false + approved:true = commita direto
  // (no SaaS não temos a etapa de aprovação visual da extensão).
  const ws = createWorkspace({ owner, name, branch }, { ...settings, dryRunFirst: false });
  ws.approved = true;
  ws.supabase = sb.url ? { url: sb.url, anonKey: sb.anonKey } : null;

  const ctx = {
    repo: { owner, name, branch },
    lovable: null,
    lovableCloud: false,
    supabase: sb.projectRef ? { connected: true, projectRef: sb.projectRef, projectName: sb.projectName } : null
  };

  let houveCommit = false;
  const wrap = (ev) => { if (ev && ev.type === "commit") houveCommit = true; onEvent(ev); };

  const result = await runAgent(
    { ws, history: convHistory, userMessage, images: embedImages, ctx, deveParar: () => false, preferredProviderId: providerId },
    wrap
  );

  // O agente já explica o que fez, em português, na última fala.
  const ultima = [...(result.messages || [])].reverse().find(m => m.role === "assistant" && m.text && m.text.trim());
  const resumo = ultima ? ultima.text.trim() : "Pronto.";

  let url = repo.url || null;
  if (deploy && houveCommit) {
    try {
      onEvent({ type: "status", text: "Republicando na Vercel pra atualizar o site no ar…" });
      const dep = await vercel.deploy(owner, name, branch, p => onEvent({ type: "deploy", ...p }), ws.supabase);
      url = typeof dep === "string" ? dep : (dep?.prodUrl || dep?.url || url);
    } catch (e) {
      onEvent({ type: "notice", text: "Alteracao salva, mas o redeploy da Vercel falhou: " + e.message });
    }
  }

  const repoInfo = { owner, name, branch, url, brief: repo.brief || "" };
  if (sessionId) {
    await history.setSessionRepo(sessionId, repoInfo);
    await history.appendMessage(sessionId, { role: "assistant", text: resumo, meta: { repo: repoInfo } });
  }

  return { repo: repoInfo, url, resumo, houveCommit };
}

/**
 * Reconecta um projeto JÁ EXISTENTE ao Supabase escolhido, de forma
 * determinística (sem IA): lê os arquivos, injeta as credenciais reais no lugar
 * do placeholder, commita só o que mudou e republica. Resolve o
 * "placeholder.supabase.co / Supabase não configurado".
 */
export async function reconectarSupabase(repo, onEvent = () => {}) {
  const sb = await store.get("supabase");
  if (!sb.url || !sb.anonKey) throw new Error("Escolha um projeto Supabase primeiro (Conexões → Supabase → Projeto).");
  const owner = repo.owner, name = repo.name, branch = repo.branch || "main";

  onEvent({ type: "status", text: "Lendo o seu projeto…" });
  const files = await lerArquivosDoProjeto(owner, name, branch);
  const injet = gen.injetarCredenciais(files, { url: sb.url, anonKey: sb.anonKey });

  const mudados = Object.entries(injet)
    .filter(([p, c]) => files[p] !== c)
    .map(([path, content]) => ({ path, content }));
  if (!mudados.length) { onEvent({ type: "notice", text: "As credenciais do Supabase já estavam aplicadas." }); return { url: repo.url || null }; }

  onEvent({ type: "status", text: "Aplicando suas credenciais do Supabase no app…" });
  await github.commitFiles({ owner, repo: name, branch, message: "copilot: conectar Supabase", files: mudados });

  let url = repo.url || null;
  try {
    onEvent({ type: "status", text: "Republicando na Vercel…" });
    const dep = await vercel.deploy(owner, name, branch, p => onEvent({ type: "deploy", ...p }));
    url = typeof dep === "string" ? dep : (dep?.prodUrl || dep?.url || url);
  } catch (e) { onEvent({ type: "notice", text: "Credenciais aplicadas, mas o redeploy falhou: " + e.message }); }

  onEvent({ type: "notice", text: "Supabase conectado ao seu app ✅" });
  return { url };
}

/**
 * Coloca a chave do Google Maps NO APP (front), que é onde o mapa client-side a
 * usa: troca import.meta.env.VITE_GOOGLE_MAPS_API_KEY por um fallback com a chave
 * real, e o key= da tag <script> do Maps. Commita e republica. (A chave do Maps
 * JS é pública por natureza — o certo é restringi-la por domínio no Google.)
 */
export async function configurarChaveMapa({ repo, apiKey, envFront = "VITE_GOOGLE_MAPS_API_KEY", kind = "gmaps", label = "Google Maps", onEvent = () => {} }) {
  const owner = repo.owner, name = repo.name, branch = repo.branch || "main";
  onEvent({ type: "status", text: `Lendo o seu app pra colocar a chave do ${label}…` });
  const files = await lerArquivosDoProjeto(owner, name, branch);

  const out = {};
  for (const [p, c] of Object.entries(files)) {
    if (!/\.(jsx?|tsx?|html)$/i.test(p)) continue;
    let novo = c.replace(new RegExp(`import\\.meta\\.env\\.${envFront}`, "g"), `(import.meta.env.${envFront} || "${apiKey}")`);
    if (kind === "gmaps") {
      novo = novo
        .replace(/process\.env\.(?:REACT_APP_|NEXT_PUBLIC_|VITE_)?GOOGLE_MAPS_API_KEY/g, `"${apiKey}"`)
        .replace(/["'](?:YOUR_GOOGLE_MAPS_API_KEY|SUA_CHAVE(?:_GOOGLE_MAPS)?|GOOGLE_MAPS_API_KEY|__GOOGLE_MAPS_KEY__|VITE_GOOGLE_MAPS_API_KEY|COLE_SUA_CHAVE[^"']*)["']/g, `"${apiKey}"`)
        .replace(/(maps\.googleapis\.com\/maps\/api\/js\?[^"'<>]*?key=)[^"'&<>\s]*/g, `$1${apiKey}`);
    } else if (kind === "mapbox") {
      novo = novo
        .replace(/(mapboxgl\.accessToken\s*=\s*)["'][^"']*["']/g, `$1"${apiKey}"`)
        .replace(/process\.env\.(?:REACT_APP_|NEXT_PUBLIC_|VITE_)?MAPBOX(?:_ACCESS)?_TOKEN/g, `"${apiKey}"`)
        .replace(/["'](?:YOUR_MAPBOX_TOKEN|SEU_TOKEN_MAPBOX|MAPBOX_TOKEN|VITE_MAPBOX_TOKEN|pk\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)["']/g, `"${apiKey}"`)
        .replace(/(access_token=)pk\.[A-Za-z0-9_\-.]+/g, `$1${apiKey}`);
    }
    if (novo !== c) out[p] = novo;
  }

  const mudados = Object.entries(out).map(([path, content]) => ({ path, content }));
  if (!mudados.length) {
    onEvent({ type: "notice", text: `Não achei onde o app usa a chave do ${label} — talvez a tela do mapa ainda não exista ou use outro nome de variável.` });
    return { ok: false, url: repo.url || null };
  }

  onEvent({ type: "status", text: "Salvando a chave no app…" });
  await github.commitFiles({ owner, repo: name, branch, message: `copilot: configurar ${label}`, files: mudados });

  let url = repo.url || null;
  try {
    onEvent({ type: "status", text: "Republicando na Vercel…" });
    const dep = await vercel.deploy(owner, name, branch, p => onEvent({ type: "deploy", ...p }));
    url = typeof dep === "string" ? dep : (dep?.prodUrl || dep?.url || url);
  } catch (e) { onEvent({ type: "notice", text: "Chave aplicada, mas o redeploy falhou: " + e.message }); }

  onEvent({ type: "notice", text: `Chave do ${label} aplicada no app ✅` });
  return { ok: true, url };
}

// Compat: o App ainda importa configurarGoogleMaps.
export const configurarGoogleMaps = (args) => configurarChaveMapa({ ...args, envFront: "VITE_GOOGLE_MAPS_API_KEY", kind: "gmaps", label: "Google Maps" });

/** Desfaz a última alteração do projeto (restaura a versão anterior) e republica. */
export async function desfazerUltimo(repo, onEvent = () => {}) {
  const owner = repo.owner, name = repo.name, branch = repo.branch || "main";
  onEvent({ type: "status", text: "Voltando pra versão anterior…" });
  await github.revertLast(owner, name, branch);
  let url = repo.url || null;
  try {
    onEvent({ type: "status", text: "Republicando na Vercel…" });
    const dep = await vercel.deploy(owner, name, branch, p => onEvent({ type: "deploy", ...p }));
    url = typeof dep === "string" ? dep : (dep?.prodUrl || dep?.url || url);
  } catch (e) { onEvent({ type: "notice", text: "Revertido no GitHub, mas o redeploy falhou: " + e.message }); }
  onEvent({ type: "notice", text: "Voltei pra versão anterior ✅" });
  return { url };
}

/** Lista os projetos criados pelo SaaS (com preview salvo, se houver). */
export async function listarProjetos() {
  const repos = await store.get("extensionRepos");
  const urls = await store.get("previewUrls");
  return repos.map(full => {
    const [owner, name] = full.split("/");
    return { owner, name, full, url: urls[full] || null };
  });
}
