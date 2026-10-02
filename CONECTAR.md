# Conectar o SaaS — passo a passo (bem explicado)

Três coisas pra fazer uma vez. Depois disso, o "Entrar com GitHub/Supabase" e a
publicação na Vercel funcionam. Tempo total: ~5 minutos.

> **Atalho pra testar HOJE sem OAuth:** no SaaS, clique em **Conexões** → no
> GitHub clique em **Token** e cole um token pessoal. Funciona na hora, sem mexer
> em painel nenhum. Aí você só precisa dos passos do GitHub (item 1) quando quiser
> o botão "Entrar com GitHub" bonito. O da Vercel (item 3) é obrigatório de
> qualquer jeito pra publicar.

---

## 1) GitHub — cadastrar o endereço de volta (callback)

**Por quê:** quando você clica "Entrar com GitHub", o GitHub precisa saber pra
qual endereço mandar você de volta. Hoje esse endereço cadastrado é o da
extensão; falta o do SaaS (`http://localhost:5173/`).

1. Entre em **https://github.com** (logado na sua conta).
2. Clique na sua **foto de perfil** (canto superior direito) → **Settings**.
3. No menu da esquerda, **role até o fim** → clique em **Developer settings**.
4. Clique em **OAuth Apps** (é essa, **não** é "GitHub Apps").
5. Clique no seu app na lista (o do Copilot — o Client ID começa com
   `Ov23liBToovJjfxTGpmJ`).
6. Ache a seção **Redirect URIs** (plural — este app aceita até 10 endereços).
   No canto direito dela, clique em **Add redirect URI**.
7. No **campo novo e vazio** que aparecer, digite exatamente:
   ```
   http://localhost:5173/
   ```
   > Atenção: é **http** (não https), minúsculo, **com a barra `/` no final**.
8. **NÃO apague** o endereço da extensão que já está lá
   (`…chromiumapp.org/`). Os dois convivem.
9. Desça até o fim e clique no botão verde **Update application**.

Não marque "Allow wildcard matching" nem "Enable Device Flow" — não são usados.

Pronto. A extensão continua funcionando (o endereço dela ficou) e o SaaS passa a
ser aceito também.

> **Quando tiver domínio (produção):** um OAuth App do GitHub só aceita **um**
> callback. Então, quando o SaaS for pro ar num domínio, o ideal é criar um
> **OAuth App separado só pro site** (com a callback do domínio) e trocar o
> `clientId` em `saas/src/core/config.js`. Por enquanto, localhost basta.

---

## 2) Supabase — adicionar o endereço de volta (redirect URI)

**Por quê:** mesma ideia do GitHub. O bom é que o Supabase aceita **vários**
endereços, então dá pra adicionar o do SaaS sem tirar nenhum.

1. Entre em **https://supabase.com/dashboard** (logado).
2. No canto superior esquerdo, selecione a sua **organização** (não um projeto).
3. Vá em **Organization settings** (engrenagem) → procure **OAuth Apps**
   (em algumas contas aparece como **Apps** ou **Published integrations**).
4. Abra o app OAuth que você criou (Client ID começa com `8436c2fb`).
5. Procure a seção **Redirect URIs** (ou "URLs de redirecionamento").
6. Clique em **Add URL / Adicionar** e coloque:
   ```
   http://localhost:5173/
   ```
   (com a barra no final). **Salve**.

> Se você não achar "OAuth Apps" no menu: é porque essa seção fica no nível da
> **organização**, não do projeto. Confirme que clicou no nome da organização
> antes de entrar em Settings.

---

## 3) Vercel — republicar o Worker (resolve o CORS)

**Importante:** aqui **não** tem erro de callback — a Vercel usa **token colado**.
O que precisa é o Worker no ar com a rota nova `/proxy`, senão o navegador
bloqueia as chamadas à Vercel (CORS). É rápido, pelo painel:

1. Entre em **https://dash.cloudflare.com** (logado).
2. Menu da esquerda → **Workers & Pages**.
3. Clique no worker **`copilot-oauth`**.
4. Clique em **Edit code** (ou o ícone `< >`).
5. **Apague todo o código** (Ctrl+A, Delete).
6. Abra o arquivo `server/github-oauth-worker.js` no seu PC, copie **tudo**
   (Ctrl+A, Ctrl+C) e **cole** no editor do Cloudflare (Ctrl+V).
7. Clique em **Deploy** (canto superior direito).
8. **Teste:** abra no navegador
   `https://copilot-oauth.victor-faridoff.workers.dev/proxy`
   - Apareceu `{"error":"missing_url"}` → **funcionou** ✅
   - Apareceu `method_not_allowed` ou 404 → o deploy não pegou, refaça o passo 4.

Depois é só colar o **token da Vercel** no painel Conexões
(pegue em https://vercel.com/account/tokens).

O guia completo do Cloudflare (com a opção por terminal também) está em
[server/CLOUDFLARE-PASSO-A-PASSO.md](../server/CLOUDFLARE-PASSO-A-PASSO.md).

---

## Depois de fazer os 3 — como conectar no SaaS

1. `cd saas && npm run dev` → abre em `http://localhost:5173`.
2. Clique em **Conexões** (canto superior direito).
3. **GitHub:** clique em **Entrar** (ou **Token**).
4. **Supabase:** clique em **Conectar** (opcional — só se for usar banco).
5. **Vercel:** cole o token no campo.
6. Feche. Descreva um projeto no chat e clique em **Criar**.

Ordem mínima pra criar um projeto: **1 chave de IA** (comece pela grátis:
NVIDIA ou Gemini) + **GitHub** + **Vercel**.
