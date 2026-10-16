// ============================================================================
// previa.js — RODA o projeto gerado dentro do navegador, antes de publicar
// ----------------------------------------------------------------------------
// Por que existe: conferir o codigo (verificador.js) pega nome que nao existe,
// mas nao pega o que so quebra AO RODAR — uma funcao chamada com o argumento
// errado, um .map em algo que e undefined, um componente que retorna nada. O
// build tambem nao pega: ele so verifica se o codigo MONTA. O unico jeito de
// saber se a pagina abre e ABRIR A PAGINA.
//
// Aqui o projeto e montado em memoria e executado num iframe isolado, uma rota
// por vez. Os erros reais sao capturados e voltam para a IA com a frase exata
// que o navegador mostrou — e nao com um palpite.
//
// Decisoes que valem explicar:
//  - sucrase converte JSX -> JS em CommonJS. Com require() sincrono montamos um
//    registro proprio de modulos, sem bundler e sem servidor.
//  - As bibliotecas (react, react-router-dom, lucide-react...) vem do esm.sh,
//    carregadas UMA vez antes de rodar os modulos.
//  - A rota e controlada por MemoryRouter, nao por BrowserRouter: dentro de um
//    iframe srcdoc o history.pushState falha, e trocar de rota de verdade seria
//    impossivel. Por isso a previa monta a propria entrada em vez de usar o
//    main.jsx do projeto.
// ============================================================================

import { transform } from "sucrase";

const CDN = "https://esm.sh";

// Versoes fixas: iguais as do package.json do kit (starter-template.js). Pedir
// "@latest" aqui traria, um dia, uma versao incompativel e a previa acusaria um
// erro que nao existe no projeto publicado.
// UM React para todos. Sem o "?deps", cada biblioteca do CDN traz a propria
// copia do React e os hooks morrem com "Cannot read properties of null
// (reading 'useRef')" — um erro da PREVIA, que faria a IA sair consertando o
// que nao estava quebrado. Medido: com deps compartilhado, some.
const REACT = "react@18.3.1";
const REACT_DOM = "react-dom@18.3.1";
const JUNTO = `?deps=${REACT},${REACT_DOM}`;

const BIBLIOTECAS = {
  "react": REACT,
  "react-dom": REACT_DOM + `?deps=${REACT}`,
  "react-dom/client": `${REACT_DOM}/client?deps=${REACT}`,
  "react-router-dom": "react-router-dom@6.26.2" + JUNTO,
  "lucide-react": "lucide-react@0.454.0" + JUNTO,
  "framer-motion": "framer-motion@11.5.4" + JUNTO,
  "react-day-picker": "react-day-picker@8.10.1" + JUNTO,
  "clsx": "clsx@2.1.1",
  "tailwind-merge": "tailwind-merge@2.5.4",
  "class-variance-authority": "class-variance-authority@0.7.0",
  "date-fns": "date-fns@3.6.0",
  "gsap": "gsap@3.13.0",
  // O plugin de scroll e um modulo separado. Sem ele mapeado, o import caia
  // no pacote base, ScrollTrigger vinha undefined e o site avisava "Missing
  // plugin? gsap.registerPlugin()" — efeito de rolagem simplesmente sumia.
  "gsap/ScrollTrigger": "gsap@3.13.0/ScrollTrigger",
  "gsap/dist/ScrollTrigger": "gsap@3.13.0/dist/ScrollTrigger",
  "@supabase/supabase-js": "@supabase/supabase-js@2.45.0"
};

const EXTENSOES = ["", ".jsx", ".js", ".tsx", ".ts", "/index.jsx", "/index.js"];

/** "src/pages/Home.jsx" + "../components/X" -> "src/components/X.jsx" */
export function resolverCaminho(de, spec, arquivos) {
  if (!spec.startsWith(".") && !spec.startsWith("/") && !spec.startsWith("@/")) return null;
  let bruto;
  if (spec.startsWith("@/")) bruto = "src/" + spec.slice(2);
  else if (spec.startsWith("/")) bruto = spec.slice(1);
  else {
    const partes = de.split("/").slice(0, -1);
    for (const p of spec.split("/")) {
      if (p === "." || p === "") continue;
      if (p === "..") partes.pop(); else partes.push(p);
    }
    bruto = partes.join("/");
  }
  for (const ext of EXTENSOES) if (arquivos[bruto + ext] !== undefined) return bruto + ext;
  return bruto;   // nao achou: deixa o erro acontecer no require, com nome claro
}

/** Converte os arquivos de codigo em modulos prontos para o registro. */
function prepararModulos(files) {
  const mods = {};
  const avisos = [];
  for (const [caminho, conteudo] of Object.entries(files)) {
    if (!/^src\/.+\.(jsx|js|tsx|ts)$/i.test(caminho)) continue;
    try {
      const { code } = transform(String(conteudo), {
        transforms: ["jsx", "imports", ...(/\.tsx?$/i.test(caminho) ? ["typescript"] : [])],
        filePath: caminho
      });
      // import.meta.env e coisa do Vite; na previa vira um objeto simples, senao
      // qualquer projeto com Supabase quebraria aqui por motivo errado.
      mods[caminho] = code.replace(/import\.meta\.env/g, "__ENV__");
    } catch (e) {
      // Nao compila: o verificador/build ja acusam isso melhor do que nos.
      avisos.push({ arquivo: caminho, erro: String(e.message || e) });
    }
  }
  return { mods, avisos };
}

/** CSS do projeto, sem as diretivas que so existem no build. */
function juntarCss(files) {
  let css = "";
  for (const [caminho, conteudo] of Object.entries(files)) {
    if (!/^src\/.+\.css$/i.test(caminho)) continue;
    css += "\n" + String(conteudo)
      .replace(/@tailwind[^;]*;/g, "")
      .replace(/@import[^;]*;/g, "")
      .replace(/@apply[^;]*;/g, "");
  }
  return css;
}

/** Onde esta o App do projeto. */
export function acharApp(files) {
  return ["src/App.jsx", "src/App.tsx", "src/App.js"].find(p => files[p] !== undefined) || null;
}

/**
 * HTML completo da previa, pronto para o srcdoc de um iframe.
 * A pagina avisa o resultado para a janela de cima por postMessage.
 */
export function montarHtmlPrevia(files, rota = "/", { marca = "previa" } = {}) {
  const { mods, avisos } = prepararModulos(files);
  const app = acharApp(files);
  const dados = JSON.stringify({ mods, app, rota, marca, avisos, libs: BIBLIOTECAS, cdn: CDN })
    .replace(/</g, "\\u003c");   // nunca fechar o <script> por acidente

  return `<!doctype html>
<html><head><meta charset="utf-8">
<script src="https://cdn.tailwindcss.com/3.4.14"><\/script>
<style>${juntarCss(files).replace(/<\/style/gi, "<\\/style")}</style>
<style>body{margin:0}</style>
</head><body>
<div id="root"></div>
<script id="dados" type="application/json">${dados}<\/script>
<script type="module">
const D = JSON.parse(document.getElementById("dados").textContent);
const achados = [];
const contar = (tipo, msg, extra) => {
  const texto = String(msg || "").slice(0, 400);
  if (!texto) return;
  if (!achados.some(a => a.msg === texto)) achados.push({ tipo, msg: texto, ...extra });
};
addEventListener("error", e => contar("erro", e.message || (e.error && e.error.message)));
addEventListener("unhandledrejection", e => contar("promessa", (e.reason && e.reason.message) || e.reason));

// A PRÉVIA NÃO PODE SAIR DO SITE GERADO.
// Este documento é um srcdoc: um href="/" resolve contra o endereço da PÁGINA
// DE CIMA, então um clique levava o quadro para o próprio Copilot Code — a
// pessoa via o app dentro do preview e achava que tinha quebrado.
// O bloqueio roda na fase de bolha e respeita quem já tratou o clique: os
// <Link> do react-router chamam preventDefault antes, então continuam
// navegando normalmente entre as telas. Link externo abre em aba nova.
addEventListener("click", (e) => {
  if (e.defaultPrevented) return;              // o roteador já cuidou
  const a = e.target && e.target.closest && e.target.closest("a");
  if (!a) return;
  const href = a.getAttribute("href") || "";
  if (!href || href.startsWith("#")) return;   // âncora na mesma tela: deixa
  e.preventDefault();
  if (/^https?:\\/\\//i.test(href)) { try { window.open(href, "_blank", "noopener"); } catch {} }
}, false);
// Formulário sem onSubmit recarregaria o quadro pelo mesmo motivo.
addEventListener("submit", (e) => { if (!e.defaultPrevented) e.preventDefault(); }, false);
const avisar = (estado, extra = {}) => parent.postMessage({ marca: D.marca, rota: D.rota, estado, achados, ...extra }, "*");

try {
  // 1) bibliotecas externas, uma vez
  const ext = {};
  await Promise.all(Object.entries(D.libs).map(async ([nome, pacote]) => {
    try { ext[nome] = await import(D.cdn + "/" + pacote); } catch (e) { contar("biblioteca", nome + ": " + e.message); }
  }));
  const React = ext["react"] && (ext["react"].default || ext["react"]);
  if (!React) { avisar("sem-react"); throw new Error("react nao carregou");
  }
  window.React = React;   // o JSX compilado usa React.createElement

  // 2) registro de modulos do projeto
  const cache = {};
  const EXT = ["", ".jsx", ".js", ".tsx", ".ts", "/index.jsx", "/index.js"];
  const resolver = (de, spec) => {
    if (!spec.startsWith(".") && !spec.startsWith("/") && !spec.startsWith("@/")) return null;
    let p;
    if (spec.startsWith("@/")) p = "src/" + spec.slice(2);
    else if (spec.startsWith("/")) p = spec.slice(1);
    else {
      const partes = de.split("/").slice(0, -1);
      for (const s of spec.split("/")) { if (s === "." || s === "") continue; if (s === "..") partes.pop(); else partes.push(s); }
      p = partes.join("/");
    }
    for (const e of EXT) if (D.mods[p + e] !== undefined) return p + e;
    return p;
  };
  const pedir = (de, spec) => {
    if (/\\.(css|scss|png|jpe?g|svg|webp|gif)$/i.test(spec)) return {};   // estilo/imagem: nao e codigo
    const alvo = resolver(de, spec);
    if (alvo === null) {
      const lib = ext[spec] || ext[spec.replace(/\\/.*$/, "")];
      if (lib) return lib;
      contar("biblioteca", "o projeto usa \\"" + spec + "\\", que nao esta instalado");
      return {};
    }
    if (D.mods[alvo] === undefined) { contar("arquivo", "arquivo nao encontrado: " + alvo + " (pedido por " + de + ")"); return {}; }
    if (cache[alvo]) return cache[alvo].exports;
    const mod = { exports: {} };
    cache[alvo] = mod;
    const fn = new Function("module", "exports", "require", "__ENV__", "React", D.mods[alvo] + "\\n//# sourceURL=" + alvo);
    fn(mod, mod.exports, (s) => pedir(alvo, s), {}, React);
    return mod.exports;
  };

  // 3) monta App dentro de um MemoryRouter na rota pedida
  if (!D.app) { avisar("sem-app"); } else {
    const App = (() => { const m = pedir("src/main.jsx", "./" + D.app.replace(/^src\\//, "")); return m.default || m.App || m; })();
    const RR = ext["react-router-dom"];
    const createRoot = (ext["react-dom/client"] || {}).createRoot;
    class Cerca extends React.Component {
      constructor(p) { super(p); this.state = {}; }
      static getDerivedStateFromError(e) { return { caiu: true, msg: e && e.message }; }
      componentDidCatch(e) { contar("render", e && e.message); }
      render() { return this.state.caiu ? React.createElement("div", { id: "quebrou" }, "quebrou") : this.props.children; }
    }
    const arvore = React.createElement(Cerca, null,
      React.createElement(RR.MemoryRouter, { initialEntries: [D.rota] }, React.createElement(App)));
    createRoot(document.getElementById("root")).render(arvore);

    // 4) deu tempo de desenhar? a tela tem conteudo?
    setTimeout(() => {
      const raiz = document.getElementById("root");
      const vazia = !raiz || raiz.children.length === 0 || (raiz.innerText || "").trim() === "";
      avisar(vazia ? "vazia" : "ok", { elementos: raiz ? raiz.querySelectorAll("*").length : 0 });
    }, 1600);
  }
} catch (e) {
  contar("fatal", e && e.message);
  avisar("falhou");
}
<\/script>
</body></html>`;
}

export { BIBLIOTECAS };
