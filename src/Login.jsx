// ============================================================================
// Login.jsx — entrada do Prumo Code
// ----------------------------------------------------------------------------
// Dois caminhos, o padrao das ferramentas de hoje: botao do Google, ou e-mail
// com codigo de 6 digitos. NAO existe tela de cadastro separada de proposito —
// quem entra pela primeira vez tem a conta criada na hora, igual ao Notion, ao
// Vercel e ao proprio Supabase. Uma tela a menos para a pessoa errar.
// ============================================================================

import React, { useEffect, useRef, useState } from "react";
import { t } from "./i18n.js";
import { entrarComGoogle, enviarCodigo, confirmarCodigo } from "./core/auth.js";

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Login() {
  const [etapa, setEtapa] = useState("email");   // "email" | "codigo"
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState("");    // "google" | "enviar" | "conferir"
  const [reenviarEm, setReenviarEm] = useState(0);
  const campoCodigo = useRef(null);

  // Contagem para reenviar: sem ela a pessoa fica clicando e toma bloqueio do
  // Supabase por excesso de tentativas.
  useEffect(() => {
    if (reenviarEm <= 0) return;
    const id = setTimeout(() => setReenviarEm(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [reenviarEm]);

  useEffect(() => { if (etapa === "codigo") campoCodigo.current?.focus(); }, [etapa]);

  async function comGoogle() {
    setErro(""); setOcupado("google");
    try { await entrarComGoogle(); }       // sai da página; só volta se falhar
    catch (e) { setErro(e.message); setOcupado(""); }
  }

  async function pedirCodigo(ev) {
    ev?.preventDefault();
    const limpo = email.trim();
    if (!EMAIL_OK.test(limpo)) { setErro(t("Digite um e-mail válido.")); return; }
    setErro(""); setOcupado("enviar");
    try {
      await enviarCodigo(limpo);
      setEtapa("codigo");
      setReenviarEm(45);
    } catch (e) { setErro(e.message); }
    finally { setOcupado(""); }
  }

  async function conferir(ev) {
    ev?.preventDefault();
    const n = codigo.replace(/\D/g, "");
    if (n.length < 6) { setErro(t("O código tem 6 números.")); return; }
    setErro(""); setOcupado("conferir");
    try {
      await confirmarCodigo(email, n);
      // Entrou: quem avisa a tela é o onAuthStateChange lá no main.
    } catch (e) { setErro(e.message); setOcupado(""); }
  }

  return (
    <div className="login-tela">
      <div className="login-caixa">
        <div className="login-marca">
          <span className="login-orb"><IconRaio /></span>
          <h1>Prumo Code</h1>
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
            <form onSubmit={pedirCodigo} className="login-form" noValidate>
              <label htmlFor="login-email">{t("Seu e-mail")}</label>
              <input
                id="login-email" className="text" type="email" autoComplete="email"
                placeholder="voce@exemplo.com" value={email} autoFocus
                onChange={e => { setEmail(e.target.value); setErro(""); }}
              />
              <button className="btn primary wide" type="submit" disabled={Boolean(ocupado)}>
                {ocupado === "enviar" ? t("Enviando…") : t("Receber código por e-mail")}
              </button>
            </form>
          </>
        ) : (
          <form onSubmit={conferir} className="login-form">
            <p className="login-enviado">
              {t("Enviei um código de 6 números para")} <b>{email}</b>.
            </p>
            <label htmlFor="login-codigo">{t("Código")}</label>
            <input
              id="login-codigo" ref={campoCodigo} className="text login-codigo"
              inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6}
              value={codigo}
              onChange={e => { setCodigo(e.target.value.replace(/\D/g, "")); setErro(""); }}
            />
            <button className="btn primary wide" type="submit" disabled={Boolean(ocupado)}>
              {ocupado === "conferir" ? t("Conferindo…") : t("Entrar")}
            </button>
            <div className="login-rodape">
              <button type="button" className="login-link" onClick={() => { setEtapa("email"); setCodigo(""); setErro(""); }}>
                {t("Trocar de e-mail")}
              </button>
              <button type="button" className="login-link" disabled={reenviarEm > 0 || Boolean(ocupado)}
                onClick={() => pedirCodigo()}>
                {reenviarEm > 0 ? t("Reenviar em {s}s", { s: reenviarEm }) : t("Reenviar código")}
              </button>
            </div>
            <p className="login-dica">{t("Não chegou? Veja no spam — pode levar um minuto.")}</p>
          </form>
        )}

        {erro && <div className="login-erro">{erro}</div>}
      </div>
    </div>
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

function IconRaio() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}
