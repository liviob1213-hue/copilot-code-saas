// ============================================================================
// /api/convite — registra que alguem entrou pelo link de convite de outra pessoa
// ----------------------------------------------------------------------------
// COMO A COISA FUNCIONA, DO INICIO AO FIM:
//   1. A pessoa clica no link de alguem:  copilotcode.app/?convite=ABC12345
//   2. O app guarda esse codigo no navegador (guardarConviteDaUrl, em
//      src/core/plano.js). Guarda porque o cadastro acontece depois, em outra
//      tela — e, pelo Google, ate depois de sair e voltar do site do Google.
//   3. Terminado o login, o app chama ESTA funcao com o codigo e o token.
//   4. Aqui a gente acha o dono do codigo e anota, no perfil de quem entrou,
//      que foi ele quem indicou (coluna convidado_por).
//   5. Presente de boas-vindas: quem entrou ganha um site a mais na hora.
//
// O PREMIO DO DONO DO CONVITE NAO SAI AQUI, DE PROPOSITO: ele e pago quando a
// pessoa convidada cria o primeiro site de verdade. Pagar no cadastro viraria
// fazenda de conta fantasma — e o banco ja esta preparado para isso, na coluna
// perfis.convite_creditado (ver supabase/contas.sql).
//
// POR QUE ISSO PRECISA DE SERVIDOR: o app roda inteiro no navegador, e o
// navegador nao guarda segredo. Se o proprio app pudesse escrever na tabela de
// perfis, qualquer pessoa abriria o console e se daria sites de graca. As
// politicas (RLS) do Supabase so deixam a pessoa LER o proprio perfil; escrever
// e so aqui, com a chave service_role.
//
// VARIAVEIS NECESSARIAS (na Vercel, SEM VITE_):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// COMO ESTA FUNCAO RESPONDE (o app em src/core/plano.js conta com isto):
//   200 { ok: true }         -> convite registrado
//   200 { ok: false, recado } -> recusa tranquila e definitiva (codigo seu,
//                                convite ja usado, codigo que nao existe).
//                                O app pode esquecer o codigo.
//   401 / 5xx                -> deu errado AGORA; o app guarda o codigo e
//                                tenta de novo na proxima vez que abrir.
// ============================================================================

import { usuarioDoToken, json, supabaseAdmin } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { erro: "use POST" });

  // ---- quem esta chamando? -------------------------------------------------
  // So o token prova. Nunca aceitar um "sou o usuario tal" que venha no corpo.
  const usuario = await usuarioDoToken(req);
  if (!usuario) return json(res, 401, { erro: "Faça login para usar o convite." });

  // ---- o que foi pedido ----------------------------------------------------
  let corpo = req.body;
  if (typeof corpo === "string") {
    try { corpo = JSON.parse(corpo); } catch { corpo = {}; }
  }

  const codigo = String(corpo?.codigo || "").trim().toUpperCase();
  if (!codigo) return json(res, 400, { erro: "Faltou o código do convite." });

  let sb;
  try { sb = supabaseAdmin(); }
  catch (e) { return json(res, 500, { erro: e.message }); }

  // ---- o perfil de quem acabou de entrar -----------------------------------
  const { data: meu, error: e1 } = await sb
    .from("perfis")
    .select("id, email_normalizado, codigo_convite, convidado_por")
    .eq("id", usuario.id)
    .maybeSingle();

  if (e1) return json(res, 500, { erro: e1.message });
  // O perfil nasce por gatilho no instante do cadastro. Se ainda nao esta la,
  // e questao de segundos: devolvemos 503 para o app tentar depois, em vez de
  // "nao deu" — que faria a pessoa perder o convite por uma fracao de segundo.
  if (!meu) return json(res, 503, { erro: "Sua conta ainda está sendo preparada. Tente de novo em instantes." });

  if (meu.convidado_por) {
    return json(res, 200, { ok: false, recado: "Você já tinha um convite registrado." });
  }
  if (codigo === String(meu.codigo_convite || "").trim().toUpperCase()) {
    return json(res, 200, { ok: false, recado: "Esse é o seu próprio link de convite." });
  }

  // ---- de quem e esse codigo? ----------------------------------------------
  const { data: dono, error: e2 } = await sb
    .from("perfis")
    .select("id, email_normalizado")
    .eq("codigo_convite", codigo)
    .maybeSingle();

  if (e2) return json(res, 500, { erro: e2.message });
  if (!dono) return json(res, 200, { ok: false, recado: "Esse link de convite não existe." });
  if (dono.id === usuario.id) {
    return json(res, 200, { ok: false, recado: "Esse é o seu próprio link de convite." });
  }
  if (dono.email_normalizado === meu.email_normalizado) {
    return json(res, 200, { ok: false, recado: "Esse convite é de outra conta sua." });
  }

  // Uma pessoa pode ter varias contas com o MESMO e-mail na pratica:
  // victor+1@gmail, vic.tor@gmail e victor@gmail caem todas na mesma caixa de
  // entrada (e por isso o banco guarda o email_normalizado). Se a gente olhasse
  // so o perfil atual, bastava criar conta nova para pegar o bonus outra vez.
  // Entao a pergunta certa e: alguma conta deste e-mail ja usou um convite?
  const { data: outras, error: e3 } = await sb
    .from("perfis")
    .select("id")
    .eq("email_normalizado", meu.email_normalizado)
    .not("convidado_por", "is", null)
    .limit(1);

  if (e3) return json(res, 500, { erro: e3.message });
  if (outras && outras.length) {
    return json(res, 200, { ok: false, recado: "Esse e-mail já usou um convite." });
  }

  // ---- grava o convite -----------------------------------------------------
  const { error: e4 } = await sb
    .from("perfis")
    .update({ convidado_por: dono.id })
    .eq("id", usuario.id);

  if (e4) return json(res, 500, { erro: e4.message });

  // ---- o presente de boas-vindas: um site a mais ---------------------------
  // Se isso falhar, o convite JA ESTA gravado e nao se perde: o dono recebe o
  // premio dele do mesmo jeito quando esta pessoa criar o primeiro site. Por
  // isso aqui a gente nao devolve erro, so avisa que o bonus nao entrou.
  let bonus = false;
  try {
    const { data: cota } = await sb
      .from("cotas")
      .select("slots_ganhos")
      .eq("email_normalizado", meu.email_normalizado)
      .maybeSingle();

    const { error: e5 } = await sb
      .from("cotas")
      .upsert(
        {
          email_normalizado: meu.email_normalizado,
          slots_ganhos: Number(cota?.slots_ganhos || 0) + 1
        },
        { onConflict: "email_normalizado" }
      );
    bonus = !e5;
  } catch {
    bonus = false;
  }

  return json(res, 200, {
    ok: true,
    bonus,
    recado: bonus
      ? "Convite aceito: você começa com um site a mais."
      : "Convite registrado."
  });
}
