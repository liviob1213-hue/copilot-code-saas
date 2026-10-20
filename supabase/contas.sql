-- ===========================================================================
--  BANCO DE CONTAS DO COPILOT CODE
--  ---------------------------------------------------------------------
--  Rode este arquivo UMA VEZ no Supabase das CONTAS (nao no dos projetos):
--  Dashboard -> SQL Editor -> New query -> cole tudo -> Run.
--
--  Pode rodar de novo sem medo: tudo aqui e "se nao existir, cria".
--
--  DUAS TABELAS, E A RAZAO DE SEREM DUAS:
--    perfis  -> UM POR PESSOA.  Guarda o PLANO (quem pagou).
--    cotas   -> UM POR E-MAIL NORMALIZADO. Guarda o LIMITE GRATIS.
--
--  Por que separado? Porque victor+1@gmail.com, victor+2@gmail.com e
--  vic.tor@gmail.com caem todos na MESMA caixa de entrada, mas para o
--  Supabase sao tres pessoas diferentes. Se a cota gratis ficasse no perfil,
--  bastava criar contas novas para ganhar sites infinitos.
--
--  Amarrando a cota ao e-mail normalizado, a pessoa ate pode criar 50 contas
--  — e todas as 50 dividem o MESMO site gratis. O cadastro nunca falha (nada
--  de erro feio na cara do usuario), e o truque simplesmente nao rende nada.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Normalizador de e-mail
--    gmail: tira os pontos e tudo depois do "+"  (vic.tor+spam@ -> victor@)
--    demais dominios: tira so o "+..." (Outlook, iCloud e Fastmail tambem usam)
-- ---------------------------------------------------------------------------
create or replace function public.normalizar_email(e text)
returns text
language sql
immutable
as $$
  with p as (
    select
      split_part(lower(trim(coalesce(e, ''))), '@', 1) as parte_local,
      split_part(lower(trim(coalesce(e, ''))), '@', 2) as dominio
  )
  select case
    when dominio = '' then lower(trim(coalesce(e, '')))
    when dominio in ('gmail.com', 'googlemail.com')
      then replace(split_part(parte_local, '+', 1), '.', '') || '@gmail.com'
    else split_part(parte_local, '+', 1) || '@' || dominio
  end
  from p;
$$;

-- ---------------------------------------------------------------------------
-- 2. Gerador de codigo de convite (8 caracteres, facil de ler e digitar)
-- ---------------------------------------------------------------------------
-- NAO troque md5/random por gen_random_bytes: aquela vem da extensao pgcrypto,
-- que no Supabase mora no esquema "extensions". Dentro do gatilho de cadastro o
-- caminho de busca e restrito, a funcao nao seria encontrada, e o erro desfaz a
-- criacao do usuario inteiro — ja aconteceu, e derrubou todo cadastro novo.
-- md5, random e clock_timestamp sao do proprio Postgres e existem sempre.
create or replace function public.gerar_codigo_convite()
returns text
language sql
volatile
as $$
  select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
$$;

-- ---------------------------------------------------------------------------
-- 3. COTAS — o limite gratis, por e-mail normalizado
-- ---------------------------------------------------------------------------
create table if not exists public.cotas (
  email_normalizado  text primary key,
  -- o site de cortesia, feito com a chave de IA DA CASA (a do dono do app).
  -- so acontece uma vez na vida deste e-mail.
  usou_chave_da_casa boolean not null default false,
  -- quantos sites essa pessoa ja criou com a chave DELA.
  sites_criados      int     not null default 0,
  -- slots ganhos indicando gente (teto aplicado no app, nao aqui).
  slots_ganhos       int     not null default 0,
  -- quantas chamadas de IA ja foram feitas na conta da casa. Um site sozinho
  -- gasta varias chamadas (planejar, escrever, testar, corrigir), entao o
  -- limite nao pode ser "1 chamada" — e um teto generoso que, se estourar,
  -- encerra a cortesia do mesmo jeito. Sem isso, daria pra ficar gerando pra
  -- sempre sem nunca concluir um projeto.
  chamadas_casa      int     not null default 0,
  atualizado_em      timestamptz not null default now()
);

-- se a tabela ja existia de uma rodada anterior, garante a coluna nova
alter table public.cotas add column if not exists chamadas_casa int not null default 0;

-- ---------------------------------------------------------------------------
-- 4. PERFIS — uma linha por usuario; e aqui que mora o PLANO
-- ---------------------------------------------------------------------------
create table if not exists public.perfis (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text,
  email_normalizado  text not null,
  -- 'free' | 'mensal' | 'anual'
  plano              text not null default 'free',
  -- quando o acesso pago vence. NULL = nao vence (acesso vitalicio/manual).
  plano_expira_em    timestamptz,
  -- de onde veio o plano: 'kiwify' | 'manual' | NULL
  plano_origem       text,
  codigo_convite     text unique not null default public.gerar_codigo_convite(),
  -- quem indicou esta pessoa
  convidado_por      uuid references auth.users(id) on delete set null,
  -- o convite so e pago quando a pessoa convidada CRIA UM SITE de verdade.
  -- creditar no cadastro viraria fazenda de conta fantasma.
  convite_creditado  boolean not null default false,
  criado_em          timestamptz not null default now()
);

create index if not exists perfis_email_norm_idx on public.perfis (email_normalizado);
create index if not exists perfis_codigo_idx     on public.perfis (codigo_convite);

-- ---------------------------------------------------------------------------
-- 5. PROJETOS CRIADOS — historico, serve para contar os slots
-- ---------------------------------------------------------------------------
create table if not exists public.projetos_criados (
  id                 uuid primary key default gen_random_uuid(),
  usuario            uuid references auth.users(id) on delete cascade,
  email_normalizado  text not null,
  nome               text,
  tipo               text,           -- 'site' | 'app'
  chave_da_casa      boolean not null default false,
  criado_em          timestamptz not null default now()
);

create index if not exists projetos_email_idx on public.projetos_criados (email_normalizado);

-- ---------------------------------------------------------------------------
-- 5b. ACESSOS PENDENTES — quem PAGOU ANTES de ter conta
--     A pessoa compra na Kiwify e so depois cria a conta no app. Se o webhook
--     nao achasse o perfil e desistisse, ela entraria no plano gratis depois
--     de ter pago — e viria reclamar, com razao. Entao o pagamento fica
--     guardado aqui pelo e-mail e e aplicado no instante do cadastro.
-- ---------------------------------------------------------------------------
create table if not exists public.acessos_pendentes (
  email_normalizado  text primary key,
  plano              text not null,
  plano_expira_em    timestamptz,
  origem             text,
  criado_em          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. Toda vez que nasce um usuario, nasce o perfil e a cota dele
-- ---------------------------------------------------------------------------
create or replace function public.ao_criar_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  norm      text;
  pendente  public.acessos_pendentes%rowtype;
begin
  -- REDE DE SEGURANCA, E ELA E OBRIGATORIA: este gatilho roda dentro da mesma
  -- transacao que cria o usuario. Se ele estourar, o Postgres desfaz o
  -- cadastro inteiro e a pessoa recebe "Database error saving new user" — ou
  -- seja, um defeito aqui vira parada total de cadastro no app.
  -- Perfil incompleto a gente conserta depois; cliente que nao conseguiu
  -- entrar, nao.
  begin
    norm := public.normalizar_email(new.email);

    insert into public.cotas (email_normalizado)
    values (norm)
    on conflict (email_normalizado) do nothing;

    -- Pagou antes de criar a conta? Entao ja entra com o plano pago.
    select * into pendente
    from public.acessos_pendentes
    where email_normalizado = norm;

    insert into public.perfis (id, email, email_normalizado, plano, plano_expira_em, plano_origem)
    values (
      new.id,
      new.email,
      norm,
      coalesce(pendente.plano, 'free'),
      pendente.plano_expira_em,
      pendente.origem
    )
    on conflict (id) do nothing;

    if pendente.email_normalizado is not null then
      delete from public.acessos_pendentes where email_normalizado = norm;
    end if;

  exception when others then
    raise warning 'ao_criar_usuario falhou para % — %', new.email, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists trg_ao_criar_usuario on auth.users;
create trigger trg_ao_criar_usuario
  after insert on auth.users
  for each row execute function public.ao_criar_usuario();

-- ---------------------------------------------------------------------------
-- 7. SEGURANCA (RLS)
--    A pessoa LE o proprio perfil e a propria cota. Nao ESCREVE nada:
--    plano e slots so mudam pelo servidor (webhook da Kiwify / liberacao
--    manual), que usa a chave service_role e ignora RLS.
--    Se o usuario pudesse escrever, bastava abrir o console do navegador e
--    se dar o plano anual sozinho.
-- ---------------------------------------------------------------------------
alter table public.perfis            enable row level security;
alter table public.cotas             enable row level security;
alter table public.projetos_criados  enable row level security;

drop policy if exists "le o proprio perfil" on public.perfis;
create policy "le o proprio perfil" on public.perfis
  for select using (auth.uid() = id);

drop policy if exists "le a propria cota" on public.cotas;
create policy "le a propria cota" on public.cotas
  for select using (
    email_normalizado = (
      select email_normalizado from public.perfis where id = auth.uid()
    )
  );

drop policy if exists "le os proprios projetos" on public.projetos_criados;
create policy "le os proprios projetos" on public.projetos_criados
  for select using (auth.uid() = usuario);

-- ---------------------------------------------------------------------------
-- 8. Quem JA ESTAVA no banco continua com acesso anual completo
--    (voce liberou essas pessoas na mao; elas nao podem perder nada)
--    plano_expira_em = NULL  =>  nao vence nunca.
-- ---------------------------------------------------------------------------
insert into public.cotas (email_normalizado)
select distinct public.normalizar_email(u.email)
from auth.users u
where u.email is not null
on conflict (email_normalizado) do nothing;

insert into public.perfis (id, email, email_normalizado, plano, plano_origem)
select u.id, u.email, public.normalizar_email(u.email), 'anual', 'manual'
from auth.users u
where u.email is not null
on conflict (id) do update
  set plano         = 'anual',
      plano_origem  = 'manual',
      plano_expira_em = null;

-- ---------------------------------------------------------------------------
-- 9. Confere o resultado
-- ---------------------------------------------------------------------------
select
  p.email,
  p.plano,
  coalesce(p.plano_expira_em::text, 'nao vence') as vence,
  p.codigo_convite
from public.perfis p
order by p.criado_em;
