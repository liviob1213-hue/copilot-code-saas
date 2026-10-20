// ============================================================================
// /api/passe-ia — "posso usar a IA da casa agora?"
// ----------------------------------------------------------------------------
// COMO A COISA FUNCIONA, DO INICIO AO FIM:
//   1. A pessoa manda um pedido no app ("crie um site de barbearia").
//   2. Antes de CADA chamada de IA, o app pergunta aqui se pode usar a chave da
//      casa (as nossas chaves gratuitas: Gemini, OpenRouter, Groq, Mistral).
//   3. Aqui a gente confere o plano e gasta a cota NO BANCO (funcao
//      public.usar_chave_da_casa, em supabase/slots.sql).
//   4. Se puder, devolvemos um PASSE assinado, valido por 2 minutos.
//   5. O app manda o pedido de IA pro Cloudflare Worker levando o passe. O
//      Worker confere a assinatura, pega a chave da casa que fica guardada LA,
//      e repassa a resposta da IA.
//
// POR QUE O PASSE (e por que o Worker, e nao esta funcao, fala com a IA):
//   Decidir se pode e rapido — cabe aqui. Esperar a IA escrever um site leva
//   MINUTOS, e funcao de servidor tem prazo curto pra responder; o Worker
//   aguenta e vai repassando a resposta em tempo real. A explicacao completa
//   esta em api/_lib.js, junto da funcao que assina o passe.
//
// A TRAVA AQUI E DE VERDADE: a chave da casa nunca chega ao navegador, e todo
// uso dela passa por esta conferencia. Ja o limite de quem usa a PROPRIA chave
// e aplicado no app (a chamada vai do navegador direto pro provedor, sem
// servidor no meio pra barrar) — ver o aviso honesto em src/core/plano.js.
//
// VARIAVEIS NECESSARIAS (na Vercel, SEM VITE_):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   PASSE_IA_SEGREDO          <- o mesmo valor que esta no Cloudflare Worker
// Opcional:
//   CASA_WORKER_URL           <- endereco do Worker, se mudar do padrao
//
// COMO ESTA FUNCAO RESPONDE (o app em src/core/casa.js conta com isto):
//   200 { ok: true, passe, ponte, ... }  -> pode usar
//   200 { ok: false, motivo, recado }    -> recusa tranquila (acabou a cota do
//                                           dia, chave da casa desligada).
//                                           O app usa a chave da pessoa.
//   401                                  -> sem login
//   503                                  -> deu errado AGORA, vale tentar de novo
// ============================================================================

import {
  usuarioDoToken, json, supabaseAdmin,
  assinarPasse, casaConfigurada, PROVEDORES_DA_CASA, PASSE_VALIDADE_MS
} from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { erro: "use POST" });

  // ---- quem esta chamando? -------------------------------------------------
  // So o token prova. Nunca aceitar um "sou o usuario tal" que venha no corpo.
  const usuario = await usuarioDoToken(req);
  if (!usuario) return json(res, 401, { erro: "Faça login para usar a IA da casa." });

  let corpo = req.body;
  if (typeof corpo === "string") {
    try { corpo = JSON.parse(corpo); } catch { corpo = {}; }
  }

  const provedor = String(corpo?.provedor || "").trim().toLowerCase();
  if (!PROVEDORES_DA_CASA.includes(provedor)) {
    // Pediu uma API paga com a chave da casa? Nao existe: a casa so empresta
    // as gratuitas. Quem quer Claude/DeepSeek usa a chave propria (plano pago).
    return json(res, 200, {
      ok: false, motivo: "provedor_nao_e_da_casa",
      recado: "A IA da casa só cobre os serviços gratuitos (Gemini, OpenRouter, Groq e Mistral)."
    });
  }

  // Na primeira chamada de um projeto novo o banco confere se ainda ha site do
  // dia. As seguintes (corrigir, continuar, resumir, editar) passam sem essa
  // conferencia: cortar alguem no meio de um trabalho ja comecado seria pior.
  // O slot em si e descontado quando o projeto SAI (/api/projeto-criado), pra
  // que uma geracao que falhou no meio nao tire o site do dia de quem nao
  // recebeu nada.
  const novoProjeto = corpo?.novoProjeto === true;

  if (!casaConfigurada()) {
    return json(res, 200, {
      ok: false, motivo: "casa_desligada",
      recado: "A IA da casa ainda não está configurada. Ligue a sua própria chave em Conexões."
    });
  }

  let sb;
  try { sb = supabaseAdmin(); }
  catch (e) { return json(res, 503, { erro: e.message }); }

  // ---- gasta a cota no banco (e la que a conta e feita, com a linha trancada)
  const { data, error } = await sb.rpc("usar_chave_da_casa", {
    p_usuario: usuario.id,
    p_novo_projeto: novoProjeto
  });

  if (error) {
    // Funcao inexistente = o SQL de supabase/slots.sql ainda nao foi rodado.
    // Dizemos isso em voz alta: e o erro mais comum e o mais facil de resolver.
    const faltaSql = /does not exist|not find|schema cache/i.test(error.message || "");
    return json(res, 503, {
      erro: faltaSql
        ? "O banco ainda não tem as funções de slot. Rode supabase/slots.sql no SQL Editor do Supabase."
        : error.message
    });
  }

  if (!data?.ok) {
    return json(res, 200, {
      ok: false,
      motivo: data?.motivo || "sem_cota",
      recado: data?.recado || "A IA da casa não está disponível para você agora.",
      sitesRestantesHoje: data?.sites_restantes_hoje ?? 0,
      chamadasRestantesHoje: data?.chamadas_restantes_hoje ?? 0
    });
  }

  const passe = assinarPasse({ usuarioId: usuario.id, provedor, pago: data.pago === true });
  if (!passe) {
    return json(res, 200, {
      ok: false, motivo: "casa_desligada",
      recado: "A IA da casa ainda não está configurada. Ligue a sua própria chave em Conexões."
    });
  }

  return json(res, 200, {
    ok: true,
    passe,
    // Onde o app entrega o passe. Vazio = usa o endereco padrao do Worker, que
    // o proprio app ja conhece (src/core/config.js).
    ponte: process.env.CASA_WORKER_URL || "",
    provedor,
    validadeMs: PASSE_VALIDADE_MS,
    sitesRestantesHoje: data.sites_restantes_hoje ?? 0,
    chamadasRestantesHoje: data.chamadas_restantes_hoje ?? 0
  });
}
