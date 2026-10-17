import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Login from "./Login.jsx";
import { authConfigurada, sessaoAtual, aoMudarSessao } from "./core/auth.js";
import "./styles.css";

import * as store from "./core/storage.js";
import { installProxy } from "./core/net.js";
import { GITHUB_OAUTH, PROVIDER_CATALOG } from "./core/config.js";
import { handleOAuthRedirect } from "./core/oauth-web.js";

// Modelos impróprios pra gerar CÓDIGO (visão/experimentais): travam a geração.
const MODELO_RUIM = m => /vision|experimental|preview|(^|[-_])exp([-_]|$)|-exp\b/i.test(m || "");

// Boot: instala o proxy de CORS, garante os defaults no localStorage e trata um
// eventual retorno de OAuth (?code=...) ANTES de montar a UI.
async function boot() {
  installProxy(GITHUB_OAUTH.workerUrl);
  await store.ensureDefaults();

  // Conserta escolhas antigas: modelo base de visão/experimental -> modelo de
  // código padrão do provedor (a visão é acionada sozinha quando há imagem).
  try {
    const provs = await store.get("providers");
    let mudou = false;
    for (const p of provs) {
      const meta = PROVIDER_CATALOG.find(x => x.id === p.id);
      if (meta && MODELO_RUIM(p.model)) { p.model = meta.defaultModel; mudou = true; }
    }
    if (mudou) await store.set("providers", provs);
  } catch { /* nao bloqueia o boot */ }

  let oauthResult = null, oauthError = null;
  try {
    oauthResult = await handleOAuthRedirect();
  } catch (e) {
    oauthError = e.message || String(e);
  }

  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <Portao oauthResult={oauthResult} oauthError={oauthError} />
    </React.StrictMode>
  );
}

/**
 * Decide entre a tela de entrada e o app.
 *
 * REGRA IMPORTANTE: sem Supabase de contas configurado (as variaveis
 * VITE_SUPABASE_APP_URL / VITE_SUPABASE_APP_ANON_KEY), o app roda exatamente
 * como antes, sem pedir login. Assim nada quebra enquanto a configuracao nao
 * estiver pronta — e, se um dia as variaveis sumirem, ninguem fica trancado
 * para fora.
 */
function Portao(props) {
  const exigeLogin = authConfigurada();
  const [sessao, setSessao] = useState(null);
  const [pronto, setPronto] = useState(!exigeLogin);

  useEffect(() => {
    if (!exigeLogin) return;
    let vivo = true;
    sessaoAtual().then(s => { if (vivo) { setSessao(s); setPronto(true); } })
      .catch(() => { if (vivo) setPronto(true); });
    const parar = aoMudarSessao(s => { if (vivo) { setSessao(s); setPronto(true); } });
    return () => { vivo = false; parar(); };
  }, [exigeLogin]);

  if (!exigeLogin) return <App {...props} />;
  // Enquanto a sessao e lida: nada na tela. Mostrar o login por uma fracao de
  // segundo e depois trocar para o app daria um "piscar" feio em quem ja esta
  // logado — e a leitura e instantanea (fica no proprio navegador).
  if (!pronto) return null;
  if (!sessao) return <Login />;
  return <App {...props} sessao={sessao} />;
}

boot();
