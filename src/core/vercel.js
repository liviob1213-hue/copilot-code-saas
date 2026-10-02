// [gerado por sync-core.mjs] copia de ../../src/core — NAO edite aqui.
// Edite na extensao (src/core) e rode `npm run sync-core`.
// ============================================================================
//  Publicacao na Vercel.
//  Modelo: a Vercel fica ligada ao repositorio do GitHub (integracao Git). O
//  usuario cola o proprio token; ao publicar, criamos/achamos o projeto na
//  Vercel, disparamos um deploy de producao a partir do repo e esperamos ficar
//  no ar. A Vercel faz o build no servidor dela.
// ============================================================================

import * as store from "./storage.js";
import * as gh from "./github.js";

const API = "https://api.vercel.com";

async function token() {
  const t = await store.getSecret("VERCEL_TOKEN");
  if (!t) {
    throw new Error(
      "Vercel nao conectada. Cole seu token da Vercel no painel (pegue em vercel.com/account/tokens)."
    );
  }
  return t;
}

async function vapi(path, options = {}) {
  const t = await token();
  const res = await fetch(path.startsWith("http") ? path : API + path, {
    ...options,
    headers: {
      authorization: `Bearer ${t}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    const detail = data?.error?.message || data?.message || text.slice(0, 300) || `HTTP ${res.status}`;
    const err = new Error(detail);
    err.status = res.status;
    err.vercelCode = data?.error?.code;
    throw err;
  }
  return data;
}

/**
 * Descobre a URL de producao de um projeto que JA existe na Vercel, sem fazer
 * deploy. Usado ao reabrir um projeto para o preview voltar sem precisar
 * publicar de novo. Retorna "https://..." ou "" se nao achar.
 */
// Acha o projeto na Vercel pelo nome; se nao achar (nome com sufixo), procura o
// que esta ligado a este repo do GitHub (owner/name). Retorna o projeto ou null.
async function findProject(owner, name) {
  const slug = projectSlug(name);
  try {
    return await vapi(`/v9/projects/${encodeURIComponent(slug)}`);
  } catch { /* pode ter nome com sufixo; procura abaixo */ }
  try {
    const list = await vapi(`/v9/projects?search=${encodeURIComponent(slug)}&limit=20`);
    const projs = list.projects || list || [];
    const alvo = `${owner}/${name}`.toLowerCase();
    return projs.find(p => {
      const repo = (p.link && p.link.repo) || (p.gitRepository && p.gitRepository.repo) || "";
      return String(repo).toLowerCase() === alvo;
    }) || projs.find(p => (p.name || "").startsWith(slug)) || projs[0] || null;
  } catch {
    return null;
  }
}

// Garante que o projeto deste repo esta PUBLICO. Roda ao abrir um projeto,
// mesmo quando o link ja esta em cache (senao um projeto protegido nunca era
// liberado). Best-effort.
export async function ensurePublic(owner, name) {
  const project = await findProject(owner, name);
  if (project) await setPublic(project.id);
}

export async function getProdUrl(owner, name) {
  const project = await findProject(owner, name);
  if (!project) return "";
  // Garante que o projeto esta publico (senao o preview cai na tela de login).
  await setPublic(project.id);
  // Alias de producao pode vir direto no projeto (mais barato).
  const alvoProd = project?.targets?.production;
  const aliasDireto = pickProdAlias(alvoProd?.alias || [], project.name);
  if (aliasDireto) return `https://${aliasDireto}`;
  if (alvoProd?.url) return `https://${alvoProd.url}`;

  // Senao, pega o ultimo deploy de producao e resolve o alias dele.
  try {
    const data = await vapi(`/v6/deployments?projectId=${encodeURIComponent(project.id)}&target=production&limit=3`);
    const deps = (data.deployments || data || []);
    for (const d of deps) {
      const id = d.uid || d.id;
      if (!id) continue;
      try {
        const full = await vapi(`/v13/deployments/${id}`);
        const alias = pickProdAlias(Array.isArray(full.alias) ? full.alias : [], project.name);
        if (alias) return `https://${alias}`;
        if (full.url) return `https://${full.url}`;
      } catch { /* tenta o proximo */ }
    }
    if (deps[0] && deps[0].url) return `https://${deps[0].url}`;
  } catch { /* sem deploys ainda */ }
  return "";
}

/**
 * Lista os projetos da conta Vercel conectada, com o repositorio do GitHub
 * ligado (owner/name) e a URL de producao. Usado para a lista de "Projetos"
 * mostrar tambem o que ja existe na Vercel (nao so o que a extensao criou).
 */
export async function listProjects() {
  const data = await vapi("/v9/projects?limit=100");
  const projs = data.projects || data || [];
  return projs.map(p => {
    const link = p.link || {};
    let owner = "", name = "";
    if (link.org && link.repo && !String(link.repo).includes("/")) { owner = link.org; name = link.repo; }
    else if (typeof link.repo === "string" && link.repo.includes("/")) {
      const parts = link.repo.split("/"); owner = parts[0]; name = parts.slice(1).join("/");
    } else if (p.gitRepository && typeof p.gitRepository.repo === "string" && p.gitRepository.repo.includes("/")) {
      const parts = p.gitRepository.repo.split("/"); owner = parts[0]; name = parts.slice(1).join("/");
    }
    const aliases = (p.targets && p.targets.production && p.targets.production.alias) || p.alias || [];
    const alias = pickProdAlias(aliases, p.name);
    const url = alias ? `https://${alias}` : `https://${p.name}.vercel.app`;
    return { vercelName: p.name, owner, name, url };
  });
}

/** Confirma o token e devolve quem e o dono. */
export async function whoami() {
  const data = await vapi("/v2/user");
  const u = data.user || data;
  return { username: u.username || u.name || u.email || "conta" };
}

// Escolhe o dominio de producao mais amigavel entre os aliases da Vercel.
// Prefere o canonico "<projeto>.vercel.app"; senao, o .vercel.app estavel mais
// curto (evita os de preview de branch, que tem "-git-" no nome).
function pickProdAlias(aliases, projectName) {
  const list = (aliases || []).filter(a => typeof a === "string" && a);
  const vercelApp = list.filter(a => a.endsWith(".vercel.app"));
  const exact = vercelApp.find(a => a === `${projectName}.vercel.app`);
  if (exact) return exact;
  const estaveis = vercelApp.filter(a => !a.includes("-git-")).sort((a, b) => a.length - b.length);
  if (estaveis.length) return estaveis[0];
  if (vercelApp.length) return vercelApp[0];
  // Sem .vercel.app: pode ser dominio proprio ligado ao projeto.
  return list.sort((a, b) => a.length - b.length)[0] || null;
}

// Nome de projeto valido na Vercel: minusculo, so letras/numeros/hifen/ponto.
function projectSlug(name) {
  return (name || "projeto")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 100) || "projeto";
}

// Deixa o projeto PUBLICO: desliga a "Deployment Protection" (Vercel
// Authentication e senha). Sem isso, o deploy exige login da Vercel e o preview
// no iframe da extensao (e o link compartilhado) redireciona para a tela de
// login. Best-effort: se falhar, nao derruba o deploy.
export async function setPublic(projectId) {
  try {
    await vapi(`/v9/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      body: JSON.stringify({ ssoProtection: null, passwordProtection: null })
    });
  } catch { /* nao bloqueia */ }
}

// Garante que existe um projeto na Vercel ligado ao repo do GitHub.
async function ensureProject(owner, name) {
  const slug = projectSlug(name);

  // Ja existe um projeto com esse nome?
  try {
    const proj = await vapi(`/v9/projects/${encodeURIComponent(slug)}`);
    await setPublic(proj.id);
    return { id: proj.id, name: proj.name || slug };
  } catch (e) {
    if (e.status !== 404) throw e;
  }

  // Nao existe: cria ligado ao repo. Exige a integracao GitHub da Vercel
  // instalada na conta, com acesso a este repositorio.
  try {
    const proj = await vapi("/v9/projects", {
      method: "POST",
      body: JSON.stringify({
        name: slug,
        gitRepository: { type: "github", repo: `${owner}/${name}` }
      })
    });
    await setPublic(proj.id);
    return { id: proj.id, name: proj.name || slug };
  } catch (e) {
    if (/github|repositor|not\s*found|permission|install|access/i.test(e.message)) {
      throw new Error(
        "A Vercel ainda nao tem acesso a este repositorio do GitHub. Entre em vercel.com, clique em " +
        "'Add New… > Project', conecte sua conta do GitHub e autorize o repositorio (so precisa fazer isso uma vez). " +
        `Depois volte e publique de novo. (detalhe: ${e.message})`
      );
    }
    throw e;
  }
}

// Grava uma variavel de ambiente no projeto (upsert: sobrescreve se ja existe).
// E o que faz o VITE_SUPABASE_URL/ANON_KEY existirem no build da Vercel, para o
// app conectar ao banco sem o aviso "Supabase nao configurado".
async function setEnv(projectId, key, value) {
  if (!value) return;
  try {
    await vapi(`/v10/projects/${encodeURIComponent(projectId)}/env?upsert=true`, {
      method: "POST",
      body: JSON.stringify({
        key, value, type: "encrypted",
        target: ["production", "preview", "development"]
      })
    });
  } catch { /* nao bloqueia o deploy se a variavel falhar */ }
}

// Busca as linhas de log de um build que falhou, para a extensao mostrar o erro
// e poder mandar o agente corrigir. Melhor esforco: se falhar, devolve "".
async function fetchBuildLog(deploymentId) {
  try {
    const data = await vapi(`/v2/deployments/${deploymentId}/events?builds=1&direction=backward&limit=200`);
    const eventos = Array.isArray(data) ? data : (data?.events || []);
    const linhas = eventos
      .map(e => e?.payload?.text || e?.text || "")
      .map(s => String(s).replace(/\u001b\[[0-9;]*m/g, "").trimEnd()) // tira cores ANSI
      .filter(Boolean);
    if (!linhas.length) return "";
    // Ordena do mais antigo pro mais novo (backward vem invertido) e acha o erro.
    const ord = linhas.slice().reverse();
    const rx = /error|could not resolve|expected|failed|cannot find|is not defined|unexpected|syntaxerror|unterminated/i;
    const idx = ord.findIndex(l => rx.test(l));
    const trecho = idx >= 0 ? ord.slice(Math.max(0, idx - 3), idx + 10) : ord.slice(-14);
    return trecho.join("\n").slice(0, 1600);
  } catch {
    return "";
  }
}

/**
 * Cria um deploy de producao a partir do repo e espera ficar pronto.
 * onProgress(label) recebe cada passo, para o painel mostrar o andamento.
 * supabase = { url, anonKey } (opcional): grava as variaveis na Vercel antes do build.
 * Retorna { url, prodUrl, projectName, deploymentId }.
 */
export async function deploy(owner, name, branch, onProgress = () => {}, supabase = null) {
  onProgress("preparando o projeto na Vercel");
  const project = await ensureProject(owner, name);
  const rid = await gh.repoId(owner, name);

  // Se ha Supabase ligado, garante as variaveis no projeto ANTES do build.
  if (supabase?.url || supabase?.anonKey) {
    onProgress("configurando variaveis do Supabase");
    await setEnv(project.id, "VITE_SUPABASE_URL", supabase.url);
    await setEnv(project.id, "VITE_SUPABASE_ANON_KEY", supabase.anonKey);
  }

  onProgress("enviando para a Vercel");
  const dep = await vapi("/v13/deployments", {
    method: "POST",
    body: JSON.stringify({
      name: project.name,
      project: project.id,
      target: "production",
      gitSource: { type: "github", repoId: rid, ref: branch || "main" }
    })
  });

  const id = dep.id || dep.uid;
  let url = dep.url ? `https://${dep.url}` : null;
  let aliases = Array.isArray(dep.alias) ? dep.alias : [];
  let state = dep.readyState || dep.status || "QUEUED";

  // Espera o build. READY = no ar; ERROR/CANCELED = falhou. Teto de 5 min.
  const started = Date.now();
  while (!["READY", "ERROR", "CANCELED"].includes(state) && Date.now() - started < 300_000) {
    await new Promise(r => setTimeout(r, 4000));
    try {
      const s = await vapi(`/v13/deployments/${id}`);
      state = s.readyState || s.status || state;
      if (s.url) url = `https://${s.url}`;
      if (Array.isArray(s.alias) && s.alias.length) aliases = s.alias;
    } catch { /* uma leitura falha nao derruba o acompanhamento */ }
    onProgress(`build na Vercel: ${String(state).toLowerCase()}`);
  }

  if (state === "ERROR") {
    const log = await fetchBuildLog(id);
    const err = new Error(
      log
        ? "A Vercel acusou erro no build. Veja o erro abaixo e clique em Corrigir."
        : "A Vercel acusou erro no build. Abra o projeto em vercel.com para ver os logs."
    );
    err.buildLog = log;
    throw err;
  }
  if (state === "CANCELED") throw new Error("O deploy foi cancelado.");
  if (state !== "READY") {
    throw new Error("O build demorou demais. Ele pode terminar sozinho — confira em vercel.com.");
  }

  // O link de producao REAL vem dos aliases que a Vercel atribuiu (o palpite
  // "<projeto>.vercel.app" as vezes esta errado porque o subdominio ja existe e
  // a Vercel muda o nome). Se nao houver alias, cai para a URL imutavel do
  // deploy, que sempre funciona.
  const prodAlias = pickProdAlias(aliases, project.name);
  const prodUrl = prodAlias ? `https://${prodAlias}` : (url || `https://${project.name}.vercel.app`);

  const info = { url: url || prodUrl, prodUrl, projectName: project.name, deploymentId: id };
  await store.patch("vercel", { projectName: project.name, url: prodUrl });
  return info;
}
