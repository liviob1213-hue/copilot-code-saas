-- ===========================================================================
--  SLOTS — o plano gratuito do Copilot Code
--  ---------------------------------------------------------------------
--  Rode este arquivo UMA VEZ no Supabase das CONTAS (o mesmo de contas.sql):
--  Dashboard -> SQL Editor -> New query -> cole tudo -> Run.
--
--  Rode SEMPRE DEPOIS de supabase/contas.sql (ele cria as tabelas que este
--  arquivo usa). Pode rodar de novo quantas vezes quiser: tudo aqui e "se nao
--  existir, cria" / "substitui a funcao".
--
--  ---------------------------------------------------------------------
--  AS REGRAS, EM PORTUGUES CLARO
--  ---------------------------------------------------------------------
--  Existem DOIS tipos de slot, e eles nao se misturam:
--
--  1) SLOT DA CASA  (chave de IA do dono do app)
--     - Todo mundo ganha 1 por DIA. Renova sozinho a cada dia.
--     - E com ele que a pessoa cria o primeiro site sem precisar de chave
--       nenhuma: a chamada de IA passa pelo nosso servidor, que usa as chaves
--       gratuitas da casa (Gemini, OpenRouter, Groq, Mistral).
--     - Tem tambem um teto de CHAMADAS por dia. Um site sozinho gasta varias
--       chamadas (planejar, escrever, testar, corrigir), entao limitar so o
--       numero de sites deixaria a porta aberta pra ficar gerando pra sempre
--       sem nunca concluir um projeto.
--
--     ATE ONDE CADA UM DOS DOIS SEGURA (importante nao se enganar com isto):
--       * O TETO DE CHAMADAS e a trava de verdade. Toda chamada a nossa chave
--         passa por /api/passe-ia e e contada aqui, no banco. Nao existe jeito
--         de furar pelo navegador.
--       * O "1 site por dia" e contado quando o app avisa que um projeto saiu
--         (/api/projeto-criado). Ou seja: ele depende do app ser honesto. Pra
--         quem usa o app normalmente, e o limite que vale; pra quem souber
--         mexer no navegador, o que segura de fato e o teto de chamadas acima.
--         E por isso que ele existe — sem ele, esse caminho seria ilimitado.
--
--  2) SLOT PROPRIO  (chave de IA da PESSOA)
--     - Vem de CONVITE: cada pessoa que entra pelo seu link e cria um site de
--       verdade te da +2 slots proprios.
--     - Com eles a pessoa cria sites usando a chave gratuita DELA (a chamada
--       vai do navegador dela direto pro provedor; nao passa por nos).
--
--  PLANO PAGO: slots a vontade e pode usar APIs pagas (Claude, DeepSeek, xAI).
--  No gratis, so as quatro APIs gratuitas.
--
--  ---------------------------------------------------------------------
--  ONDE MEXER SE QUISER MUDAR OS NUMEROS
--  ---------------------------------------------------------------------
--  Num lugar so: a funcao public.limites_dos_slots(), logo abaixo. Mude o
--  numero, rode o arquivo de novo e pronto — o app e o servidor leem daqui,
--  entao nao existe numero repetido em dois lugares pra desencontrar.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Colunas novas na tabela de cotas
--    A cota continua amarrada ao E-MAIL NORMALIZADO (e nao ao usuario): quem
--    cria dez contas com victor+1@, victor+2@... divide os MESMOS slots. Ver a
--    explicacao longa em supabase/contas.sql.
-- ---------------------------------------------------------------------------
alter table public.cotas add column if not exists dia_casa            date;
alter table public.cotas add column if not exists slots_casa_usados   int not null default 0;
alter table public.cotas add column if not exists chamadas_casa_hoje  int not null default 0;

comment on column public.cotas.dia_casa is
  'A que DIA se referem os contadores de hoje. Se for diferente de hoje, eles valem zero (o slot do dia renovou).';
comment on column public.cotas.slots_casa_usados is
  'Quantos sites a pessoa comecou HOJE com a chave da casa.';
comment on column public.cotas.chamadas_casa_hoje is
  'Quantas chamadas de IA na conta da casa foram feitas HOJE.';
comment on column public.cotas.sites_criados is
  'Sites criados com a chave DA PESSOA. E o que gasta os slots de convite.';
comment on column public.cotas.slots_ganhos is
  'Slots proprios ganhos indicando gente (+2 por convite que criou site).';

-- ---------------------------------------------------------------------------
-- 2. OS NUMEROS DO PLANO, num lugar so
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
    'slots_por_convite',           2,    -- +2 slots proprios por convite que criou site
    'teto_slots_convite',         10,    -- maximo de slots que da pra juntar convidando
    -- PAGO (nao e "sem limite" de proposito: as chaves gratuitas da casa sao
    -- compartilhadas por todos, e uma conta sozinha nao pode esgotar o limite
    -- por minuto do provedor e deixar os outros na mao. Quem paga tem slot a
    -- vontade com a chave DELE e acesso as APIs pagas.)
    'slots_casa_por_dia_pago',    20,
    'chamadas_casa_por_dia_pago', 600
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Que dia e hoje? (no horario de Brasilia)
--    Importa de verdade: se usassemos UTC, o slot do dia renovaria as 21h pra
--    quem esta no Brasil — a pessoa criaria dois sites na mesma noite.
-- ---------------------------------------------------------------------------
create or replace function public.hoje_br()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- ---------------------------------------------------------------------------
-- 4. O plano pago desta pessoa ainda vale?
--    plano_expira_em NULL = nao vence nunca (liberacao manual/vitalicia).
-- ---------------------------------------------------------------------------
create or replace function public.plano_pago_vale(p_plano text, p_expira timestamptz)
returns boolean
language sql
immutable
as $$
  select coalesce(p_plano, 'free') <> 'free'
     and (p_expira is null or p_expira > now());
$$;

-- ---------------------------------------------------------------------------
-- 5. GASTAR UMA CHAMADA DA CHAVE DA CASA
--    Quem chama: /api/passe-ia (no servidor, com a chave service_role). O app
--    no navegador NAO pode chamar isto — senao bastava abrir o console e se
--    dar slots de graca.
--
--    p_novo_projeto = true na PRIMEIRA chamada de um projeto novo: ai a gente
--    confere se ainda ha site do dia. As chamadas seguintes (corrigir,
--    continuar, resumir, editar) passam com false e nao precisam de slot livre
--    — cortar alguem no meio de um trabalho ja comecado seria pior.
--
--    O SLOT DO DIA E DESCONTADO SO QUANDO O PROJETO SAI, em registrar_projeto()
--    mais abaixo. Aqui a gente so confere e conta a chamada.
--
--    POR QUE ISTO E UMA FUNCAO DO BANCO, e nao JavaScript no servidor: o
--    "select ... for update" tranca a linha da cota. Sem essa tranca, dois
--    pedidos disparados no mesmo instante leriam "0 slots usados" e passariam
--    os dois — o jeito classico de furar limite.
-- ---------------------------------------------------------------------------
create or replace function public.usar_chave_da_casa(
  p_usuario       uuid,
  p_novo_projeto  boolean default false
)
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
begin
  select * into perfil from public.perfis where id = p_usuario;

  -- O perfil nasce por gatilho no instante do cadastro. Se ainda nao esta la,
  -- e questao de segundos: avisamos "tente de novo" em vez de "nao pode".
  if perfil.id is null then
    return jsonb_build_object(
      'ok', false, 'motivo', 'sem_perfil',
      'recado', 'Sua conta ainda está sendo preparada. Tente de novo em instantes.'
    );
  end if;

  pago := public.plano_pago_vale(perfil.plano, perfil.plano_expira_em);

  teto_sites := case when pago
    then (lim->>'slots_casa_por_dia_pago')::int
    else (lim->>'slots_casa_por_dia')::int end;
  teto_chamadas := case when pago
    then (lim->>'chamadas_casa_por_dia_pago')::int
    else (lim->>'chamadas_casa_por_dia')::int end;

  -- Garante a linha da cota e TRANCA ela ate o fim desta funcao.
  insert into public.cotas (email_normalizado)
  values (perfil.email_normalizado)
  on conflict (email_normalizado) do nothing;

  select * into cota
  from public.cotas
  where email_normalizado = perfil.email_normalizado
  for update;

  -- Virou o dia? Os contadores de hoje voltam a zero. Gravamos a virada ANTES
  -- de conferir os limites: se a pessoa for recusada logo depois, a renovacao
  -- do dia nao pode se perder.
  if cota.dia_casa is distinct from hoje then
    update public.cotas
       set dia_casa = hoje, slots_casa_usados = 0, chamadas_casa_hoje = 0,
           atualizado_em = now()
     where email_normalizado = perfil.email_normalizado
    returning * into cota;
  end if;

  if p_novo_projeto and cota.slots_casa_usados >= teto_sites then
    return jsonb_build_object(
      'ok', false, 'motivo', 'slot_do_dia', 'pago', pago,
      'recado', case when pago
        then 'Você já usou os sites de hoje da chave da casa. Use a sua própria chave de IA (Conexões) ou volte amanhã.'
        else 'Seu site de hoje com a nossa IA já foi usado. Amanhã você ganha outro — ou convide alguém para criar agora com a sua própria chave.'
      end,
      'sites_restantes_hoje', 0,
      'chamadas_restantes_hoje', greatest(0, teto_chamadas - cota.chamadas_casa_hoje)
    );
  end if;

  if cota.chamadas_casa_hoje >= teto_chamadas then
    return jsonb_build_object(
      'ok', false, 'motivo', 'chamadas_do_dia', 'pago', pago,
      'recado', 'A nossa IA já trabalhou o máximo de hoje na sua conta. Amanhã renova — ou ligue a sua própria chave em Conexões.',
      'sites_restantes_hoje', greatest(0, teto_sites - cota.slots_casa_usados),
      'chamadas_restantes_hoje', 0
    );
  end if;

  -- Gasta UMA CHAMADA. O SLOT DO DIA nao e cobrado aqui, e sim quando o projeto
  -- sai de verdade (public.registrar_projeto). A diferenca importa: se a
  -- geracao morrer no meio — IA fora do ar, internet caindo —, a pessoa nao
  -- perde o site do dia por causa de uma tentativa que nao entregou nada. Quem
  -- segura o abuso nessa janela e o teto de chamadas, nao o slot.
  update public.cotas
     set chamadas_casa_hoje = chamadas_casa_hoje + 1,
         chamadas_casa      = coalesce(chamadas_casa, 0) + 1,
         usou_chave_da_casa = true,
         atualizado_em      = now()
   where email_normalizado = perfil.email_normalizado
  returning * into cota;

  return jsonb_build_object(
    'ok', true,
    'pago', pago,
    'sites_restantes_hoje',    greatest(0, teto_sites - cota.slots_casa_usados),
    'chamadas_restantes_hoje', greatest(0, teto_chamadas - cota.chamadas_casa_hoje)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. REGISTRAR UM PROJETO CRIADO
--    Chamado por /api/projeto-criado quando um projeto sai de verdade. Faz
--    tres coisas:
--      a) guarda no historico (projetos_criados);
--      b) gasta o slot: o do DIA se foi com a nossa IA, ou um PROPRIO se foi
--         com a chave da pessoa;
--      c) PAGA O CONVITE de quem indicou esta pessoa — +2 slots proprios.
--
--    O premio do convite e pago AQUI, e nao no cadastro, de proposito: pagar
--    no cadastro viraria fazenda de conta fantasma (criar 50 contas com o
--    proprio link e colher 100 slots). Pagando so quando a pessoa convidada
--    cria um projeto de verdade, o trabalho de fraudar fica maior que o premio.
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
  lim         jsonb := public.limites_dos_slots();
  perfil      public.perfis%rowtype;
  padrinho    public.perfis%rowtype;
  teto        int   := (lim->>'teto_slots_convite')::int;
  premio      int   := (lim->>'slots_por_convite')::int;
  pagou       boolean := false;
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
    -- Usou a NOSSA IA: gasta o slot do dia. E aqui que ele e cobrado, e nao na
    -- primeira chamada, pra que uma geracao que falhou no meio nao tire o site
    -- do dia de quem nao recebeu nada.
    update public.cotas
       set slots_casa_usados  = case when dia_casa = public.hoje_br() then slots_casa_usados + 1 else 1 end,
           chamadas_casa_hoje = case when dia_casa = public.hoje_br() then chamadas_casa_hoje else 0 end,
           dia_casa           = public.hoje_br(),
           usou_chave_da_casa = true,
           atualizado_em      = now()
     where email_normalizado = perfil.email_normalizado;
  else
    -- Usou a chave DELA: gasta um slot proprio (os que vem de convite).
    update public.cotas
       set sites_criados = sites_criados + 1, atualizado_em = now()
     where email_normalizado = perfil.email_normalizado;
  end if;

  -- ---- o premio de quem indicou ------------------------------------------
  if perfil.convidado_por is not null and not perfil.convite_creditado then
    -- Marca ANTES de pagar e so se ainda nao estava marcado. Duas chamadas
    -- simultaneas: a primeira marca e paga, a segunda nao acha linha pra
    -- atualizar e nao paga de novo.
    update public.perfis
       set convite_creditado = true
     where id = p_usuario and not convite_creditado;

    if found then
      select * into padrinho from public.perfis where id = perfil.convidado_por;
      if padrinho.id is not null then
        insert into public.cotas (email_normalizado)
        values (padrinho.email_normalizado)
        on conflict (email_normalizado) do nothing;

        -- O teto limita o que se GANHA de novo; nunca tira o que a pessoa ja
        -- tinha (o greatest existe pra isso — baixar saldo de alguem por causa
        -- de um teto que mudou seria pegar de volta um premio ja dado).
        update public.cotas
           set slots_ganhos  = greatest(slots_ganhos, least(slots_ganhos + premio, teto)),
               atualizado_em = now()
         where email_normalizado = padrinho.email_normalizado;

        pagou := true;
      end if;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'premiou_convite', pagou, 'premio', premio);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. O SALDO, PRONTO PRA TELA
--    Isto o app PODE chamar do navegador (e so leitura, e so do proprio dono).
--    Existe pra nao haver regra repetida em dois lugares: o saldo que a pessoa
--    ve vem da MESMA fonte que o servidor usa pra autorizar.
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
  usados_hoje    int;
  chamadas_hoje  int;
  ganhos         int;
  proprios_total int;
  convites       int;
begin
  -- Ninguem olha o saldo de outra pessoa. (auth.uid() e nulo quando quem
  -- chama e o servidor com a chave service_role — ai pode consultar qualquer um.)
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

  -- Se os contadores sao de ontem, hoje eles valem zero. Nao gravamos nada
  -- aqui: consultar saldo nao deve escrever no banco (e esta funcao e chamada
  -- a cada abertura do app).
  usados_hoje   := case when cota.dia_casa = hoje then coalesce(cota.slots_casa_usados, 0)  else 0 end;
  chamadas_hoje := case when cota.dia_casa = hoje then coalesce(cota.chamadas_casa_hoje, 0) else 0 end;

  ganhos := least(coalesce(cota.slots_ganhos, 0), (lim->>'teto_slots_convite')::int);
  proprios_total := (lim->>'slots_proprios_base')::int + ganhos;

  select count(*) into convites
  from public.perfis
  where convidado_por = p_usuario and convite_creditado;

  return jsonb_build_object(
    'ok', true,
    'plano', perfil.plano,
    'pago', pago,
    'codigo_convite', perfil.codigo_convite,
    -- slots da casa (a nossa IA), que renovam todo dia
    'casa_total_dia',       teto_sites,
    'casa_usados_hoje',     usados_hoje,
    'casa_restantes_hoje',  greatest(0, teto_sites - usados_hoje),
    'chamadas_total_dia',   teto_chamadas,
    'chamadas_restantes_hoje', greatest(0, teto_chamadas - chamadas_hoje),
    -- slots proprios (chave da pessoa), que vem de convite
    'proprios_total',       proprios_total,
    'proprios_usados',      coalesce(cota.sites_criados, 0),
    'proprios_restantes',   greatest(0, proprios_total - coalesce(cota.sites_criados, 0)),
    'slots_ganhos',         ganhos,
    'convites_pagos',       coalesce(convites, 0),
    'limites', lim
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. QUEM PODE CHAMAR O QUE
--    resumo_slots: a pessoa logada (e so o proprio saldo — a propria funcao
--      confere isso).
--    usar_chave_da_casa / registrar_projeto: SO o servidor. Se o navegador
--      pudesse chamar, bastava abrir o console pra se dar slots.
-- ---------------------------------------------------------------------------
revoke all on function public.usar_chave_da_casa(uuid, boolean)            from public, anon, authenticated;
revoke all on function public.registrar_projeto(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.resumo_slots(uuid)                           from public, anon;

grant execute on function public.usar_chave_da_casa(uuid, boolean)            to service_role;
grant execute on function public.registrar_projeto(uuid, text, text, boolean) to service_role;
grant execute on function public.resumo_slots(uuid)                           to authenticated, service_role;
grant execute on function public.limites_dos_slots()                          to anon, authenticated, service_role;
grant execute on function public.hoje_br()                                    to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Confere o resultado
-- ---------------------------------------------------------------------------
select public.limites_dos_slots() as regras_do_plano;

select
  p.email,
  p.plano,
  coalesce(c.dia_casa::text, 'nunca usou') as dia_da_chave_da_casa,
  coalesce(c.slots_casa_usados, 0)         as sites_da_casa_hoje,
  coalesce(c.sites_criados, 0)             as sites_com_a_chave_dela,
  coalesce(c.slots_ganhos, 0)              as slots_ganhos_convidando,
  p.codigo_convite
from public.perfis p
left join public.cotas c on c.email_normalizado = p.email_normalizado
order by p.criado_em;
