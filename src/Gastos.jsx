// ============================================================================
// Gastos.jsx — "quanto tem na minha conta de IA" e "quanto custou cada site"
// ----------------------------------------------------------------------------
// Duas perguntas diferentes, e misturar as duas confunde:
//
//   SALDO  -> o dinheiro que ainda existe na conta da pessoa no provedor.
//             Vem do proprio provedor (DeepSeek e OpenRouter expoem isso pela
//             chave), entao e numero EXATO.
//
//   GASTO  -> quanto de IA cada projeto consumiu aqui dentro. E ESTIMATIVA,
//             calculada por tokens x preco de tabela, e a tela diz isso em
//             todo lugar. Ver o aviso honesto em core/gasto.js.
//
// Por que o saldo importa tanto para este publico: quem usa a propria chave
// descobre que ela acabou do pior jeito possivel — no meio de uma geracao, com
// um erro que parece defeito da ferramenta. Com o saldo na tela, a pessoa ve
// chegando.
// ============================================================================

import React, { useEffect, useState } from "react";
import { t } from "./i18n.js";
import { PROVIDER_CATALOG } from "./core/config.js";
import { fetchBalance, temSaldoReal } from "./core/billing.js";
import { resumoDeGastos, emReais, tokensCurto, limparGastos } from "./core/gasto.js";
import * as store from "./core/storage.js";

const COM_SALDO = PROVIDER_CATALOG.filter(p => temSaldoReal(p.id));

function quando(ts) {
  try {
    const d = new Date(ts);
    const hoje = new Date();
    const mesmoDia = d.toDateString() === hoje.toDateString();
    return mesmoDia
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
  } catch { return ""; }
}

/** O saldo real de um provedor, lido da conta da pessoa. */
function LinhaSaldo({ provedor, temChave }) {
  const [estado, setEstado] = useState(temChave ? "carregando" : "sem-chave");
  const [dados, setDados] = useState(null);

  async function buscar() {
    setEstado("carregando");
    const r = await fetchBalance(provedor.id);
    if (!r) { setEstado("sem-chave"); return; }
    if (r.error) { setDados(r); setEstado("erro"); return; }
    setDados(r); setEstado("ok");
  }

  useEffect(() => { if (temChave) buscar(); else setEstado("sem-chave"); }, [temChave, provedor.id]);

  return (
    <div className="saldo-linha">
      <span className="sl-nome">{provedor.label}</span>
      <span className={"sl-valor " + estado}>
        {estado === "carregando" ? t("consultando…")
          : estado === "sem-chave" ? t("sem chave")
          : estado === "erro" ? t("não consegui consultar")
          : dados?.remaining != null
            ? `${dados.currency === "CNY" ? "¥" : "$"}${Number(dados.remaining).toFixed(2)}`
            : (dados?.label || "—")}
      </span>
      {temChave && (
        <button className="sl-refresh" onClick={buscar} disabled={estado === "carregando"}
          title={t("Consultar de novo")}>↻</button>
      )}
    </div>
  );
}

export default function PainelGastos({ seq = 0 }) {
  const [resumo, setResumo] = useState(null);
  const [secrets, setSecrets] = useState(null);
  const [verTudo, setVerTudo] = useState(false);

  async function recarregar() {
    setResumo(await resumoDeGastos());
    setSecrets(await store.get("secrets"));
  }
  useEffect(() => { recarregar(); }, [seq]);

  if (!resumo) return null;

  const mostrados = verTudo ? resumo.lista : resumo.lista.slice(0, 5);

  return (
    <div className="gastos-card">
      <div className="gc-bloco">
        <div className="gc-titulo">{t("Saldo das suas chaves")}</div>
        {COM_SALDO.map(p => (
          <LinhaSaldo key={p.id} provedor={p}
            temChave={Boolean((secrets?.[p.secretKey] || "").trim())} />
        ))}
        <p className="gc-nota">
          {t("Vem direto da sua conta no provedor. As outras IAs não informam saldo pela chave.")}
        </p>
      </div>

      <div className="gc-bloco">
        <div className="gc-titulo">
          {t("Quanto a IA custou")}
          {resumo.lista.length > 0 && (
            <button className="gc-limpar" onClick={async () => { await limparGastos(); recarregar(); }}>
              {t("zerar")}
            </button>
          )}
        </div>

        {resumo.lista.length === 0 ? (
          <p className="gc-vazio">{t("Assim que você criar um projeto, o custo dele aparece aqui.")}</p>
        ) : (
          <>
            <div className="gc-topo">
              <div className="gc-num">
                <strong>{emReais(resumo.mediaPorProjeto)}</strong>
                <span>{t("média por projeto criado")}</span>
              </div>
              <div className="gc-num">
                <strong>{emReais(resumo.totalUsd)}</strong>
                <span>{t("no total, em {n} pedidos", { n: resumo.lista.length })}</span>
              </div>
            </div>

            <div className="gc-lista">
              {mostrados.map((g, i) => (
                <div className="gc-item" key={i}>
                  <span className={"gc-acao " + g.acao}>{g.acao === "criar" ? t("criou") : t("ajustou")}</span>
                  <span className="gc-nome" title={g.nome}>{g.nome}</span>
                  <span className="gc-tok">{tokensCurto(g.tokens)}</span>
                  <span className="gc-usd">{emReais(g.usd)}</span>
                  <span className="gc-quando">{quando(g.quando)}</span>
                </div>
              ))}
            </div>

            {resumo.lista.length > 5 && (
              <button className="gc-mais" onClick={() => setVerTudo(v => !v)}>
                {verTudo ? t("ver menos") : t("ver todos ({n})", { n: resumo.lista.length })}
              </button>
            )}
          </>
        )}

        <p className="gc-nota">
          {/* Este aviso nao e burocracia: o preco de tabela nem sempre e o
              cobrado, e a primeira fatura que nao batesse com um numero
              apresentado como exato destruiria a confianca no resto. */}
          {t("Estimativa, pelo preço de tabela de cada IA. O que você criou com a nossa IA (plano grátis) não entra: essa conta é nossa, não sua.")}
        </p>
      </div>
    </div>
  );
}
