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
  ["ADMIN_EMAILS",              "seu e-mail, pra liberar acesso"]
];

const OPCIONAIS = [
  ["KIWIFY_PRODUTO_MENSAL", "id do produto mensal"],
  ["KIWIFY_PRODUTO_ANUAL",  "id do produto anual"],
  ["IA_CASA_OPENROUTER_KEY", "chave de IA da casa (site de cortesia)"]
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
      for (const tabela of ["perfis", "cotas", "acessos_pendentes"]) {
        const { count, error } = await sb
          .from(tabela)
          .select("*", { count: "exact", head: true });
        banco[tabela] = error ? `ERRO: ${error.message}` : `ok (${count} linhas)`;
      }
    } catch (e) {
      banco.erro = e.message || String(e);
    }
  }

  const tudoCerto = faltando.length === 0 &&
    banco.testado &&
    String(banco.perfis || "").startsWith("ok");

  res.status(200).setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({
    resumo: tudoCerto
      ? "Tudo certo. O webhook esta pronto pra receber pagamento."
      : "Tem coisa faltando — veja abaixo.",
    o_que_fazer: faltando.length
      ? `Faltam ${faltando.length} variavel(is) na Vercel. Depois de salvar, va em Deployments -> Redeploy e DESMARQUE "Use existing Build Cache". Sem o redeploy a funcao continua com os valores antigos.`
      : (banco.testado ? undefined : "Nao deu pra testar o banco."),
    faltando,
    variaveis,
    banco
  }, null, 2));
}
