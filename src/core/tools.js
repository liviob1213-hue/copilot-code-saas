// [gerado por sync-core.mjs] copia de ../../src/core — NAO edite aqui.
// Edite na extensao (src/core) e rode `npm run sync-core`.
import * as gh from "./github.js";
import * as sb from "./supabase-mgmt.js";
import { AGENT_LIMITS } from "./config.js";

export const TOOL_SCHEMAS = [
  {
    name: "list_files",
    description:
      "Lista os arquivos do repositorio. Use no inicio para entender a estrutura antes de editar. O filtro e opcional e casa por trecho do caminho, ex: 'src/components'.",
    parameters: {
      type: "object",
      properties: {
        filter: { type: "string", description: "Trecho do caminho para filtrar. Vazio lista tudo." }
      },
      required: []
    }
  },
  {
    name: "read_file",
    description:
      "Le o conteudo completo de um arquivo. Sempre leia um arquivo antes de reescrever, para nao perder codigo existente.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Caminho a partir da raiz, ex: src/pages/Index.tsx" } },
      required: ["path"]
    }
  },
  {
    name: "search_code",
    description:
      "Procura um termo dentro do codigo do repositorio e devolve os arquivos que contem o termo. Bom para achar onde um componente e usado.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Termo a procurar, ex: useAuth" } },
      required: ["query"]
    }
  },
  {
    name: "write_file",
    description:
      "Grava um arquivo na area de preparacao. Envie o conteudo final e completo do arquivo, nunca um trecho ou um diff. Nada vai para o GitHub ate voce chamar commit_changes.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho a partir da raiz." },
        content: { type: "string", description: "Conteudo final e completo do arquivo." }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "delete_file",
    description: "Marca um arquivo para remocao na area de preparacao.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"]
    }
  },
  {
    name: "commit_changes",
    description:
      "Envia tudo que esta na area de preparacao para a branch principal em um unico commit. O Lovable recebe a atualizacao em seguida. Chame uma vez so, no fim da tarefa.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "Mensagem do commit, curta e no imperativo." }
      },
      required: ["message"]
    }
  },
  {
    name: "salvar_imagem",
    description:
      "Salva no repositorio uma das imagens que a PESSOA ANEXOU nesta conversa, como arquivo de verdade. Use sempre que ela pedir para colocar a foto dela no site — assim a imagem entra no projeto e aparece no ar. Depois de salvar, use o caminho retornado no src da tag <img>. Nunca invente caminhos de imagem nem peca para a pessoa subir o arquivo na mao.",
    parameters: {
      type: "object",
      properties: {
        indice: { type: "number", description: "Qual imagem anexada salvar: 1 para a primeira, 2 para a segunda, e assim por diante." },
        path: { type: "string", description: "Onde salvar, a partir da raiz. Em projetos Vite use 'public/nome.jpg'; em projetos sem pasta public, use 'src/assets/nome.jpg'." }
      },
      required: ["indice", "path"]
    }
  },
  {
    name: "listar_tabelas",
    description:
      "Lista as tabelas que ja existem no banco Supabase conectado, com as colunas de cada uma. Use SEMPRE antes de criar tabelas, para nao duplicar e para escrever o front com os nomes de coluna certos.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "criar_tabela",
    description:
      "Executa SQL de criacao (CREATE TABLE, ALTER TABLE ADD COLUMN, CREATE POLICY, CREATE INDEX, CREATE FUNCTION/TRIGGER) direto no banco Supabase da pessoa. Use SEMPRE que o pedido envolver guardar ou ler dados: formularios, cadastros, listas, comentarios, pedidos, autenticacao. Nao escreva o SQL num arquivo — execute aqui, a tabela passa a existir de verdade. Comandos destrutivos sao bloqueados.",
    parameters: {
      type: "object",
      properties: {
        sql: { type: "string", description: "SQL PostgreSQL completo. Pode ter varios comandos separados por ponto e virgula." },
        explicacao: { type: "string", description: "Uma frase curta em portugues do que isso cria (ex: 'tabela de contatos com nome, email e mensagem')." }
      },
      required: ["sql", "explicacao"]
    }
  },
  {
    name: "criar_edge_function",
    description:
      "Publica uma Edge Function (Deno/TypeScript) no Supabase da pessoa. Use quando o pedido precisar de logica no servidor: enviar email, integrar pagamento, webhook, processar algo com chave secreta que nao pode ficar no front.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Nome da funcao em minusculas com hifens, ex: 'enviar-contato'." },
        code: { type: "string", description: "Codigo completo da funcao em TypeScript para Deno, usando Deno.serve." },
        explicacao: { type: "string", description: "Uma frase curta do que a funcao faz." }
      },
      required: ["slug", "code", "explicacao"]
    }
  }
];

/**
 * A area de preparacao guarda as edicoes ate o commit. Isso mantem o Lovable
 * com um estado sempre compilavel: um pedido = um commit = um sync.
 */
export function createWorkspace(repo, settings) {
  return {
    repo,                 // { owner, name, branch }
    settings,
    staged: new Map(),    // path -> { content } | { delete: true }
    treeCache: null,
    fileCache: new Map(),
    commits: []
  };
}

export function stagedSummary(ws) {
  return [...ws.staged.entries()].map(([path, v]) => ({
    path,
    action: v.delete ? "remover" : ws.fileCache.has(path) ? "alterar" : "criar",
    bytes: v.delete ? 0 : v.content.length
  }));
}

function safeRepoPath(rawPath) {
  const raw = String(rawPath || "").trim();
  if (raw.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(raw)) {
    throw new Error("Caminho absoluto nao e permitido.");
  }
  const path = raw.replace(/\\/g, "/");
  const parts = path.split("/");
  if (!path || path.length > 400 || parts.some(part => !part || part === "." || part === "..") ||
      /[\u0000-\u001f]/.test(path) || parts.includes(".git")) {
    throw new Error("Caminho invalido. Use um caminho relativo dentro do repositorio.");
  }
  return path;
}

// Guarda-rede contra a causa #1 de TELA PRETA: um componente/icone usado no JSX
// sem o import correspondente (ex.: <ChevronDown/> sem "import {ChevronDown} from
// 'lucide-react'"). Nao bloqueia o salvamento — so devolve um aviso pro agente
// se corrigir antes de commitar. Conservador: so acusa o que tem CERTEZA que nao
// foi importado nem definido no proprio arquivo.
function checarReferencias(path, content) {
  if (!/\.(jsx|tsx)$/i.test(path)) return "";
  const txt = String(content);

  // Nomes que o arquivo conhece: imports (default, namespace e nomeados) +
  // coisas definidas localmente (funcao, const/let/var, class).
  const conhecidos = new Set(["React", "Fragment", "Suspense", "StrictMode"]);
  for (const m of txt.matchAll(/import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g)) {
    const clausula = m[1];
    // default e namespace: import Foo, * as Bar
    for (const d of clausula.matchAll(/(?:^|,)\s*(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)\s*(?=,|$|\{)/g)) {
      if (d[1]) conhecidos.add(d[1]);
    }
    // nomeados: { A, B as C }
    const bloco = clausula.match(/\{([\s\S]*?)\}/);
    if (bloco) {
      for (const n of bloco[1].split(",")) {
        const nome = n.split(/\s+as\s+/).pop().trim();
        if (nome) conhecidos.add(nome);
      }
    }
  }
  for (const m of txt.matchAll(/\b(?:function|class)\s+([A-Z][\w$]*)/g)) conhecidos.add(m[1]);
  for (const m of txt.matchAll(/\b(?:const|let|var)\s+([A-Z][\w$]*)\s*=/g)) conhecidos.add(m[1]);

  // Tags em CamelCase usadas no JSX (<Foo ...>), ignorando namespaced (<Motion.div>).
  const usados = new Set();
  for (const m of txt.matchAll(/<([A-Z][A-Za-z0-9]*)(?=[\s/>])/g)) usados.add(m[1]);

  const faltando = [...usados].filter(n => !conhecidos.has(n));
  if (!faltando.length) return "";
  return `ATENCAO: estes nomes aparecem no JSX mas NAO tem import nem definicao neste arquivo: ${faltando.join(", ")}. ` +
    `Sem o import vira "X is not defined" e a tela fica PRETA. Adicione o import (icones: from "lucide-react"; componentes fx/ui: do caminho relativo) e grave de novo.`;
}

export async function runTool(ws, name, args, emit = () => {}) {
  const { owner, name: repo, branch } = ws.repo;

  switch (name) {
    case "list_files": {
      if (!ws.treeCache) ws.treeCache = await gh.getTree(owner, repo, branch);
      const filter = (args.filter || "").toLowerCase();
      let files = ws.treeCache.files
        // Fora dependencias, build e binarios: enchem o contexto e nunca sao
        // o que a pessoa quer alterar.
        .filter(f => !AGENT_LIMITS.ignorar.test(f.path));

      const total = files.length;
      if (filter) files = files.filter(f => f.path.toLowerCase().includes(filter));

      const cortou = files.length > AGENT_LIMITS.maxTreeEntries;
      files = files.slice(0, AGENT_LIMITS.maxTreeEntries);

      emit({ type: "tool", name, detail: `${files.length} de ${total} arquivos` });

      // So os caminhos. Tamanhos e shas dobrariam o custo sem ajudar a decidir.
      const lista = files.map(f => f.path).join("\n");
      return lista
        ? lista + (cortou ? `\n\n[lista cortada em ${AGENT_LIMITS.maxTreeEntries}. Use o filtro para focar numa pasta.]` : "")
        : "Nenhum arquivo encontrado com esse filtro.";
    }

    case "read_file": {
      let path;
      try { path = safeRepoPath(args.path); } catch (err) { return `Erro: ${err.message}`; }
      // Arquivo gerado (routeTree.gen.ts, locks): nao le o conteudo, so avisa.
      if (AGENT_LIMITS.gerado?.test(path)) {
        emit({ type: "tool", name, detail: `${path} (gerado — ignorado)` });
        return `"${path}" e um arquivo GERADO automaticamente (roteador/lock). Nao precisa ler nem editar — ele se atualiza sozinho. Foque nos arquivos de codigo do projeto.`;
      }
      if (ws.staged.has(path) && !ws.staged.get(path).delete) {
        emit({ type: "tool", name, detail: `${path} (versao preparada)` });
        return ws.staged.get(path).content;
      }
      if (ws.fileCache.has(path)) {
        emit({ type: "tool", name, detail: path });
        return ws.fileCache.get(path);
      }
      let file;
      try {
        file = await gh.readFile(owner, repo, branch, path);
      } catch (err) {
        if (!/404/.test(err.message)) throw err;
        // Em vez de devolver "404" cru, ajudamos a IA a se corrigir sozinha:
        // ela chutou um caminho, entao mostramos os parecidos que existem.
        if (!ws.treeCache) ws.treeCache = await gh.getTree(owner, repo, branch);
        const base = (path.split("/").pop() || "").toLowerCase();
        const semExt = base.replace(/\.[^.]+$/, "");
        const parecidos = ws.treeCache.files
          .filter(f => !AGENT_LIMITS.ignorar.test(f.path))
          .filter(f => {
            const nome = f.path.split("/").pop().toLowerCase();
            return nome === base || (semExt.length > 2 && nome.includes(semExt));
          })
          .slice(0, 12)
          .map(f => f.path);

        emit({ type: "tool", name, detail: `${path} nao existe` });
        return parecidos.length
          ? `O arquivo "${path}" nao existe no repositorio. Caminhos parecidos que existem:\n${parecidos.join("\n")}\n\nUse list_files com um filtro se nenhum destes servir.`
          : `O arquivo "${path}" nao existe no repositorio. Use list_files com um filtro para descobrir o caminho certo antes de tentar de novo.`;
      }
      if (file.content.length > AGENT_LIMITS.maxFileBytes) {
        const cut = file.content.slice(0, AGENT_LIMITS.maxFileBytes);
        emit({ type: "tool", name, detail: `${path} (cortado)` });
        return cut + "\n\n[arquivo cortado por tamanho]";
      }
      ws.fileCache.set(path, file.content);
      emit({ type: "tool", name, detail: path });
      return file.content;
    }

    case "search_code": {
      // Busca LOCAL nos arquivos do projeto. Antes isso batia no /search/code do
      // GitHub, que (1) da erro de CORS no navegador e (2) nao indexa repo recem
      // criado — entao sempre voltava vazio bem na hora de localizar um import que
      // falta. Agora lemos a arvore e procuramos o termo no conteudo de verdade.
      const termo = String(args.query || "").trim();
      if (!termo) return "Informe um termo para procurar.";
      const alvo = termo.toLowerCase();

      if (!ws.treeCache) ws.treeCache = await gh.getTree(owner, repo, branch);
      const candidatos = ws.treeCache.files
        .filter(f => !AGENT_LIMITS.ignorar.test(f.path) && !AGENT_LIMITS.gerado?.test(f.path));

      // Conteudo que ja temos em maos sai de graca (preparado + cache de leitura).
      const conteudoDe = async (path) => {
        if (ws.staged.has(path)) {
          const s = ws.staged.get(path);
          return s.delete ? null : s.content;
        }
        if (ws.fileCache.has(path)) return ws.fileCache.get(path);
        try {
          const file = await gh.readFile(owner, repo, branch, path);
          if (file.content.length <= AGENT_LIMITS.maxFileBytes) ws.fileCache.set(path, file.content);
          return file.content;
        } catch { return null; }
      };

      const achados = [];
      let lidos = 0;
      const MAX_LER = 80; // teto de arquivos buscados por chamada (projetos gerados sao pequenos)
      for (const f of candidatos) {
        // Casa pelo nome do arquivo tambem (ex.: procurar "Index" ou "radar-rings").
        const nome = f.path.split("/").pop().toLowerCase();
        if (nome.includes(alvo)) { achados.push({ path: f.path, linha: "(no nome do arquivo)" }); continue; }
        if (lidos >= MAX_LER) continue;
        const txt = await conteudoDe(f.path);
        lidos++;
        if (!txt) continue;
        const idx = txt.toLowerCase().indexOf(alvo);
        if (idx !== -1) {
          const ini = txt.lastIndexOf("\n", idx) + 1;
          let fim = txt.indexOf("\n", idx); if (fim === -1) fim = txt.length;
          achados.push({ path: f.path, linha: txt.slice(ini, fim).trim().slice(0, 160) });
        }
        if (achados.length >= 30) break;
      }

      emit({ type: "tool", name, detail: `"${termo}": ${achados.length} arquivos` });
      return achados.length
        ? achados.map(h => `${h.path}: ${h.linha}`).join("\n")
        : `Nenhum arquivo contem "${termo}". Se for um componente/icone, provavelmente falta o import — confira os imports do arquivo que usa o termo.`;
    }

    case "write_file": {
      if (typeof args.content !== "string") {
        return "Erro: informe path e content.";
      }
      let path;
      try { path = safeRepoPath(args.path); } catch (err) { return `Erro: ${err.message}`; }
      if (args.content.length > 2_000_000) {
        return "Erro: o arquivo preparado ultrapassa 2 MB. Divida a alteracao em arquivos menores.";
      }
      ws.staged.set(path, { content: args.content });
      emit({ type: "stage", path, action: "escrever", bytes: args.content.length });
      const aviso = checarReferencias(path, args.content);
      return `Preparado: ${path} (${args.content.length} caracteres). Ainda nao foi enviado ao GitHub.` +
        (aviso ? `\n\n${aviso}` : "");
    }

    case "delete_file": {
      let path;
      try { path = safeRepoPath(args.path); } catch (err) { return `Erro: ${err.message}`; }
      ws.staged.set(path, { delete: true });
      emit({ type: "stage", path, action: "remover" });
      return `Marcado para remocao: ${path}.`;
    }

    case "commit_changes": {
      if (!ws.staged.size) return "A area de preparacao esta vazia. Use write_file antes.";
      if (ws.settings?.dryRunFirst && !ws.approved) {
        emit({ type: "approval_needed", files: stagedSummary(ws), message: args.message });
        return "Aguardando a pessoa aprovar as alteracoes na interface. Encerre sua resposta explicando o que voce mudou e por que.";
      }
      const files = [...ws.staged.entries()].map(([path, v]) =>
        v.delete ? { path, delete: true } : { path, content: v.content, base64: Boolean(v.base64) }
      );

      // Rede de seguranca: grava a URL e a anon key REAIS do Supabase nos
      // arquivos antes de enviar, para os botoes funcionarem no deploy mesmo se
      // a IA deixou placeholder ou usou import.meta.env (que nao existe na Vercel).
      const sbCreds = ws.supabase;
      if (sbCreds?.url && sbCreds?.anonKey) {
        const u = sbCreds.url, k = sbCreds.anonKey;
        for (const f of files) {
          if (f.delete || f.base64 || !/\.(js|jsx|ts|tsx|html)$/i.test(f.path)) continue;
          if (!/createClient|supabase/i.test(f.content)) continue;
          f.content = f.content
            .replace(/import\.meta\.env\.VITE_SUPABASE_URL/g, `(import.meta.env.VITE_SUPABASE_URL || "${u}")`)
            .replace(/import\.meta\.env\.VITE_SUPABASE_ANON_KEY/g, `(import.meta.env.VITE_SUPABASE_ANON_KEY || "${k}")`)
            .replace(/["'](?:SUA_URL|YOUR_SUPABASE_URL|SUPABASE_URL|COLE_SUA_URL|https:\/\/[a-z0-9-]+\.supabase\.co)["']/gi, `"${u}"`)
            .replace(/["'](?:SUA_CHAVE|SUA_ANON_KEY|YOUR_SUPABASE_ANON_KEY|SUPABASE_ANON_KEY|ANON_KEY|COLE_SUA_ANON_KEY)["']/gi, `"${k}"`);
        }
      }

      const prefix = ws.settings?.commitPrefix ? ws.settings.commitPrefix + " " : "";
      const result = await gh.commitFiles({
        owner, repo, branch,
        message: prefix + args.message,
        files
      });
      ws.staged.clear();
      ws.treeCache = null;
      ws.fileCache.clear();
      ws.commits.push(result);
      emit({ type: "commit", ...result });
      return `Commit ${result.shortSha} enviado para ${branch} com ${files.length} arquivo(s). O Lovable vai sincronizar em instantes.`;
    }

    case "salvar_imagem": {
      const anexos = ws.imagensAnexadas || [];
      const i = Math.max(1, Math.round(Number(args.indice) || 1)) - 1;
      if (!anexos.length) return "A pessoa nao anexou nenhuma imagem nesta mensagem. Peca para ela anexar a foto no chat (botao de imagem) e tente de novo.";
      if (!anexos[i]) return `So ha ${anexos.length} imagem(ns) anexada(s). Escolha um indice entre 1 e ${anexos.length}.`;

      const dataUrl = anexos[i];
      const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return "Nao consegui ler essa imagem.";

      // extensao coerente com o tipo real da imagem
      const tipo = m[1];
      const extPorTipo = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/svg+xml": ".svg" };
      const extCerta = extPorTipo[tipo] || ".jpg";
      let caminho;
      try {
        caminho = safeRepoPath(args.path || "");
      } catch {
        caminho = "public/imagem" + extCerta;
      }
      if (!caminho) caminho = "public/imagem" + extCerta;
      if (!/\.[a-z0-9]{2,5}$/i.test(caminho)) caminho += extCerta;

      // vai para a area de preparacao como arquivo binario de verdade
      ws.staged.set(caminho, { content: m[2], base64: true });
      emit({ type: "imagem_salva", path: caminho });
      return `Imagem salva em "${caminho}". Use exatamente esse caminho no src da tag img (em projetos Vite, arquivos em public/ sao servidos na raiz: "public/foto.jpg" vira src="/foto.jpg"). Nao peca para a pessoa subir nada.`;
    }

    case "listar_tabelas": {
      const st = await sb.status();
      if (!st.connected || !st.projectRef) {
        return "O Supabase nao esta conectado. Peca a pessoa para conectar na linha 'supabase' do painel. Enquanto isso, nao invente conexao de banco no codigo.";
      }
      const tabelas = await sb.listTables();
      if (!tabelas.length) return "O banco esta vazio (schema public sem tabelas). Pode criar o que precisar.";
      // Descreve as colunas das tabelas, para o front sair com os nomes certos.
      const detalhes = [];
      for (const t of tabelas.slice(0, 12)) {
        const cols = await sb.describeTable(t);
        detalhes.push(`${t}(${cols.map(c => `${c.column_name} ${c.data_type}`).join(", ")})`);
      }
      return "Tabelas existentes: " + detalhes.join(" | ") + ". Reutilize essas; nao recrie.";
    }

    case "criar_tabela": {
      const st = await sb.status();
      if (!st.connected || !st.projectRef) {
        return "Nao da para criar: Supabase nao conectado. Peca a pessoa para conectar na linha 'supabase' do painel.";
      }
      const check = sb.checarSql(args.sql);
      if (!check.ok) return "SQL bloqueado por seguranca: " + check.motivo + " Reescreva usando apenas comandos de criacao.";

      emit({ type: "sql_running", explicacao: args.explicacao, sql: args.sql });
      try {
        await sb.runSql(args.sql);
        const tabelas = await sb.listTables();
        emit({ type: "sql_done", explicacao: args.explicacao, tables: tabelas });
        return `Aplicado no banco: ${args.explicacao}. Tabelas agora: ${tabelas.join(", ")}. Use a URL "${st.url}" e a anon key do projeto no front para ler/gravar nessas tabelas.`;
      } catch (err) {
        if (err.blocked) return "SQL bloqueado por seguranca: " + err.message;
        emit({ type: "sql_error", message: err.message });
        return "O Supabase recusou o comando: " + err.message + " Revise o SQL e tente novamente.";
      }
    }

    case "criar_edge_function": {
      const st = await sb.status();
      if (!st.connected || !st.projectRef) {
        return "Nao da para publicar: Supabase nao conectado.";
      }
      emit({ type: "fn_running", slug: args.slug, explicacao: args.explicacao });
      try {
        await sb.deployEdgeFunction(args.slug, args.code);
        emit({ type: "fn_done", slug: args.slug, explicacao: args.explicacao });
        return `Edge Function "${args.slug}" publicada: ${args.explicacao}. Ela responde em ${st.url.replace(".supabase.co", ".functions.supabase.co")}/${args.slug} (ou via supabase.functions.invoke("${args.slug}")).`;
      } catch (err) {
        emit({ type: "fn_error", message: err.message });
        return "Nao consegui publicar a funcao: " + err.message;
      }
    }

    default:
      return `Ferramenta desconhecida: ${name}`;
  }
}
