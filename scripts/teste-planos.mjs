// ===========================================================================
// Teste dos planos
//   node scripts/teste-planos.mjs
//
// Esta e a logica que decide QUEM PODE USAR O QUE depois de pagar. Errar aqui
// nao da tela branca: da cliente bravo. Dos dois lados:
//
//   liberar de menos -> a pessoa paga R$ 34,97 pelo Claude, abre a ferramenta,
//                       o Claude esta trancado, e ela pede reembolso;
//   liberar demais   -> todo mundo compra o plano de R$ 24,97 e usa tudo.
//
// O caso mais perigoso e o dos clientes ANTIGOS: eles estao gravados no banco
// como 'mensal' e 'anual', nomes de antes dos tres niveis existirem. Se um dia
// alguem mexer aqui e esses nomes caírem no plano gratis, gente que pagou
// perde acesso sem ninguem perceber.
// ===========================================================================

import { readFileSync } from "node:fs";
import {
  PLANOS, planoDe, planoLibera, planoMaisBaratoCom, linkDoPlano, LINKS_KIWIFY
} from "../src/core/planos.js";

let falhas = 0;
const ok = (cond, oque) => {
  if (!cond) falhas++;
  console.log(`${cond ? "ok    " : "FALHOU"}  ${oque}`);
};

// ---------------------------------------------------------------------------
// 1. Quem libera o que
// ---------------------------------------------------------------------------
console.log("\n-- o que cada plano libera --");
const casos = [
  // plano,      provedor,     libera?, porque
  ["free",      "deepseek",    false, "gratis nao usa IA paga"],
  ["free",      "anthropic",   false, "gratis nao usa Claude"],

  ["basico",    "deepseek",    true,  "Basico foi comprado justamente por isso"],
  ["basico",    "anthropic",   false, "Claude nao esta no Basico"],
  ["basico",    "teamsoclo",   false, "o gateway do Claude tambem nao"],
  ["basico",    "xai",         false, "xAI nao esta no Basico"],

  ["pro",       "anthropic",   true,  "Claude direto"],
  ["pro",       "teamsoclo",   true,  "Claude pelo gateway conta como Claude"],
  ["pro",       "xai",         true,  "xAI Grok"],
  ["pro",       "deepseek",    false, "DeepSeek e do Basico, nao do Pro"],

  ["premium",   "deepseek",    true,  "Premium libera tudo"],
  ["premium",   "anthropic",   true,  "Premium libera tudo"],
  ["premium",   "xai",         true,  "Premium libera tudo"],
  ["premium",   "ia-que-nao-existe-ainda", true, "Premium libera ate o que vier depois"],

  // OS CLIENTES ANTIGOS — nao podem perder nada
  ["mensal",    "anthropic",   true,  "cliente antigo de R$ 47 continua com tudo"],
  ["anual",     "anthropic",   true,  "cliente anual continua com tudo"],
  ["anual",     "deepseek",    true,  "cliente anual continua com tudo"],
  ["ilimitado", "xai",         true,  "modo sem login libera tudo"]
];
for (const [plano, prov, esperado, porque] of casos) {
  const obtido = planoLibera(plano, prov);
  ok(obtido === esperado, `${plano.padEnd(10)} -> ${prov.padEnd(22)} ${porque}`);
}

// ---------------------------------------------------------------------------
// 2. Nome estranho no banco nunca pode virar "gratis"
// ---------------------------------------------------------------------------
console.log("\n-- nome desconhecido no banco --");
ok(planoDe("premiun").nivel > 0, "erro de digitacao num plano pago nao derruba para o gratis");
ok(planoDe("PREMIUM").id === "premium", "maiuscula nao muda o plano");
ok(planoDe("  pro  ").id === "pro", "espaco sobrando nao muda o plano");
ok(planoDe("").id === "free", "vazio e plano gratis");
ok(planoDe(null).id === "free", "nulo e plano gratis");
ok(planoDe("free").nivel === 0, "free e nivel zero");

// ---------------------------------------------------------------------------
// 3. O plano oferecido tem que ser o MAIS BARATO que serve
// ---------------------------------------------------------------------------
console.log("\n-- qual plano a ferramenta oferece --");
ok(planoMaisBaratoCom("deepseek").id === "basico", "quem quer DeepSeek ve o Basico, nao o Premium");
ok(planoMaisBaratoCom("anthropic").id === "pro", "quem quer Claude ve o Pro");
ok(planoMaisBaratoCom("teamsoclo").id === "pro", "quem quer o gateway do Claude ve o Pro");
ok(planoMaisBaratoCom("xai").id === "pro", "quem quer xAI ve o Pro");
ok(planoMaisBaratoCom("qualquer-outra").id === "premium", "IA nova cai no Premium ate alguem decidir o contrario");
// O anual nunca pode ser oferecido como se fosse mensal: R$ 297 na cara de
// quem clicou numa IA faria a pessoa fechar a tela.
ok(planoMaisBaratoCom("deepseek").ciclo === "mês", "o plano oferecido e sempre mensal");

// ---------------------------------------------------------------------------
// 4. Precos e links
// ---------------------------------------------------------------------------
console.log("\n-- precos e links --");
ok(PLANOS.basico.preco === "24,97", "Basico custa R$ 24,97");
ok(PLANOS.pro.preco === "34,97", "Pro custa R$ 34,97");
ok(PLANOS.premium.preco === "47", "Premium custa R$ 47");
ok(PLANOS.anual.preco === "297", "anual custa R$ 297");
ok(PLANOS.basico.nivel < PLANOS.pro.nivel && PLANOS.pro.nivel < PLANOS.premium.nivel,
   "os niveis sobem junto com o preco");
// Link vazio nao pode virar href quebrado: cai na pagina de planos.
ok(linkDoPlano("premium").startsWith("https://pay.kiwify"), "Premium aponta para a Kiwify");
ok(linkDoPlano("anual").startsWith("https://pay.kiwify"), "anual aponta para a Kiwify");
for (const id of ["basico", "pro"]) {
  const link = linkDoPlano(id);
  ok(Boolean(link), `${id}: o botao sempre tem para onde ir`);
  if (!LINKS_KIWIFY[id]) {
    console.log(`        aviso: o link da Kiwify do plano ${id} ainda nao foi colado`);
    console.log(`        (por enquanto o botao leva para ${link})`);
  }
}

// ---------------------------------------------------------------------------
// 4b. A pagina de vendas e a ferramenta cobram o MESMO preco pelo MESMO link
//
// Os dois arquivos tem a sua propria copia dos links e dos precos (um e HTML
// estatico, o outro e modulo do app). Copia sem conferencia vira, um dia,
// preco diferente em cada lugar — e a pessoa que vir R$ 34,97 na pagina e cair
// num checkout de R$ 47 nao volta.
// ---------------------------------------------------------------------------
console.log("\n-- pagina de vendas x ferramenta --");
const vendas = readFileSync(new URL("../public/vendas/index.html", import.meta.url), "utf8");

for (const p of [PLANOS.basico, PLANOS.pro, PLANOS.premium, PLANOS.anual]) {
  ok(vendas.includes(">" + p.preco + "<"), `a pagina mostra R$ ${p.preco} (${p.nome})`);
}

// Os links que a pagina ja tem na mao
for (const [id, link] of Object.entries(LINKS_KIWIFY)) {
  if (!link) continue;
  ok(vendas.includes(link), `a pagina usa o mesmo link do plano ${id}`);
}

// E os que ainda faltam: o valor colado la tem que ser o mesmo colado aqui.
const naPagina = {};
const bloco = vendas.match(/var LINKS_KIWIFY = \{([^}]*)\}/);
if (bloco) {
  for (const m of bloco[1].matchAll(/(\w+)\s*:\s*"([^"]*)"/g)) naPagina[m[1]] = m[2];
}
for (const id of ["basico", "pro"]) {
  ok(naPagina[id] === LINKS_KIWIFY[id],
     `o link do ${id} e o mesmo nos dois arquivos${LINKS_KIWIFY[id] ? "" : " (ainda vazio nos dois)"}`);
}

// ---------------------------------------------------------------------------
// 5. Todo plano pago cria app; o gratis nao
// ---------------------------------------------------------------------------
console.log("\n-- apps e SaaS --");
ok(PLANOS.free.podeApps === false, "plano gratis nao cria app");
for (const id of ["basico", "pro", "premium", "anual"]) {
  ok(PLANOS[id].podeApps === true, `quem paga o ${id} cria app`);
}

console.log("\n" + (falhas ? `>>> ${falhas} FALHA(S) <<<` : ">>> TUDO CERTO <<<") + "\n");
process.exit(falhas ? 1 : 0);
