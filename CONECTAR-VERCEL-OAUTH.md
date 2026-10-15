# Vercel sem token colado — criar a integração (passo a passo)

**O que isso resolve:** hoje a pessoa precisa ir em `vercel.com/account/tokens`,
criar um token e colar no painel. Com OAuth ela clica em **Conectar**, escolhe a
conta e pronto — igual ao "Entrar com GitHub" que já existe.

**Quem faz o quê:** este arquivo é a parte que **só você pode fazer** (criar a
integração no console da Vercel). O código do app vem depois, e precisa de dois
valores que o console vai te dar: o **Client ID** e o **slug**.

> ⚠️ **O Client Secret NÃO entra no código e não deve ser colado no chat.**
> Ele vive só no Worker da Cloudflare, como variável secreta — exatamente como
> já acontece com o GitHub e o Supabase. Quem tiver esse segredo consegue se
> passar pelo app.

---

## Antes de começar: que tipo de integração criar

A Vercel tem dois tipos, e só um serve aqui:

| Tipo | Serve? | Por quê |
| --- | --- | --- |
| **Native integration** (produto no Marketplace) | ❌ Não | Exige um servidor seu implementando a Marketplace Provider API, planos de cobrança, e a Vercel fatura o cliente. Nada a ver com o nosso caso. |
| **Integração comum / connectable account** | ✅ Sim | É só o OAuth: a pessoa autoriza e o app age na conta dela. É o que queremos. |

Então: **não adicione nenhum "Product"** e **ignore a seção "Marketplace
Integration Settings"** inteira (Base URL, Redirect Login URL, planos de
cobrança). Se o console insistir em algo de produto, você está no fluxo errado.

---

## 1) Abrir o console

1. Entre em **https://vercel.com/dashboard** (logado).
2. Vá no **Integration Console**: https://vercel.com/dashboard/integrations/console
3. Clique em **Create** (ou **Create Integration**).

---

## 2) Preencher o formulário

### Profile — a parte "de vitrine"

Esses campos existem porque um dia a integração pode ser listada no Marketplace.
**Você não vai listar agora**, então preencha o mínimo pra passar. Nada aqui
afeta o funcionamento.

| Campo | O que pôr |
| --- | --- |
| **Integration Name** | `Copilot Code` |
| **URL Slug** | `copilot-code` ⭐ **anote este valor** |
| **Developer** | seu nome |
| **Contact email** | seu e-mail (não fica público) |
| **Support contact email** | seu e-mail (fica público) |
| **Short Description** | `Cria e publica projetos com IA` (máx. 40 caracteres) |
| **Logo** | PNG quadrado, sem transparência, mínimo 256px — dá pra usar `public/brand/logo.png` |
| **Category** | **Dev Tools** |
| **Website / Documentation / Support URL** | pode repetir a mesma URL (o GitHub do projeto serve) |
| **EULA URL / Privacy Policy URL** | só obrigatórios pra listar no Marketplace. Se o formulário exigir, aponte pro README do repositório por enquanto |
| **Overview** | duas linhas dizendo o que o app faz |
| **Feature media** | 1 imagem 1920x1080. Só obrigatório pra listar — se puder pular agora, pule |

> ⭐ O **URL Slug** vira o endereço de instalação:
> `https://vercel.com/integrations/copilot-code/new`
> É pra lá que o app vai mandar a pessoa quando ela clicar em "Conectar".

### External Integration Settings — **a parte que importa de verdade**

#### Redirect URL ⭐
```
http://localhost:5173/
```
- É **http** (não https), minúsculo, **com a barra `/` no final**.
- Tem que ser idêntico ao que o app manda na troca do código — se divergir uma
  barra, a troca falha.
- A Vercel **aceita localhost** aqui (está na documentação dela), então dá pra
  desenvolver e testar antes de ter domínio.
- **Quando o app for pro ar num domínio:** o campo é um só. Aí você cria uma
  **segunda integração** ("Copilot Code (dev)") com o localhost e deixa a
  principal com o domínio — mesma solução que o `CONECTAR.md` sugere pro GitHub.

#### API Scopes ⭐ — marque exatamente isto

Conferi endpoint por endpoint na tabela de escopos da Vercel contra o que o
`src/core/vercel.js` realmente chama. Esta é a lista mínima que faz tudo
funcionar:

| Escopo | Permissão | Por que o app precisa |
| --- | --- | --- |
| **project** | **Read/Write** | criar o projeto (`POST /v9/projects`), achar pelo nome, e desligar a proteção de login pro preview abrir (`PATCH /v9/projects/{id}`) |
| **deployment** | **Read/Write** | disparar a publicação (`POST /v13/deployments`), acompanhar o build e ler o log do erro quando falha |
| **project-env-vars** | **Read/Write** | gravar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nos projetos que o app cria |
| **user** | **Read** | mostrar de quem é a conta conectada |
| **todos os outros** | **None** | não são usados — deixe em None, é menos acesso à conta de quem instalar |

> Por que não `global-project-env-vars`: ele dá acesso às variáveis de **todos**
> os projetos da conta. O `project-env-vars` cobre só os projetos que a própria
> integração criou, que é exatamente o nosso caso. Menos acesso, mesmo resultado.

#### Webhook URL
Deixe **vazio**. O app pergunta o status do build na hora; não precisa receber eventos.

#### Configuration URL
Deixe **vazio**. Sem ela, o botão "Configure" no painel da Vercel vira um link
pro Website, que já basta.

---

## 3) Salvar e anotar

Depois de criar, o console mostra:

- **Client ID** — começa com `oac_…` → **me traga este**
- **Client Secret** → **NÃO me traga.** Vai direto pro Worker (passo 4)
- O **slug** que você escolheu → **me traga este também**

---

## 4) Worker da Cloudflare (pode ser depois)

O Worker precisa de uma rota nova que troca o `code` por um token. Isso tem que
ser no Worker, e não no navegador, por dois motivos: o Client Secret não pode
aparecer no código do site, e a Vercel pede explicitamente que a API dela não
seja chamada direto do navegador.

Dois detalhes que diferenciam da rota do GitHub (dá erro silencioso se passar
batido):

1. O corpo é **`application/x-www-form-urlencoded`**, não JSON.
2. O endereço é `https://api.vercel.com/v2/oauth/access_token` (note o **`v2`**).

A resposta vem assim:
```json
{ "token_type": "Bearer", "access_token": "…",
  "installation_id": "icfg_…", "user_id": "…", "team_id": null }
```

O `team_id` importa: se não for `null`, a integração foi instalada **num time**,
e aí **toda** chamada à API precisa levar `?teamId=…` junto. Isso é mudança no
`vapi()` do `src/core/vercel.js` — eu faço quando for codar.

**Como fazer:** o código do Worker não está nesta máquina (o `CONECTAR.md`
aponta pra um `server/github-oauth-worker.js` que mora no repositório da
extensão). Então, quando chegar a hora: abra
**dash.cloudflare.com → Workers & Pages → `copilot-oauth` → Edit code**, copie o
código atual e me mande — eu acrescento a rota da Vercel sem mexer no resto.

O Client Secret vai como **variável secreta** (Settings → Variables and Secrets →
Add → tipo **Secret**), nunca escrito no código.

---

## 5) O teste que decide se dá pra todo mundo usar

Esta é a **única coisa que eu não consegui confirmar na documentação**, e ela
muda o tamanho do projeto:

> A documentação da Vercel descreve os requisitos pra **listar** a integração no
> Marketplace (logo, galeria, EULA, aprovação). O que ela **não** deixa claro é
> se uma pessoa **de fora** consegue instalar uma integração **ainda não
> aprovada** pelo link `/new`.

Como descobrir em 5 minutos, assim que tiver o slug:

1. Abra `https://vercel.com/integrations/copilot-code/new` **deslogado** ou numa
   aba anônima com **outra conta** da Vercel (serve a de um amigo).
2. **Instalou normalmente?** → dá pra lançar sem aprovação. 🎉
3. **Deu erro, ou pediu aprovação/não encontrou?** → funciona só na sua conta
   por enquanto, e pra liberar pros outros a integração precisa passar pela
   revisão da Vercel (aí os campos de vitrine do passo 2 viram obrigatórios de
   verdade: logo, galeria 1920x1080, EULA e política de privacidade).

**De qualquer jeito vale codar**, porque na sua conta funciona desde já — e se a
aprovação for necessária, o código fica pronto esperando, e o campo de token
colado continua existindo como alternativa pra quem precisar.

---

## Resumo do que me trazer

- [ ] **Client ID** (`oac_…`)
- [ ] **slug** (ex.: `copilot-code`)
- [ ] resultado do **teste do passo 5** (instalou com outra conta? sim/não)
- [ ] (quando der) o **código atual do Worker**, pra eu acrescentar a rota

Com os dois primeiros eu já escrevo o fluxo inteiro no app.
