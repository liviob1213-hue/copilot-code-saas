-- ===========================================================================
--  CONSERTO URGENTE: conta nova nao conseguia nascer
--  ---------------------------------------------------------------------
--  Rode UMA VEZ no Supabase das CONTAS:
--  Dashboard -> SQL Editor -> New query -> cole tudo -> Run.
--
--  Pode rodar de novo sem medo. Nao apaga nada e nao mexe no plano de
--  ninguem que ja tem conta.
--
--  ---------------------------------------------------------------------
--  O QUE ESTAVA ACONTECENDO
--
--  Quem tentava entrar com um e-mail novo tomava "Database error saving new
--  user" e voltava pra tela de login.
--
--  A causa eram duas linhas do contas.sql:
--
--    1. gerar_codigo_convite() usava gen_random_bytes(), que vem da extensao
--       pgcrypto. No Supabase, extensao mora no esquema "extensions".
--
--    2. O gatilho ao_criar_usuario() tinha "set search_path = public", que
--       deixa o esquema "extensions" DE FORA.
--
--  Entao, no instante em que nascia um usuario, o gatilho tentava gerar o
--  codigo de convite, nao encontrava a funcao e estourava. Como o gatilho roda
--  dentro da mesma transacao do cadastro, o erro desfazia a criacao do
--  usuario inteiro.
--
--  Por que os usuarios antigos nao foram afetados: eles entraram pelo
--  preenchimento em massa do contas.sql, executado no editor de SQL, onde o
--  caminho de busca normal inclui "extensions". O gatilho, na pratica, NUNCA
--  funcionou para conta nova.
--
--  O conserto tem tres camadas, de proposito:
--    a) a funcao nao depende mais de extensao nenhuma;
--    b) o gatilho enxerga o esquema "extensions" de qualquer jeito;
--    c) e, acima de tudo, o gatilho NUNCA MAIS derruba um cadastro: se algo
--       der errado la dentro, ele avisa no log e deixa a pessoa entrar.
--       Perfil incompleto se conserta depois; cadastro perdido, nao.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Código de convite sem depender de extensão
--    md5, random e clock_timestamp sao do proprio Postgres: existem sempre,
--    em qualquer caminho de busca.
-- ---------------------------------------------------------------------------
create or replace function public.gerar_codigo_convite()
returns text
language sql
volatile
as $$
  select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
$$;

-- ---------------------------------------------------------------------------
-- 2. O gatilho, agora à prova de falha
-- ---------------------------------------------------------------------------
create or replace function public.ao_criar_usuario()
returns trigger
language plpgsql
security definer
-- "extensions" entra aqui para o caso de qualquer default de coluna precisar
-- de uma funcao de extensao no futuro.
set search_path = public, extensions, pg_temp
as $$
declare
  norm      text;
  pendente  public.acessos_pendentes%rowtype;
begin
  -- Tudo o que vem abaixo e desejavel, mas NADA aqui pode impedir alguem de
  -- criar conta. Por isso o bloco tem rede: se falhar, registra e segue.
  begin
    norm := public.normalizar_email(new.email);

    insert into public.cotas (email_normalizado)
    values (norm)
    on conflict (email_normalizado) do nothing;

    -- Pagou antes de criar a conta? Ja entra com o plano pago.
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
-- 3. Conserta quem por acaso tenha ficado sem perfil ou sem cota
--    "do nothing" de proposito: quem ja tem perfil NAO perde o plano.
-- ---------------------------------------------------------------------------
insert into public.cotas (email_normalizado)
select distinct public.normalizar_email(u.email)
from auth.users u
where u.email is not null
on conflict (email_normalizado) do nothing;

-- O PERFIL QUE FALTAVA JA NASCE COM O PAGAMENTO QUE ESTAVA GUARDADO.
--
-- Antes esta linha criava o perfil sempre como 'free'. Quem tinha pago na
-- Kiwify sem ter perfil (o pagamento vai pra public.acessos_pendentes) era
-- consertado aqui como GRATIS, e o pagamento ficava preso na lista de espera
-- pra sempre: cliente pagante vendo "assine o plano" no app. Era o defeito que
-- supabase/pagamento-pendente.sql conserta de uma vez — e aqui ele nao
-- acontece mais.
insert into public.perfis (id, email, email_normalizado, plano, plano_expira_em, plano_origem)
select
  u.id,
  u.email,
  public.normalizar_email(u.email),
  coalesce(a.plano, 'free'),
  a.plano_expira_em,
  a.origem
from auth.users u
left join public.acessos_pendentes a
       on a.email_normalizado = public.normalizar_email(u.email)
where u.email is not null
on conflict (id) do nothing;

-- O que foi aplicado sai da lista de espera.
delete from public.acessos_pendentes a
using public.perfis p
where p.email_normalizado = a.email_normalizado
  and p.plano = a.plano;

-- ---------------------------------------------------------------------------
-- 4. Confere
-- ---------------------------------------------------------------------------
select
  (select count(*) from auth.users)    as usuarios,
  (select count(*) from public.perfis) as perfis,
  (select count(*) from public.cotas)  as cotas,
  public.gerar_codigo_convite()        as exemplo_de_codigo;

-- "usuarios" e "perfis" tem que bater. O codigo de exemplo tem que aparecer
-- com 8 caracteres. Se as duas coisas estiverem certas, o cadastro voltou.
