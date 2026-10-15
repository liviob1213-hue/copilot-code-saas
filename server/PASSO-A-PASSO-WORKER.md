# Worker da Cloudflare — colar o código e seguir daqui

O arquivo a colar é **[`oauth-worker.js`](oauth-worker.js)**, nesta mesma pasta.

---

## ⚠️ Leia isto antes de colar

O Worker que está no ar hoje **não está neste computador** (o `CONECTAR.md`
aponta pra uma pasta `server/` que vive no repositório da extensão). Então o
`oauth-worker.js` é uma **reconstrução**: eu escrevi as rotas do GitHub e do
Supabase a partir do que o app realmente envia pra elas, não a partir do seu
arquivo atual.

Elas estão testadas (34 verificações automáticas passam, incluindo o streaming
das IAs), mas **se o seu Worker atual tiver alguma coisa que eu não sei**, ela
se perde na substituição.

**O caminho sem risco:** antes de apagar, copie o código atual do editor da
Cloudflare e me mande aqui. Eu acrescento só a rota da Vercel e te devolvo o
arquivo inteiro, sem tocar no resto.

Se preferir ir direto com o meu, tudo bem — o **passo 5** testa tudo e mostra na
hora se alguma coisa quebrou.

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

> Enquanto estiver aí, **anote os nomes dos segredos que já existem** (os do
> GitHub e do Supabase). O passo 5 confere se o código novo achou todos.

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

Deve aparecer algo assim:

```json
{ "ok": true,
  "segredos": {
    "github":   { "id": true, "secret": true },
    "supabase": { "id": true, "secret": true },
    "vercel":   { "id": true, "secret": true } } }
```

**Só aparece `true`/`false` — nunca o valor do segredo.**

Se algum vier `false`, o nome da variável na Cloudflare é diferente do esperado.
Duas saídas: renomeie a variável, ou me diga o nome que ela tem que eu acrescento
na lista de apelidos do código.

---

## 4) Conferir o proxy (o teste que já existia)

```
https://copilot-oauth.victor-faridoff.workers.dev/proxy
```

- Apareceu `{"error":"missing_url"}` → **funcionou** ✅
- Apareceu `method_not_allowed` ou 404 → o deploy não pegou, refaça o passo 2.

---

## 5) Conferir que **não quebrou nada**

Esta é a parte importante da substituição. Rode `npm run dev` e, em **Conexões**:

| Teste | O que esperar |
| --- | --- |
| **GitHub** → botão **Entrar** | volta logado, com seu @usuário no card |
| **Supabase** → **Conectar** | volta conectado e lista seus projetos |
| **Vercel** → já tem token colado | o card mostra se enxerga seus repositórios |
| Criar um projeto qualquer | a IA responde — isso prova que o `/proxy` e o streaming estão de pé |

Se qualquer um falhar, volte o código que você guardou no passo 2 e me diga o
que aconteceu.

---

## 6) Me mandar para eu escrever o código do app

- [ ] **Client ID** da integração (`oac_…`)
- [ ] **slug** (o que está em `vercel.com/integrations/<slug>`)
- [ ] `/status` mostrou `vercel: id true, secret true`?
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
| `GET /status` | diz quais segredos ele achou (só `true`/`false`) |
| `ANY /proxy?url=…` | refaz a chamada do lado do servidor e devolve com CORS, porque o navegador bloqueia `api.vercel.com`, `api.supabase.com` e várias IAs |
| `POST /` | troca o `code` por token. O serviço é escolhido pelo corpo: sem `provider` = GitHub, `provider:"supabase"`, `provider:"vercel"` |

Dois detalhes que o código comenta e vale você saber:

- **O `/proxy` repassa o corpo em stream, de propósito.** O `streamComplete()`
  em `src/core/providers.js` lê a resposta da IA aos poucos. Se o Worker
  esperasse a resposta inteira, o texto só apareceria no fim — e um texto longo
  estouraria o limite de memória do Worker.
- **O `/proxy` só aceita uma lista de hosts.** Sem essa lista o endereço vira um
  proxy aberto, e proxy aberto é achado e usado por terceiros, gastando a sua
  cota. A lista é a mesma de `PROXIED_HOSTS` em `src/core/net.js` — se um dia
  adicionar um provedor de IA lá, adicione aqui também.
