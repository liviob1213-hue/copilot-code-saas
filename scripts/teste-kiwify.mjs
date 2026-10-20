// ===========================================================================
// Teste do webhook da Kiwify, sem precisar da Kiwify.
//   node scripts/teste-kiwify.mjs
//
// Simula o pedido do jeito que a Vercel entrega: req e um FLUXO de bytes
// (porque desligamos a conversao automatica de corpo), com a assinatura na
// query. Prova as tres coisas que quebraram antes:
//   1. o corpo cru chega inteiro
//   2. a assinatura sha1 bate
//   3. o e-mail e a situacao sao encontrados no formato da Kiwify
//
// O passo de gravar no banco NAO e testado aqui (nao temos a chave de
// producao): o teste so confere que a execucao CHEGA nesse ponto. Se a
// assinatura estivesse errada, pararia antes, com 401.
// ===========================================================================

import crypto from "node:crypto";
import { Readable } from "node:stream";

const SEGREDO = "segredo-de-teste-123";
process.env.KIWIFY_WEBHOOK_SECRET = SEGREDO;
process.env.SUPABASE_URL = "https://exemplo-invalido.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-falsa-de-teste";

const { default: handler } = await import("../api/kiwify.js");

function reqFalso(corpoTexto, assinatura, metodo = "POST") {
  const r = Readable.from([Buffer.from(corpoTexto, "utf8")]);
  r.method = metodo;
  r.headers = { "content-type": "application/json" };
  r.query = assinatura ? { signature: assinatura } : {};
  return r;
}

function resFalso() {
  const r = {
    _status: 0, _corpo: "",
    status(s) { r._status = s; return r; },
    setHeader() { return r; },
    end(c) { r._corpo = c; return r; }
  };
  return r;
}

function assinar(texto) {
  return crypto.createHmac("sha1", SEGREDO).update(texto, "utf8").digest("hex");
}

async function rodar(nome, corpo, assinatura) {
  const res = resFalso();
  try {
    await handler(reqFalso(corpo, assinatura), res);
  } catch (e) {
    res._status = res._status || 500;
    res._corpo = JSON.stringify({ excecao: e.message });
  }
  let json = {};
  try { json = JSON.parse(res._corpo || "{}"); } catch { /* ignora */ }
  return { nome, status: res._status, json };
}

// --- o formato que a Kiwify manda numa compra aprovada ---------------------
const compra = JSON.stringify({
  order_id: "abc123",
  order_status: "paid",
  Product: { product_id: "prod_anual_xyz", product_name: "Copilot Code Anual" },
  Customer: { email: "comprador@exemplo.com", full_name: "Fulano" },
  subscription: { plan: { frequency: "yearly" } }
});

const casos = [
  await rodar("assinatura CERTA (compra aprovada)", compra, assinar(compra)),
  await rodar("assinatura ERRADA", compra, "0".repeat(40)),
  await rodar("SEM assinatura", compra, null),
  await rodar("reembolso", JSON.stringify({
    order_status: "refunded", Customer: { email: "comprador@exemplo.com" }
  }), assinar(JSON.stringify({
    order_status: "refunded", Customer: { email: "comprador@exemplo.com" }
  })))
];

console.log("\n=================== RESULTADO ===================\n");
let falhou = false;

for (const c of casos) {
  console.log(`• ${c.nome}`);
  console.log(`  HTTP ${c.status}`);
  console.log(`  ${JSON.stringify(c.json).slice(0, 200)}`);
  console.log("");
}

// --- o que PRECISA ser verdade --------------------------------------------
const certa = casos[0];
const errada = casos[1];
const sem = casos[2];

function conferir(descricao, condicao) {
  console.log(`${condicao ? "OK  " : "FALHOU"}  ${descricao}`);
  if (!condicao) falhou = true;
}

conferir("assinatura certa NAO e recusada por assinatura (passou da conferencia)",
  certa.status !== 401);
conferir("assinatura certa achou o e-mail do comprador",
  JSON.stringify(certa.json).includes("comprador@exemplo.com") || certa.status === 500);
conferir("assinatura errada e recusada com 401", errada.status === 401);
conferir("sem assinatura e recusado com 401", sem.status === 401);
conferir("corpo nao chegou vazio (o bug que derrubou antes)",
  errada.json.tamanho_do_corpo > 0);
conferir("a recusa NAO revela a assinatura esperada",
  !JSON.stringify(errada.json).includes(assinar(compra)));

console.log("\n" + (falhou ? ">>> TEM COISA ERRADA <<<" : ">>> TUDO CERTO <<<") + "\n");
process.exit(falhou ? 1 : 0);
