// ============================================================================
// sync-core.mjs — sincroniza o "cerebro" da extensao para o SaaS
// ----------------------------------------------------------------------------
// O ecossistema (extensao + SaaS + futuro app) compartilha a MESMA logica de
// core. Enquanto nao viramos um monorepo de verdade (packages/core), este
// script copia os arquivos PORTAVEIS de ../src/core para ./src/core, garantindo
// zero drift: qualquer melhoria no agente/gerador da extensao vale para o SaaS.
//
// Roda automaticamente antes de `npm run dev` e `npm run build`.
//
// PRESERVA (nunca sobrescreve) os arquivos que sao especificos da web:
//   storage.js   -> adaptador localStorage (em vez de chrome.storage)
//   config.js    -> copia local (mantida em sincronia manual; e so constantes)
//   net.js       -> proxy de CORS via Worker
//   oauth-web.js -> login por redirect (em vez de chrome.identity)
// ============================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "..", "src", "core");   // core da extensao
const DEST = join(here, "..", "src", "core");         // core do SaaS

// Arquivos copiados VERBATIM (sao livres de chrome, ou so tocam chrome em
// funcoes de OAuth que o SaaS nao chama — usa oauth-web.js no lugar).
const PORTABLE = [
  "providers.js",
  "agent.js",
  "tools.js",
  "site-generator.js",
  "starter-template.js",
  "billing.js",
  "vercel.js",
  "github.js",         // chrome so em startOAuthLogin (nao chamado no SaaS)
  "supabase-mgmt.js",  // idem
  "history.js"         // historico compartilhado (usa store, livre de chrome)
];

// Nunca sobrescrever: sao a "casca web".
const WEB_OWNED = new Set(["storage.js", "config.js", "net.js", "oauth-web.js"]);

// App STANDALONE: o core próprio já vive em src/core. Este script é só um
// utilitário OPCIONAL pra puxar melhorias da extensão quando ela estiver ao
// lado (em ../). Sem a extensão, não há o que sincronizar — sai sem erro.
if (!existsSync(SRC)) {
  console.log(`[sync-core] extensão não encontrada em ${SRC} — app standalone, nada a sincronizar.`);
  process.exit(0);
}
if (!existsSync(DEST)) mkdirSync(DEST, { recursive: true });

const banner = "// [gerado por sync-core.mjs] copia de ../../src/core — NAO edite aqui.\n" +
               "// Edite na extensao (src/core) e rode `npm run sync-core`.\n";

let copiados = 0;
for (const nome of PORTABLE) {
  if (WEB_OWNED.has(nome)) continue;
  const de = join(SRC, nome);
  if (!existsSync(de)) { console.warn(`[sync-core] pulando (nao existe): ${nome}`); continue; }
  const conteudo = readFileSync(de, "utf8");
  writeFileSync(join(DEST, nome), banner + conteudo, "utf8");
  copiados++;
}

console.log(`[sync-core] ${copiados} arquivos de core sincronizados. Web-owned preservados: ${[...WEB_OWNED].join(", ")}`);
