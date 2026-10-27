// ============================================================================
// planos.js — O QUE CADA PLANO LIBERA. Fonte unica.
// ----------------------------------------------------------------------------
// Este arquivo nao importa NADA de proposito: assim ele roda tanto no navegador
// (a ferramenta) quanto no servidor da Vercel (o webhook da Kiwify, em
// api/kiwify.js). Preco de plano escrito em dois lugares vira, mais cedo ou
// mais tarde, preco diferente em dois lugares.
//
// ---------------------------------------------------------------------------
// OS PLANOS
// ---------------------------------------------------------------------------
//   Gratis    R$ 0        -> so as IAs gratuitas. 1 site por dia na nossa IA.
//   Basico    R$ 24,97    -> libera a DeepSeek.
//   Pro       R$ 34,97    -> libera Claude (direta e pelo gateway) e xAI Grok.
//   Premium   R$ 47       -> libera TODAS as IAs pagas.
//   Premium anual R$ 297  -> o Premium por ano, com o bonus do Prumo Edit.
//
// ---------------------------------------------------------------------------
// POR QUE "nivel" E POR QUE PLANO DESCONHECIDO VIRA PREMIUM
// ---------------------------------------------------------------------------
// No banco, a coluna `plano` e texto livre, e ja existem clientes gravados como
// "mensal" e "anual" de antes destes tres niveis existirem. Se um nome que nao
// esta nesta lista caisse no plano gratis, um cliente que PAGOU perderia acesso
// calado. Entao a regra e: nome desconhecido e diferente de "free" = Premium.
// Errar para o lado de dar demais custa alguns centavos; errar para o lado de
// tirar acesso de quem pagou custa o cliente.
// ============================================================================

/**
 * Os links de pagamento da Kiwify.
 *
 * Se um dia um link mudar, troque AQUI e tambem no bloco LINKS_KIWIFY da
 * pagina de vendas (public/vendas/index.html) — `node scripts/teste-planos.mjs`
 * reclama se os dois ficarem diferentes. Link vazio nao quebra nada: o botao
 * passa a levar para a pagina de planos.
 */
export const LINKS_KIWIFY = {
  basico:  "https://pay.kiwify.com.br/Olo49sN",
  pro:     "https://pay.kiwify.com.br/dkm49bU",
  premium: "https://pay.kiwify.com.br/5ikalLs",
  anual:   "https://pay.kiwify.com.br/oPNhBLB"
};

/** Para onde o botao vai quando o link ainda nao foi colado. */
const PAGINA_DE_PLANOS = "/vendas#planos";

export function linkDoPlano(id) {
  return LINKS_KIWIFY[id] || PAGINA_DE_PLANOS;
}

/**
 * "pagas" lista os provedores PAGOS que o plano libera (ver PROVIDER_CATALOG em
 * config.js). As IAs gratuitas nunca entram aqui: elas valem em todo plano,
 * inclusive no gratis.
 *
 * O Claude aparece por DOIS ids: "anthropic" e a chave direta da Anthropic;
 * "teamsoclo" e um gateway que serve os mesmos modelos Claude por creditos.
 * Quem compra o plano Pro pensando em Claude espera os dois.
 */
export const PLANOS = {
  free: {
    id: "free",
    nome: "Grátis",
    nivel: 0,
    preco: "0",
    ciclo: "",
    pagas: [],
    podeApps: false,
    resumo: "IAs gratuitas, 1 site por dia na nossa IA."
  },
  basico: {
    id: "basico",
    nome: "Básico",
    nivel: 1,
    preco: "24,97",
    ciclo: "mês",
    pagas: ["deepseek"],
    podeApps: true,
    resumo: "Libera a DeepSeek."
  },
  pro: {
    id: "pro",
    nome: "Pro",
    nivel: 2,
    preco: "34,97",
    ciclo: "mês",
    pagas: ["anthropic", "teamsoclo", "xai"],
    podeApps: true,
    resumo: "Libera o Claude e o xAI Grok."
  },
  premium: {
    id: "premium",
    nome: "Premium",
    nivel: 3,
    preco: "47",
    ciclo: "mês",
    // "*" = todas as pagas, inclusive as que forem adicionadas depois. Listar
    // uma por uma faria o Premium ficar para tras a cada IA nova no catalogo.
    pagas: "*",
    podeApps: true,
    resumo: "Libera todas as IAs pagas."
  },
  anual: {
    id: "anual",
    nome: "Premium anual",
    nivel: 3,
    preco: "297",
    ciclo: "ano",
    pagas: "*",
    podeApps: true,
    resumo: "O Premium por ano, com o Prumo Edit de bônus."
  }
};

/**
 * Nomes antigos gravados no banco, de antes dos tres niveis. Quem comprou o
 * plano de R$ 47 esta gravado como "mensal": continua Premium, sem mexer em
 * nada no banco.
 */
const APELIDOS = {
  mensal: "premium",
  "premium-anual": "anual",
  premium_anual: "anual",
  basic: "basico",
  básico: "basico",
  premium: "premium",
  ilimitado: "premium"
};

/** Normaliza o que veio do banco (ou da Kiwify) para um plano desta lista. */
export function planoDe(nome) {
  const chave = String(nome || "free").trim().toLowerCase();
  if (!chave || chave === "free" || chave === "gratis" || chave === "grátis") return PLANOS.free;
  const alvo = APELIDOS[chave] || chave;
  // Desconhecido mas pagante: Premium. Ver a explicacao la em cima.
  return PLANOS[alvo] || PLANOS.premium;
}

/** Este plano libera este provedor pago? (provedor gratuito nunca passa aqui) */
export function planoLibera(nomeDoPlano, provedorId) {
  const p = planoDe(nomeDoPlano);
  if (p.pagas === "*") return true;
  return p.pagas.includes(String(provedorId || ""));
}

/**
 * O plano MAIS BARATO que libera este provedor. E o que o card dentro da
 * ferramenta oferece: mandar quem quer so a DeepSeek para o plano de R$ 47
 * seria empurrar a pessoa para o preco errado e perder a venda.
 */
export function planoMaisBaratoCom(provedorId) {
  const id = String(provedorId || "");
  return Object.values(PLANOS)
    .filter(p => p.nivel > 0 && p.ciclo === "mês")
    .sort((a, b) => a.nivel - b.nivel)
    .find(p => p.pagas === "*" || p.pagas.includes(id)) || PLANOS.premium;
}

/** Todos os planos mensais que liberam este provedor, do mais barato ao maior. */
export function planosCom(provedorId) {
  const id = String(provedorId || "");
  return Object.values(PLANOS)
    .filter(p => p.nivel > 0 && (p.pagas === "*" || p.pagas.includes(id)))
    .sort((a, b) => a.nivel - b.nivel);
}

/** Preco com o "R$" na frente, do jeito que vai para a tela. */
export function precoEmReais(p) {
  return "R$ " + (typeof p === "string" ? p : p?.preco || "0");
}
