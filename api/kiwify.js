// ============================================================================
// /api/kiwify — a Kiwify avisa aqui quando alguem paga, cancela ou pede
// reembolso, e este arquivo atualiza o plano da pessoa.
// ----------------------------------------------------------------------------
// COLE ESTE ENDERECO NA KIWIFY:
//   https://copilot-code-saas.vercel.app/api/kiwify
//
// VARIAVEIS (na Vercel, SEM o prefixo VITE_):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   KIWIFY_WEBHOOK_SECRET      <- o token que a Kiwify mostra ao criar o webhook
//   KIWIFY_PRODUTO_MENSAL      <- (opcional) id do produto mensal
//   KIWIFY_PRODUTO_ANUAL       <- (opcional) id do produto anual
//
// ----------------------------------------------------------------------------
// A PEGADINHA QUE DERRUBOU ISSO NA PRIMEIRA TENTATIVA:
//
// A Vercel, por padrao, le o corpo do pedido e ja entrega convertido em objeto.
// So que a assinatura da Kiwify e calculada sobre os BYTES CRUS que ela enviou.
// Se a gente converter e depois re-serializar, qualquer diferenca de espaco ou
// de ordem de campo muda o resultado — e a conferencia falha, mesmo a Kiwify
// tendo mandado tudo certo.
//
// O `export const config` abaixo desliga essa conversao. E a linha mais
// importante do arquivo: sem ela, o corpo chega vazio aqui e NENHUM pagamento
// e aceito.
// ----------------------------------------------------------------------------
// POR QUE CONFERIR A ASSINATURA: sem isso, qualquer pessoa na internet pode
// chamar este endereco dizendo "fulano pagou" e sair distribuindo plano anual
// de graca.
// ============================================================================

import crypto from "node:crypto";
import { iguaisEmTempoConstante, definirPlanoPorEmail, json } from "./_lib.js";

export const config = { api: { bodyParser: false } };

// Situacoes em que a pessoa TEM acesso.
const LIBERA = new Set([
  "paid", "approved", "completed", "aprovado", "pago",
  "order_approved", "subscription_renewed", "renewed", "active"
]);

// Situacoes em que o acesso CAI.
const CORTA = new Set([
  "refunded", "chargedback", "chargeback", "canceled", "cancelled",
  "subscription_canceled", "subscription_late", "reembolsado", "cancelado",
  "order_refunded", "subscription_expired", "expired"
]);

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { erro: "use POST" });

  // ---- 1. os bytes crus, exatamente como a Kiwify mandou -------------------
  let cru = "";
  try {
    const pedacos = [];
    for await (const p of req) pedacos.push(Buffer.from(p));
    cru = Buffer.concat(pedacos).toString("utf8");
  } catch (e) {
    console.error("[kiwify] nao li o corpo:", e?.message);
  }

  if (!cru) {
    return json(res, 400, {
      erro: "corpo vazio",
      dica: "Se isso aparecer, a conversao automatica de corpo voltou a ligar."
    });
  }

  // ---- 2. a assinatura prova que veio da Kiwify ----------------------------
  const segredo = process.env.KIWIFY_WEBHOOK_SECRET;
  if (!segredo) {
    console.error("[kiwify] falta KIWIFY_WEBHOOK_SECRET");
    return json(res, 500, {
      erro: "webhook nao configurado",
      dica: "Cadastre KIWIFY_WEBHOOK_SECRET na Vercel e refaca o deploy."
    });
  }

  const recebida = String(
    (req.query && (req.query.signature || req.query.assinatura)) ||
    req.headers["x-kiwify-signature"] ||
    req.headers["x-signature"] ||
    ""
  ).trim().toLowerCase().replace(/^sha(1|256)=/, "");

  // A Kiwify usa sha1 sobre o corpo cru. Conferimos tambem sha256 e o corpo
  // re-serializado porque, se um dia ela mudar, o pagamento do cliente nao
  // pode parar de funcionar por causa disso. Aceitar varias formas nao
  // enfraquece nada: sem o segredo, nenhuma delas pode ser forjada.
  const variantes = [];
  const adicionar = (nome, texto, algoritmo) => {
    variantes.push({
      nome,
      valor: crypto.createHmac(algoritmo, segredo).update(texto, "utf8").digest("hex")
    });
  };

  adicionar("sha1-cru", cru, "sha1");
  adicionar("sha256-cru", cru, "sha256");
  try {
    const reserializado = JSON.stringify(JSON.parse(cru));
    if (reserializado !== cru) {
      adicionar("sha1-reserializado", reserializado, "sha1");
      adicionar("sha256-reserializado", reserializado, "sha256");
    }
  } catch { /* corpo nao e JSON: so as variantes cruas valem */ }

  const casou = recebida && variantes.find(v => iguaisEmTempoConstante(recebida, v.valor));

  if (!casou) {
    // O diagnostico abaixo aparece na tela da Kiwify, na lista de envios do
    // webhook. NUNCA devolvemos a assinatura esperada: isso ensinaria qualquer
    // um a forjar. So tamanhos e nomes, que nao servem pra ataque nenhum.
    console.warn("[kiwify] assinatura invalida. recebida:", recebida.slice(0, 8) + "…");
    return json(res, 401, {
      erro: "assinatura invalida",
      recebeu_assinatura: Boolean(recebida),
      tamanho_da_assinatura: recebida.length,
      tamanho_do_corpo: cru.length,
      formas_testadas: variantes.map(v => v.nome),
      dica: recebida
        ? "A assinatura chegou mas nao bateu. Confira se o KIWIFY_WEBHOOK_SECRET na Vercel e exatamente o token que a Kiwify mostrou (sem espaco sobrando)."
        : "Nao veio assinatura nenhuma no pedido."
    });
  }

  // ---- 3. entender o aviso -------------------------------------------------
  let corpo;
  try {
    corpo = JSON.parse(cru);
  } catch {
    return json(res, 400, { erro: "corpo nao e JSON" });
  }

  const email = acharEmail(corpo);
  if (!email) {
    console.error("[kiwify] aviso sem e-mail. campos:", Object.keys(corpo || {}));
    return json(res, 200, {
      ok: true,
      ignorado: "nao achei o e-mail do comprador",
      campos_recebidos: Object.keys(corpo || {})
    });
  }

  const situacao = String(
    corpo.order_status || corpo.subscription_status || corpo.status ||
    corpo.webhook_event_type || corpo.event || ""
  ).toLowerCase();

  // ---- 4. aplicar ----------------------------------------------------------
  if (CORTA.has(situacao)) {
    const r = await definirPlanoPorEmail({ email, plano: "free", expiraEm: null, origem: "kiwify" });
    console.log("[kiwify] cortou acesso de", email, situacao, r);
    // Se a gravacao falhou, PRECISA responder erro. Respondendo 200 a Kiwify
    // entenderia "deu certo", nunca tentaria de novo, e quem pediu reembolso
    // ficaria com o acesso para sempre.
    if (!r.ok) return json(res, 500, { erro: "nao consegui cortar", motivo: r.motivo, email });
    return json(res, 200, { ok: true, acao: "cortou", email, situacao, ...r });
  }

  if (!LIBERA.has(situacao)) {
    // "waiting_payment", boleto gerado, pix pendente... nao mexe em nada.
    console.log("[kiwify] situacao ignorada:", situacao);
    return json(res, 200, { ok: true, ignorado: situacao || "(sem situacao)", email });
  }

  const plano = descobrirPlano(corpo);
  const expiraEm = calcularVencimento(plano);

  const r = await definirPlanoPorEmail({ email, plano, expiraEm, origem: "kiwify" });
  console.log("[kiwify] liberou", plano, "para", email, r);

  if (!r.ok) return json(res, 500, { erro: "nao consegui gravar", motivo: r.motivo, email });

  return json(res, 200, {
    ok: true,
    acao: "liberou",
    plano,
    email,
    onde: r.aplicado === "conta" ? "conta existente" : "guardado ate a pessoa se cadastrar",
    conferido_por: casou.nome
  });
}

/** O e-mail aparece em lugares diferentes conforme o tipo de aviso. */
function acharEmail(c) {
  return (
    c?.Customer?.email ||
    c?.customer?.email ||
    c?.Customer?.Email ||
    c?.buyer?.email ||
    c?.Buyer?.email ||
    c?.subscription?.customer?.email ||
    c?.Subscription?.customer?.email ||
    c?.customer_email ||
    c?.email ||
    ""
  );
}

/**
 * Mensal ou anual? Primeiro tenta pelo id do produto (o jeito exato). Se voce
 * nao tiver preenchido os ids, cai na frequencia da assinatura — que funciona,
 * mas e chute informado. Preencha os ids quando puder.
 */
function descobrirPlano(c) {
  const idProduto = String(
    c?.Product?.product_id || c?.Product?.id || c?.product?.id ||
    c?.product_id || ""
  ).trim();

  const mensal = String(process.env.KIWIFY_PRODUTO_MENSAL || "").trim();
  const anual  = String(process.env.KIWIFY_PRODUTO_ANUAL  || "").trim();

  if (idProduto && anual  && idProduto === anual)  return "anual";
  if (idProduto && mensal && idProduto === mensal) return "mensal";

  const freq = String(
    c?.subscription?.plan?.frequency || c?.subscription?.frequency ||
    c?.Subscription?.plan?.frequency || c?.plan?.frequency || ""
  ).toLowerCase();

  if (/year|anual|annual|12/.test(freq)) return "anual";
  if (/month|mensal|monthly/.test(freq)) return "mensal";

  // Nao deu pra saber: trata como mensal, que e o menor. Melhor dar de menos
  // e corrigir na mao do que dar um ano para quem comprou um mes.
  console.warn("[kiwify] nao identifiquei o plano, assumindo mensal. produto:", idProduto, "freq:", freq);
  return "mensal";
}

/**
 * Data de vencimento com 3 dias de folga. A folga existe porque a renovacao
 * nem sempre cai no minuto exato: sem ela, um cliente em dia veria o acesso
 * sumir por algumas horas e abriria chamado.
 */
function calcularVencimento(plano) {
  const dias = plano === "anual" ? 365 : 30;
  const d = new Date();
  d.setDate(d.getDate() + dias + 3);
  return d.toISOString();
}
