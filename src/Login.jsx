// ============================================================================
// Login.jsx — entrada do Prumo Code
// ----------------------------------------------------------------------------
// Dois caminhos, o padrao das ferramentas de hoje: botao do Google, ou e-mail
// com link de confirmacao. NAO existe tela de cadastro separada de proposito —
// quem entra pela primeira vez tem a conta criada na hora, igual ao Notion, ao
// Vercel e ao proprio Supabase. Uma tela a menos para a pessoa errar.
//
// POR QUE LINK, E NAO CODIGO DE 6 NUMEROS
// Quem decide o que vai no e-mail e o MODELO do Supabase, nao o nosso codigo:
// o modelo padrao manda um link de confirmacao. A tela antes pedia um codigo
// de 6 numeros que nunca chegava — a pessoa ficava parada diante de um campo
// impossivel de preencher, achando que o e-mail tinha falhado.
// Agora a tela fala a mesma lingua do e-mail que realmente chega.
// ============================================================================

import React, { useEffect, useState } from "react";
import { t } from "./i18n.js";
import { entrarComGoogle, enviarEmailDeEntrada } from "./core/auth.js";
import { VERSAO } from "./core/config.js";

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** O endereco do webmail, para o botao "Abrir meu e-mail" levar direto. */
const WEBMAIL = {
  "gmail.com": "https://mail.google.com",
  "googlemail.com": "https://mail.google.com",
  "outlook.com": "https://outlook.live.com",
  "hotmail.com": "https://outlook.live.com",
  "live.com": "https://outlook.live.com",
  "msn.com": "https://outlook.live.com",
  "yahoo.com": "https://mail.yahoo.com",
  "yahoo.com.br": "https://mail.yahoo.com",
  "icloud.com": "https://www.icloud.com/mail",
  "me.com": "https://www.icloud.com/mail",
  "uol.com.br": "https://email.uol.com.br",
  "bol.com.br": "https://email.bol.uol.com.br",
  "terra.com.br": "https://mail.terra.com.br"
};

function linkDoWebmail(email) {
  const dominio = String(email).split("@")[1] || "";
  return WEBMAIL[dominio.toLowerCase()] || "";
}

export default function Login() {
  const [etapa, setEtapa] = useState("email");   // "email" | "enviado"
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState("");    // "google" | "enviar"
  const [reenviarEm, setReenviarEm] = useState(0);

  // Contagem para reenviar: sem ela a pessoa fica clicando e toma bloqueio do
  // Supabase por excesso de tentativas.
  useEffect(() => {
    if (reenviarEm <= 0) return;
    const id = setTimeout(() => setReenviarEm(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [reenviarEm]);

  async function comGoogle() {
    setErro(""); setOcupado("google");
    try { await entrarComGoogle(); }       // sai da página; só volta se falhar
    catch (e) { setErro(e.message); setOcupado(""); }
  }

  async function enviar(ev) {
    ev?.preventDefault();
    const limpo = email.trim();
    if (!EMAIL_OK.test(limpo)) { setErro(t("Digite um e-mail válido.")); return; }
    setErro(""); setOcupado("enviar");
    try {
      await enviarEmailDeEntrada(limpo);
      setEtapa("enviado");
      setReenviarEm(45);
    } catch (e) { setErro(e.message); }
    finally { setOcupado(""); }
  }

  return (
    <div className="login-tela">
      <div className="login-caixa">
        <div className="login-marca">
          <span className="login-orb"><img src="/brand/logo.png" alt="" /></span>
          <h1>Prumo Code <span className="login-versao">{VERSAO}</span></h1>
          <p>{t("Crie sites, apps e SaaS conversando com a IA.")}</p>
        </div>

        {etapa === "email" ? (
          <>
            <button className="login-google" onClick={comGoogle} disabled={Boolean(ocupado)}>
              <IconGoogle />
              <span>{ocupado === "google" ? t("Abrindo o Google…") : t("Continuar com o Google")}</span>
            </button>

            <div className="login-ou"><span>{t("ou")}</span></div>

            {/* noValidate: sem isso o proprio navegador barra o envio e mostra o aviso
                    dele, em ingles, antes da nossa mensagem em portugues aparecer. */}
            <form onSubmit={enviar} className="login-form" noValidate>
              <label htmlFor="login-email">{t("Seu e-mail")}</label>
              <input
                id="login-email" className="text" type="email" autoComplete="email"
                placeholder="voce@exemplo.com" value={email} autoFocus
                onChange={e => { setEmail(e.target.value); setErro(""); }}
              />
              <button className="btn primary wide" type="submit" disabled={Boolean(ocupado)}>
                {ocupado === "enviar" ? t("Enviando…") : t("Entrar com e-mail")}
              </button>
              <p className="login-dica">{t("Você recebe um e-mail de confirmação e entra clicando no link.")}</p>
            </form>
          </>
        ) : (
          /* Nada para preencher aqui de propósito: a ação da pessoa é no
             e-mail dela, não nesta tela. Um campo vazio no meio do caminho
             faria ela procurar o que digitar em vez de ir ver a caixa. */
          <div className="login-form">
            <div className="login-enviado-ok">
              <IconEnvelope />
              <strong>{t("Confira seu e-mail")}</strong>
              <p>
                {t("Enviamos um e-mail de confirmação para")} <b>{email}</b>.{" "}
                {t("Abra a mensagem e clique no link para entrar — não há código para digitar.")}
              </p>
            </div>

            {linkDoWebmail(email) && (
              <a className="btn primary wide" href={linkDoWebmail(email)} target="_blank" rel="noopener noreferrer">
                {t("Abrir meu e-mail")}
              </a>
            )}

            <div className="login-rodape">
              <button type="button" className="login-link" onClick={() => { setEtapa("email"); setErro(""); }}>
                {t("Trocar de e-mail")}
              </button>
              <button type="button" className="login-link" disabled={reenviarEm > 0 || Boolean(ocupado)}
                onClick={() => enviar()}>
                {reenviarEm > 0 ? t("Reenviar em {s}s", { s: reenviarEm }) : t("Reenviar e-mail")}
              </button>
            </div>
            <p className="login-dica">{t("Não chegou? Veja no spam ou na aba de promoções — pode levar um minuto.")}</p>
          </div>
        )}

        {erro && <div className="login-erro">{erro}</div>}
      </div>
    </div>
  );
}

function IconEnvelope() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="m3 7 8.1 5.8a1.6 1.6 0 0 0 1.8 0L21 7" />
    </svg>
  );
}

function IconGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.0 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.0 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.8-2 13.3-5.2l-6.2-5.2C29.1 35.1 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.2 5.6l6.2 5.2C36.9 40.2 44 35 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}

