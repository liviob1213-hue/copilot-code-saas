# Ligar o login do Prumo Code — passo a passo

A tela de entrada já está pronta e publicada. **Enquanto você não fizer os passos
abaixo, o app continua funcionando como sempre, sem pedir login.** Ele só passa a
pedir depois do Passo 5.

Leia na ordem. São 5 passos e leva uns 20 minutos.

Guarde num bloco de notas os dois valores que o Passo 1 vai te dar — você vai
precisar deles no Passo 5.

---

## Passo 1 — Criar o banco de contas no Supabase

Aqui nasce o lugar onde ficam as contas de quem entra no seu app.

> Isto é **separado** do Supabase que você conecta dentro do app para os projetos
> que a IA cria. São duas coisas diferentes e não se misturam. Se você já tem um
> Supabase para projetos, **crie outro** para as contas.

1. Entre em **https://supabase.com** e faça login.
2. Clique em **New project**.
3. Preencha:
   - **Name:** `copilot-code-contas`
   - **Database Password:** clique em **Generate a password** e **copie num bloco
     de notas**. Você não vai usar agora, mas sem ela não dá para recuperar o
     banco depois.
   - **Region:** escolha **South America (São Paulo)**.
4. Clique em **Create new project** e espere uns 2 minutos.
5. Quando terminar, no menu da esquerda clique na engrenagem **Project Settings**
   → **API**. Copie e guarde estes dois valores:
   - **Project URL** — algo como `https://abcdefgh.supabase.co`
   - **anon public** (em *Project API keys*) — um texto bem comprido

> **Esses dois valores podem aparecer no navegador sem problema.** Eles são
> públicos por natureza; a proteção de verdade fica nas regras do Supabase. Não
> confunda com a chave **service_role**, que fica logo abaixo na mesma tela —
> **essa nunca deve sair do servidor**. Não vamos usá-la.

---

## Passo 2 — Fazer o Supabase mandar CÓDIGO, não link

Por padrão o Supabase manda um link de "clique aqui para entrar". Nosso app pede
um **código de 6 números**, então precisamos trocar o texto do e-mail.

**Se você pular este passo, o campo de código não vai funcionar.**

1. No menu da esquerda: **Authentication** → **Emails**.
2. Escolha o modelo **Magic Link**.
3. Apague todo o conteúdo e cole isto no lugar:

```html
<h2>Seu código de acesso</h2>
<p>Use este código para entrar no Prumo Code:</p>
<p style="font-size:30px;letter-spacing:8px;font-weight:bold">{{ .Token }}</p>
<p>O código vale por 1 hora. Se não foi você que pediu, pode ignorar este e-mail.</p>
```

4. Clique em **Save**.

> A parte que importa é o `{{ .Token }}` — é ele que vira o código de 6 números.

---

## Passo 3 — Dizer ao Supabase para onde voltar

Depois de entrar, a pessoa precisa voltar para o seu app. Sem este passo o login
funciona mas joga a pessoa na página errada.

1. Menu da esquerda: **Authentication** → **URL Configuration**.
2. Em **Site URL**, coloque:
   ```
   https://copilot-code-saas.vercel.app
   ```
3. Em **Redirect URLs**, clique em **Add URL** e adicione as duas, uma de cada vez:
   ```
   https://copilot-code-saas.vercel.app
   http://localhost:5173
   ```
   (a segunda é só para testes na sua máquina)
4. **Save**.

---

## Passo 4 — Ligar o botão do Google

Este é o passo mais longo, porque envolve o Google. Faça com calma.

### 4a. Pegar o endereço de retorno no Supabase

1. Menu: **Authentication** → **Providers** → clique em **Google**.
2. Ligue a chavinha **Enable Sign in with Google**.
3. Aparecerá um campo **Callback URL (for OAuth)** com um endereço terminado em
   `/auth/v1/callback`. **Copie esse endereço** — é o Passo 4c.
4. **Deixe esta aba aberta.**

### 4b. Criar o acesso no Google

1. Em outra aba, entre em **https://console.cloud.google.com**.
2. No topo, clique no seletor de projeto → **New Project** → nome
   `copilot-code` → **Create**. Espere e selecione esse projeto.
3. Menu (☰) → **APIs & Services** → **OAuth consent screen**:
   - **User Type:** **External** → **Create**
   - **App name:** `Prumo Code`
   - **User support email:** seu e-mail
   - **Developer contact:** seu e-mail
   - **Save and Continue** até o fim, e depois **Back to Dashboard**
   - Se aparecer o botão **Publish app**, clique nele e confirme. Sem isso só
     e-mails que você cadastrar como testadores conseguem entrar.

### 4c. Gerar as credenciais

1. Menu → **APIs & Services** → **Credentials**.
2. **+ Create Credentials** → **OAuth client ID**.
3. **Application type:** **Web application**. Nome: `Prumo Code Web`.
4. Em **Authorized redirect URIs** → **+ ADD URI** → cole aqui **o endereço que
   você copiou no Passo 4a** (o que termina em `/auth/v1/callback`).
5. **Create**. O Google mostra **Client ID** e **Client Secret** — copie os dois.

### 4d. Colar no Supabase

1. Volte à aba do Supabase (Authentication → Providers → Google).
2. Cole o **Client ID** e o **Client Secret** nos campos correspondentes.
3. **Save**.

---

## Passo 5 — Ligar no app (é aqui que o login passa a valer)

> **⚠️ O nome PRECISA começar com `VITE_` — não tire isso.** Essa palavra não é
> enfeite: a ferramenta que monta o app (Vite) só deixa o navegador enxergar as
> variáveis cujo nome começa com `VITE_`. Se você tirar o `VITE_`, o app não
> consegue ler o valor, acha que o login não está ligado e **não mostra a tela de
> entrada**. Se a Vercel reclamar de alguma coisa, me mande o print — mas o nome
> tem que ser exatamente este.

1. Entre em **https://vercel.com** e abra o projeto **copilot-code-saas**.
2. **Settings** → **Environment Variables**.
3. Adicione a primeira:
   - **Key:** `VITE_SUPABASE_APP_URL`
   - **Value:** a *Project URL* do Passo 1
   - Marque **Production**, **Preview** e **Development**
   - **Save**
4. Adicione a segunda do mesmo jeito:
   - **Key:** `VITE_SUPABASE_APP_ANON_KEY`
   - **Value:** a chave *anon public* do Passo 1
   - Marque as três caixas → **Save**
5. Vá na aba **Deployments**, clique nos três pontinhos do deploy mais recente e
   escolha **Redeploy**. **Na janelinha que abrir, DESMARQUE a caixinha "Use
   existing Build Cache"** e então confirme.

> **Atenção 1:** variável de ambiente só vale depois de republicar. Se você só
> salvar e não clicar em Redeploy, nada muda.
>
> **Atenção 2:** desmarque mesmo o **"Use existing Build Cache"**. Marcada, a
> Vercel reaproveita o app antigo (de antes das variáveis) e a tela de login
> **não aparece**, mesmo com tudo certo. Os valores do Supabase são gravados
> dentro do app no momento da construção — por isso ele precisa ser construído
> de novo, do zero, com as variáveis já salvas.

---

## Testar

Espere o deploy terminar (uns 40 segundos) e abra
**https://copilot-code-saas.vercel.app** numa **janela anônima**.

Deve aparecer a tela de entrada. Teste os dois caminhos:

1. **Continuar com o Google** → escolhe a conta → volta já dentro do app.
2. **Digite seu e-mail** → **Receber código** → abre o e-mail → digita os 6
   números → entra.

Para sair: ícone de **Conexões** na barra lateral → bloco **Sua conta** →
**Sair**.

---

## Se der errado

| O que aparece | O que fazer |
|---|---|
| Chegou um **link** no e-mail em vez de código | Passo 2 não foi salvo. Confira se o modelo tem `{{ .Token }}`. |
| **"Esse jeito de entrar ainda não foi ligado no Supabase"** | Passo 4: a chavinha do Google não está ligada. |
| Google abre uma página com **"No API key found in request"** | O Google foi ligado no Supabase **errado** (o dos projetos). Ligue no projeto das CONTAS. Confira também que o endereço de retorno no Google Cloud é o `/auth/v1/callback` **desse** projeto. |
| **"O endereço de retorno não está liberado"** | Passo 3: falta a URL em *Redirect URLs*. |
| Depois do Google cai numa página em branco | Passo 3: a *Site URL* está diferente do endereço real do app. |
| O app **não pede login** | Passo 5: os nomes têm que começar com `VITE_` (sem isso o app não lê), as variáveis não foram salvas, ou faltou o **Redeploy**. |
| **"Muitas tentativas seguidas"** | Limite do Supabase. Espere 1 minuto. |
| O e-mail não chega | Veja o spam. O envio grátis do Supabase é limitado (poucos por hora) — para uso real, configure um serviço de e-mail em *Authentication → Emails → SMTP Settings*. |

---

## Duas coisas que você deve saber

**Não existe tela de cadastro separada — e isso é de propósito.** Quem entra pela
primeira vez tem a conta criada na hora, igual ao Notion, ao Vercel e ao próprio
Supabase. Uma tela a menos para a pessoa errar. Se você quiser mesmo uma tela de
"criar conta" separada, me peça que eu faço.

**O login protege a tela, não as chaves de IA.** As chaves que você cola em
"Chaves de IA" continuam guardadas no navegador de cada pessoa, como hoje. Se o
objetivo for cada usuário ter a própria conta com os próprios projetos salvos no
servidor, isso é um passo seguinte — me avise que eu monto.
