// ============================================================================
// Tutoriais.jsx — a aba "Tutoriais": os vídeos de uso da ferramenta.
// ----------------------------------------------------------------------------
// A LISTA dos vídeos NÃO está aqui: está em src/core/tutoriais.js, que é um
// arquivo feito pra ser editado à mão (tem instruções em português lá dentro).
// Aqui só desenhamos os cartões e o player.
//
// Duas decisões que valem explicar:
//
//  1) O player do YouTube (o iframe) só é criado DEPOIS do clique. Antes disso
//     o cartão mostra apenas a miniatura, que é uma imagem comum. Assim a aba
//     abre rápido e não carrega cinco players de uma vez.
//
//  2) Vídeo sem código preenchido vira cartão "Em breve": apagado e sem
//     clique. A aba nasce assim em produção (nenhum vídeo gravado ainda) e
//     tem que ficar bonita desse jeito — nunca vazia, nunca quebrada.
// ============================================================================

import React, { useEffect, useState } from "react";
import { TUTORIAIS, porGrupo, temVideo, codigoDoVideo, miniaturaDoVideo } from "./core/tutoriais.js";
import { t } from "./i18n.js";
import "./tutoriais.css";

/* ---------------- ícones (traço fino, mesmo estilo do resto do app) ---------------- */
const svg = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
const IconPlayBox = () => <svg {...svg}><rect x="2.5" y="4" width="19" height="16" rx="3" /><path d="m10 9 5 3-5 3z" /></svg>;
const IconPlay = () => <svg {...svg} width="20" height="20" fill="currentColor" stroke="none"><path d="M8 5.5v13l11-6.5z" /></svg>;
const IconClose = () => <svg {...svg}><path d="M18 6 6 18M6 6l12 12" /></svg>;
const IconClock = () => <svg {...svg} width="22" height="22"><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></svg>;

export default function Tutoriais({ onClose }) {
  // Qual vídeo está tocando agora (null = nenhum). É este estado que faz o
  // iframe existir ou não: sem clique, sem player.
  const [tocando, setTocando] = useState(null);
  const grupos = porGrupo(TUTORIAIS);

  // Esc fecha: primeiro o vídeo, se houver um aberto; senão a aba inteira.
  useEffect(() => {
    function aoTeclar(e) {
      if (e.key !== "Escape") return;
      if (tocando) setTocando(null);
      else onClose?.();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [tocando, onClose]);

  return (
    <div className="tut">
      <header className="tut-head">
        <span className="tut-ico"><IconPlayBox /></span>
        <span className="tut-titles">
          <h1>{t("Tutoriais")}</h1>
          <p>{t("Vídeos curtos mostrando a ferramenta na prática, do zero ao site no ar.")}</p>
        </span>
        <button className="icon-btn" onClick={onClose} title={t("Fechar")} aria-label={t("Fechar")}><IconClose /></button>
      </header>

      <div className="tut-body">
        <div className="tut-wrap">
          {grupos.map(grupo => (
            <section className="tut-grupo" key={grupo.nome}>
              <h2 className="tut-grupo-nome">{t(grupo.nome)}</h2>
              <div className="tut-grid">
                {grupo.videos.map(tut => (
                  <Cartao key={tut.id} tut={tut} onAbrir={() => setTocando(tut)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {tocando && <Player tut={tocando} onClose={() => setTocando(null)} />}
    </div>
  );
}

/* ---------------- um cartão de vídeo ---------------- */
function Cartao({ tut, onAbrir }) {
  const pronto = temVideo(tut);
  const miniatura = miniaturaDoVideo(tut);

  return (
    <button
      className="tut-card"
      onClick={pronto ? onAbrir : undefined}
      disabled={!pronto}
      aria-label={pronto ? t("Assistir: {titulo}", { titulo: t(tut.titulo) }) : `${t(tut.titulo)} — ${t("Em breve")}`}
    >
      <span className="tut-thumb">
        {/* Só uma imagem até a pessoa clicar. O player entra depois, no modal. */}
        {pronto
          ? <><img src={miniatura} alt="" loading="lazy" /><span className="tut-play"><IconPlay /></span></>
          : <span className="tut-vazia"><IconClock /></span>}
        {pronto && tut.duracao ? <span className="tut-dur">{tut.duracao}</span> : null}
      </span>
      <span className="tut-info">
        <strong>{t(tut.titulo)}</strong>
        <span>{t(tut.descricao)}</span>
        <span className="tut-tags">
          {!pronto && <span className="tut-tag">{t("Em breve")}</span>}
          {tut.pro && <span className="tut-tag pro">{t("Plano Pro")}</span>}
        </span>
      </span>
    </button>
  );
}

/* ---------------- o vídeo tocando, dentro do app ---------------- */
function Player({ tut, onClose }) {
  const id = codigoDoVideo(tut);
  return (
    // Clique no fundo escuro fecha; clique dentro do quadro não (o stopPropagation).
    <div className="tut-modal-scrim" onClick={onClose} role="dialog" aria-modal="true" aria-label={t(tut.titulo)}>
      <div className="tut-modal" onClick={e => e.stopPropagation()}>
        <div className="tut-modal-head">
          <strong>{t(tut.titulo)}</strong>
          {tut.pro && <span className="tut-tag pro">{t("Plano Pro")}</span>}
          <button className="icon-btn" onClick={onClose} title={t("Fechar")} aria-label={t("Fechar")}><IconClose /></button>
        </div>
        <div className="tut-player">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
            title={t(tut.titulo)}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
