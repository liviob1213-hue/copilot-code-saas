// ============================================================================
// /api/diagnostico — "o que esta faltando pra isso funcionar?"
// ----------------------------------------------------------------------------
// Abra no navegador:
//   https://copilot-code-saas.vercel.app/api/diagnostico
//
// Ele responde quais variaveis chegaram, se o banco responde e se as tabelas
// existem. NUNCA mostra o valor de nada — so "chegou" ou "nao chegou". Pode
// abrir sem medo, nao vaza segredo.
//
// Existe porque, sem isso, descobrir por que um webhook nao gravou vira
// adivinhacao: pode ser variavel faltando, variavel com nome errado, deploy
// nao refeito, SQL nao rodado ou chave errada — e todos falham parecido.
// ============================================================================

import { createClient } from "@supabase/supabase-js";

const PRECISA = [
  ["SUPABASE_URL",              "endereco do Supabase das contas"],
  ["SUPABASE_SERVICE_ROLE_KEY", "chave service_role (a secreta)"],
  ["KIWIFY_WEBHOOK_SECRET",     "token do webhook da Kiwify"],
  ["ADMIN_EMAILS",              "seu e-mail, pra liberar acesso"],
  // Sem este segredo, o site gratis de cada dia (a "chave da casa") nao
  // funciona: e ele que assina o passe que o Cloudflare Worker confere.
  // O MESMO valor tem que estar no Worker. As chaves de IA da casa em si NAO
  // ficam aqui — elas moram no Worker (IA_CASA_*), que e quem aguenta esperar
  // a IA escrever o projeto inteiro.
  ["PASSE_IA_SEGREDO",          "segredo do passe da IA da casa (o mesmo do Cloudflare)"]
];

// Os ids de produto sao "opcionais" so no sentido de que o codigo nao quebra
// sem eles. COM TRES NIVEIS DE PLANO eles importam: e por eles que /api/kiwify
// sabe se a compra foi do Basico (so DeepSeek), do Pro ou do Premium. Sem eles
// sobra a pista do titulo do produto — e o que o titulo nao denunciar entra
// como Premium, ou seja, voce entrega o plano de R$ 47 por R$ 24,97.
const OPCIONAIS = [
  ["KIWIFY_PRODUTO_BASICO",  "id do produto Basico (R$ 24,97)"],
  ["KIWIFY_PRODUTO_PRO",     "id do produto Pro (R$ 34,97)"],
  ["KIWIFY_PRODUTO_PREMIUM", "id do produto Premium (R$ 47)"],
  ["KIWIFY_PRODUTO_MENSAL",  "nome antigo do Premium mensal"],
  ["KIWIFY_PRODUTO_ANUAL",   "id do produto anual"],
  ["CASA_WORKER_URL",        "endereco do Worker da IA da casa (so se mudar do padrao)"]
];

export default async function handler(req, res) {
  const variaveis = {};
  const faltando = [];

  for (const [nome, oque] of PRECISA) {
    const tem = Boolean(process.env[nome]);
    variaveis[nome] = tem ? "chegou" : "FALTANDO";
    if (!tem) faltando.push({ nome, oque });
  }
  for (const [nome, oque] of OPCIONAIS) {
    variaveis[nome] = process.env[nome] ? "chegou" : "nao preenchida (opcional)";
  }

  // ---- o banco responde? as tabelas existem? -------------------------------
  const banco = { testado: false };
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    banco.testado = true;
    try {
      const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
      });
      for (const tabela of ["perfis", "cotas", "acessos_pendentes", "projetos_criados"]) {
        const { count, error } = await sb
          .from(tabela)
          .select("*", { count: "exact", head: true });
        banco[tabela] = error ? `ERRO: ${error.message}` : `ok (${count} linhas)`;
      }

      // QUEM TEM ACESSO COMPLETO, conferido no banco de verdade.
      //
      // A promessa feita aos primeiros usuarios foi: quem ja estava aqui, e
      // quem for liberado na mao, NAO entra na regra de slots. Quem garante
      // isso e o plano ser diferente de 'free' sem data de vencimento — e
      // quando isso vale, a trava da interface nem chega a ser consultada.
      //
      // Mostramos so a CONTAGEM por plano. Nenhum e-mail sai daqui.
      const { data: todos, error: erroPlanos } = await sb
        .from("perfis")
        .select("plano, plano_expira_em");

      if (erroPlanos) {
        banco.acesso_completo = `ERRO: ${erroPlanos.message}`;
      } else {
        const agora = Date.now();
        const porPlano = {};
        let completos = 0;
        let vencendo = 0;
        for (const p of todos || []) {
          const nome = p.plano || "free";
          porPlano[nome] = (porPlano[nome] || 0) + 1;
          if (nome === "free") continue;
          if (!p.plano_expira_em) completos++;          // nao vence: acesso completo
          else if (new Date(p.plano_expira_em).getTime() > agora) vencendo++;
          else porPlano["(pago vencido)"] = (porPlano["(pago vencido)"] || 0) + 1;
        }
        banco.acesso_completo = {
          por_plano: porPlano,
          sem_slots_e_sem_vencimento: completos,
          pagos_com_data_de_vencimento: vencendo,
          explicacao: "sem_slots_e_sem_vencimento = contas que NUNCA caem na regra de slots (as que ja estavam no banco e as liberadas na mao)."
        };
      }

      // As funcoes de slot (supabase/slots.sql). Sem elas, o site gratis de
      // cada dia nao funciona — e o erro apareceria so na hora de gerar.
      const { data: lim, error: erroLim } = await sb.rpc("limites_dos_slots");
      banco.funcoes_de_slot = erroLim
        ? `FALTANDO: rode supabase/slots.sql no SQL Editor do Supabase (${erroLim.message})`
        : "ok";
      if (!erroLim) banco.regras_do_plano = lim;

      // O CONSERTO DO PAGAMENTO GUARDADO (supabase/pagamento-pendente.sql).
      // Sem ele, um pagamento que cai na lista de espera de quem JA TEM CONTA
      // nunca e aplicado: cliente pagante vendo "assine o plano". Testamos com
      // um id que nao existe — a funcao responde "sem_perfil" e nao escreve
      // nada, so prova que ela esta la.
      const { error: erroPend } = await sb.rpc("aplicar_acesso_pendente", {
        p_usuario: "00000000-0000-0000-0000-000000000000"
      });
      banco.conserto_de_pagamento_guardado = erroPend
        ? `FALTANDO: rode supabase/pagamento-pendente.sql no SQL Editor do Supabase (${erroPend.message})`
        : "ok";
    } catch (e) {
      banco.erro = e.message || String(e);
    }
  }

  const tudoCerto = faltando.length === 0 &&
    banco.testado &&
    String(banco.perfis || "").startsWith("ok") &&
    banco.funcoes_de_slot === "ok";

  res.status(200).setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({
    resumo: tudoCerto
      ? "Tudo certo aqui na Vercel: o webhook recebe pagamento e os slots estao no banco. Confira tambem o Worker em <endereco do worker>/status — e la que ficam as chaves de IA da casa."
      : "Tem coisa faltando — veja abaixo.",
    o_que_fazer: faltando.length
      ? `Faltam ${faltando.length} variavel(is) na Vercel. Depois de salvar, va em Deployments -> Redeploy e DESMARQUE "Use existing Build Cache". Sem o redeploy a funcao continua com os valores antigos.`
      : (banco.testado ? undefined : "Nao deu pra testar o banco."),
    faltando,
    variaveis,
    banco
  }, null, 2));
}
