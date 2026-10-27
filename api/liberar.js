// ============================================================================
// /api/liberar — libera (ou tira) acesso na mao, pelo e-mail
// ----------------------------------------------------------------------------
// E o motor da pagina /acesso-anual. Serve para:
//   - dar acesso a quem voce quer liberar de cortesia
//   - consertar um pagamento que a Kiwify nao avisou direito
//   - tirar acesso de alguem
//
// SO VOCE PODE USAR: a funcao confere o token de quem esta chamando e exige
// que o e-mail dele esteja na variavel ADMIN_EMAILS. Nao basta saber o
// endereco — tem que estar logado como administrador.
//
// VARIAVEIS NECESSARIAS (na Vercel, SEM VITE_):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   ADMIN_EMAILS   <- seu e-mail. Varios: separe por virgula.
// ============================================================================

import { usuarioDoToken, ehAdmin, definirPlanoPorEmail, json, normalizarEmail, supabaseAdmin } from "./_lib.js";

// Os niveis de hoje, mais "mensal", que e como estao gravados os clientes de
// antes dos tres niveis (vale como Premium — ver src/core/planos.js).
const PLANOS = new Set(["free", "basico", "pro", "premium", "mensal", "anual"]);

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { erro: "use POST" });

  // ---- quem esta chamando? -------------------------------------------------
  const usuario = await usuarioDoToken(req);
  if (!usuario) return json(res, 401, { erro: "Faça login para usar esta página." });

  if (!ehAdmin(usuario.email)) {
    console.warn("[liberar] tentativa de", usuario.email);
    return json(res, 403, { erro: "Sua conta não tem permissão para liberar acessos." });
  }

  // ---- o que foi pedido ----------------------------------------------------
  let corpo = req.body;
  if (typeof corpo === "string") {
    try { corpo = JSON.parse(corpo); } catch { corpo = {}; }
  }

  const email = String(corpo?.email || "").trim();
  const plano = String(corpo?.plano || "premium").trim().toLowerCase();
  const meses = Number(corpo?.meses || 0);

  if (!email || !email.includes("@")) {
    return json(res, 400, { erro: "Digite um e-mail válido." });
  }
  if (!PLANOS.has(plano)) {
    return json(res, 400, { erro: "Plano inválido. Use free, basico, pro, premium ou anual." });
  }

  // meses = 0 significa "não vence" (acesso vitalício), que e o padrao de uma
  // liberacao manual: voce esta dando, nao vendendo.
  let expiraEm = null;
  if (meses > 0) {
    const d = new Date();
    d.setMonth(d.getMonth() + meses);
    expiraEm = d.toISOString();
  }

  const r = await definirPlanoPorEmail({
    email,
    plano,
    expiraEm,
    origem: "manual"
  });

  if (!r.ok) return json(res, 500, { erro: r.motivo || "não consegui gravar" });

  const norm = normalizarEmail(email);
  const recado = r.aplicado === "conta"
    ? `Pronto. ${email} está no plano ${plano}${expiraEm ? "" : " (não vence)"}.`
    : `${email} ainda não tem conta. Guardei o acesso: assim que a pessoa se cadastrar com esse e-mail, ela já entra no plano ${plano}.`;

  return json(res, 200, { ok: true, recado, email_normalizado: norm, ...r });
}
