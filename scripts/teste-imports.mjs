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

import { ehImportadoPorAlguem } from "../src/core/verificador.js";

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

console.log("\n" + (falhas ? `>>> ${falhas} FALHA(S) <<<` : ">>> TUDO CERTO <<<") + "\n");
process.exit(falhas ? 1 : 0);
