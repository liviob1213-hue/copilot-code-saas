// Core do SaaS (standalone). Este arquivo E a fonte da verdade: edite aqui.
// Nao rode `npm run sync-core` sem revisar — ele sobrescreve com a versao da extensao.
// ============================================================================
//  Publicacao na Vercel.
//  Modelo: a Vercel fica ligada ao repositorio do GitHub (integracao Git). O
//  usuario cola o proprio token; ao publicar, criamos/achamos o projeto na
//  Vercel, disparamos um deploy de producao a partir do repo e esperamos ficar
//  no ar. A Vercel faz o build no servidor dela.
// ============================================================================

import * as store from "./storage.js";
import * as gh from "./github.js";
// Relogio unico cobrindo requisicao + leitura do corpo (ver net.js). Importa
// ainda mais aqui: as chamadas da Vercel passam pelo Worker-proxy, e uma ponte
// que abre a resposta e para de enviar prendia a publicacao para sempre.
import { fetchComCorpo, ehTimeout, PRAZO } from "./net.js";

const API = "https://api.vercel.com";

// Link unico para corrigir o acesso da integracao da Vercel no GitHub. Vive numa
// constante porque o MESMO problema aparece em tres lugares: no card da Vercel
// em Conexoes, no aviso previo do criarProjeto e no erro do deploy.
export const LINK_ACESSO_GITHUB = "https://github.com/apps/vercel/installations/select_target";

async function token() {
  const t = await store.getSecret("VERCEL_TOKEN");
  if (!t) {
    throw new Error(
      "Vercel nao conectada. Cole seu token da Vercel no painel (pegue em vercel.com/account/tokens)."
    );
  }
  return t;
}

/**
 * Anexa ?teamId=... quando a Vercel foi conectada por OAuth e a integracao
 * ficou instalada num TIME (e nao numa conta pessoal).
 *
 * Por que isto existe: sem o teamId, a API responde como se a conta estivesse
 * vazia — listar projetos volta [], criar projeto da 403 — e a mensagem de erro
 * nao diz nada sobre time. Com token colado a mao, ou em conta pessoal, nao ha
 * teamId guardado e a URL sai exatamente como antes.
 */
// Nem todo endereco da Vercel aceita teamId. Mandar o parametro para um que
// nao conhece NAO e ignorado: a resposta volta 400 ("One of the provided values
// in the request query is invalid"). Foi exatamente o que derrubou a checagem
// previa — ela chamava git-namespaces com teamId, tomava 400, concluia "nao sei"
// e deixava a geracao seguir para quebrar no fim.
const SEM_TEAM_ID = [/\/v1\/integrations\/git-namespaces/, /\/v2\/user/];

async function comTeamId(url) {
  if (SEM_TEAM_ID.some(re => re.test(url))) return url;
  let teamId = "";
  try { teamId = (await store.get("vercel"))?.teamId || ""; } catch { /* segue sem */ }
  if (!teamId) return url;
  const u = new URL(url);
  // Nao sobrescreve um teamId que o proprio chamador ja tenha posto.
  if (!u.searchParams.has("teamId")) u.searchParams.set("teamId", teamId);
  return u.toString();
}

async function vapi(path, options = {}) {
  const t = await token();
  // Leitura (achar projeto, status do deploy, logs do build) e rapida; escrita
  // (criar projeto, gravar variavel, disparar deploy) ganha folga. Note que o
  // POST /v13/deployments apenas CRIA o deploy e volta na hora — a espera do
  // build e feita em vapi() separados, num laco com teto proprio de 5 min.
  const { timeoutMs, ...init } = options;
  const prazo = timeoutMs ?? (init.method && init.method !== "GET" ? PRAZO.escrita : PRAZO.leitura);
  let res, text;
  try {
    ({ res, text } = await fetchComCorpo(await comTeamId(path.startsWith("http") ? path : API + path), {
      ...init,
      headers: {
        authorization: `Bearer ${t}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers || {})
      }
    }, prazo));
  } catch (e) {
    const err = new Error(
      ehTimeout(e)
        ? `A Vercel nao respondeu em ${Math.round(prazo / 1000)}s (${init.method || "GET"} ${path}). Tente publicar de novo.`
        : `Nao consegui falar com a Vercel (${e.message || e}).`
    );
    // Mantemos o formato de erro do vapi() (status/vercelCode) para quem
    // inspeciona: varios chamadores fazem try/catch e olham err.status.
    err.status = 0;
    err.timeout = ehTimeout(e);
    throw err;
  }
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

// ============================================================================
//  Pre-flight: a integracao da Vercel enxerga os repositorios do GitHub?
// ----------------------------------------------------------------------------
//  Por que isto existe: cada projeto criado aqui nasce num repositorio NOVO e
//  PRIVADO. Se a integracao da Vercel no GitHub estiver em "Only select
//  repositories", esse repositorio nasce invisivel para ela e o deploy quebra no
//  ULTIMO passo — depois de gastar uma geracao de IA e deixar um repositorio
//  orfao na conta. Checar antes custa duas consultas curtas e evita o prejuizo.
//
//  Endpoints (conferidos na especificacao OpenAPI oficial da Vercel, nao
//  adivinhados — https://openapi.vercel.sh):
//    GET /v1/integrations/git-namespaces?provider=github
//        -> [{ id, installationId, slug, isAccessRestricted, requireReauth, ... }]
//        Lista vazia = a integracao nao esta instalada em conta nenhuma.
//    GET /v1/integrations/search-repo?provider=github&namespaceId=<id>
//        -> { gitAccount, repos: [...] }  = o que a Vercel realmente enxerga, ou
//        -> { error: { code: "installation_not_found" } }  com HTTP 200 (!), que
//           e como ela diz "nao estou instalada aqui".
//
//  ATENCAO ao desenho: isto NAO e uma barreira. Qualquer imprevisto (timeout,
//  403 por escopo do token, formato inesperado) devolve "desconhecido", e quem
//  chama deixa passar. Impedir alguem de criar um projeto por causa de uma
//  checagem instavel e pior do que deixar o deploy falhar no fim.
// ============================================================================

// Cache curto: o painel de Conexoes e o criarProjeto pedem a mesma resposta, e
// em desenvolvimento o React monta os componentes duas vezes. Dois minutos
// bastam para nao repetir a consulta sem esconder uma correcao que a pessoa
// acabou de fazer no GitHub (e o botao "checar" do painel passa forcar: true).
const CACHE_ACESSO_MS = 120_000;
let cacheAcesso = null;   // { em: timestamp, resultado }

/** Esquece a resposta guardada (ao trocar o token da Vercel, por exemplo). */
export function esquecerAcessoGithub() { cacheAcesso = null; }

/**
 * Diz se a Vercel conectada consegue ver os repositorios do GitHub do usuario.
 *
 * Devolve { estado, detalhe, mensagem, namespaces, reposVisiveis }, onde
 * `detalhe` e uma linha para a interface e `mensagem` e o texto acionavel
 * completo (so nos estados que pedem acao). Estados:
 *
 *   "sem_token"    — Vercel nem conectada. Nao ha o que checar.
 *   "ok"           — enxerga repositorios e nada indica restricao.
 *   "restrito"     — enxerga alguns, mas a instalacao esta marcada como restrita
 *                    ("Only select repositories"). E a causa real do bug, porem
 *                    o campo isAccessRestricted nao tem semantica documentada —
 *                    entao vale como AVISO, nunca como barreira.
 *   "sem_acesso"   — nao enxerga repositorio nenhum (integracao ausente ou sem
 *                    nada selecionado). Unico caso em que vale falhar cedo: o
 *                    deploy vai quebrar com certeza.
 *   "desconhecido" — nao deu para saber. Siga em frente.
 */
export async function checarAcessoGithub({ forcar = false } = {}) {
  if (!forcar && cacheAcesso && Date.now() - cacheAcesso.em < CACHE_ACESSO_MS) {
    return cacheAcesso.resultado;
  }
  const resultado = await apurarAcessoGithub();
  cacheAcesso = { em: Date.now(), resultado };
  return resultado;
}

async function apurarAcessoGithub() {
  if (!(await store.getSecret("VERCEL_TOKEN"))) {
    return { estado: "sem_token", detalhe: "Vercel nao conectada.", mensagem: null };
  }

  // 1) Que contas/organizacoes do GitHub a integracao da Vercel alcanca?
  let namespaces;
  try {
    namespaces = await listarNamespacesGithub();
  } catch (e) {
    return {
      estado: "desconhecido",
      detalhe: `Nao deu para verificar o acesso ao GitHub (${e.message}).`,
      mensagem: null
    };
  }

  if (!namespaces.length) {
    return {
      estado: "sem_acesso",
      detalhe: "A Vercel nao esta ligada a nenhuma conta do GitHub.",
      mensagem: mensagemSemAcessoGithub("a integracao da Vercel nao aparece em nenhuma conta do GitHub"),
      namespaces: [],
      reposVisiveis: 0
    };
  }

  // 2) Dentro dessas contas, quantos repositorios ela de fato enxerga? Teto de
  // quatro contas para a checagem continuar curta em quem tem muitas orgs.
  const examinadas = namespaces.slice(0, 4);
  let reposVisiveis = 0, semInstalacao = 0, falhas = 0;
  for (const ns of examinadas) {
    try {
      const n = await contarReposVisiveis(ns);
      if (n === null) semInstalacao++; else reposVisiveis += n;
    } catch {
      falhas++;
    }
  }

  // Um repositorio visivel ja prova que a ligacao funciona.
  if (reposVisiveis > 0) {
    const restrita = examinadas.find(ns => ns.isAccessRestricted === true);
    if (restrita) {
      return {
        estado: "restrito",
        detalhe: `A integracao da Vercel esta limitada a repositorios escolhidos${restrita.slug ? ` em ${restrita.slug}` : ""}. Projetos novos nascem invisiveis para ela.`,
        mensagem: mensagemSemAcessoGithub('a integracao da Vercel esta marcada como "Only select repositories"'),
        namespaces, reposVisiveis
      };
    }
    return {
      estado: "ok",
      detalhe: `A Vercel enxerga seus repositorios${examinadas[0]?.slug ? ` em ${examinadas[0].slug}` : ""}.`,
      mensagem: null,
      namespaces, reposVisiveis
    };
  }

  // Zero visiveis, mas alguma consulta falhou: a resposta boa pode estar justo
  // na que falhou. Nao da para afirmar nada — deixa passar.
  if (falhas) {
    return {
      estado: "desconhecido",
      detalhe: "Nao deu para verificar quais repositorios a Vercel enxerga.",
      mensagem: null,
      namespaces, reposVisiveis: null
    };
  }

  // Zero visiveis e todas as consultas responderam: a Vercel realmente nao ve
  // nada. E o unico caso em que vale barrar antes de gastar uma geracao de IA.
  return {
    estado: "sem_acesso",
    detalhe: "A Vercel esta ligada ao GitHub, mas nao enxerga nenhum repositorio.",
    mensagem: mensagemSemAcessoGithub(
      semInstalacao === examinadas.length
        ? "a integracao da Vercel nao esta instalada nesta conta do GitHub"
        : "a Vercel nao enxerga nenhum repositorio seu"
    ),
    namespaces, reposVisiveis: 0
  };
}

// Contas do GitHub ao alcance da integracao. Pergunta com provider=github e, se
// vier vazio, pergunta de novo sem provider — assim a Vercel deduz o provedor de
// quem autenticou, o que cobre GitHub Enterprise e o modo "github-limited".
// Vazio nas duas = integracao ausente.
async function listarNamespacesGithub() {
  const primeira = somenteGithub(await vapi("/v1/integrations/git-namespaces?provider=github", { timeoutMs: PRAZO.consulta }));
  if (primeira.length) return primeira;
  try {
    const segunda = somenteGithub(await vapi("/v1/integrations/git-namespaces", { timeoutMs: PRAZO.consulta }));
    if (segunda.length) return segunda;
  } catch { /* a primeira resposta ja basta */ }
  return [];
}

// So interessam contas do GitHub: este app cria repositorios la. Quem usa so
// GitLab/Bitbucket na Vercel conta como sem acesso, o que esta correto.
function somenteGithub(data) {
  const lista = Array.isArray(data) ? data : (data?.namespaces || []);
  return lista.filter(ns => ns && (!ns.provider || /github/i.test(String(ns.provider))));
}

// Quantos repositorios a Vercel enxerga nesta conta. null = a integracao nao
// esta instalada aqui (a Vercel avisa isso no CORPO, com HTTP 200).
async function contarReposVisiveis(ns) {
  const q = new URLSearchParams({ provider: String(ns.provider || "github") });
  if (ns.id !== undefined && ns.id !== null) q.set("namespaceId", String(ns.id));
  if (ns.installationId !== undefined && ns.installationId !== null) q.set("installationId", String(ns.installationId));
  const data = await vapi(`/v1/integrations/search-repo?${q}`, { timeoutMs: PRAZO.consulta });
  if (data?.error?.code === "installation_not_found") return null;
  // Formato diferente do documentado: melhor nao saber do que chutar.
  if (!Array.isArray(data?.repos)) throw new Error("resposta inesperada da Vercel");
  return data.repos.length;
}

/**
 * Texto UNICO do problema de acesso. Uma funcao so para que exista UMA redacao
 * do mesmo problema, usada nos tres momentos em que ele aparece: o card da
 * Vercel em Conexoes, o aviso antes de gastar IA e o erro do deploy.
 *
 * ATENCAO ao texto: a versao antiga dizia "so precisa fazer isso uma vez" e
 * mandava autorizar O REPOSITORIO. Isso e falso e fazia a pessoa repetir o
 * deploy indefinidamente — cada projeto nasce num repositorio NOVO e PRIVADO,
 * entao autorizar um repositorio nao cobre o proximo. A unica correcao duravel
 * e dar acesso a TODOS os repositorios na integracao.
 */
function mensagemSemAcessoGithub(detalheTecnico) {
  return (
    "A Vercel nao consegue enxergar seus repositorios do GitHub.\n\n" +
    "Como resolver de vez (1 minuto):\n" +
    `1) Abra ${LINK_ACESSO_GITHUB}\n` +
    '2) Escolha sua conta e marque "All repositories".\n' +
    "3) Salve e tente de novo aqui.\n\n" +
    "Por que repetir nao resolve: cada projeto criado aqui nasce num " +
    "repositorio NOVO e PRIVADO. Se a integracao da Vercel estiver limitada a " +
    '"Only select repositories", cada projeto novo nasce invisivel para ela — ' +
    "autorizar um repositorio nao cobre os seguintes." +
    (detalheTecnico ? `\n\n(detalhe tecnico: ${detalheTecnico})` : "")
  );
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

  // Nao existe: cria SEM vinculo com o GitHub.
  //
  // Aqui estava o erro que derrubava todo projeto novo. Antes mandavamos
  // gitRepository: { type: "github", repo }, o que exige a integracao da Vercel
  // instalada no GitHub COM acesso aquele repositorio. Como cada projeto nasce
  // num repositorio NOVO e PRIVADO, e a integracao costuma vir limitada a
  // "Only select repositories", a Vercel respondia "The repository ... couldn't
  // be found" — depois de a IA ja ter rodado e o repositorio ja existir.
  //
  // Sem o vinculo, a Vercel nao precisa enxergar o GitHub: o deploy() envia os
  // arquivos direto (ver deploy). O GitHub continua sendo o lugar onde o codigo
  // mora e de onde o app le para editar — so deixou de ser o caminho por onde a
  // Vercel recebe o projeto.
  const proj = await vapi("/v9/projects", {
    method: "POST",
    body: JSON.stringify({ name: slug })
  });
  await setPublic(proj.id);
  return { id: proj.id, name: proj.name || slug };
}

/**
 * Monta a lista de arquivos do deploy lendo o repositorio do GitHub.
 *
 * O caminho e "GitHub -> navegador -> Vercel" em vez de "GitHub -> Vercel"
 * porque o primeiro usa o token do PROPRIO usuario, que obviamente enxerga o
 * repositorio dele. O segundo dependia da integracao da Vercel no GitHub, que e
 * uma configuracao a parte e que o cliente final nao deveria precisar conhecer.
 */
async function arquivosParaDeploy(owner, name, branch, onProgress) {
  const tree = await gh.getTree(owner, name, branch);
  const alvos = (tree.files || []).filter(f => !f.path.startsWith(".git/"));
  if (!alvos.length) throw new Error("O repositorio esta vazio — nao ha o que publicar.");

  const arquivos = [];
  let lidos = 0;
  for (const f of alvos) {
    try {
      const { content } = await gh.readFile(owner, name, branch, f.path);
      arquivos.push({ file: f.path, data: content, encoding: "utf-8" });
    } catch (e) {
      // Um binario (imagem solta no repo) nao decodifica como texto. Pular um
      // arquivo e melhor do que derrubar a publicacao inteira — e os projetos
      // gerados aqui sao texto; imagem costuma vir embutida como data URI.
      console.warn(`[vercel] pulei "${f.path}" no deploy: ${e.message}`);
    }
    if (++lidos % 5 === 0) onProgress(`lendo arquivos (${lidos}/${alvos.length})`);
  }
  if (!arquivos.length) throw new Error("Nao consegui ler nenhum arquivo do repositorio.");
  return arquivos;
}

/**
 * O que a Vercel precisa saber para BUILDAR. Obrigatorio no primeiro deploy de
 * um projeto (depois ela guarda). Com framework null ela serve os arquivos como
 * estao, que e o certo para um index.html solto; com "vite" ela roda o install e
 * o build e publica o dist/.
 */
function projectSettings(arquivos) {
  const tem = p => arquivos.some(a => a.file === p);
  const pkg = arquivos.find(a => a.file === "package.json");
  const ehVite = tem("vite.config.js") || tem("vite.config.ts") ||
    (pkg && /"vite"\s*:/.test(pkg.data));
  if (ehVite) {
    // null = "detecta sozinha". A Vercel conhece o vite e acerta o dist/.
    return { framework: "vite", buildCommand: null, installCommand: null, outputDirectory: null };
  }
  return { framework: null, buildCommand: null, installCommand: null, outputDirectory: null };
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

  onProgress("lendo os arquivos do projeto");
  const arquivos = await arquivosParaDeploy(owner, name, branch || "main", onProgress);

  // Se ha Supabase ligado, garante as variaveis no projeto ANTES do build.
  if (supabase?.url || supabase?.anonKey) {
    onProgress("configurando variaveis do Supabase");
    await setEnv(project.id, "VITE_SUPABASE_URL", supabase.url);
    await setEnv(project.id, "VITE_SUPABASE_ANON_KEY", supabase.anonKey);
  }

  onProgress("enviando para a Vercel");
  // files (e NAO gitSource): o conteudo vai no proprio corpo da requisicao. A
  // especificacao da Vercel e explicita — "Required for non-git deployments.
  // Cannot be used together with gitSource". A Vercel continua fazendo o build
  // no servidor dela; o que muda e so de onde ela recebe o codigo.
  const dep = await vapi("/v13/deployments", {
    method: "POST",
    body: JSON.stringify({
      name: project.name,
      project: project.id,
      target: "production",
      projectSettings: projectSettings(arquivos),
      files: arquivos
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
