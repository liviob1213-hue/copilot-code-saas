# Ligar os planos e o pagamento — passo a passo

São 4 passos. Faça na ordem, porque o Passo 2 depende do 1.

> **Nada quebra enquanto você não terminar.** Até o Passo 3, o app continua
> funcionando como hoje, sem travar ninguém.

---

## Passo 1 — Criar as tabelas no Supabase

1. Abra o Supabase **das contas** (o projeto `ndyfmrtwsfnzioyyfdlm`):
   👉 https://supabase.com/dashboard/project/ndyfmrtwsfnzioyyfdlm/sql/new
2. Abra o arquivo **`supabase/contas.sql`** deste projeto, copie **tudo**.
3. Cole na caixa do Supabase e clique em **Run**.
4. No final ele mostra uma tabelinha com os usuários e o plano de cada um.

**Confira isso:** todo mundo que já estava no banco tem que aparecer com
`plano = anual` e `vence = nao vence`. É o pessoal que você liberou na mão —
eles não podem perder nada. O próprio SQL já faz isso.

Pode rodar de novo quantas vezes quiser; nada é apagado.

---

## Passo 2 — As 6 variáveis na Vercel

Vercel → projeto **copilot-code-saas** → **Settings** → **Environment Variables**.

> ⚠️ **Nenhuma delas começa com `VITE_`. E isso é de propósito.** Tudo que
> começa com `VITE_` fica **visível para qualquer pessoa** que abrir o site.
> Essas aqui são segredos de verdade: se vazarem, alguém se dá o plano anual
> sozinho ou gasta a sua conta de IA.

| Nome | O que colar |
|---|---|
| `SUPABASE_URL` | O mesmo valor que já está em `VITE_SUPABASE_APP_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → **`service_role`** (a de baixo, secreta) |
| `KIWIFY_WEBHOOK_SECRET` | O token que a Kiwify mostra quando você cria o webhook (Passo 3) |
| `ADMIN_EMAILS` | **O seu e-mail.** É quem pode liberar acesso. Vários: separe por vírgula |
| `KIWIFY_PRODUTO_MENSAL` | O ID do produto mensal na Kiwify *(opcional, mas recomendo)* |
| `KIWIFY_PRODUTO_ANUAL` | O ID do produto anual na Kiwify *(opcional, mas recomendo)* |

Marque **Production, Preview e Development** em todas.

> Os dois últimos são opcionais: sem eles o sistema tenta adivinhar se a compra
> foi mensal ou anual. Funciona, mas é chute. **Com os IDs, é exato** — e na
> dúvida ele dá o plano *menor*, nunca o maior (melhor corrigir na mão do que
> dar um ano pra quem comprou um mês).
>
> O ID do produto aparece na Kiwify, na URL quando você abre o produto.

Depois de salvar: **Deployments → Redeploy → desmarque "Use existing Build
Cache"**.

---

## Passo 3 — Ligar o webhook da Kiwify

Na Kiwify: **Apps** → **Webhooks** → **Criar webhook**.

- **URL:**
  ```
  https://copilot-code-saas.vercel.app/api/kiwify
  ```
- **Eventos:** marque todos os de compra e assinatura — principalmente
  *Compra aprovada*, *Reembolso*, *Chargeback*, *Assinatura cancelada* e
  *Assinatura atrasada*.
- Ao salvar, a Kiwify mostra um **token/segredo**. É ele que vai em
  `KIWIFY_WEBHOOK_SECRET` no Passo 2.

**O que acontece sozinho a partir daqui:**

| Evento | O que o sistema faz |
|---|---|
| Alguém compra | Vira plano mensal ou anual na hora |
| Pediu reembolso / chargeback | Volta pro grátis |
| Cancelou ou atrasou a assinatura | Volta pro grátis |
| **Comprou antes de ter conta** | Fica guardado. No dia que ela se cadastrar com aquele e-mail, já entra paga |

Aquele último caso é o que mais dá dor de cabeça nesse tipo de integração, e
já está resolvido.

---

## Passo 4 — Sua página de liberar acesso

Pronta em:

```
https://copilot-code-saas.vercel.app/acesso-anual
```

Você entra com a sua conta, digita o e-mail da pessoa, escolhe o plano e
pronto. Serve para liberar de cortesia, consertar pagamento que não caiu, ou
tirar acesso.

**Só funciona para você.** O servidor confere se o seu e-mail está em
`ADMIN_EMAILS`. Se outra pessoa abrir o endereço, a tela aparece mas o servidor
recusa — que é onde a segurança tem que estar, não no esconderijo do link.

Se a pessoa ainda não tiver conta, o acesso fica guardado e entra sozinho
quando ela se cadastrar.

---

## As regras que ficaram valendo

| | Grátis | Pago |
|---|---|---|
| Criar **sites** | Sim | Sim |
| Criar **apps / SaaS** | **Não** | Sim |
| Quantidade | 3 sites + 1 por indicação (até 10) | Sem limite |
| IAs gratuitas | Sim | Sim |
| IAs pagas | — | Sim |

**Sobre o `+alias` do Gmail:** `victor+1@gmail.com`, `victor+2@gmail.com` e
`vic.tor@gmail.com` caem todos na mesma caixa, mas para o Supabase são pessoas
diferentes. Em vez de bloquear (o que daria erro feio no cadastro), o limite
grátis fica amarrado ao **e-mail normalizado**. A pessoa pode criar 50 contas —
todas dividem a mesma cota. O truque simplesmente não rende nada.

---

## Como testar

1. Entre em `/acesso-anual` com a sua conta e libere um e-mail de teste seu.
2. Entre com esse e-mail → deve estar no plano que você deu.
3. Volte em `/acesso-anual` e passe esse e-mail para **grátis**.
4. Entre de novo e tente clicar em **App / SaaS** → tem que aparecer o recado
   de que apps são do plano Pro.

---

## Se der errado

| O que acontece | O que olhar |
|---|---|
| Webhook dá erro 401 na Kiwify | `KIWIFY_WEBHOOK_SECRET` está diferente do token que a Kiwify mostrou |
| Webhook dá erro 500 | Faltou `SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY`, ou não fez o Redeploy |
| `/acesso-anual` diz "sem permissão" | Seu e-mail não está em `ADMIN_EMAILS` |
| Pagou e não liberou | Abra `/acesso-anual`, digite o e-mail e clique em **Conferir o que está gravado** — a ficha diz a causa |
| Plano errado (mensal virou anual) | Preencha `KIWIFY_PRODUTO_MENSAL` e `KIWIFY_PRODUTO_ANUAL` |

---

## "O cliente pagou e o app pede assinatura"

**Rode uma vez:** Supabase → SQL Editor → New query → cole o conteúdo de
`supabase/pagamento-pendente.sql` → Run. Pode rodar de novo sempre que quiser;
ele não rebaixa o plano de ninguém.

Esse arquivo conserta o defeito que fazia isso acontecer: quando a Kiwify
avisava um pagamento e não existia o perfil daquele e-mail, o pagamento ia pra
uma lista de espera (`acessos_pendentes`) — e essa lista só era olhada no
instante em que a conta nascia. Quem já tinha conta mas estava sem a linha de
perfil ficava pagante no plano grátis pra sempre. Depois do SQL, o plano se
conserta sozinho na próxima vez que a pessoa abre o app.

**Para conferir um cliente:** abra `/acesso-anual`, digite o e-mail dele e
clique em **Conferir o que está gravado**. A ficha responde qual plano está
gravado, se ele vale, quais IAs pagas ele libera e se existe pagamento
guardado — e aplica o pagamento guardado na hora. O que a ficha diz e o que
fazer em cada caso:

| A ficha diz | O que é | O que fazer |
|---|---|---|
| Consertado agora | O pagamento estava guardado e não tinha sido aplicado | Nada. Peça F5 para o cliente |
| Está no plano X e o plano VALE | O banco está certo | Peça F5; o app já libera |
| O plano VENCEU | A renovação não chegou | Libere o plano na mão, ao lado |
| Plano GRÁTIS e nenhum pagamento guardado | O aviso da Kiwify não chegou, **ou** a compra foi com outro e-mail | Veja a lista de envios do webhook na Kiwify e `/api/diagnostico`. Para resolver na hora, libere o plano na mão |
| Esse e-mail NÃO tem conta | Ele comprou com um e-mail e se cadastrou com outro | Libere o plano no e-mail com que ele entra no app |
