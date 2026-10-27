// ===========================================================================
// Teste da troca manual de imagem
//   node scripts/teste-trocar-imagem.mjs
//
// Esta troca acontece SEM IA: a pessoa clica na foto da previa, escolhe outra,
// e o endereco e substituido no codigo. Como nao ha modelo nenhum no meio para
// "consertar" um erro, o que estiver errado aqui vai direto para o projeto
// dela. Dois perigos:
//
//   trocar de menos -> a pessoa ve a foto antiga e acha que o botao nao
//                      funciona (ou, pior, a tela diz que trocou e nao trocou);
//   trocar demais   -> um endereco curto bate em lugares que nao eram a foto
//                      clicada e o projeto quebra.
// ===========================================================================

import { trocarImagem, ondeApareceA, recusaDaFoto, LIMITE_FOTO_MB } from "../src/core/trocar-imagem.js";

let falhas = 0;
const ok = (cond, oque) => {
  if (!cond) falhas++;
  console.log(`${cond ? "ok    " : "FALHOU"}  ${oque}`);
};

const ANTIGA = "https://picsum.photos/seed/barbearia/1200/800";
const NOVA = "data:image/png;base64,AAAA";

const projeto = {
  "src/Hero.jsx": `export default function Hero(){\n  return <img src="${ANTIGA}" alt="capa" />;\n}`,
  "src/Sobre.jsx": `const fundo = { backgroundImage: "url(${ANTIGA})" };\nexport default function Sobre(){ return <div style={fundo} /> }`,
  "src/Precos.jsx": `export default function Precos(){ return <h1>Preços</h1> }`
};

console.log("\n-- achar antes de mexer --");
const onde = ondeApareceA(projeto, ANTIGA);
ok(onde.length === 2, "encontra os dois arquivos que usam a foto");
ok(onde.reduce((n, o) => n + o.vezes, 0) === 2, "conta duas aparicoes");
ok(ondeApareceA(projeto, "https://nao-existe/x.jpg").length === 0, "endereco que nao existe nao acha nada");

console.log("\n-- a troca --");
const r = trocarImagem(projeto, { de: ANTIGA, para: NOVA });
ok(r.trocas === 2, "troca nos dois lugares");
ok(r.files["src/Hero.jsx"].includes(NOVA), "o <img> aponta para a nova");
ok(!r.files["src/Hero.jsx"].includes(ANTIGA), "a antiga sumiu do <img>");
ok(r.files["src/Sobre.jsx"].includes(NOVA), "o background-image tambem trocou");
ok(r.files["src/Precos.jsx"] === projeto["src/Precos.jsx"], "arquivo sem a foto fica intacto");
// Alterar o objeto original faria "desfazer" virar impossivel.
ok(projeto["src/Hero.jsx"].includes(ANTIGA), "o projeto original nao e alterado");

console.log("\n-- quando NAO deve trocar --");
// trocas: 0 e o que faz a tela dizer "nao achei" em vez de fechar fingindo
// que deu certo. Se algum destes passar a devolver 1, o defeito volta.
ok(trocarImagem(projeto, { de: "https://outra/foto.jpg", para: NOVA }).trocas === 0, "endereco que nao existe: nenhuma troca");
ok(trocarImagem(projeto, { de: "", para: NOVA }).trocas === 0, "sem endereco antigo: nenhuma troca");
ok(trocarImagem(projeto, { de: ANTIGA, para: "" }).trocas === 0, "sem endereco novo: nenhuma troca");
ok(trocarImagem(projeto, { de: ANTIGA, para: ANTIGA }).trocas === 0, "trocar por ela mesma nao conta como troca");

console.log("\n-- caracteres especiais no endereco --");
// Um endereco com ? e . e lido como expressao regular se alguem esquecer de
// escapar: "a.jpg" casaria com "aXjpg" e o projeto sairia corrompido.
const comQuery = { "a.jsx": `<img src="https://x.com/f.jpg?w=10&h=5" />\n<img src="https://x.com/fXjpgYw=10&h=5" />` };
const r2 = trocarImagem(comQuery, { de: "https://x.com/f.jpg?w=10&h=5", para: "/nova.png" });
ok(r2.trocas === 1, "troca so o endereco exato, nao o parecido");
ok(r2.files["a.jsx"].includes("fXjpgYw=10"), "o endereco parecido continua intacto");

console.log("\n-- o que entra como foto --");
ok(recusaDaFoto(null) !== "", "sem arquivo, recusa");
ok(recusaDaFoto({ type: "application/pdf", size: 1000 }) !== "", "PDF e recusado");
ok(recusaDaFoto({ type: "image/png", size: 500 * 1024 }) === "", "PNG pequeno passa");
ok(recusaDaFoto({ type: "image/jpeg", size: (LIMITE_FOTO_MB + 1) * 1024 * 1024 }) !== "", "acima do limite e recusado");
// A recusa precisa DIZER o tamanho e o limite: "imagem invalida" nao ensina
// nada a quem nao e programador.
const recusa = recusaDaFoto({ type: "image/jpeg", size: 9 * 1024 * 1024 });
ok(/9[.,]0 MB/.test(recusa) && String(LIMITE_FOTO_MB) && recusa.includes(String(LIMITE_FOTO_MB)),
   "a recusa diz o tamanho da foto e o limite");

console.log("\n" + (falhas ? `>>> ${falhas} FALHA(S) <<<` : ">>> TUDO CERTO <<<") + "\n");
process.exit(falhas ? 1 : 0);
