// ============================================================================
// TrocarImagem.jsx — a janela de "trocar esta foto", sem IA no meio
// ----------------------------------------------------------------------------
// Abre quando a pessoa clica numa imagem dentro da previa. Duas saidas:
// escolher um arquivo do computador, ou colar um endereco de imagem.
//
// O QUE ELA NUNCA FAZ: dizer que trocou sem ter trocado. Se o endereco nao for
// encontrado no codigo, a janela mostra isso em portugues e nao fecha — foi
// justamente o "pronto, troquei" sem troca nenhuma que motivou esta tela.
// ============================================================================

import React, { useEffect, useRef, useState } from "react";
import { t } from "./i18n.js";
import { ondeApareceA, recusaDaFoto, lerComoDataUrl, LIMITE_FOTO_MB } from "./core/trocar-imagem.js";

/** Encurta um endereco para caber numa linha, sem esconder o que importa. */
function curto(endereco) {
  const s = String(endereco || "");
  if (s.startsWith("data:")) return t("imagem que você enviou");
  if (s.length <= 52) return s;
  return s.slice(0, 30) + "…" + s.slice(-18);
}

export default function TrocarImagem({ alvo, files, publicado = false, onTrocar, onFechar }) {
  const [url, setUrl] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const campo = useRef(null);

  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);

  if (!alvo) return null;

  const lugares = ondeApareceA(files, alvo.src);
  const vezes = lugares.reduce((n, l) => n + l.vezes, 0);

  async function aplicar(novo) {
    setErro("");
    setOcupado(true);
    try {
      const r = onTrocar(alvo.src, novo);
      if (!r || !r.trocas) {
        // Nao achou. Dizer isso e o ponto principal desta tela.
        setErro(t("Não encontrei esse endereço no código do projeto, então não troquei nada. Peça a troca pelo chat que eu resolvo."));
        return;
      }
      onFechar();
    } catch (e) {
      setErro(e.message || t("Não consegui trocar a imagem."));
    } finally {
      setOcupado(false);
    }
  }

  async function doComputador(e) {
    const arquivo = e.target.files && e.target.files[0];
    e.target.value = "";                       // deixa escolher o mesmo de novo
    const recusa = recusaDaFoto(arquivo);
    if (recusa) { setErro(recusa); return; }
    setErro("");
    setOcupado(true);
    try {
      const dataUrl = await lerComoDataUrl(arquivo);
      await aplicar(dataUrl);
    } catch (err) {
      setErro(err.message || t("Não consegui ler essa imagem."));
      setOcupado(false);
    }
  }

  function doEndereco() {
    const v = url.trim();
    if (!v) { setErro(t("Cole o endereço da imagem.")); return; }
    if (!/^https?:\/\//i.test(v)) {
      setErro(t("O endereço precisa começar com http:// ou https://."));
      return;
    }
    aplicar(v);
  }

  return (
    <>
      <div className="drawer-scrim" onClick={onFechar} />
      <div className="assinar-camada" onClick={onFechar}>
        <div className="troca-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <button className="assinar-x" onClick={onFechar} aria-label={t("Fechar")}>×</button>

          <h2>{t("Trocar esta imagem")}</h2>
          <p className="troca-sub">
            {alvo.pedido
              ? t("Aqui deveria estar: {o_que}.", { o_que: alvo.pedido })
              : alvo.alt
                ? t("A imagem descrita como “{alt}”.", { alt: alvo.alt })
                : t("A imagem em que você clicou.")}
          </p>

          <div className="troca-atual">
            <img src={alvo.src} alt="" />
            <div className="ta-info">
              <span className="ta-end">{curto(alvo.src)}</span>
              <span className="ta-onde">
                {vezes === 0
                  ? t("não encontrei este endereço no código")
                  : vezes === 1
                    ? t("aparece em 1 lugar do projeto")
                    : t("aparece em {n} lugares do projeto", { n: vezes })}
              </span>
            </div>
          </div>

          <label className={"troca-btn principal" + (ocupado ? " off" : "")}>
            <input type="file" accept="image/*" onChange={doComputador} disabled={ocupado} hidden />
            {ocupado ? t("Trocando…") : t("Escolher do meu computador")}
          </label>
          <p className="troca-dica">{t("JPG, PNG, WEBP ou GIF, até {n} MB.", { n: LIMITE_FOTO_MB })}</p>

          <div className="troca-ou"><span>{t("ou")}</span></div>

          <div className="troca-url">
            <input ref={campo} className="text" placeholder="https://..." value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doEndereco(); }} disabled={ocupado} />
            <button className="btn sm" onClick={doEndereco} disabled={ocupado}>{t("Usar")}</button>
          </div>

          {erro && <p className="troca-erro">{erro}</p>}

          <p className="troca-rodape">
            {publicado
              ? t("A troca aparece aqui na hora. O site no ar só muda quando você clicar em “Salvar e publicar”.")
              : t("A troca vale na prévia na hora. Ela entra no site publicado quando você publicar.")}
          </p>
        </div>
      </div>
    </>
  );
}
