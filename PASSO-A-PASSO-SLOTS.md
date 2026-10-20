# Plano grátis por slots — passo a passo

São **5 passos**. Faça na ordem: o Passo 3 depende do 2, e o 2 depende do 1.

> **Nada quebra enquanto você não terminar.** Até o Passo 4, o app continua
> funcionando como hoje: quem tem chave de IA própria cria normalmente, e quem
> não tem continua sendo avisado pra colar uma chave. Nenhum usuário atual perde
> nada (todos estão no plano `anual`).

---

## O que você vai ter no fim

Duas moedas diferentes dentro do plano grátis. Elas **não se misturam** — e essa
é a ideia toda:

| Moeda | De onde vem | Pra que serve |
| --- | --- | --- |
| **Site do dia** | todo mundo ganha **1 por dia**, renova sozinho | criar usando **a SUA chave de IA** (a "chave da casa"), sem a pessoa precisar de chave nenhuma |
| **Sites próprios** | **+2 por convite** que entra pelo link e cria um site | criar usando **a chave da própria pessoa** (só as 4 gratuitas) |

E o plano pago: **slots à vontade** + libera as **IAs pagas** (Claude, DeepSeek,
xAI). No grátis, só as quatro gratuitas (Gemini, OpenRouter, Groq, Mistral).

**Por que o convite dá slots da chave DELA, e não da sua:** porque as suas
chaves são compartilhadas por todos os usuários. Se convidar 5 amigos dobrasse o
consumo das suas chaves, o limite por minuto do Gemini estouraria e **todo mundo
ficaria na mão**. Dando slots da chave dela, convidar sai de graça pra você.

---

## Passo 1 — Criar as funções no Supabase

1. Abra o Supabase **das contas** (o projeto `ndyfmrtwsfnzioyyfdlm`):
   👉 https://supabase.com/dashboard/project/ndyfmrtwsfnzioyyfdlm/sql/new
2. Abra o arquivo **`supabase/slots.sql`** deste projeto e copie **tudo**.
3. Cole na caixa do Supabase e clique em **Run**.

> Se der erro dizendo que a tabela `cotas` ou `perfis` não existe, é porque o
> `supabase/contas.sql` ainda não foi rodado. Rode ele primeiro (é o Passo 1 do
> `PASSO-A-PASSO-PLANOS.md`) e volte aqui.

**No fim ele mostra duas tabelinhas.** A primeira são as regras do plano:

```json
{ "slots_casa_por_dia": 1, "chamadas_casa_por_dia": 60, "slots_por_convite": 2, ... }
```

A segunda é a lista de pessoas com o saldo de cada uma. Pode rodar de novo
quantas vezes quiser — nada é apagado.

---

## Passo 2 — Pegar as 4 chaves de IA gratuitas (as suas)

São as chaves que o app vai emprestar pra quem acabou de entrar. **Todas de
graça, sem cartão.** Crie com uma conta sua e guarde num bloco de notas:

| Serviço | Onde pegar |
| --- | --- |
| **Gemini** (o mais importante — contexto enorme) | https://aistudio.google.com/apikey |
| **OpenRouter** | https://openrouter.ai/keys |
| **Groq** | https://console.groq.com/keys |
| **Mistral** | https://console.mistral.ai |

> **Dica que vale ouro:** você pode colocar **mais de uma chave de cada
> serviço**, separadas por vírgula. Se a primeira estourar o limite do minuto, o
> app tenta a segunda sozinho. Exemplo de valor:
> `AIzaSy_chave1, AIzaSy_chave2`
>
> Comece com uma de cada. Quando começar a aparecer "limite" pros usuários, crie
> uma segunda conta Google e acrescente a chave na mesma variável.

---

## Passo 3 — As variáveis (são 5, em dois lugares)

### 3a) Na Vercel — **1 variável**

Vercel → projeto **copilot-code-saas** → **Settings** → **Environment
Variables** → **Add**.

| Nome | Valor | Tipo |
| --- | --- | --- |
| `PASSE_IA_SEGREDO` | uma senha longa que **você inventa** (30+ caracteres, qualquer coisa) | Secret |

Pra inventar a senha, você pode rodar isto no terminal (ou só digitar uma frase
longa e sem sentido — serve igual):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Copie esse valor e guarde**, porque ele vai aparecer de novo no passo 3b.
Marque as três caixas (Production, Preview, Development).

> ⚠️ **Não começa com `VITE_`, e isso é de propósito.** Tudo que começa com
> `VITE_` é empacotado dentro do site e qualquer visitante consegue ler.

### 3b) No Cloudflare — **4 chaves + o mesmo segredo**

Cloudflare → **Workers & Pages** → worker **`copilot-oauth`** → **Settings** →
**Variables and Secrets** → **Add**. Tipo **Secret** em todas.

| Nome | Valor |
| --- | --- |
| `PASSE_IA_SEGREDO` | **exatamente o mesmo valor** do passo 3a |
| `IA_CASA_GEMINI_KEY` | sua chave do Gemini |
| `IA_CASA_OPENROUTER_KEY` | sua chave do OpenRouter |
| `IA_CASA_GROQ_KEY` | sua chave do Groq |
| `IA_CASA_MISTRAL_KEY` | sua chave do Mistral |

Clique em **Deploy / Save**.

### Por que as chaves ficam no Cloudflare e o segredo nos dois

Esta é a única parte "estranha" do desenho, e tem um motivo prático:

- **A Vercel decide se a pessoa pode.** É lá que mora a chave do banco, que lê o
  plano e conta os slots. Essa decisão leva meio segundo — cabe numa função da
  Vercel.
- **O Cloudflare espera a IA trabalhar.** Escrever um site inteiro leva
  **minutos**, e função de servidor tem prazo curto pra responder. O Worker
  aguenta e vai repassando a resposta em tempo real. Por isso as chaves de IA
  moram lá.
- **O `PASSE_IA_SEGREDO` é o que liga os dois.** A Vercel assina um bilhete
  ("esse usuário pode usar a chave do Groq pelos próximos 2 minutos") e o Worker
  confere a assinatura antes de emprestar a chave. Se os dois valores não forem
  **idênticos**, o Worker recusa tudo — é o erro nº 1 desse passo.

Suas chaves de IA **nunca** chegam ao navegador de ninguém.

---

## Passo 4 — Publicar as duas pontas

### Na Vercel

**Deployments** → no último, menu `…` → **Redeploy** → **desmarque** "Use
existing Build Cache" → **Redeploy**.

> Sem o redeploy, a função continua rodando com os valores antigos. Variável
> nova na Vercel só vale depois de publicar de novo.

### No Cloudflare

1. Worker `copilot-oauth` → **Edit code** (ícone `< >`).
2. **Antes de apagar:** `Ctrl+A`, `Ctrl+C` e guarde o código atual num bloco de
   notas. É o seu ponto de retorno.
3. `Ctrl+A`, `Delete`. Abra `server/oauth-worker.js` deste projeto, copie tudo e
   cole lá.
4. **Deploy.**

> O código novo **só acrescenta** a rota `/casa`. O `/proxy`, o login do GitHub,
> do Supabase e da Vercel não foram tocados — e `server/oauth-worker.test.mjs`
> (60 verificações) prova isso sem precisar de internet:
> ```bash
> node server/oauth-worker.test.mjs
> ```

---

## Passo 5 — Conferir se ficou de pé

### a) A Vercel enxerga as variáveis e o banco?

Abra: **https://copilot-code-saas.vercel.app/api/diagnostico**

Procure por estas duas linhas:

```json
"PASSE_IA_SEGREDO": "chegou",
"funcoes_de_slot": "ok"
```

- `PASSE_IA_SEGREDO: FALTANDO` → a variável não foi salva ou falta o redeploy.
- `funcoes_de_slot: FALTANDO…` → o Passo 1 não rodou. Rode `supabase/slots.sql`.

### b) O Worker enxerga as chaves?

Abra: **https://copilot-oauth.victor-faridoff.workers.dev/status**

Deve aparecer:

```json
{
  "segredos": {
    "github": true, "supabase": true, "vercel": true,
    "passe_ia": true,
    "ia_da_casa": { "gemini": 1, "openrouter": 1, "groq": 1, "mistral": 1 }
  }
}
```

Os números são **quantas chaves** de cada serviço chegaram — nunca o valor
delas. Se algum vier `0`, aquela variável não foi salva ou está com nome errado.

**Se `github`, `supabase` ou `vercel` virarem `false`, pare**: alguma variável
antiga sumiu e o login vai quebrar. Volte o código do Passo 4.

### c) O teste de verdade: criar um site sem chave nenhuma

1. Abra o app numa **janela anônima** e entre com um e-mail que ainda não tem
   conta (ou um `seuemail+teste1@gmail.com`).
2. Conecte o **GitHub** (isso continua obrigatório — é onde o código é salvo).
3. **Não cole chave de IA nenhuma.**
4. Peça um site: *"site para uma barbearia no centro de SP"*.

**O que tem que acontecer:** a IA trabalha e o site aparece na prévia. No painel
**Conexões**, embaixo da sua conta, aparece:

```
Seus sites
Hoje, com a nossa IA: 0 de 1     renova todo dia, sem precisar de chave
Com a sua chave: 0 de 0          ganhe 2 por convite
```

5. Peça **outro** site na mesma conta. Agora ele responde:

> *Seu site de hoje com a nossa IA já foi usado — amanhã você ganha outro. Para
> criar agora, convide alguém: cada pessoa que entrar pelo seu link e criar um
> site te dá 2 sites.*

### d) O teste do convite

1. Nessa conta de teste, copie o **link de convite** (Conexões → Convide e ganhe
   sites).
2. Abra o link em **outra janela anônima** e crie uma **terceira** conta.
3. Com ela, crie um site.
4. Volte na conta de teste e recarregue: **"Com a sua chave: 2 de 2"**.

É esse o momento em que o prêmio é pago — e não no cadastro, de propósito: senão
bastava criar 50 contas com o próprio link pra colher 100 slots.

---

## Como mudar os números depois

**Num lugar só.** Abra `supabase/slots.sql`, ache a função
`public.limites_dos_slots()` (logo no começo), mude o número, e rode o arquivo
inteiro de novo no SQL Editor.

```sql
'slots_casa_por_dia',          1,    -- sites por dia com a SUA chave
'chamadas_casa_por_dia',      60,    -- teto de chamadas de IA por dia
'slots_proprios_base',         0,    -- sites com a chave da pessoa, sem convidar
'slots_por_convite',           2,    -- quanto vale cada convite
'teto_slots_convite',         10,    -- máximo que dá pra juntar convidando
'slots_casa_por_dia_pago',    20,    -- idem, pra quem paga
'chamadas_casa_por_dia_pago', 600,
```

Não precisa mexer em código nem publicar nada: o app e o servidor leem daqui. É
por isso que o número não está repetido em dois lugares — repetido, um dia um
muda e o outro não, e a pessoa vê "1 site disponível" e toma "acabaram seus
sites".

**O mais importante de entender:** `chamadas_casa_por_dia` é o número que
**realmente** segura o gasto. Um site gasta de 5 a 15 chamadas, então 60 por dia
dá folga pra criar um site e ajustá-lo bastante. O "1 site por dia" é contado
quando o app avisa que um projeto saiu — vale pra quem usa o app normalmente,
mas quem souber mexer no navegador contorna. Quem não contorna é o teto de
chamadas, porque ele é contado no banco, no servidor, antes de a chave ser
emprestada. Se um dia quiser apertar o torniquete, é esse número que você mexe.

---

## O caminho de uma chamada, em uma tela

```
    A pessoa pede um site
            │
            ▼
   o app vê que ela não tem chave própria
            │
            ▼
   POST /api/passe-ia            (Vercel)
      · confere o plano no Supabase
      · conta a chamada do dia
      · devolve um bilhete assinado, válido por 2 min
            │
            ▼
   POST <worker>/casa            (Cloudflare)
      · confere a assinatura do bilhete
      · pega a SUA chave (IA_CASA_*)
      · chama a IA e repassa a resposta ao vivo
            │
            ▼
   o site aparece na prévia
            │
            ▼
   POST /api/projeto-criado      (Vercel)
      · desconta o slot do dia
      · paga +2 slots pra quem convidou essa pessoa
```

| Arquivo | O que faz |
| --- | --- |
| `supabase/slots.sql` | as regras, os contadores e o saldo. **A fonte da verdade.** |
| `api/passe-ia.js` | decide se pode e emite o bilhete |
| `api/projeto-criado.js` | desconta o slot e paga o convite |
| `server/oauth-worker.js` | rota `/casa`: guarda suas chaves e fala com a IA |
| `src/core/casa.js` | o lado do app: pede o bilhete e desvia a chamada |
| `src/core/plano.js` | lê o saldo e decide o que mostrar/bloquear |
| `src/core/providers.js` | o revezamento de IAs, agora ciente do plano |
