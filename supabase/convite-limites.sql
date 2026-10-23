-- ===========================================================================
--  TRAVAS NO CONVITE
--  ---------------------------------------------------------------------
--  Rode UMA VEZ no Supabase das CONTAS:
--  SQL Editor -> New query -> cole tudo -> Run. Pode repetir sem medo.
--
--  ---------------------------------------------------------------------
--  O RACIOCINIO, PRA NINGUEM DESFAZER ISTO SEM SABER O PORQUE
--
--  Slot de convite NAO custa dinheiro: ele e pra pessoa criar usando a chave
--  de IA DELA. Quem juntasse 50 slots gastaria a conta dele, nao a nossa.
--
--  O que custa e outra coisa: toda conta nova ganha 1 site por dia com as
--  NOSSAS chaves. Logo, o estrago de verdade nao e "farmar slot", e "farmar
--  CONTA" -- e um farmador sozinho esgota a cota gratuita compartilhada e
--  deixa cliente de verdade sem conseguir gerar.
--
--  Por isso estas travas existem pra TIRAR O MOTIVO de criar conta falsa, e
--  nao pra proteger slot:
--
--    1. premio cai de 2 para 1       -> metade do incentivo
--    2. o slot ganho so vale AMANHA  -> mata o farm de rajada, que e como o
--                                       farm acontece de verdade (a pessoa
--                                       senta e cria 10 contas em 20 min).
--                                       Pra quem indica de verdade nao muda
--                                       nada: ninguem indica com pressa.
--    3. teto de 10 POR MES           -> antes era teto pra vida inteira, o
--                                       que punia justamente quem divulga
--                                       sempre. Mensal renova e limita rajada.
--
--  O que NAO foi mexido, de proposito: o premio continua saindo so quando o
--  convidado CRIA UM SITE. Pagar no cadastro e o que faria valer a pena criar
--  conta fantasma.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Colunas novas
-- ---------------------------------------------------------------------------
-- Slots ganhos que ainda nao amadureceram (so valem no dia seguinte).
alter table public.cotas add column if not exists slots_pendentes int not null default 0;
alter table public.cotas add column if not exists dia_pendentes   date;
-- Contagem do mes corrente, pro teto mensal.
alter table public.cotas add column if not exists mes_ganhos      date;
alter table public.cotas add column if not exists ganhos_no_mes   int not null default 0;

comment on column public.cotas.slots_pendentes is
  'Slots de convite ganhos hoje. So entram no saldo no dia seguinte: e o que impede farm de rajada.';
comment on column public.cotas.dia_pendentes is
  'Dia (Brasilia) em que os pendentes foram ganhos. Se for anterior a hoje, eles ja valem.';
comment on column public.cotas.ganhos_no_mes is
  'Quantos slots de convite ja foram ganhos no mes de mes_ganhos (teto mensal).';

-- ---------------------------------------------------------------------------
-- 2. Os numeros novos
-- ---------------------------------------------------------------------------
create or replace function public.limites_dos_slots()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    -- GRATIS
    'slots_casa_por_dia',          1,    -- sites por dia com a chave da casa
    'chamadas_casa_por_dia',      60,    -- teto de chamadas de IA da casa por dia
    'slots_proprios_base',         0,    -- sites com a chave da pessoa SEM convidar ninguem
    'slots_por_convite',           1,    -- +1 por convite que criou site (era 2)
    'teto_slots_mes',             10,    -- maximo de slots ganhos POR MES
    'teto_slots_convite',         10,    -- mantido: codigo antigo ainda le este nome
    'dias_para_liberar',           1,    -- o slot ganho hoje so vale amanha
    -- PAGO (nao e "sem limite" de proposito: as chaves gratuitas da casa sao
    -- compartilhadas por todos, e uma conta sozinha nao pode esgotar o limite
    -- por minuto do provedor e deixar os outros na mao.)
    'slots_casa_por_dia_pago',    20,
    'chamadas_casa_por_dia_pago', 600
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Quanto de slot de convite ESTA VALENDO agora
--    Consultar saldo NAO escreve no banco (esta funcao e chamada a cada
--    abertura do app). A consolidacao de verdade acontece na hora de gravar,
--    em registrar_projeto() — mesmo padrao dos contadores do dia.
-- ---------------------------------------------------------------------------
create or replace function public.ganhos_valendo(c public.cotas)
returns int
language sql
stable
as $$
  select coalesce(c.slots_ganhos, 0)
       + case
           when c.dia_pendentes is not null and c.dia_pendentes < public.hoje_br()
             then coalesce(c.slots_pendentes, 0)
           else 0
         end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Gravar o projeto e pagar o convite, agora com as travas
-- ---------------------------------------------------------------------------
create or replace function public.registrar_projeto(
  p_usuario        uuid,
  p_nome           text    default null,
  p_tipo           text    default 'site',
  p_chave_da_casa  boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lim        jsonb := public.limites_dos_slots();
  perfil     public.perfis%rowtype;
  padrinho   public.perfis%rowtype;
  cota_p     public.cotas%rowtype;
  teto_mes   int := (lim->>'teto_slots_mes')::int;
  premio     int := (lim->>'slots_por_convite')::int;
  hoje       date := public.hoje_br();
  mes        date := date_trunc('month', public.hoje_br())::date;
  ja_no_mes  int;
  cabe       int;
  pagou      boolean := false;
  pago_agora int := 0;
begin
  select * into perfil from public.perfis where id = p_usuario;
  if perfil.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_perfil');
  end if;

  insert into public.projetos_criados (usuario, email_normalizado, nome, tipo, chave_da_casa)
  values (p_usuario, perfil.email_normalizado, p_nome, coalesce(p_tipo, 'site'), coalesce(p_chave_da_casa, false));

  insert into public.cotas (email_normalizado)
  values (perfil.email_normalizado)
  on conflict (email_normalizado) do nothing;

  if coalesce(p_chave_da_casa, false) then
    update public.cotas
       set slots_casa_usados  = case when dia_casa = hoje then slots_casa_usados + 1 else 1 end,
           chamadas_casa_hoje = case when dia_casa = hoje then chamadas_casa_hoje else 0 end,
           dia_casa           = hoje,
           usou_chave_da_casa = true,
           atualizado_em      = now()
     where email_normalizado = perfil.email_normalizado;
  else
    update public.cotas
       set sites_criados = sites_criados + 1, atualizado_em = now()
     where email_normalizado = perfil.email_normalizado;
  end if;

  -- ---- o premio de quem indicou ------------------------------------------
  if perfil.convidado_por is not null and not perfil.convite_creditado then
    -- Marca ANTES de pagar e so se ainda nao estava marcado: duas chamadas
    -- simultaneas, a primeira marca e paga, a segunda nao acha linha.
    update public.perfis
       set convite_creditado = true
     where id = p_usuario and not convite_creditado;

    if found then
      select * into padrinho from public.perfis where id = perfil.convidado_por;
      if padrinho.id is not null then
        insert into public.cotas (email_normalizado)
        values (padrinho.email_normalizado)
        on conflict (email_normalizado) do nothing;

        -- TRANCA a linha do padrinho: dois convidados criando site no mesmo
        -- instante leriam o mesmo "ja ganhou no mes" e furariam o teto.
        select * into cota_p
        from public.cotas
        where email_normalizado = padrinho.email_normalizado
        for update;

        -- Virou o mes? O contador zera.
        ja_no_mes := case when cota_p.mes_ganhos = mes then coalesce(cota_p.ganhos_no_mes, 0) else 0 end;
        cabe := greatest(0, teto_mes - ja_no_mes);
        pago_agora := least(premio, cabe);

        if pago_agora > 0 then
          update public.cotas
             set
               -- Pendentes de ONTEM (ou antes) ja amadureceram: entram no saldo.
               slots_ganhos = coalesce(slots_ganhos, 0)
                 + case when dia_pendentes is not null and dia_pendentes < hoje
                        then coalesce(slots_pendentes, 0) else 0 end,
               -- O premio de agora entra como PENDENTE: so vale amanha.
               slots_pendentes = case when dia_pendentes = hoje
                                      then coalesce(slots_pendentes, 0) + pago_agora
                                      else pago_agora end,
               dia_pendentes  = hoje,
               mes_ganhos     = mes,
               ganhos_no_mes  = ja_no_mes + pago_agora,
               atualizado_em  = now()
           where email_normalizado = padrinho.email_normalizado;

          pagou := true;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'premiou_convite', pagou,
    'premio', pago_agora,
    'libera_amanha', pagou,
    'teto_do_mes_atingido', (pagou = false and perfil.convidado_por is not null and pago_agora = 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. O saldo, agora separando o que VALE do que ESTA ESPERANDO
--    A tela precisa saber dos dois: esconder o pendente faria o premio parecer
--    que nao veio, e a pessoa abriria chamado dizendo que o convite nao pagou.
-- ---------------------------------------------------------------------------
create or replace function public.resumo_slots(p_usuario uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lim            jsonb := public.limites_dos_slots();
  perfil         public.perfis%rowtype;
  cota           public.cotas%rowtype;
  pago           boolean;
  teto_sites     int;
  teto_chamadas  int;
  hoje           date  := public.hoje_br();
  mes            date  := date_trunc('month', public.hoje_br())::date;
  usados_hoje    int;
  chamadas_hoje  int;
  ganhos         int;
  esperando      int;
  proprios_total int;
  convites       int;
  no_mes         int;
begin
  if auth.uid() is not null and p_usuario is distinct from auth.uid() then
    raise exception 'so da pra ver o proprio saldo';
  end if;

  select * into perfil from public.perfis where id = p_usuario;
  if perfil.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_perfil');
  end if;

  select * into cota from public.cotas where email_normalizado = perfil.email_normalizado;
  pago := public.plano_pago_vale(perfil.plano, perfil.plano_expira_em);

  teto_sites := case when pago
    then (lim->>'slots_casa_por_dia_pago')::int
    else (lim->>'slots_casa_por_dia')::int end;
  teto_chamadas := case when pago
    then (lim->>'chamadas_casa_por_dia_pago')::int
    else (lim->>'chamadas_casa_por_dia')::int end;

  usados_hoje   := case when cota.dia_casa = hoje then coalesce(cota.slots_casa_usados, 0)  else 0 end;
  chamadas_hoje := case when cota.dia_casa = hoje then coalesce(cota.chamadas_casa_hoje, 0) else 0 end;

  -- O que ja vale (inclui pendente que amadureceu) e o que ainda espera.
  ganhos    := public.ganhos_valendo(cota);
  esperando := case
                 when cota.dia_pendentes = hoje then coalesce(cota.slots_pendentes, 0)
                 else 0
               end;
  no_mes    := case when cota.mes_ganhos = mes then coalesce(cota.ganhos_no_mes, 0) else 0 end;

  proprios_total := (lim->>'slots_proprios_base')::int + ganhos;

  select count(*) into convites
  from public.perfis
  where convidado_por = p_usuario and convite_creditado;

  return jsonb_build_object(
    'ok', true,
    'plano', perfil.plano,
    'pago', pago,
    'codigo_convite', perfil.codigo_convite,
    'casa_total_dia',       teto_sites,
    'casa_usados_hoje',     usados_hoje,
    'casa_restantes_hoje',  greatest(0, teto_sites - usados_hoje),
    'chamadas_total_dia',   teto_chamadas,
    'chamadas_restantes_hoje', greatest(0, teto_chamadas - chamadas_hoje),
    'proprios_total',       proprios_total,
    'proprios_usados',      coalesce(cota.sites_criados, 0),
    'proprios_restantes',   greatest(0, proprios_total - coalesce(cota.sites_criados, 0)),
    'slots_ganhos',         ganhos,
    -- NOVOS: o que esta esperando amanhecer e quanto ja foi ganho no mes
    'slots_esperando',      esperando,
    'ganhos_no_mes',        no_mes,
    'teto_do_mes',          (lim->>'teto_slots_mes')::int,
    'convites_pagos',       coalesce(convites, 0),
    'limites', lim
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Confere
-- ---------------------------------------------------------------------------
select
  (public.limites_dos_slots()->>'slots_por_convite') as premio_por_convite,
  (public.limites_dos_slots()->>'teto_slots_mes')    as teto_por_mes,
  (public.limites_dos_slots()->>'dias_para_liberar') as dias_para_liberar;
