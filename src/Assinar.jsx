// ============================================================================
// Assinar.jsx — os convites para assinar, dentro da ferramenta
// ----------------------------------------------------------------------------
// Três momentos, e cada um com um tom diferente de propósito:
//
//   1. ACABOU O LIMITE  -> a pessoa está travada AGORA. Aqui o convite pode
//      ocupar a tela, porque ela não tem o que fazer sem resolver isto.
//
//   2. QUER UMA IA PAGA -> ela escolheu algo que o plano dela não cobre.
//      Mostramos o que ela ganharia, sem bloquear o resto do app.
//
//   3. LEMBRETE DISCRETO -> ela ainda tem saldo. Nunca interrompe: é uma
//      faixa pequena, que some sozinha e não volta no mesmo dia.
//
// O que NÃO fazemos: popup no meio do trabalho de quem ainda pode trabalhar.
// Interromper quem está no meio de um projeto é o jeito mais rápido de a
// pessoa associar a sua marca a incômodo.
// ============================================================================

import React, { useEffect, useState } from "react";
import { t } from "./i18n.js";

export const LINK_MENSAL = "https://pay.kiwify.com.br/5ikalLs";
export const LINK_ANUAL = "https://pay.kiwify.com.br/oPNhBLB";

const GUARDA_FAIXA = "prumo:faixaAssinar";

function Vantagens() {
  const itens = [
    t("IAs pagas liberadas: Claude, GPT, Gemini Pro, DeepSeek"),
    t("Apps e SaaS, não só sites"),
    t("Projetos sem limite de quantidade"),
    t("Suporte por e-mail")
  ];
  return (
    <ul className="assinar-lista">
      {itens.map((x, i) => (
        <li key={i}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
          <span>{x}</span>
        </li>
      ))}
    </ul>
  );
}

function Precos() {
  return (
    <div className="assinar-planos">
      <a className="assinar-plano" href={LINK_MENSAL} target="_blank" rel="noopener noreferrer">
        <span className="ap-nome">{t("Mensal")}</span>
        <span className="ap-preco">R$ 47<small>{t("/mês")}</small></span>
        <span className="ap-obs">{t("cancela quando quiser")}</span>
      </a>
      <a className="assinar-plano destaque" href={LINK_ANUAL} target="_blank" rel="noopener noreferrer">
        <span className="ap-selo">{t("melhor custo")}</span>
        <span className="ap-nome">{t("Anual")}</span>
        <span className="ap-preco">R$ 297<small>{t("/ano")}</small></span>
        <span className="ap-obs">{t("sai a R$ 24,75 por mês")}</span>
      </a>
    </div>
  );
}

/**
 * O convite de tela cheia. Só aparece quando a pessoa está realmente travada,
 * e sempre com uma saída visível — prender alguém numa tela de venda é o jeito
 * mais rápido de perder o cliente e ganhar um pedido de reembolso.
 */
export function ModalAssinar({ aberto, motivo, onFechar }) {
  useEffect(() => {
    if (!aberto) return;
    const esc = (e) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  return (
    <>
      <div className="drawer-scrim" onClick={onFechar} />
      <div className="assinar-modal" role="dialog" aria-modal="true">
        <button className="assinar-x" onClick={onFechar} aria-label={t("Fechar")}>×</button>
        <div className="assinar-topo">
          <img src="/brand/logo.png" alt="" />
          <h2>{motivo || t("Seus sites de hoje acabaram")}</h2>
          <p>{t("No Pro você cria sem limite, com as IAs mais fortes — e continua usando a sua própria chave.")}</p>
        </div>
        <Vantagens />
        <Precos />
        <p className="assinar-rodape">
          {t("Amanhã você ganha um site novo de graça. Se preferir esperar, é só fechar aqui.")}
        </p>
      </div>
    </>
  );
}

/**
 * A faixa discreta. Aparece uma vez por dia, no pé da conversa, e só para quem
 * ainda PODE trabalhar — por isso ela nunca bloqueia nada.
 */
export function FaixaAssinar({ acesso, onAssinar }) {
  const [fechada, setFechada] = useState(true);

  useEffect(() => {
    if (!acesso || acesso.semLogin || acesso.pago) return;
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      setFechada(localStorage.getItem(GUARDA_FAIXA) === hoje);
    } catch { setFechada(false); }
  }, [acesso]);

  if (!acesso || acesso.semLogin || acesso.pago || fechada) return null;

  const fechar = () => {
    setFechada(true);
    try { localStorage.setItem(GUARDA_FAIXA, new Date().toISOString().slice(0, 10)); } catch { /* ignora */ }
  };

  return (
    <div className="assinar-faixa">
      <span className="af-texto">
        {t("Você está no plano grátis.")}{" "}
        <b>{t("No Pro: IAs pagas, apps e sites sem limite.")}</b>
      </span>
      <button className="af-cta" onClick={onAssinar}>{t("Ver planos")}</button>
      <button className="af-x" onClick={fechar} aria-label={t("Agora não")}>×</button>
    </div>
  );
}
