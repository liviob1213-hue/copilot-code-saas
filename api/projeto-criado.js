// ============================================================================
// /api/projeto-criado — "saiu um projeto": anota no historico e paga o convite
// ----------------------------------------------------------------------------
// O app chama aqui UMA vez, quando um projeto novo termina de ser gerado.
// Duas coisas acontecem (ambas na funcao public.registrar_projeto, em
// supabase/slots.sql):
//
//   1. Se a pessoa usou a chave DELA, gasta um slot proprio. (Se usou a chave
//      da casa, o slot do dia ja foi gasto em /api/passe-ia — nao cobramos
//      duas vezes.)
//   2. PAGA O CONVITE de quem indicou esta pessoa: +2 slots proprios pra quem
//      mandou o link, uma vez so, na vida.
//
// POR QUE O PREMIO SO SAI AGORA, e nao no cadastro: pagar no cadastro viraria
// fazenda de conta fantasma — criar 50 contas com o proprio link e colher 100
// slots. Pagando so quando a pessoa convidada cria um projeto DE VERDADE, o
// trabalho de fraudar fica maior que o premio.
//
// POR QUE ISSO PRECISA DE SERVIDOR: o app roda inteiro no navegador, e o
// navegador nao guarda segredo. As politicas (RLS) do Supabase so deixam a
// pessoa LER o proprio saldo; escrever e so aqui, com a chave service_role.
//
// VARIAVEIS NECESSARIAS (na Vercel, SEM VITE_):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// NUNCA ATRAPALHA: se der errado, o projeto da pessoa ja existe e ela nao
// perde nada — so o saldo fica desatualizado ate a proxima vez. Por isso o app
// chama isto sem esperar e sem mostrar erro na tela.
// ============================================================================

import { usuarioDoToken, json, supabaseAdmin } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { erro: "use POST" });

  const usuario = await usuarioDoToken(req);
  if (!usuario) return json(res, 401, { erro: "Faça login." });

  let corpo = req.body;
  if (typeof corpo === "string") {
    try { corpo = JSON.parse(corpo); } catch { corpo = {}; }
  }

  const nome = String(corpo?.nome || "").slice(0, 120) || null;
  const tipo = corpo?.tipo === "app" ? "app" : "site";
  const chaveDaCasa = corpo?.chaveDaCasa === true;

  let sb;
  try { sb = supabaseAdmin(); }
  catch (e) { return json(res, 503, { erro: e.message }); }

  const { data, error } = await sb.rpc("registrar_projeto", {
    p_usuario: usuario.id,
    p_nome: nome,
    p_tipo: tipo,
    p_chave_da_casa: chaveDaCasa
  });

  if (error) {
    const faltaSql = /does not exist|not find|schema cache/i.test(error.message || "");
    return json(res, 503, {
      erro: faltaSql
        ? "O banco ainda não tem as funções de slot. Rode supabase/slots.sql no SQL Editor do Supabase."
        : error.message
    });
  }

  // Devolve o saldo novo junto: a tela atualiza o contador de slots sem ter
  // que fazer uma segunda consulta.
  const { data: saldo } = await sb.rpc("resumo_slots", { p_usuario: usuario.id });

  return json(res, 200, {
    ok: data?.ok !== false,
    premiouConvite: data?.premiou_convite === true,
    premio: data?.premio ?? 0,
    saldo: saldo || null
  });
}
