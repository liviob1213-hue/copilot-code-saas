# Copilot Code — SaaS (MVP web)

Versão **web** do Copilot Code: criar e editar projetos com IA **fora do Lovable**,
100% com suas próprias chaves (BYOK). Faz parte do ecossistema:

- **SaaS (esta pasta)** → criar/editar projetos fora do Lovable.
- **Extensão (`../`)** → editar dentro do Lovable (e futuras plataformas).
- **App futuro** → gerar sites.

Os três compartilham o **mesmo cérebro** (`core/`). Esta é a decisão central da
arquitetura: a lógica de IA/agente/gerador é escrita uma vez e reusada.

---

## Como rodar

```bash
cd saas
npm install
npm run dev
```

`npm run dev` roda `scripts/sync-core.mjs` automaticamente antes do Vite: ele
copia o core portável da extensão (`../src/core`) para `src/core`. Depois abre em
`http://localhost:5173`.

> **A extensão continua intacta.** O SaaS só *lê* `../src/core`; nunca escreve lá.

---

## Arquitetura: o que é compartilhado x o que é da web

O core tem duas categorias de arquivo:

### 1. Portáveis (copiados verbatim pelo sync-core) — o "cérebro"
`providers.js`, `agent.js`, `tools.js`, `site-generator.js`,
`starter-template.js`, `billing.js`, `vercel.js`, `github.js`, `supabase-mgmt.js`

São livres de `chrome.*` (ou só o tocam dentro das funções de OAuth, que o SaaS
não chama). **Não edite as cópias em `src/core`** — edite na extensão e rode
`npm run sync-core`. Elas estão no `.gitignore`.

### 2. Casca web (versionados nesta pasta) — só o que muda entre extensão e web

| Arquivo | Extensão usa | SaaS usa (aqui) |
|---|---|---|
| `src/core/storage.js` | `chrome.storage.local` | **`localStorage`** (mesma API) |
| `src/core/config.js` | constantes | cópia local (só constantes; mantenha em sync) |
| `src/core/net.js` | *(host_permissions fura CORS)* | **proxy via Worker** p/ Vercel/Supabase-Mgmt |
| `src/core/oauth-web.js` | `chrome.identity` | **redirect na própria página** |
| `src/core/runtime.js` | service-worker + ports | **orquestração in-page** |

O truque: como `storage.js` da web expõe **exatamente a mesma API** do da
extensão, todos os arquivos portáveis (`providers.js` etc.) funcionam sem
alteração — eles importam `./storage.js` e recebem a versão web.

---

## O CORS e o Worker (o único "backend")

Numa página web o navegador bloqueia chamadas a `api.vercel.com` e
`api.supabase.com` (não mandam cabeçalhos CORS). A extensão não sofria isso por
causa do `host_permissions`.

Solução: `core/net.js` faz um *monkey-patch* no `fetch` que, **só** para esses
hosts, reescreve a chamada para passar pelo Worker (rota `/proxy`), que responde
com CORS `*`. Tudo o mais (GitHub, a maioria das IAs) continua indo direto.

- Worker: `../server/github-oauth-worker.js` (o mesmo do OAuth; adicionei a rota
  `/proxy` com **allowlist** de Vercel/Supabase).
- **Redeploy necessário** depois dessa mudança:
  ```bash
  # de dentro de server/ (ou como você já publica o Worker)
  npx wrangler deploy
  ```
- Se alguma IA der erro de CORS no console, adicione o host dela em
  `PROXIED_HOSTS` (`net.js`) **e** em `PROXY_ALLOW` (worker), e redeploy.

> O token BYOK vai no cabeçalho `Authorization` através do *seu* Worker, nunca na
> URL. É "backend-lite": o Worker só repassa; não guarda nada.

---

## OAuth na web (diferente da extensão)

A extensão volta em `https://<id>.chromiumapp.org/`. A web volta na **origem do
app**. Você precisa registrar essa origem como callback:

- **GitHub OAuth App** → *Authorization callback URL* = a origem do app
  (`http://localhost:5173/` em dev, `https://seudominio/` em prod).
  Como um OAuth App tem uma callback só, para dev+prod use um OAuth App por
  ambiente (ou um App só de web) e ajuste `GITHUB_OAUTH.clientId` em `config.js`.
- **Supabase OAuth App** → *Redirect URI* = a mesma origem. Usa PKCE.

O `client_secret` continua **só no Worker**. `clientId`/`workerUrl` são os mesmos
de `config.js`.

---

## Escopo do MVP (nesta versão do esqueleto)

Pronto e funcional:
- **Criar projeto**: descreve → IA gera (revezamento de provedores) → commit num
  repo novo no GitHub → deploy na Vercel → preview no iframe.
- Conexões: GitHub (OAuth web ou token), Supabase (OAuth PKCE), Vercel (token).
- Chaves de IA (BYOK) no drawer de Configurações, salvas no `localStorage`.

Próximos passos (não incluídos ainda):
- **Editar** projeto existente (loop do `agent.js` + leitura da árvore do repo):
  o core já suporta; falta a UI de chat de edição + escolha do projeto.
- Lista de projetos (`runtime.listarProjetos()` já existe) numa tela.
- Auth/contas, domínio, cobrança — depois do MVP, como você planejou.

---

## Rumo ao monorepo (quando quiser)

O `sync-core.mjs` é a ponte enquanto isso. O passo definitivo do ecossistema é
extrair `core/` para `packages/core` e ter `apps/extension`, `apps/saas` e o
futuro `apps/generator` importando o mesmo pacote. Aí some a cópia e o
`storage`/`oauth`/`net` viram *adapters* injetados por cada app.
