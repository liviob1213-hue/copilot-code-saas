// ============================================================================
// teste-previa.js — abre o projeto rota por rota e junta os erros REAIS
// ----------------------------------------------------------------------------
// Roda a previa (previa.js) num iframe escondido, uma rota de cada vez, e ouve
// o que ela avisa: erro de JavaScript, falha ao desenhar, ou tela que carregou
// mas ficou vazia (o "retangulo preto" que a pessoa ve).
//
// Cada rota roda num iframe NOVO: assim um erro numa tela nao contamina a
// proxima, e o estado (useState, localStorage do projeto) comeca limpo.
// ============================================================================

import { montarHtmlPrevia, acharApp } from "./previa.js";
import { extrairRotas } from "./site-generator.js";

const PRAZO_POR_ROTA = 15000;

/** Abre UMA rota e devolve o que aconteceu. */
function abrirRota(files, rota, prazo = PRAZO_POR_ROTA) {
  return new Promise((resolve) => {
    const marca = "previa-" + Math.random().toString(36).slice(2);
    const iframe = document.createElement("iframe");
    // Isolado de proposito: allow-scripts para o projeto rodar, allow-same-origin
    // para o postMessage e o esm.sh funcionarem. Sem allow-top-navigation nem
    // allow-popups — um projeto gerado nao vai levar a pessoa para outro lugar.
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
    iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:1200px;height:800px;border:0;opacity:0;pointer-events:none";

    let encerrado = false;
    const encerrar = (resultado) => {
      if (encerrado) return;
      encerrado = true;
      clearTimeout(relogio);
      removeEventListener("message", ouvir);
      iframe.remove();
      resolve(resultado);
    };
    const ouvir = (ev) => {
      if (!ev.data || ev.data.marca !== marca) return;
      encerrar({ rota, estado: ev.data.estado, achados: ev.data.achados || [], elementos: ev.data.elementos || 0 });
    };
    const relogio = setTimeout(() => {
      // Sem resposta no prazo: quase sempre e biblioteca que nao baixou. Nao
      // acusamos o projeto por isso — seria culpar o codigo por falha de rede.
      encerrar({ rota, estado: "sem-resposta", achados: [], elementos: 0 });
    }, prazo);

    addEventListener("message", ouvir);
    iframe.srcdoc = montarHtmlPrevia(files, rota, { marca });
    document.body.appendChild(iframe);
  });
}

/**
 * Testa o projeto inteiro. Devolve:
 *   { rotas: [{rota, estado, achados}], problemas: [...], ok: boolean }
 * "problemas" ja vem pronto para virar texto para a IA.
 *
 * As opcoes existem para a EDICAO, que nao pode demorar como a criacao: ela
 * manda as rotas que quer (as mais provaveis primeiro) e aperta os relogios.
 * Sem opcao nenhuma, o comportamento e o de sempre — todas as rotas, 15s cada.
 */
export async function testarProjeto(files, onEvent = () => {}, opcoes = {}) {
  if (typeof document === "undefined") return { rotas: [], problemas: [], ok: true, pulado: "sem navegador" };
  const app = acharApp(files);
  if (!app) return { rotas: [], problemas: [], ok: true, pulado: "sem App" };

  const { prazoPorRota = PRAZO_POR_ROTA, prazoTotal = Infinity } = opcoes;
  const rotas = opcoes.rotas?.length ? opcoes.rotas : extrairRotas(files[app]);
  const comecou = Date.now();
  const resultados = [];
  for (const rota of rotas) {
    // Estourou o tempo: entregamos o que ja sabemos em vez de prender a pessoa.
    if (resultados.length && Date.now() - comecou > prazoTotal) break;
    onEvent({ type: "status", text: `Abrindo a tela ${rota} para ver se funciona…` });
    resultados.push(await abrirRota(files, rota, prazoPorRota));
  }

  const problemas = [];
  for (const r of resultados) {
    const erros = r.achados.filter(a => a.tipo !== "biblioteca");
    if (erros.length) {
      problemas.push({ rota: r.rota, tipo: "erro", mensagens: [...new Set(erros.map(e => e.msg))] });
    } else if (r.estado === "vazia") {
      problemas.push({ rota: r.rota, tipo: "vazia", mensagens: ["a tela carregou sem erro, mas nao mostrou nada"] });
    } else if (r.estado === "falhou" || r.estado === "sem-react") {
      problemas.push({ rota: r.rota, tipo: "erro", mensagens: ["a tela nao conseguiu nem comecar a desenhar"] });
    }
    // "sem-resposta" fica de fora: e quase sempre rede, nao o projeto.
  }
  return { rotas: resultados, problemas, ok: problemas.length === 0 };
}

/** Vira um pedido direto para a IA, com a frase que o navegador mostrou. */
export function pedidoDeConsertoPorTeste(problemas, files) {
  const app = acharApp(files);
  const linhas = problemas.map(p => {
    const quais = p.mensagens.map(m => `    ${m}`).join("\n");
    return p.tipo === "vazia"
      ? `- Tela "${p.rota}": abriu em BRANCO (sem erro no console).\n${quais}`
      : `- Tela "${p.rota}": quebrou com\n${quais}`;
  }).join("\n");

  return `Rodei o projeto no navegador e abri cada tela. Estas NAO funcionam:\n\n${linhas}\n\n` +
    `Essas mensagens sao do navegador de verdade, nao suposicao. Conserte a CAUSA de cada uma:\n` +
    `- "X is not defined": crie a variavel/funcao que falta ou importe-a do arquivo certo.\n` +
    `- "Cannot read properties of undefined": garanta um valor inicial (ex.: useState([])) e proteja o acesso.\n` +
    `- Tela em branco: o componente da rota precisa RETORNAR conteudo de verdade; confira em ${app || "src/App.jsx"} se a rota aponta para a pagina certa.\n\n` +
    `Devolva APENAS os arquivos que precisam mudar, completos, no formato ===FILE: caminho=== ... ===END===. NAO reescreva o projeto inteiro.`;
}
