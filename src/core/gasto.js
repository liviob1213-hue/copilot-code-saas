// ============================================================================
// gasto.js — quanto cada projeto custou de IA
// ----------------------------------------------------------------------------
// A pergunta que a pessoa realmente faz nao e "quantos tokens eu usei": e
// "quanto me custou este site?". Token nao e dinheiro para quem nao e
// programador, e um total acumulado desde sempre nao ajuda a decidir nada.
//
// COMO A CONTA E FEITA
// storage.js ja soma, por provedor, o custo estimado de cada chamada
// (tokens x preco de tabela, em PROVIDER_PRICES). Aqui a gente so tira uma
// FOTO desse total antes do pedido e outra depois: a diferenca e o que aquele
// projeto consumiu. Nada de contador paralelo, que um dia discordaria do outro.
//
// ---------------------------------------------------------------------------
// HONESTIDADE SOBRE O NUMERO (nao apague este aviso)
// ---------------------------------------------------------------------------
// E ESTIMATIVA, e precisa ser mostrada como tal:
//   - o preco usado e o de tabela, e varios provedores dao desconto fora do
//     horario de pico ou cobram cache mais barato;
//   - quando a chamada vai pela NOSSA chave (a "chave da casa"), quem paga
//     somos nos, nao a pessoa — isso nao entra no bolso dela;
//   - provedor que nao esta em PROVIDER_PRICES entra como zero.
// Prometer centavo exato aqui seria mentira, e a primeira fatura que nao
// batesse destruiria a confianca no resto da ferramenta.
// ============================================================================

import * as store from "./storage.js";

/** Quanto ja foi gasto no total, por provedor, desde sempre. */
async function totaisPorProvedor() {
  const runtime = await store.get("runtime");
  const mapa = {};
  for (const [id, e] of Object.entries(runtime || {})) {
    mapa[id] = { usd: Number(e?.costUsd || 0), tokens: Number(e?.tokens || 0) };
  }
  return mapa;
}

/** A foto de antes. Guarde e devolva para fecharMedicao(). */
export async function comecarMedicao() {
  return { em: Date.now(), antes: await totaisPorProvedor() };
}

/**
 * A diferenca entre antes e agora: o que ESTE pedido consumiu.
 * Nunca lanca — um erro aqui nao pode derrubar um projeto que deu certo.
 */
export async function fecharMedicao(foto) {
  const vazio = { usd: 0, tokens: 0, provedores: [], segundos: 0 };
  if (!foto?.antes) return vazio;
  try {
    const agora = await totaisPorProvedor();
    let usd = 0, tokens = 0;
    const provedores = [];
    for (const [id, dep] of Object.entries(agora)) {
      const ant = foto.antes[id] || { usd: 0, tokens: 0 };
      const dUsd = Math.max(0, dep.usd - ant.usd);
      const dTok = Math.max(0, dep.tokens - ant.tokens);
      if (!dTok && !dUsd) continue;
      usd += dUsd; tokens += dTok;
      provedores.push({ id, usd: dUsd, tokens: dTok });
    }
    return { usd, tokens, provedores, segundos: Math.round((Date.now() - foto.em) / 1000) };
  } catch {
    return vazio;
  }
}

/** Quantos projetos guardamos no historico. O suficiente para ver a media. */
const QUANTOS_GUARDAR = 60;

/**
 * Anota o custo de um projeto. Best-effort: se falhar, o projeto da pessoa
 * continua existindo do mesmo jeito.
 */
export async function anotarGasto({ nome, tipo, acao = "criar", medida }) {
  try {
    if (!medida || (!medida.tokens && !medida.usd)) return;
    const lista = await store.get("gastos");
    lista.unshift({
      quando: Date.now(),
      nome: String(nome || "projeto").slice(0, 60),
      tipo: tipo || "",
      acao,                               // "criar" | "editar"
      usd: Number(medida.usd || 0),
      tokens: Number(medida.tokens || 0),
      segundos: Number(medida.segundos || 0),
      provedores: (medida.provedores || []).map(p => p.id)
    });
    await store.set("gastos", lista.slice(0, QUANTOS_GUARDAR));
  } catch { /* contabilidade nunca atrapalha o trabalho */ }
}

/**
 * O resumo que vai para a tela.
 *
 * `mediaPorProjeto` so conta CRIACOES: misturar com edicoes puxaria a media
 * para baixo e responderia errado a pergunta "quanto me custa fazer um site?".
 */
export async function resumoDeGastos() {
  const lista = await store.get("gastos");
  const criacoes = lista.filter(g => g.acao === "criar");
  const soma = (arr, campo) => arr.reduce((n, g) => n + Number(g[campo] || 0), 0);
  const totalUsd = soma(lista, "usd");
  return {
    lista,
    projetos: criacoes.length,
    totalUsd,
    totalTokens: soma(lista, "tokens"),
    mediaPorProjeto: criacoes.length ? soma(criacoes, "usd") / criacoes.length : 0
  };
}

export async function limparGastos() {
  await store.set("gastos", []);
}

// ---------------------------------------------------------------------------
// Dinheiro na tela
// ---------------------------------------------------------------------------

/**
 * Quanto vale um dolar em real. E uma referencia fixa de proposito: buscar
 * cotacao ao vivo acrescentaria uma chamada de rede que pode falhar para
 * melhorar um numero que ja e estimativa. O texto na tela diz "aprox.".
 */
export const REAL_POR_DOLAR = 5.4;

/**
 * Formata um valor em dolar do jeito que a pessoa entende.
 *
 * Centavo arredondado para baixo viraria "R$ 0,00" num projeto que custou
 * tres centavos — e "de graca" e uma promessa diferente de "quase nada".
 * Por isso qualquer valor acima de zero mostra pelo menos "menos de R$ 0,01".
 */
export function emReais(usd) {
  const v = Number(usd || 0) * REAL_POR_DOLAR;
  if (v <= 0) return "R$ 0,00";
  if (v < 0.01) return "menos de R$ 0,01";
  return "R$ " + v.toFixed(2).replace(".", ",");
}

/** Tokens em formato curto: 1.234.567 -> "1,2 mi". */
export function tokensCurto(n) {
  const v = Number(n || 0);
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(".", ",") + " mi";
  if (v >= 1e3) return Math.round(v / 1e3) + " mil";
  return String(Math.round(v));
}
