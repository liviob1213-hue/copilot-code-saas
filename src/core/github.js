// [gerado por sync-core.mjs] copia de ../../src/core — NAO edite aqui.
// Edite na extensao (src/core) e rode `npm run sync-core`.
import * as store from "./storage.js";
import { GITHUB_OAUTH } from "./config.js";

const API = "https://api.github.com";

function b64encodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64decodeUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Tokens de GitHub App (client_id Ov23li...) EXPIRAM (padrao ~8h). O login
// guarda o refresh_token; aqui renovamos sozinhos, sem o usuario ver erro.
export async function renovarTokenSePreciso(gh, forcar = false) {
  if (!gh?.refreshToken || !gh.token) return gh;
  const faltam = (gh.tokenExpiresAt || 0) - Date.now();
  // Renova de antemao quando falta menos de 5 min (ou quando forcar, apos 401).
  if (!forcar && faltam > 5 * 60 * 1000) return gh;
  try {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_id: GITHUB_OAUTH.clientId,
        grant_type: "refresh_token",
        refresh_token: gh.refreshToken
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!data.access_token) {
      // Refresh token invalido/revogado: limpa pra UI mostrar "desconectado"
      // em vez de guardar um token morto que so gera 401 depois.
      if (data.error === "bad_refresh_token" || data.error === "invalid_grant") {
        await store.patch("github", { token: "", login: "", avatar: "", refreshToken: "", tokenExpiresAt: 0 });
      }
      return gh;
    }
    const atualizado = {
      token: data.access_token,
      refreshToken: data.refresh_token || gh.refreshToken,
      tokenExpiresAt: data.expires_in ? Date.now() + (Number(data.expires_in) - 60) * 1000 : 0
    };
    await store.patch("github", atualizado);
    return { ...gh, ...atualizado };
  } catch { /* offline etc: segue com o token atual */ return gh; }
}

async function token() {
  let gh = await store.get("github");
  if (gh.token && (gh.refreshToken || gh.tokenExpiresAt)) {
    gh = await renovarTokenSePreciso(gh);
  }
  const t = gh.token || (await store.getSecret("GITHUB_TOKEN"));
  if (!t) throw new Error("GitHub nao conectado. Entre com sua conta ou cole um token nas Configuracoes.");
  return t;
}

async function api(path, options = {}) {
  const t = await token();
  const res = await fetch(path.startsWith("http") ? path : API + path, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${t}`,
      "x-github-api-version": "2022-11-28",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  if (!res.ok) {
    // O MOTIVO REAL costuma estar no array "errors", nao no "message" generico.
    let detail = text.slice(0, 400);
    try {
      const j = JSON.parse(text);
      detail = j.message || detail;
      if (Array.isArray(j.errors) && j.errors.length) {
        const extra = j.errors
          .map(e => e.message || [e.field, e.code].filter(Boolean).join(" "))
          .filter(Boolean).join("; ");
        if (extra) detail += " — " + extra;
      }
    } catch {}

    // 401 tem uma causa so: o token nao vale mais. Antes de desistir, tentamos
    // renovar (GitHub App expira ~8h) e repetir a chamada UMA vez. So se o
    // refresh tambem falhar avisamos o usuario pra reconectar.
    if (res.status === 401) {
      const gh = await store.get("github");
      if (gh.refreshToken && !options.__retryAuth) {
        const renovado = await renovarTokenSePreciso(gh, true);
        if (renovado.token && renovado.token !== gh.token) {
          return api(path, { ...options, __retryAuth: true });
        }
      }
      const err = new Error(
        "O token do GitHub nao e mais aceito. Ele pode ter expirado ou sido revogado. Clique em sair e conecte de novo."
      );
      err.githubAuth = true;
      throw err;
    }
    // Limite SECUNDARIO/abuso: o GitHub bloqueia por minutos quem cria muitos
    // repositorios (ou faz muitas chamadas) em pouco tempo. Acontece depois de
    // criar varios projetos de teste em sequencia.
    if ((res.status === 403 || res.status === 429) && /secondary rate|abuse|too many/i.test(detail + text)) {
      throw new Error("O GitHub bloqueou temporariamente por EXCESSO de acoes em pouco tempo (limite secundario/abuso) — comum depois de criar varios projetos seguidos. Espere ~5 a 15 minutos e tente de novo. Apagar repositorios de teste antigos tambem ajuda.");
    }
    if (res.status === 403 && /rate limit/i.test(detail)) {
      throw new Error("Limite de requisicoes do GitHub atingido. Espere alguns minutos.");
    }
    if (res.status === 403) {
      throw new Error(
        `GitHub 403: sem permissao. Confira se o token tem escopo "repo" (criar repositorio) ou "Contents: Read and write". (${detail})`
      );
    }
    throw new Error(`GitHub ${res.status}: ${detail}`);
  }
  return text ? JSON.parse(text) : null;
}

/** Confere se o token responde antes de voce depender dele num commit. */
export async function validateToken(candidate) {
  const res = await fetch(`${API}/user`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${candidate}`,
      "x-github-api-version": "2022-11-28"
    }
  });
  if (res.status === 401) throw new Error("Token recusado pelo GitHub. Confira se voce copiou ele inteiro.");
  if (!res.ok) throw new Error(`GitHub ${res.status} ao validar o token.`);
  const user = await res.json();

  // Um token so serve aqui se puder escrever em repositorio. Checamos o escopo
  // quando o GitHub informa (tokens classicos e OAuth trazem esse cabecalho).
  const scopes = res.headers.get("x-oauth-scopes");
  const semRepo = scopes !== null && scopes !== "" && !/\brepo\b/.test(scopes);

  return { login: user.login, avatar: user.avatar_url, name: user.name, semRepo, scopes };
}

// --- conta -------------------------------------------------------------------

export async function whoami() {
  const user = await api("/user");
  await store.patch("github", { login: user.login, avatar: user.avatar_url });
  return { login: user.login, avatar: user.avatar_url, name: user.name };
}

export async function listRepos() {
  const collected = new Map();
  const diag = { conta: 0, instalacoes: 0, privados: 0, publicos: 0, escopos: null, erros: [] };

  // Descobrimos o alcance real do token: e ele que explica lista curta.
  try {
    const res = await fetch(`${API}/user`, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${await token()}`,
        "x-github-api-version": "2022-11-28"
      }
    });
    diag.escopos = res.headers.get("x-oauth-scopes");
    // Token de GitHub App devolve o cabecalho vazio; token de OAuth App traz os
    // escopos concedidos. A distincao importa: o de App so alcanca repositorios
    // onde o App foi instalado, por mais permissoes que voce marque.
    if (diag.escopos === null || diag.escopos === "") {
      diag.tipoToken = "GitHub App ou fine-grained";
      diag.appToken = true;
    } else {
      diag.tipoToken = `OAuth App (escopos: ${diag.escopos})`;
      diag.temRepoScope = /\brepo\b/.test(diag.escopos);
    }
  } catch { /* diagnostico e opcional */ }

  // 1) Repositorios da conta. visibility=all explicito: sem ele, tokens com
  //    alcance reduzido devolvem so os publicos e a lista parece incompleta.
  for (let page = 1; page <= 10; page++) {
    try {
      const batch = await api(
        `/user/repos?per_page=100&page=${page}&sort=updated&visibility=all&affiliation=owner,collaborator,organization_member`
      );
      for (const r of batch) collected.set(r.full_name, r);
      diag.conta += batch.length;
      if (batch.length < 100) break;
    } catch (e) {
      diag.erros.push(`conta: ${e.message}`);
      break;
    }
  }

  // 2) Repositorios acessiveis via apps instalados. E onde ficam os que o
  //    Lovable cria, sob a instalacao do GitHub App dele.
  // Busca via instalacoes de GitHub App. So faz sentido para token de App;
  // com OAuth, o endpoint acima ja trouxe tudo, entao pulamos e evitamos um
  // 403 que confundiria sem motivo.
  if (diag.appToken) {
    try {
      const installs = await api("/user/installations?per_page=100");
      diag.numInstalacoes = (installs.installations || []).length;
      for (const inst of installs.installations || []) {
        for (let page = 1; page <= 10; page++) {
          const data = await api(`/user/installations/${inst.id}/repositories?per_page=100&page=${page}`);
          const repos = data.repositories || [];
          for (const r of repos) collected.set(r.full_name, r);
          diag.instalacoes += repos.length;
          if (repos.length < 100) break;
        }
      }
    } catch (e) {
      diag.erros.push(`instalacoes: ${e.message}`);
    }
  }

  const list = [...collected.values()];
  diag.privados = list.filter(r => r.private).length;
  diag.publicos = list.length - diag.privados;

  return {
    diag,
    repos: list
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .map(r => ({
        fullName: r.full_name,
        owner: r.owner.login,
        name: r.name,
        branch: r.default_branch,
        private: r.private,
        updatedAt: r.updated_at,
        description: r.description
      }))
  };
}

// A Vercel precisa do id numerico do repositorio (nao do "owner/name") para
// disparar um deploy a partir do GitHub.
export async function repoId(owner, name) {
  const r = await api(`/repos/${owner}/${name}`);
  return r.id;
}

export async function getRepo(owner, name) {
  try {
    const r = await api(`/repos/${owner}/${name}`);
    return { owner: r.owner.login, name: r.name, branch: r.default_branch, private: r.private };
  } catch (e) {
    if (/404/.test(e.message)) {
      throw new Error(
        `Nao encontrei "${owner}/${name}", ou seu token nao alcanca ele. ` +
        `Se for um repositorio criado pelo Lovable, gere um token fine-grained com acesso a ele em Contents: Read and write.`
      );
    }
    throw e;
  }
}

// --- login sem backend (GitHub Device Flow) -----------------------------------

export async function startDeviceLogin(clientId) {
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId, scope: "repo read:user" })
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (data.error || !res.ok) {
    const raw = data.error_description || data.error || `HTTP ${res.status}`;
    // Traduz os erros mais comuns em algo que diga o que fazer.
    if (res.status === 404 || /not found/i.test(raw)) {
      throw new Error(
        `O GitHub nao reconheceu este Client ID ("${clientId}"). ` +
        `Confira o campo "Client ID (OAuth)" nas Configuracoes — ele precisa ser de um OAuth App real, ` +
        `com o "Device Flow" ligado. Alternativa mais simples: cole um token pessoal (github_pat_...) no painel.`
      );
    }
    if (/device[_ ]?flow/i.test(raw)) {
      throw new Error(
        `Este OAuth App esta com o "Device Flow" desligado. Ative "Enable Device Flow" nas configuracoes do ` +
        `OAuth App no GitHub, ou cole um token pessoal (github_pat_...) no painel.`
      );
    }
    throw new Error(raw);
  }
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    interval: (data.interval || 5) * 1000,
    expiresIn: data.expires_in * 1000
  };
}

export async function pollDeviceLogin(clientId, deviceCode) {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code"
    })
  });
  const data = await res.json();
  if (data.access_token) {
    await store.patch("github", {
      token: data.access_token,
      refreshToken: data.refresh_token || "",
      tokenExpiresAt: data.expires_in ? Date.now() + (Number(data.expires_in) - 60) * 1000 : 0
    });
    const me = await whoami();
    return { status: "done", ...me };
  }
  if (data.error === "authorization_pending") return { status: "pending" };
  if (data.error === "slow_down") return { status: "slow_down", interval: (data.interval || 10) * 1000 };
  throw new Error(data.error_description || data.error || "Falha no login.");
}

// Login "sem codigo": abre a autorizacao do GitHub numa janela (launchWebAuthFlow),
// recebe o "code", troca por um token no mini-proxy (Worker) e guarda o token.
// Aditivo: se o OAuth nao estiver configurado, quem chama cai no device flow.
export function oauthConfigurado() {
  return Boolean(GITHUB_OAUTH.clientId && GITHUB_OAUTH.workerUrl);
}

export async function startOAuthLogin() {
  const { clientId, workerUrl, scope } = GITHUB_OAUTH;
  if (!clientId || !workerUrl) {
    throw new Error("OAuth do GitHub nao configurado (clientId/workerUrl em config.js).");
  }
  const redirectUri = chrome.identity.getRedirectURL(); // https://<id>.chromiumapp.org/
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const authUrl =
    "https://github.com/login/oauth/authorize" +
    "?client_id=" + encodeURIComponent(clientId) +
    "&redirect_uri=" + encodeURIComponent(redirectUri) +
    "&scope=" + encodeURIComponent(scope) +
    "&state=" + encodeURIComponent(state);

  const redirectResponse = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  if (!redirectResponse) throw new Error("Login cancelado.");

  const url = new URL(redirectResponse);
  const erro = url.searchParams.get("error");
  if (erro) throw new Error("GitHub recusou: " + (url.searchParams.get("error_description") || erro));
  const code = url.searchParams.get("code");
  const retState = url.searchParams.get("state");
  if (!code) throw new Error("Nao recebi o code do GitHub. Confira a callback URL do OAuth App.");
  if (retState !== state) throw new Error("State invalido — tente de novo.");

  // Troca code -> token no Worker (o client_secret so existe la).
  let data;
  try {
    const res = await fetch(workerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code })
    });
    data = await res.json();
  } catch (e) {
    throw new Error("Nao consegui falar com o servidor de login. Confira a URL do Worker. (" + (e.message || e) + ")");
  }
  if (!data || !data.access_token) {
    throw new Error("Falha ao obter o token: " + (data?.error_description || data?.error || "sem token"));
  }

  const token = data.access_token;
  const perfil = await validateToken(token); // valida e pega login/avatar/escopo
  await store.patch("github", {
    token,
    login: perfil.login,
    avatar: perfil.avatar,
    refreshToken: data.refresh_token || "",
    tokenExpiresAt: data.expires_in ? Date.now() + (Number(data.expires_in) - 60) * 1000 : 0
  });
  return { login: perfil.login, avatar: perfil.avatar, semRepo: perfil.semRepo };
}

export async function logout() {
  await store.patch("github", { token: "", login: "", avatar: "" });
}

// --- leitura do repositorio ---------------------------------------------------

export async function getTree(owner, repo, branch) {
  const ref = await api(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const commit = await api(`/repos/${owner}/${repo}/git/commits/${ref.object.sha}`);
  const tree = await api(`/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
  return {
    headSha: ref.object.sha,
    treeSha: commit.tree.sha,
    truncated: tree.truncated,
    files: tree.tree
      .filter(n => n.type === "blob")
      .map(n => ({ path: n.path, size: n.size, sha: n.sha }))
  };
}

export async function readFile(owner, repo, branch, path) {
  const data = await api(
    `/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`
  );
  if (Array.isArray(data)) throw new Error(`"${path}" e uma pasta, nao um arquivo.`);
  if (data.encoding !== "base64") throw new Error(`Formato inesperado em "${path}".`);
  return { path, sha: data.sha, size: data.size, content: b64decodeUtf8(data.content) };
}

export async function searchCode(owner, repo, query) {
  const q = encodeURIComponent(`${query} repo:${owner}/${repo}`);
  const data = await api(`/search/code?q=${q}&per_page=20`);
  return (data.items || []).map(i => ({ path: i.path, url: i.html_url }));
}

// --- escrita: um unico commit com varios arquivos ------------------------------

/**
 * files: [{ path, content }]  para criar/atualizar
 *        [{ path, delete: true }] para remover
 * Faz tudo num commit so, o que dispara um unico sync no Lovable.
 */
/**
 * Cria um repositorio novo na conta da pessoa e envia todos os arquivos do
 * projeto em um unico commit inicial. Usado pelo criador de sites para publicar
 * o micro-SaaS sem a pessoa precisar baixar nada nem usar o site do GitHub.
 */
export async function createRepoWithFiles({ name, description = "", privado = true, files }) {
  if (!files?.length) throw new Error("Nenhum arquivo para enviar.");

  const nomeLimpo = String(name).trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "meu-projeto";

  // O GitHub recusa (422) descricao com caracteres de controle (quebra de linha,
  // tab, etc.) — e o prompt da pessoa quase sempre tem. Trocamos por espaco,
  // colapsamos e limitamos o tamanho.
  const descLimpa = String(description || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);

  // 1) cria o repositorio com um README, para ja nascer com uma branch valida
  let repo;
  try {
    repo = await api("/user/repos", {
      method: "POST",
      body: JSON.stringify({
        name: nomeLimpo,
        description: descLimpa,
        private: privado,
        auto_init: true            // cria o commit inicial e a branch padrao
      })
    });
  } catch (err) {
    if (/already exists|name already exists/i.test(err.message)) {
      throw new Error(`Ja existe um repositorio chamado "${nomeLimpo}" na sua conta. Escolha outro nome.`);
    }
    // 422/403 ao criar repo. Agora o api() ja revela o motivo REAL (array
    // "errors" do GitHub), entao lideramos com ele e so adicionamos as causas
    // mais comuns. Nao afirmamos "fine-grained" como causa unica: o motivo pode
    // ser escopo do token, limite da conta ou validacao do nome.
    if (/\b(422|403)\b/.test(err.message)) {
      throw new Error(
        "O GitHub recusou a criacao do repositorio.\nMotivo informado: " + err.message + "\n\n" +
        "Causas mais comuns:\n" +
        "1) Token sem permissao para CRIAR repos — tokens fine-grained (github_pat_...) nao criam repos novos. Reconecte em Conexoes com \"Entrar com GitHub\" (OAuth) ou um PAT CLASSICO com escopo \"repo\".\n" +
        "2) Excesso de criacoes em pouco tempo (limite secundario) — espere alguns minutos.\n" +
        "3) Nome invalido ou ja usado — tente outro nome."
      );
    }
    throw err;
  }

  const owner = repo.owner.login;
  const branch = repo.default_branch || "main";

  // 2) o auto_init e assincrono: esperamos a branch aparecer antes de commitar
  let pronto = false;
  for (let i = 0; i < 10 && !pronto; i++) {
    try {
      await api(`/repos/${owner}/${nomeLimpo}/git/ref/heads/${encodeURIComponent(branch)}`);
      pronto = true;
    } catch {
      await new Promise(r => setTimeout(r, 1200));
    }
  }
  if (!pronto) throw new Error("O repositorio foi criado, mas demorou a ficar pronto. Tente enviar os arquivos de novo em instantes.");

  // 3) envia tudo em um commit so
  const commit = await commitFiles({
    owner,
    repo: nomeLimpo,
    branch,
    message: "projeto inicial criado pelo Lovable Copilot",
    files
  });

  return {
    owner,
    name: nomeLimpo,
    branch,
    htmlUrl: repo.html_url,
    commit
  };
}

export async function commitFiles({ owner, repo, branch, message, files }) {
  if (!files?.length) throw new Error("Nada para commitar.");

  const ref = await api(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const headSha = ref.object.sha;
  const headCommit = await api(`/repos/${owner}/${repo}/git/commits/${headSha}`);

  // Os blobs sao independentes. Quatro uploads simultaneos reduzem bastante o
  // tempo de commits grandes sem abrir uma rajada que provoque rate limit.
  const treeEntries = new Array(files.length);
  let nextIndex = 0;
  async function uploadWorker() {
    while (true) {
      const index = nextIndex++;
      if (index >= files.length) return;
      const f = files[index];
      if (f.delete) {
        treeEntries[index] = { path: f.path, mode: "100644", type: "blob", sha: null };
        continue;
      }
      // Arquivos binarios (imagens) chegam com o base64 pronto e nao devem ser
      // re-codificados; os de texto passam pelo encoder UTF-8.
      const conteudoBase64 = f.base64 ? f.content : b64encodeUtf8(f.content);
      const blob = await api(`/repos/${owner}/${repo}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: conteudoBase64, encoding: "base64" })
      });
      treeEntries[index] = { path: f.path, mode: "100644", type: "blob", sha: blob.sha };
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, files.length) }, () => uploadWorker()));

  // Monta a arvore, cria o commit e move a branch. Se outra gravacao entrou no
  // meio, o GitHub recusa a atualizacao da branch com 422 ("not a fast forward");
  // nesse caso relemos o topo atual e REFAZEMOS o commit por cima dele.
  let baseTreeSha = headCommit.tree.sha;
  let parentSha = headSha;
  let commit;
  for (let tentativa = 0; ; tentativa++) {
    // Num repo recem-criado os blobs podem demorar a propagar (422 "not a valid
    // blob"): esperamos e tentamos montar a arvore de novo.
    let tree;
    for (let t2 = 0; ; t2++) {
      try {
        tree = await api(`/repos/${owner}/${repo}/git/trees`, {
          method: "POST",
          body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries })
        });
        break;
      } catch (e) {
        if (t2 < 4 && /not a valid blob|is not a valid|422/i.test(e.message)) {
          await new Promise(r => setTimeout(r, 1500 * (t2 + 1)));
          continue;
        }
        throw e;
      }
    }

    commit = await api(`/repos/${owner}/${repo}/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] })
    });

    try {
      await api(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: false })
      });
      break;
    } catch (e) {
      if (tentativa < 3 && /fast.?forward|not a fast|422/i.test(e.message)) {
        const ref2 = await api(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
        parentSha = ref2.object.sha;
        const hc2 = await api(`/repos/${owner}/${repo}/git/commits/${parentSha}`);
        baseTreeSha = hc2.tree.sha;
        continue;
      }
      throw e;
    }
  }

  return {
    sha: commit.sha,
    shortSha: commit.sha.slice(0, 7),
    url: `https://github.com/${owner}/${repo}/commit/${commit.sha}`,
    files: files.map(f => ({ path: f.path, deleted: Boolean(f.delete) }))
  };
}

export async function latestCommit(owner, repo, branch) {
  const data = await api(`/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`);
  return {
    sha: data.sha,
    shortSha: data.sha.slice(0, 7),
    message: data.commit.message,
    author: data.commit.author?.name,
    date: data.commit.author?.date
  };
}

/**
 * Desfaz a última alteração: cria um commit novo que restaura a árvore do commit
 * ANTERIOR (nao-destrutivo — mantém o histórico). Usado pelo "Desfazer".
 */
export async function revertLast(owner, repo, branch) {
  const ref = await api(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const headSha = ref.object.sha;
  const head = await api(`/repos/${owner}/${repo}/git/commits/${headSha}`);
  const parent = head.parents && head.parents[0];
  if (!parent) throw new Error("Não há uma versão anterior para voltar.");
  const prev = await api(`/repos/${owner}/${repo}/git/commits/${parent.sha}`);

  const commit = await api(`/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message: "copilot: desfazer ultima alteracao", tree: prev.tree.sha, parents: [headSha] })
  });
  await api(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false })
  });
  return { sha: commit.sha, restoredFrom: parent.sha.slice(0, 7) };
}

export { b64decodeUtf8, b64encodeUtf8 };
