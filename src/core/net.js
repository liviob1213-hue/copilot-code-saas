// ============================================================================
// net.js — camada de rede da versao WEB (resolve o CORS)
// ----------------------------------------------------------------------------
// Na extensao, o host_permissions do manifest fura o CORS: qualquer fetch para
// api.vercel.com / api.supabase.com funciona direto. Numa pagina web isso NAO
// existe — o navegador bloqueia essas chamadas (nao mandam os cabecalhos CORS).
//
// Solucao sem tocar no core: um "monkey-patch" no window.fetch que, para os
// hosts que o navegador bloqueia, reescreve a chamada para passar pelo Worker
// (que responde com CORS *). Todo o resto continua indo direto (GitHub, IAs que
// permitem browser). Assim os modulos copiados (vercel.js, supabase-mgmt.js)
// rodam SEM ALTERACAO — eles chamam fetch normal e nem sabem do proxy.
//
// Chame installProxy() UMA vez, no boot (main.jsx), antes de usar o core.
// ============================================================================

// Hosts que o navegador bloqueia por CORS e precisam passar pelo Worker.
// Adicione aqui qualquer provedor de IA que devolver erro de CORS no console
// (ex.: /api\.openai\.com/). GitHub (api.github.com) NAO precisa — tem CORS.
const PROXIED_HOSTS = [
  /(^|\.)api\.vercel\.com$/i,
  /(^|\.)api\.supabase\.com$/i,
  // IAs que bloqueiam CORS no navegador. Gemini (chave na URL) e Anthropic
  // (cabecalho direct-browser-access) funcionam direto, entao ficam de fora.
  /(^|\.)api\.deepseek\.com$/i,
  /(^|\.)api\.mistral\.ai$/i,
  /(^|\.)api\.groq\.com$/i,
  /(^|\.)openrouter\.ai$/i,
  /(^|\.)api\.x\.ai$/i
];

let installed = false;

export function installProxy(workerUrl) {
  if (installed) return;
  if (!workerUrl) {
    console.warn("[net] sem workerUrl: chamadas a Vercel/Supabase-Mgmt vao falhar por CORS.");
    return;
  }
  const proxyBase = workerUrl.replace(/\/+$/, "") + "/proxy?url=";
  const original = window.fetch.bind(window);

  window.fetch = (input, init) => {
    let url;
    try {
      url = typeof input === "string" ? input : (input && input.url) || "";
      const host = new URL(url, window.location.href).host;
      if (PROXIED_HOSTS.some(re => re.test(host))) {
        // O token vai no HEADER (Authorization), nunca na URL — o Worker so
        // recebe o destino no parametro ?url= e repassa os cabecalhos.
        return original(proxyBase + encodeURIComponent(url), init);
      }
    } catch { /* URL relativa/estranha: deixa passar direto */ }
    return original(input, init);
  };

  installed = true;
}
