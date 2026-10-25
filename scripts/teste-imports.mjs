// ===========================================================================
// Teste de ehImportadoPorAlguem()
//   node scripts/teste-imports.mjs
//
// Esta funcao decide se uma correcao da IA e ACEITA ou JOGADA FORA, entao
// errar aqui e caro dos dois lados:
//
//   recusar demais -> volta o defeito que ela veio consertar: o projeto sai
//                     quebrado na primeira geracao porque o arquivo que
//                     faltava nunca e criado;
//   aceitar demais -> a IA inventa telas que ninguem pediu numa etapa que
//                     deveria so consertar.
// ===========================================================================

import { ehImportadoPorAlguem, importesQuebrados } from "../src/core/verificador.js";

const projeto = {
  "src/App.jsx":
    'import Home from "./pages/Home";\n' +
    'import { Cartao } from "./components/Cartao.jsx";\n' +
    'import Perfil from "./pages/Perfil";\n' +
    'import { algo } from "react";\n',
  "src/pages/Home.jsx":
    'import Botao from "../components/Botao";\n' +
    'export default function Home(){ return null }\n'
};

const casos = [
  // DEVE ACEITAR — alguem aponta para o arquivo
  ["src/pages/Perfil.jsx",      true,  "pagina importada no App mas nunca escrita"],
  ["src/components/Cartao.jsx", true,  "importado ja com a extensao"],
  ["src/components/Botao.jsx",  true,  "importado de subpasta, com ../"],
  ["src/pages/Home.jsx",        true,  "existe e e importado"],
  // DEVE RECUSAR — ninguem pediu
  ["src/pages/Precos.jsx",      false, "tela inventada"],
  ["src/components/Rodape.jsx", false, "componente inventado"],
  ["src/paginas/Home.jsx",      false, "caminho parecido, mas nao e o importado"],
  ["src/react.js",              false, "pacote npm nao e arquivo local"]
];

let falhas = 0;
for (const [caminho, esperado, porque] of casos) {
  const obtido = ehImportadoPorAlguem(projeto, caminho);
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? "ok    " : "FALHOU"}  ${caminho.padEnd(28)} ${porque}`);
}


// ===========================================================================
// importesQuebrados: o retrato do "criou quebrado"
//
// A IA escreve o App.jsx com as rotas, fecha os blocos direitinho e para antes
// de escrever as páginas que ela mesma importou. O projeto PARECE completo
// (tem tela, os blocos fecharam) e abre em branco. O gerador usa isto para
// pedir a continuação em vez de entregar assim.
// ===========================================================================
const casosQuebrados = [
  [{ "src/App.jsx": 'import H from "./pages/Home"; import S from "./pages/Sobre";',
     "src/pages/Home.jsx": "x" },
   ["src/pages/Sobre"], "página importada que nunca foi escrita"],
  [{ "src/App.jsx": 'import H from "./pages/Home"', "src/pages/Home.jsx": "x" },
   [], "projeto completo não acusa nada"],
  [{ "src/App.jsx": 'import B from "./ui"', "src/ui/index.jsx": "x" },
   [], "import de pasta resolve pelo index"],
  [{ "src/App.jsx": 'import "./theme.css"' },
   [], "css que falta não deixa a tela branca"],
  [{ "src/App.jsx": 'import React from "react"' },
   [], "pacote npm não é arquivo do projeto"]
];

for (const [files, esperado, porque] of casosQuebrados) {
  const r = importesQuebrados(files);
  const ok = JSON.stringify(r) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok    " : "FALHOU"}  ${porque.padEnd(44)} ${JSON.stringify(r)}`);
}
console.log("\n" + (falhas ? `>>> ${falhas} FALHA(S) <<<` : ">>> TUDO CERTO <<<") + "\n");
process.exit(falhas ? 1 : 0);
