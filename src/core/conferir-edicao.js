// ============================================================================
// conferir-edicao.js — a mesma conferencia da criacao, agora na EDICAO
// ----------------------------------------------------------------------------
// Por que existe: a criacao ja conferia o projeto antes de publicar (o
// verificador acha nome usado e nunca criado; a previa abre cada tela num
// iframe e pega o erro REAL do navegador). A EDICAO nao tinha nada disso: o
// agente escrevia o arquivo e commitava direto. Resultado visto no uso real —
// a pessoa pediu "a pagina quebrou, conserta", e a edicao APAGOU a pagina: o
// preview terminou mostrando o aviso do kit ("A tela inicial nao foi gerada").
// Ninguem percebeu, porque ninguem estava olhando.
//
// Aqui o commit passa por tres portoes, do mais grave para o mais barato:
//   1. REGRESSAO: a edicao transformou uma tela de verdade no aviso do kit, ou
//      sumiu com o App. Isso nao vira pedido de conserto: o commit e CANCELADO.
//      Perder a alteracao e melhor do que perder o site.
//   2. NOMES QUE NAO EXISTEM: analise estatica (acorn), instantanea, so nos
//      arquivos que ESTA edicao escreveu — um defeito antigo num arquivo que
//      ninguem tocou nao pode travar o commit para sempre.
//   3. RODAR DE VERDADE: monta o projeto inteiro (repositorio + alteracoes) e
//      abre as telas num iframe. So aqui baixamos o projeto todo, porque so
//      aqui ele e necessario.
//
// Regra que vale para tudo: a conferencia NUNCA impede um commit por falha
// dela mesma (rede, iframe mudo, projeto ilegivel). Em duvida, deixa passar —
// igual a criacao.
// ============================================================================

import * as gh from "./github.js";
import { AGENT_LIMITS } from "./config.js";
import { STARTER_FILES } from "./starter-template.js";
import { extrairRotas } from "./site-generator.js";
import { conferirProjeto, pedidoDeConserto } from "./verificador.js";
import { testarProjeto, pedidoDeConsertoPorTeste } from "./teste-previa.js";

// Quantas vezes pedimos conserto antes de deixar passar. Duas, como na criacao:
// o objetivo e pegar o erro bobo, nao prender a pessoa num vai-e-vem com a IA.
const MAX_VOLTAS = 2;
// A edicao precisa ser rapida. Cada tela custa alguns segundos, entao abrimos
// so as mais provaveis (a inicial e as que a edicao mexeu) e com relogio curto.
const MAX_ROTAS = 3;
const PRAZO_TOTAL = 25_000;
const PRAZO_POR_ROTA = 10_000;
// Teto de arquivos lidos para montar o projeto na memoria.
const MAX_ARQUIVOS = 80;

const EH_CODIGO = /^src\/.+\.(jsx|tsx|js|ts)$/i;
const EH_APP = /^src\/App\.(jsx|tsx|js|ts)$/i;

// Frases que SO aparecem quando uma tela virou aviso automatico: o placeholder
// do kit (montarAppJsx) e o stub de pagina (garantirImportsLocais).
const AVISOS_DO_KIT = [
  "A tela inicial nao foi gerada",
  "A tela inicial não foi gerada",
  "Em construcao.",
  "Em construção."
];

// Conservador de proposito: uma pagina de verdade pode escrever "Em construção"
// em algum lugar. So contamos como aviso se o arquivo INTEIRO for pequeno —
// os placeholders tem pouquissimas linhas.
function ehTelaDeAviso(conteudo) {
  const txt = String(conteudo ?? "");
  if (!txt || txt.length > 900) return false;
  return AVISOS_DO_KIT.some(frase => txt.includes(frase));
}

/**
 * Telas que ANTES tinham conteudo de verdade e DEPOIS viraram aviso do kit.
 * Arquivo que ja era aviso antes da edicao nao conta: o estrago nao e desta vez.
 */
export function telasQueViraramAviso(antes, depois) {
  const perdidas = [];
  for (const [caminho, conteudo] of Object.entries(depois || {})) {
    if (!EH_CODIGO.test(caminho)) continue;
    if (!ehTelaDeAviso(conteudo)) continue;
    const velho = antes?.[caminho];
    if (velho === undefined || ehTelaDeAviso(velho)) continue;
    perdidas.push(caminho);
  }
  return perdidas;
}

/** Aplica no conjunto de arquivos o que a edicao quer gravar. */
export function aplicarEdicao(atual, files) {
  const out = { ...(atual || {}) };
  for (const f of files || []) {
    if (f.delete) { delete out[f.path]; continue; }
    if (f.base64) continue;   // imagem salva no repo: nao e codigo
    out[f.path] = f.content;
  }
  return out;
}

/**
 * Como os arquivos editados estao HOJE no projeto. Quase sempre sai de graca:
 * o agente leu o arquivo antes de reescreve-lo, entao ele ja esta no fileCache.
 */
async function lerVersaoAtual(ws, caminhos) {
  const { owner, name: repo, branch } = ws.repo;
  const antes = {};
  for (const caminho of caminhos) {
    if (ws.fileCache.has(caminho)) { antes[caminho] = ws.fileCache.get(caminho); continue; }
    try {
      const r = await gh.readFile(owner, repo, branch, caminho);
      ws.fileCache.set(caminho, r.content);
      antes[caminho] = r.content;
    } catch { /* arquivo novo (ou ilegivel): nao ha "antes" para comparar */ }
  }
  return antes;
}

/**
 * O projeto atual inteiro, em memoria, para a previa conseguir rodar.
 * Reaproveita tudo que o agente ja leu (ws.fileCache) e guarda o resultado em
 * ws.projetoCache, para a segunda volta nao baixar nada de novo.
 */
export async function lerProjetoAtual(ws) {
  if (ws.projetoCache) return ws.projetoCache;
  const { owner, name: repo, branch } = ws.repo;
  if (!ws.treeCache) ws.treeCache = await gh.getTree(owner, repo, branch);

  const alvo = ws.treeCache.files.filter(f =>
    /^(src\/|index\.html$|package\.json$)/.test(f.path) &&
    !AGENT_LIMITS.ignorar.test(f.path) &&
    !AGENT_LIMITS.gerado.test(f.path) &&
    (f.size === undefined || f.size < AGENT_LIMITS.maxFileBytes)
  ).slice(0, MAX_ARQUIVOS);

  const files = {};
  const pendentes = [];
  for (const f of alvo) {
    if (ws.fileCache.has(f.path)) files[f.path] = ws.fileCache.get(f.path);
    else pendentes.push(f.path);
  }

  let i = 0;
  const ler = async () => {
    while (i < pendentes.length) {
      const caminho = pendentes[i++];
      try {
        const r = await gh.readFile(owner, repo, branch, caminho);
        files[caminho] = r.content;
        ws.fileCache.set(caminho, r.content);
      } catch { /* pula arquivo ilegivel: a previa segue sem ele */ }
    }
  };
  await Promise.all([ler(), ler(), ler()]);

  ws.projetoCache = files;
  return files;
}

/**
 * Em que ordem abrir as telas: a inicial primeiro (e a que todo mundo ve), e
 * depois as que esta edicao mexeu. Com teto de 3 rotas, essa ordem e o que
 * decide se o teste olha para o lugar certo.
 */
export function rotasParaTestar(appJsx, editados) {
  const todas = extrairRotas(appJsx);
  const mexidos = new Set((editados || []).map(p =>
    (p.split("/").pop() || "").replace(/\.[jt]sx?$/i, "").toLowerCase()
  ));

  const componenteDaRota = new Map();
  for (const m of String(appJsx || "").matchAll(
    /<Route\s[^>]*?path\s*=\s*["'`]([^"'`]+)["'`][^>]*?element\s*=\s*\{\s*<\s*([A-Za-z0-9_$]+)/g
  )) {
    let p = m[1].trim();
    if (!p.startsWith("/")) p = "/" + p;
    componenteDaRota.set(p.replace(/\/+$/, "") || "/", m[2].toLowerCase());
  }

  const peso = (rota) => rota === "/" ? 0 : (mexidos.has(componenteDaRota.get(rota)) ? 1 : 2);
  return [...todas].sort((a, b) => peso(a) - peso(b));
}

/**
 * O portao antes do commit.
 *
 * Devolve { acao, mensagem }:
 *   - "seguir"   → pode commitar.
 *   - "corrigir" → devolve a mensagem ao agente; ele conserta e commita depois.
 *   - "bloquear" → NAO commite. A alteracao apagaria o site.
 */
export async function conferirAntesDoCommit(ws, files, emit = () => {}) {
  try {
    const doKit = new Set(Object.keys(STARTER_FILES));
    const editados = (files || []).filter(f => !f.delete && !f.base64 && EH_CODIGO.test(f.path));
    const apagados = (files || []).filter(f => f.delete && EH_CODIGO.test(f.path));
    if (!editados.length && !apagados.length) return { acao: "seguir" };

    const novos = {};
    for (const f of editados) novos[f.path] = f.content;

    // ---- 1) A edicao apagou a tela? ---------------------------------------
    const antes = await lerVersaoAtual(ws, [
      ...editados.map(f => f.path),
      ...apagados.map(f => f.path)
    ]);
    const perdidas = telasQueViraramAviso(antes, novos);
    const appSumiu = apagados.some(f => EH_APP.test(f.path)) ||
      (Object.keys(antes).some(p => EH_APP.test(p)) && editados.some(f => EH_APP.test(f.path) && !String(f.content || "").trim()));

    if (perdidas.length || appSumiu) {
      ws.bloqueios = (ws.bloqueios || 0) + 1;
      // Tira do caminho o conteudo que destruiria a tela: assim o read_file
      // volta a mostrar o arquivo REAL do projeto e o agente consegue se achar.
      for (const caminho of perdidas) ws.staged.delete(caminho);
      for (const f of apagados) if (EH_APP.test(f.path)) ws.staged.delete(f.path);

      const quais = (perdidas.length ? perdidas : ["src/App.jsx"]).join(", ");
      emit({
        type: "notice",
        text: `Essa alteracao ia apagar o conteudo da tela do seu site (${quais}) e deixar so um aviso em branco no lugar. ` +
              `Nao enviei nada: o seu projeto continua como estava.`
      });

      if (ws.bloqueios >= 2) {
        return {
          acao: "bloquear",
          mensagem: `COMMIT CANCELADO de novo: ${quais} continuaria sem conteudo. PARE de tentar. ` +
            `Nao chame commit_changes outra vez. Responda a pessoa explicando, em portugues simples, que voce nao conseguiu fazer ` +
            `essa alteracao sem apagar a tela, que o projeto dela continua igual ao que estava, e pergunte o que ela quer na tela.`
        };
      }
      return {
        acao: "bloquear",
        mensagem: `COMMIT CANCELADO: a sua alteracao transformaria ${quais} numa tela de aviso vazia — o site perderia a pagina. ` +
          `Descartei essa alteracao; o arquivo continua como estava no projeto. ` +
          `Use read_file em ${quais} para ver o conteudo REAL que esta la, e reescreva o arquivo PRESERVANDO todo esse conteudo, ` +
          `mudando so o que a pessoa pediu. Nunca substitua uma tela por um texto de "em construcao" ou "nao foi gerada".`
      };
    }

    // ---- 2) Nomes usados e nunca criados ----------------------------------
    const achados = conferirProjeto(novos, doKit);
    if (achados.length) {
      if ((ws.voltasConferencia || 0) >= MAX_VOLTAS) {
        emit({ type: "notice", text: `Ainda ficaram nomes sem existir no codigo (${[...new Set(achados.map(a => a.nome))].join(", ")}). Enviei assim mesmo — se a tela abrir preta, me peca o conserto.` });
      } else {
        ws.voltasConferencia = (ws.voltasConferencia || 0) + 1;
        const resumo = [...new Set(achados.map(a => a.nome))].join(", ");
        emit({ type: "notice", text: `Antes de enviar, conferi o codigo: ${resumo} aparece no arquivo mas nunca foi criado. Pedi o conserto.` });
        return {
          acao: "corrigir",
          mensagem: `AINDA NAO COMMITEI. ${pedidoDeConserto(achados)}\n\n` +
            `IMPORTANTE: nao responda com blocos ===FILE===. Use write_file para cada arquivo corrigido (conteudo completo) ` +
            `e depois chame commit_changes de novo.`
        };
      }
    }

    // ---- 3) Rodar o projeto de verdade ------------------------------------
    if (typeof document === "undefined") return { acao: "seguir" };   // fora do navegador nao da
    if ((ws.voltasConferencia || 0) >= MAX_VOLTAS) return { acao: "seguir" };

    const atual = await lerProjetoAtual(ws);
    const resultante = aplicarEdicao(atual, files);
    const app = ["src/App.jsx", "src/App.tsx", "src/App.js"].find(p => resultante[p] !== undefined);
    if (!app) return { acao: "seguir" };   // sem App nao ha o que abrir

    const rotas = rotasParaTestar(resultante[app], editados.map(f => f.path)).slice(0, MAX_ROTAS);
    emit({ type: "status", text: "Abrindo o seu site pra ver se a alteracao funciona, antes de enviar…" });

    let r;
    try {
      r = await testarProjeto(resultante, emit, { rotas, prazoPorRota: PRAZO_POR_ROTA, prazoTotal: PRAZO_TOTAL });
    } catch {
      return { acao: "seguir" };   // a previa falhou: nao e motivo para travar a entrega
    }
    if (r.pulado || r.ok) return { acao: "seguir" };

    ws.voltasConferencia = (ws.voltasConferencia || 0) + 1;
    const quais = r.problemas.map(p => p.rota).join(", ");
    emit({ type: "notice", text: `Abri as telas antes de enviar e ${quais} nao funcionou. Pedi o conserto para a IA.` });
    return {
      acao: "corrigir",
      mensagem: `AINDA NAO COMMITEI. ${pedidoDeConsertoPorTeste(r.problemas, resultante)}\n\n` +
        `IMPORTANTE: nao responda com blocos ===FILE===. Use write_file para cada arquivo corrigido (conteudo completo) ` +
        `e depois chame commit_changes de novo.`
    };
  } catch {
    return { acao: "seguir" };   // a conferencia nunca pode impedir um commit por falha dela mesma
  }
}
