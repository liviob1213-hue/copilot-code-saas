# Worker da Cloudflare — colar o código e seguir daqui

O arquivo a colar é **[`oauth-worker.js`](oauth-worker.js)**, nesta mesma pasta.

**Ele é o seu Worker atual, com a rota da Vercel acrescentada.** Nada do que já
funcionava foi tocado: a comparação linha a linha com o código que estava no ar
dá **zero linhas removidas ou alteradas** — só blocos novos, marcados com
`// NOVO`.

O que foi acrescentado:

| O quê | Pra quê |
| --- | --- |
| `trocaVercel()` + `provider === "vercel"` | a troca do `code` por token da Vercel |
| `GET /status` | diagnóstico: diz quais segredos o Worker achou. **Pode apagar** — nada do app depende dele |

---

## 1) Criar os dois segredos novos

1. Entre em **https://dash.cloudflare.com** → **Workers & Pages** → **`copilot-oauth`**.
2. Aba **Settings** → **Variables and Secrets** → **Add**.
3. Adicione os dois, tipo **Secret** (não "Text" — Secret some da tela depois de
   salvo, que é o que você quer pra uma senha):

   | Nome | Valor |
   | --- | --- |
   | `VERCEL_CLIENT_ID` | o Client ID da integração (`oac_…`) |
   | `VERCEL_CLIENT_SECRET` | o Client Secret da integração |

4. **Deploy / Save.**

> Se errar e criar como `VERCEL_OAUTH_CLIENT_ID` / `VERCEL_OAUTH_CLIENT_SECRET`,
> funciona também — o código aceita as duas formas. Isso existe porque a
> nomenclatura do seu Worker já vinha misturada: o GitHub usa
> `GITHUB_CLIENT_ID`, mas o Supabase usa `SUPABASE_OAUTH_CLIENT_ID`.

---

## 2) Colar o código

1. Ainda no worker `copilot-oauth`, clique em **Edit code** (ícone `< >`).
2. **Antes de apagar:** `Ctrl+A`, `Ctrl+C` e guarde o código atual num bloco de
   notas. É o seu ponto de retorno se algo der errado.
3. Agora sim: `Ctrl+A`, `Delete`.
4. Abra `server/oauth-worker.js`, copie tudo (`Ctrl+A`, `Ctrl+C`) e cole no
   editor da Cloudflare.
5. **Deploy**.

---

## 3) Conferir se os segredos foram encontrados

Abra no navegador:

```
https://copilot-oauth.victor-faridoff.workers.dev/status
```

Deve aparecer:

```json
{ "ok": true, "segredos": { "github": true, "supabase": true, "vercel": true } }
```

**Só aparece `true`/`false` — nunca o valor do segredo.**

Se `vercel` vier `false`, o segredo não foi salvo ou está com outro nome.
Se `github` ou `supabase` vierem `false`, **pare**: alguma variável sumiu, e o
login vai quebrar. Volte o código do passo 2 e me chame.

---

## 4) Conferir o proxy (o teste que já existia)

```
https://copilot-oauth.victor-faridoff.workers.dev/proxy
```

- Apareceu `{"error":"missing_url"}` → **funcionou** ✅
- Apareceu `method_not_allowed` ou 404 → o deploy não pegou, refaça o passo 2.

---

## 5) Conferir que **não quebrou nada**

Rode `npm run dev` e, em **Conexões**:

| Teste | O que esperar |
| --- | --- |
| **GitHub** → botão **Entrar** | volta logado, com seu @usuário no card |
| **Supabase** → **Conectar** | volta conectado e lista seus projetos |
| **Vercel** → token já colado | o card mostra se enxerga seus repositórios |
| Criar um projeto qualquer | a IA responde — isso prova que o `/proxy` e o streaming estão de pé |

> Os mesmos pontos já são verificados automaticamente, sem rede, por
> `server/oauth-worker.test.mjs` (39 verificações). Pra rodar:
> ```bash
> node server/oauth-worker.test.mjs
> ```
> Mas o teste usa `fetch` falso: ele prova a **lógica**, não que os seus
> segredos estão certos na Cloudflare. Por isso o passo 5 continua valendo.

---

## 6) Me mandar para eu escrever o código do app

- [ ] **Client ID** da integração (`oac_…`)
- [ ] **slug** (o que está em `vercel.com/integrations/<slug>`)
- [ ] `/status` mostrou `vercel: true`?
- [ ] O teste do passo 5 passou?
- [ ] Deu certo instalar a integração com **outra conta** da Vercel?
      (abra `https://vercel.com/integrations/<slug>/new` numa aba anônima)

Com isso eu escrevo a parte do app: `VERCEL_OAUTH` no `config.js`, o
`startVercelLoginWeb()` e o retorno no `oauth-web.js`, o botão **Conectar** no
card da Vercel, e o `teamId` no `vapi()` do `src/core/vercel.js` — porque se a
integração for instalada num time, toda chamada à API precisa levá-lo junto.

---

## O que o Worker faz, em uma tela

| Rota | Pra quê |
| --- | --- |
| `GET /status` | diz quais segredos ele achou (só `true`/`false`) — **novo** |
| `ANY /proxy?url=…` | refaz a chamada do lado do servidor e devolve com CORS, porque o navegador bloqueia `api.vercel.com`, `api.supabase.com` e várias IAs |
| `POST /` | troca o `code` por token. O serviço vem do corpo: sem `provider` = GitHub, `provider:"supabase"`, `provider:"vercel"` (**novo**) |

Três coisas que vale você saber sobre esse código:

- **O `/proxy` repassa o corpo em stream.** O `streamComplete()` em
  `src/core/providers.js` lê a resposta da IA aos poucos. Se o Worker esperasse
  a resposta inteira, o texto só apareceria no fim.
- **O `/proxy` só aceita a lista `PROXY_ALLOW`.** Sem ela o endereço seria um
  proxy aberto. A lista espelha `PROXIED_HOSTS` em `src/core/net.js` — se um dia
  adicionar um provedor de IA lá, adicione aqui também.
- **A troca da Vercel não é igual à do GitHub.** O endereço tem `/v2/` e o corpo
  é form-urlencoded, enquanto o do GitHub aqui é JSON. Copiar um pro outro
  quebra silenciosamente.
