// ===========================================================================
// Teste do calculo de gasto
//   node scripts/teste-gasto.mjs
//
// Este numero vai para a tela como dinheiro. Dois cuidados:
//   - arredondar para baixo faria um projeto de tres centavos virar "R$ 0,00",
//     e "de graca" e uma promessa diferente de "quase nada";
//   - a media por projeto so pode contar CRIACOES. Misturar os ajustes puxa a
//     media para baixo e responde errado a pergunta "quanto custa fazer um
//     site?", que e a unica razao de a media existir.
// ===========================================================================

import { emReais, tokensCurto, REAL_POR_DOLAR } from "../src/core/gasto.js";

let falhas = 0;
const ok = (cond, oque) => {
  if (!cond) falhas++;
  console.log(`${cond ? "ok    " : "FALHOU"}  ${oque}`);
};

console.log("\n-- dinheiro na tela --");
ok(emReais(0) === "R$ 0,00", "zero e zero");
ok(emReais(1) === "R$ 5,40", `um dolar vira R$ ${REAL_POR_DOLAR.toFixed(2)}`);
ok(emReais(0.031) === "R$ 0,17", "tres centavos de dolar viram dezessete de real");
// O caso que motivou a regra: 0,0002 dolar = 0,001 real.
ok(emReais(0.0002) === "menos de R$ 0,01", "valor menor que um centavo nao vira 'R$ 0,00'");
// 0,002 dolar ja passa de um centavo de real (x5,4 = R$ 0,0108), entao aqui o
// valor aparece normalmente. O limite entre um caso e outro e perto demais
// para ficar implicito.
ok(emReais(0.002) === "R$ 0,01", "logo acima de um centavo, mostra o valor");
ok(emReais(0.0018) === "menos de R$ 0,01", "logo abaixo, mostra o aviso");
ok(emReais(0.0001) !== "R$ 0,00", "nenhum gasto real e mostrado como gratis");
ok(emReais(null) === "R$ 0,00" && emReais(undefined) === "R$ 0,00", "nulo nao estoura");
ok(emReais(-1) === "R$ 0,00", "negativo (nao deveria existir) nao vira numero estranho");
ok(emReais(12.3456).includes(","), "usa virgula decimal, nao ponto");

console.log("\n-- tokens em formato curto --");
ok(tokensCurto(900) === "900", "abaixo de mil, mostra o numero");
ok(tokensCurto(21000) === "21 mil", "milhares");
ok(tokensCurto(142000) === "142 mil", "centenas de milhares");
ok(tokensCurto(1200000) === "1,2 mi", "milhoes com uma casa");
ok(tokensCurto(0) === "0", "zero");

// -------------------------------------------------------------------------
// A media. Reproduz a conta de resumoDeGastos() sobre uma lista conhecida,
// sem depender do armazenamento do navegador.
// -------------------------------------------------------------------------
console.log("\n-- media por projeto --");
const lista = [
  { acao: "criar",  usd: 0.10, tokens: 100 },
  { acao: "editar", usd: 0.01, tokens: 10 },
  { acao: "editar", usd: 0.01, tokens: 10 },
  { acao: "criar",  usd: 0.20, tokens: 200 }
];
const criacoes = lista.filter(g => g.acao === "criar");
const soma = (arr, c) => arr.reduce((n, g) => n + Number(g[c] || 0), 0);
const media = criacoes.length ? soma(criacoes, "usd") / criacoes.length : 0;

ok(criacoes.length === 2, "conta duas criacoes");
ok(Math.abs(media - 0.15) < 1e-9, "a media e 0,15 — so das criacoes");
// Se alguem trocar o filtro e passar a contar tudo, a media cairia para 0,08.
ok(Math.abs(media - soma(lista, "usd") / lista.length) > 1e-9, "a media NAO inclui os ajustes");
ok(Math.abs(soma(lista, "usd") - 0.32) < 1e-9, "o total, esse sim, inclui tudo");
ok(((l) => (l.filter(g => g.acao === "criar").length ? 1 : 0))([]) === 0, "lista vazia nao divide por zero");

console.log("\n" + (falhas ? `>>> ${falhas} FALHA(S) <<<` : ">>> TUDO CERTO <<<") + "\n");
process.exit(falhas ? 1 : 0);
