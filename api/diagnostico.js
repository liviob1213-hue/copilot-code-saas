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

const OPCIONAIS = [
  ["KIWIFY_PRODUTO_MENSAL", "id do produto mensal"],
  ["KIWIFY_PRODUTO_ANUAL",  "id do produto anual"],
  ["CASA_WORKER_URL",       "endereco do Worker da IA da casa (so se mudar do padrao)"]
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

      // As funcoes de slot (supabase/slots.sql). Sem elas, o site gratis de
      // cada dia nao funciona — e o erro apareceria so na hora de gerar.
      const { data: lim, error: erroLim } = await sb.rpc("limites_dos_slots");
      banco.funcoes_de_slot = erroLim
        ? `FALTANDO: rode supabase/slots.sql no SQL Editor do Supabase (${erroLim.message})`
        : "ok";
      if (!erroLim) banco.regras_do_plano = lim;
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
