import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
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
      <App oauthResult={oauthResult} oauthError={oauthError} />
    </React.StrictMode>
  );
}

boot();
