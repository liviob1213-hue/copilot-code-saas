// ============================================================================
// /api/conta — "o que o banco sabe sobre este cliente?"
// ----------------------------------------------------------------------------
// E o botao "Conferir" da pagina /acesso-anual. Voce digita o e-mail do cliente
// e este endereco responde, em portugues, o que esta gravado: se ele tem conta,
// qual plano, se o plano vale, QUAIS IAs ele libera e se existe um pagamento da
// Kiwify preso na lista de espera.
//
// E ELE CONSERTA NA HORA: se houver pagamento guardado para uma conta que ja
// existe, o pagamento e aplicado antes de responder. Era exatamente o caso que
// deixou um cliente do plano Basico ouvindo "assine o plano" depois de pagar.
//
// SO VOCE PODE USAR: exige token de quem esta logado e e-mail em ADMIN_EMAILS.
//
// Por que existe: sem isto, descobrir por que um cliente pagante aparece como
// gratis era adivinhacao (webhook nao chegou? e-mail diferente? plano vencido?
// produto nao cadastrado?). Todos falham igual na tela e precisam de consertos
// diferentes.
// ============================================================================

import { usuarioDoToken, ehAdmin, json, normalizarEmail, supabaseAdmin } from "./_lib.js";
import { planoDe, planosCom } from "../src/core/planos.js";
import { PROVIDER_CATALOG } from "../src/core/config.js";

/** O plano pago desta pessoa ainda vale? (mesma regra do banco) */
function pagoVale(plano, expiraEm) {
  if (!plano || plano === "free") return false;
  if (!expiraEm) return true;
  return new Date(expiraEm).getTime() > Date.now();
}

/** As IAs PAGAS que este plano libera, pelo nome que aparece na tela. */
function iasLiberadas(nomeDoPlano) {
  const p = planoDe(nomeDoPlano);
  const pagas = PROVIDER_CATALOG.filter(c => c.tier === "paid");
  const libera = p.pagas === "*"
    ? pagas
    : pagas.filter(c => p.pagas.includes(c.id));
  return libera.map(c => c.label || c.id);
}

export default async function handler(req, res) {
  // ---- quem esta chamando? -------------------------------------------------
  const usuario = await usuarioDoToken(req);
  if (!usuario) return json(res, 401, { erro: "Faça login para usar esta página." });
  if (!ehAdmin(usuario.email)) {
    console.warn("[conta] tentativa de", usuario.email);
    return json(res, 403, { erro: "Sua conta não tem permissão para ver isso." });
  }

  // ---- qual e-mail? --------------------------------------------------------
  let corpo = req.body;
  if (typeof corpo === "string") {
    try { corpo = JSON.parse(corpo); } catch { corpo = {}; }
  }
  const email = String(corpo?.email || req.query?.email || "").trim();
  if (!email.includes("@")) return json(res, 400, { erro: "Digite um e-mail válido." });

  const norm = normalizarEmail(email);
  const sb = supabaseAdmin();

  // ---- o perfil ------------------------------------------------------------
  const { data: perfis, error } = await sb
    .from("perfis")
    .select("id, email, plano, plano_expira_em, plano_origem, criado_em")
    .eq("email_normalizado", norm);

  if (error) return json(res, 500, { erro: error.message });

  // ---- o pagamento que pode estar guardado ---------------------------------
  const { data: pendentes } = await sb
    .from("acessos_pendentes")
    .select("plano, plano_expira_em, origem, criado_em")
    .eq("email_normalizado", norm);

  const pendente = pendentes?.[0] || null;

  // ---- CONSERTO: pagamento guardado para uma conta que ja existe -----------
  // O banco tambem faz isso sozinho quando a pessoa abre o app
  // (public.aplicar_acesso_pendente), mas aqui voce ve acontecer na hora.
  let consertado = null;
  if (pendente && perfis?.length) {
    const alvo = perfis[0];
    if (!pagoVale(alvo.plano, alvo.plano_expira_em)) {
      const { error: e2 } = await sb
        .from("perfis")
        .update({
          plano: pendente.plano,
          plano_expira_em: pendente.plano_expira_em,
          plano_origem: pendente.origem || "kiwify"
        })
        .eq("email_normalizado", norm);
      if (!e2) {
        consertado = pendente.plano;
        alvo.plano = pendente.plano;
        alvo.plano_expira_em = pendente.plano_expira_em;
        alvo.plano_origem = pendente.origem || "kiwify";
      }
    }
    // Guardado ja aplicado (agora ou antes): sai da lista de espera.
    await sb.from("acessos_pendentes").delete().eq("email_normalizado", norm);
  }

  // ---- montar a resposta em portugues --------------------------------------
  if (!perfis?.length) {
    return json(res, 200, {
      ok: true,
      email, email_normalizado: norm,
      tem_conta: false,
      pagamento_guardado: pendente
        ? { plano: pendente.plano, desde: pendente.criado_em }
        : null,
      recado: pendente
        ? `Esse e-mail AINDA NÃO TEM CONTA no app, mas o pagamento do plano ${pendente.plano} está guardado. No dia em que a pessoa se cadastrar com esse e-mail exato, ela já entra no plano. Confira se ela não criou a conta com outro e-mail.`
        : "Esse e-mail não tem conta no app e não tem pagamento guardado. Ou a pessoa se cadastrou com outro e-mail, ou o aviso da Kiwify não chegou aqui (veja /api/diagnostico)."
    });
  }

  const p = perfis[0];
  const pago = pagoVale(p.plano, p.plano_expira_em);
  const nivel = planoDe(p.plano);
  const ias = pago ? iasLiberadas(p.plano) : [];

  let recado;
  if (consertado) {
    recado = `Consertado agora: o pagamento estava guardado e não tinha sido aplicado na conta. ${p.email} está no plano ${nivel.nome}. Peça para a pessoa recarregar a página (F5).`;
  } else if (pago) {
    recado = `${p.email} está no plano ${nivel.nome} e o plano VALE. IAs pagas liberadas: ${ias.join(", ") || "nenhuma"}.`;
  } else if (p.plano !== "free") {
    recado = `${p.email} está no plano ${p.plano}, mas ele VENCEU em ${p.plano_expira_em}. Por isso o app pede assinatura. Para reativar, libere o plano aqui ao lado.`;
  } else {
    recado = `${p.email} tem conta, mas está no plano GRÁTIS e não há nenhum pagamento guardado para esse e-mail. Ou o aviso da Kiwify não chegou (veja /api/diagnostico e a lista de envios do webhook na Kiwify), ou a compra foi feita com um e-mail diferente. Para resolver na hora, libere o plano aqui ao lado.`;
  }

  return json(res, 200, {
    ok: true,
    email: p.email,
    email_normalizado: norm,
    tem_conta: true,
    plano: p.plano,
    plano_nome: nivel.nome,
    pago,
    vence_em: p.plano_expira_em || "não vence",
    origem: p.plano_origem || "(nunca foi gravado)",
    ias_pagas_liberadas: ias,
    planos_que_liberam_deepseek: planosCom("deepseek").map(x => x.nome),
    pagamento_guardado: pendente ? { plano: pendente.plano, desde: pendente.criado_em } : null,
    consertado_agora: consertado,
    contas_com_esse_email: perfis.length,
    recado
  });
}
