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
import { PLANOS, LINKS_KIWIFY, linkDoPlano, planoMaisBaratoCom } from "./core/planos.js";

export const LINK_MENSAL = LINKS_KIWIFY.premium;
export const LINK_ANUAL = LINKS_KIWIFY.anual;

const GUARDA_FAIXA = "prumo:faixaAssinar";

const Cheque = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
);

/** O que vale em QUALQUER plano pago — o que os tres niveis tem em comum. */
function Vantagens() {
  const itens = [
    t("Projetos sem limite de quantidade"),
    t("Apps e SaaS, não só sites"),
    t("As IAs gratuitas continuam inclusas"),
    t("Suporte por e-mail")
  ];
  return (
    <ul className="assinar-lista">
      {itens.map((x, i) => (
        <li key={i}><Cheque /><span>{x}</span></li>
      ))}
    </ul>
  );
}

/** O que cada nivel libera de IA paga, em uma linha. */
const O_QUE_LIBERA = {
  basico: () => t("DeepSeek"),
  pro: () => t("Claude e xAI Grok"),
  premium: () => t("todas as IAs pagas"),
  anual: () => t("todas as IAs pagas")
};

/**
 * Os tres niveis mensais, lado a lado, mais o anual embaixo.
 *
 * `destaque` e o plano que fica em evidencia. Quando o convite nasce de uma IA
 * especifica ("quero a DeepSeek"), ele aponta o plano MAIS BARATO que libera
 * aquela IA — oferecer o de R$ 47 para quem so quer a DeepSeek e a forma mais
 * rapida de ouvir "caro demais" e perder a venda inteira.
 */
function Precos({ destaque = "premium" }) {
  const mensais = [PLANOS.basico, PLANOS.pro, PLANOS.premium];
  return (
    <>
      <div className="assinar-planos tres">
        {mensais.map(p => (
          <a key={p.id}
             className={"assinar-plano" + (destaque === p.id ? " destaque" : "")}
             href={linkDoPlano(p.id)} target="_blank" rel="noopener noreferrer">
            {destaque === p.id && <span className="ap-selo">{t("para você")}</span>}
            <span className="ap-nome">{t(p.nome)}</span>
            <span className="ap-preco">R$ {p.preco}<small>{t("/mês")}</small></span>
            <span className="ap-obs">{O_QUE_LIBERA[p.id]()}</span>
          </a>
        ))}
      </div>
      <a className="assinar-anual" href={linkDoPlano("anual")} target="_blank" rel="noopener noreferrer">
        <span className="aa-nome">{t("Premium anual")} <b>R$ 297</b></span>
        <span className="aa-obs">{t("sai a R$ 24,75 por mês, e vem com o Prumo Edit de bônus")}</span>
      </a>
    </>
  );
}

/**
 * O convite que aparece DENTRO do campo de cada IA paga que o plano da pessoa
 * nao cobre (tela de Chaves de IA).
 *
 * Ele diz o preco do plano certo para AQUELA IA. O campo da chave continua ali
 * embaixo, funcionando: quem ja tem a chave pode colar hoje e ligar quando
 * assinar, em vez de ter que voltar aqui depois.
 */
export function CardAssinarProvedor({ provedor, onAssinar = () => {} }) {
  const plano = planoMaisBaratoCom(provedor.id);
  return (
    <div className="ia-tranca">
      <div className="it-txt">
        <strong>{t("{ia} faz parte do plano {plano}", { ia: provedor.label, plano: t(plano.nome) })}</strong>
        <span>{t("R$ {preco} por mês. A chave continua sendo sua — o plano é o que libera o uso dela aqui.", { preco: plano.preco })}</span>
      </div>
      <button className="it-cta" onClick={() => onAssinar(
        t("Para usar o {ia} aqui", { ia: provedor.label }),
        plano.id
      )}>{t("Assinar o {plano}", { plano: t(plano.nome) })}</button>
    </div>
  );
}

/**
 * O convite de tela cheia. Só aparece quando a pessoa está realmente travada,
 * e sempre com uma saída visível — prender alguém numa tela de venda é o jeito
 * mais rápido de perder o cliente e ganhar um pedido de reembolso.
 */
export function ModalAssinar({ aberto, motivo, destaque = "premium", onFechar }) {
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
      {/* A CAMADA e quem centraliza, com flex. Antes o proprio painel se
          centralizava por translate(-50%,-50%) -- e a animacao de entrada
          (@keyframes rise) termina em "transform: none", apagando justamente
          esse translate. O painel ficava com o canto no meio da tela e a base
          pra fora. Com flex, a animacao pode mexer no transform a vontade. */}
      <div className="assinar-camada" onClick={onFechar}>
      <div className="assinar-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="assinar-x" onClick={onFechar} aria-label={t("Fechar")}>×</button>
        <div className="assinar-topo">
          <img src="/brand/logo.png" alt="" />
          <h2>{motivo || t("Seus sites de hoje acabaram")}</h2>
          <p>{t("Escolha o plano pela IA que você quer usar. Em todos eles você cria sem limite e continua usando a sua própria chave.")}</p>
        </div>
        <Vantagens />
        <Precos destaque={destaque} />
        <p className="assinar-rodape">
          {t("Amanhã você ganha um site novo de graça. Se preferir esperar, é só fechar aqui.")}
        </p>
      </div>
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
        <b>{t("A partir de R$ 24,97: IAs pagas, apps e sites sem limite.")}</b>
      </span>
      <button className="af-cta" onClick={onAssinar}>{t("Ver planos")}</button>
      <button className="af-x" onClick={fechar} aria-label={t("Agora não")}>×</button>
    </div>
  );
}

/**
 * O cartão fixo na barra lateral, naquele espaço que ficava vazio.
 *
 * Para quem JÁ É PRO ele não vende nada — só diz o plano. Continuar
 * oferecendo o que a pessoa acabou de comprar é a forma mais rápida de fazer
 * um cliente bom se sentir tratado como alvo.
 */
export function CartaoPlano({ acesso, onAssinar }) {
  if (!acesso || acesso.semLogin || !acesso.carregado) return null;

  if (acesso.pago) {
    return (
      <div className="plano-card pago">
        <span className="pc-selo"><IconCheque /></span>
        <div className="pc-txt">
          <strong>{t("Plano {plano}", { plano: t(acesso.planoNome || "Premium") })}</strong>
          <span>{t("sites e apps sem limite")}</span>
        </div>
      </div>
    );
  }

  const hoje = acesso.casaRestantesHoje || 0;
  const proprios = acesso.propriosRestantes || 0;
  const total = hoje + proprios;

  return (
    <div className="plano-card">
      <div className="pc-topo">
        <strong>{t("Plano grátis")}</strong>
        <span className={"pc-saldo" + (total === 0 ? " zerado" : "")}>
          {total === 0
            ? t("sem sites")
            : t(total === 1 ? "{n} site" : "{n} sites", { n: total })}
        </span>
      </div>
      <p className="pc-linha">
        {total === 0
          ? t("Amanhã você ganha outro. Ou assine e crie agora, sem limite.")
          : t("A partir de R$ 24,97: IAs pagas, apps e sites sem limite.")}
      </p>
      <button className="pc-cta" onClick={onAssinar}>{t("Ver planos")}</button>
    </div>
  );
}

const IconCheque = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
