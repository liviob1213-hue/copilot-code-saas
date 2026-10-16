// ============================================================================
// verificador.js — confere o projeto ANTES de publicar
// ----------------------------------------------------------------------------
// Por que existe: o build so verifica se o codigo MONTA, nao se ele FUNCIONA.
// Um nome usado e nunca criado compila, publica "com sucesso" e so quebra
// quando a pessoa abre a pagina — o React derruba a tela inteira e sobra um
// retangulo preto. Foi assim que a pagina /agendar de um sistema de barbearia
// morreu com "ReferenceError: horarios is not defined", depois de passar por
// build e deploy sem um unico aviso.
//
// A checagem usa um ANALISADOR DE VERDADE (acorn + acorn-jsx), nao busca por
// texto. Procurar nomes com expressao regular erraria o tempo todo: acusaria
// `obj.horarios` (propriedade, nao variavel), chaves de objeto, campos de
// desestruturacao. Um alarme falso aqui seria pior do que o defeito — mandaria
// a IA "consertar" codigo que estava certo.
// ============================================================================

import { Parser } from "acorn";
import jsx from "acorn-jsx";

const ParserJSX = Parser.extend(jsx());

// Nomes que sempre existem e nunca precisam ser declarados no arquivo.
const GLOBAIS = new Set([
  // navegador
  "window", "document", "navigator", "location", "history", "localStorage", "sessionStorage",
  "fetch", "console", "alert", "confirm", "prompt", "URL", "URLSearchParams", "Blob", "File",
  "FormData", "Headers", "Request", "Response", "AbortController", "Image", "Audio", "Event",
  "CustomEvent", "IntersectionObserver", "ResizeObserver", "MutationObserver", "FileReader",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame",
  "cancelAnimationFrame", "matchMedia", "getComputedStyle", "scrollTo", "crypto", "structuredClone",
  "HTMLElement", "Node", "Element", "CSS", "performance", "queueMicrotask", "btoa", "atob",
  // linguagem
  "Object", "Array", "String", "Number", "Boolean", "Math", "JSON", "Date", "RegExp", "Error",
  "TypeError", "RangeError", "SyntaxError", "Promise", "Symbol", "Map", "Set", "WeakMap", "WeakSet",
  "Proxy", "Reflect", "BigInt", "Intl", "NaN", "Infinity", "undefined", "globalThis", "isNaN",
  "isFinite", "parseInt", "parseFloat", "encodeURIComponent", "decodeURIComponent", "encodeURI",
  "decodeURI", "Function", "arguments", "eval", "AggregateError", "ArrayBuffer", "Uint8Array",
  // ambiente
  "process", "import", "require", "module", "exports", "__dirname", "React"
]);

// Percorre a arvore chamando visita(no, pai).
function andar(no, visita, pai = null) {
  if (!no || typeof no.type !== "string") return;
  visita(no, pai);
  for (const chave of Object.keys(no)) {
    if (chave === "type" || chave === "start" || chave === "end" || chave === "loc") continue;
    const v = no[chave];
    if (Array.isArray(v)) { for (const f of v) if (f && typeof f.type === "string") andar(f, visita, no); }
    else if (v && typeof v.type === "string") andar(v, visita, no);
  }
}

// Todos os nomes que um padrao (parametro, desestruturacao) cria.
function nomesDoPadrao(no, destino) {
  if (!no) return;
  switch (no.type) {
    case "Identifier": destino.add(no.name); break;
    case "ObjectPattern": for (const p of no.properties) nomesDoPadrao(p.value || p.argument, destino); break;
    case "ArrayPattern": for (const el of no.elements) nomesDoPadrao(el, destino); break;
    case "AssignmentPattern": nomesDoPadrao(no.left, destino); break;
    case "RestElement": nomesDoPadrao(no.argument, destino); break;
    default: break;
  }
}

/**
 * Nomes usados e nunca criados num arquivo.
 *
 * De proposito NAO fazemos analise de escopo: juntamos tudo que o arquivo
 * declara em QUALQUER lugar e so acusamos o que nao aparece em lugar nenhum.
 * Isso deixa passar erros finos de escopo (uma variavel de outra funcao), mas
 * nunca inventa um problema — e e exatamente a classe que apaga a tela.
 */
export function nomesIndefinidos(codigo) {
  let arvore;
  try {
    // locations: true é o que dá a LINHA de cada nome — sem isso a mensagem
    // para a IA (e para a pessoa) não diz onde olhar.
    arvore = ParserJSX.parse(String(codigo), { ecmaVersion: "latest", sourceType: "module", allowReturnOutsideFunction: true, locations: true });
  } catch {
    return [];   // nao compila: o build acusa isso com clareza, nao e com a gente
  }

  const declarados = new Set();
  const usados = new Map();   // nome -> linha aproximada

  andar(arvore, (no, pai) => {
    switch (no.type) {
      case "ImportDefaultSpecifier": case "ImportNamespaceSpecifier": case "ImportSpecifier":
        declarados.add(no.local.name); break;
      case "VariableDeclarator": nomesDoPadrao(no.id, declarados); break;
      case "FunctionDeclaration": case "FunctionExpression": case "ArrowFunctionExpression": case "ClassDeclaration": case "ClassExpression":
        if (no.id) declarados.add(no.id.name);
        for (const p of (no.params || [])) nomesDoPadrao(p, declarados);
        break;
      case "CatchClause": nomesDoPadrao(no.param, declarados); break;
      case "LabeledStatement": declarados.add(no.label.name); break;
      case "Identifier": {
        if (!pai) break;
        // Nao sao USOS de variavel:
        if (pai.type === "MemberExpression" && pai.property === no && !pai.computed) break;   // obj.prop
        if (pai.type === "Property" && pai.key === no && !pai.computed) break;                // { chave: x }
        if (pai.type === "MethodDefinition" && pai.key === no && !pai.computed) break;
        if (pai.type === "PropertyDefinition" && pai.key === no && !pai.computed) break;
        if (pai.type === "ImportSpecifier" && pai.imported === no) break;
        if (pai.type === "ExportSpecifier") break;
        if (pai.type === "LabeledStatement" || pai.type === "BreakStatement" || pai.type === "ContinueStatement") break;
        if (/Function|ClassDeclaration|ClassExpression/.test(pai.type) && pai.id === no) break;
        if (pai.type === "VariableDeclarator" && pai.id === no) break;
        if (/Pattern$/.test(pai.type)) break;
        if (!usados.has(no.name)) usados.set(no.name, no.loc ? no.loc.start.line : 0);
        break;
      }
      case "JSXIdentifier": {
        // <Componente/> conta; <div/>, atributos e namespaces nao.
        if (!pai || pai.type !== "JSXOpeningElement" || pai.name !== no) break;
        if (!/^[A-Z]/.test(no.name)) break;
        if (!usados.has(no.name)) usados.set(no.name, no.loc ? no.loc.start.line : 0);
        break;
      }
      default: break;
    }
  });

  const faltando = [];
  for (const [nome, linha] of usados) {
    if (declarados.has(nome) || GLOBAIS.has(nome)) continue;
    faltando.push({ nome, linha });
  }
  return faltando;
}

/**
 * Varre o projeto inteiro. Devolve [{ arquivo, nome, linha }] — vazio = limpo.
 * Ignora os arquivos do kit (vem prontos e funcionando) e os que nao sao codigo.
 */
export function conferirProjeto(files, ignorar = new Set()) {
  const achados = [];
  for (const [caminho, conteudo] of Object.entries(files || {})) {
    if (!/^src\/.+\.(jsx|tsx|js)$/i.test(caminho)) continue;
    if (ignorar.has(caminho)) continue;
    for (const f of nomesIndefinidos(conteudo)) achados.push({ arquivo: caminho, ...f });
  }
  return achados;
}

/** Vira um pedido curto e direto para a IA consertar. */
export function pedidoDeConserto(achados) {
  const porArquivo = new Map();
  for (const a of achados) {
    if (!porArquivo.has(a.arquivo)) porArquivo.set(a.arquivo, []);
    porArquivo.get(a.arquivo).push(a.nome);
  }
  const lista = [...porArquivo.entries()]
    .map(([arq, nomes]) => `- ${arq}: ${[...new Set(nomes)].join(", ")}`).join("\n");
  return `O projeto NAO ABRE: estes nomes sao usados mas nunca foram criados nem importados. ` +
    `No navegador isso vira "X is not defined" e a tela fica PRETA.\n\n${lista}\n\n` +
    `Devolva APENAS os arquivos citados, completos e corrigidos, no formato ===FILE: caminho=== ... ===END===. ` +
    `Para cada nome: crie a variavel/funcao que falta (com valor inicial coerente com o uso), ou importe-a do arquivo certo, ` +
    `ou remova o trecho que depende dela. NAO reescreva outros arquivos.`;
}
