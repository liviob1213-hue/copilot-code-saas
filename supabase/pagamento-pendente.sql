-- ===========================================================================
--  CONSERTO: "eu paguei e o app diz que eu nao assinei"
--  ---------------------------------------------------------------------
--  Rode UMA VEZ no Supabase das CONTAS:
--  Dashboard -> SQL Editor -> New query -> cole tudo -> Run.
--
--  Pode rodar de novo quantas vezes quiser. Nao apaga nada e nunca rebaixa
--  o plano de ninguem.
--
--  ---------------------------------------------------------------------
--  O QUE ESTAVA ACONTECENDO (o caso do cliente do plano Basico)
--
--  Quando a Kiwify avisa um pagamento, /api/kiwify procura o perfil pelo
--  e-mail. Se nao acha, guarda o pagamento em public.acessos_pendentes —
--  uma lista de espera, para a pessoa que compra ANTES de criar a conta.
--
--  So que esse pagamento guardado era aplicado em UM unico momento: no
--  gatilho que roda quando o usuario NASCE (public.ao_criar_usuario).
--  Quem tinha conta mas estava sem a linha em public.perfis — e isso
--  acontecia, porque o gatilho antigo falhava calado e o conserto em
--  supabase/conserta-cadastro.sql cria o perfil faltando SEM olhar a lista
--  de espera — ficava assim:
--
--     pagou -> nao tinha perfil -> pagamento foi pra lista de espera
--     perfil criado depois      -> nasceu como 'free'
--     lista de espera           -> ninguem mais olhava
--
--  Resultado: cliente pagante no plano 'free'. A Kiwify mostra "voce ja
--  adquiriu" (porque ele adquiriu mesmo), e o app pede assinatura — no
--  seletor de IA e na hora de gerar.
--
--  ---------------------------------------------------------------------
--  O CONSERTO, EM TRES PARTES
--    1. public.aplicar_acesso_pendente(): pega o pagamento guardado e
--       coloca no perfil. Serve pra conta que JA EXISTE.
--    2. public.resumo_slots() passa a chamar isso antes de responder. Ou
--       seja: na proxima vez que a pessoa abrir o app, o plano dela se
--       conserta sozinho. Ninguem precisa pedir suporte.
--    3. Um conserto geral, agora, de TODO pagamento que ficou preso na
--       lista de espera de alguem que ja tem conta.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Aplicar o pagamento que ficou guardado
--
--    NUNCA REBAIXA: se a pessoa ja esta com plano pago valendo, a linha da
--    lista de espera e so descartada (ela ja cumpriu o papel). Um pendente
--    antigo nao pode derrubar um plano novo.
-- ---------------------------------------------------------------------------
create or replace function public.aplicar_acesso_pendente(p_usuario uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  perfil    public.perfis%rowtype;
  pendente  public.acessos_pendentes%rowtype;
begin
  select * into perfil from public.perfis where id = p_usuario;
  if perfil.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_perfil');
  end if;

  select * into pendente
  from public.acessos_pendentes
  where email_normalizado = perfil.email_normalizado;

  if pendente.email_normalizado is null then
    return jsonb_build_object('ok', true, 'aplicou', false, 'motivo', 'nada_guardado');
  end if;

  -- Ja esta pago e valendo? Nao mexe no plano — so limpa a espera.
  if public.plano_pago_vale(perfil.plano, perfil.plano_expira_em) then
    delete from public.acessos_pendentes where email_normalizado = perfil.email_normalizado;
    return jsonb_build_object('ok', true, 'aplicou', false, 'motivo', 'ja_estava_pago',
                              'plano', perfil.plano);
  end if;

  update public.perfis
     set plano           = pendente.plano,
         plano_expira_em = pendente.plano_expira_em,
         plano_origem    = coalesce(pendente.origem, 'kiwify')
   where id = p_usuario;

  delete from public.acessos_pendentes where email_normalizado = perfil.email_normalizado;

  return jsonb_build_object(
    'ok', true,
    'aplicou', true,
    'plano', pendente.plano,
    'vence_em', pendente.plano_expira_em,
    'origem', coalesce(pendente.origem, 'kiwify')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. O saldo, agora consertando o plano antes de responder
--
--    E A MESMA FUNCAO de supabase/slots.sql, com UMA linha nova: a chamada
--    de aplicar_acesso_pendente() no comeco.
--
--    "Mas consultar saldo nao devia escrever no banco." Era a regra, e ela
--    vale pro caso normal: quando nao ha nada na lista de espera, esta
--    funcao continua so lendo. A escrita acontece uma unica vez na vida,
--    exatamente para a pessoa que pagou e estava vendo o plano errado. O
--    preco de nao fazer isso aqui e o cliente ter que abrir chamado — e ele
--    ja pagou.
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

  -- Pagamento que ficou preso na lista de espera entra AGORA, antes de a
  -- gente ler o plano. Sem isto, quem pagou abria o app e via 'free'.
  perform public.aplicar_acesso_pendente(p_usuario);

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

  -- Se os contadores sao de ontem, hoje eles valem zero.
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
    'vence_em', perfil.plano_expira_em,
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
-- 3. Quem pode chamar
--    aplicar_acesso_pendente SO o servidor. O navegador nao chama direto:
--    quem usa isso pela pessoa logada e o resumo_slots, que e security
--    definer e por isso consegue chamar por dentro.
-- ---------------------------------------------------------------------------
revoke all on function public.aplicar_acesso_pendente(uuid) from public, anon, authenticated;
grant execute on function public.aplicar_acesso_pendente(uuid) to service_role;
grant execute on function public.resumo_slots(uuid)            to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. CONSERTO GERAL, AGORA
--    Todo pagamento preso na lista de espera de alguem que JA tem conta e
--    ainda nao esta pago valendo: aplica.
-- ---------------------------------------------------------------------------
with alvos as (
  select p.id, p.email_normalizado, a.plano, a.plano_expira_em, a.origem
  from public.acessos_pendentes a
  join public.perfis p on p.email_normalizado = a.email_normalizado
  where not public.plano_pago_vale(p.plano, p.plano_expira_em)
),
corrigidos as (
  update public.perfis p
     set plano           = a.plano,
         plano_expira_em = a.plano_expira_em,
         plano_origem    = coalesce(a.origem, 'kiwify')
    from alvos a
   where p.id = a.id
  returning p.email, p.plano
)
select email as conta_consertada, plano as plano_agora from corrigidos;

-- Limpa a espera de quem ja tem conta com plano pago valendo (inclusive os
-- que acabaram de ser consertados acima).
delete from public.acessos_pendentes a
using public.perfis p
where p.email_normalizado = a.email_normalizado
  and public.plano_pago_vale(p.plano, p.plano_expira_em);

-- ---------------------------------------------------------------------------
-- 5. Confere
-- ---------------------------------------------------------------------------
select
  p.email,
  p.plano,
  p.plano_origem,
  coalesce(p.plano_expira_em::text, 'nao vence') as vence_em,
  public.plano_pago_vale(p.plano, p.plano_expira_em) as pago
from public.perfis p
where p.plano <> 'free'
order by p.criado_em desc
limit 50;

-- Sobrou alguem na lista de espera? Esses sao pagamentos de gente que ainda
-- NAO criou conta — normal. Eles entram sozinhos no dia do cadastro.
select email_normalizado, plano, criado_em from public.acessos_pendentes order by criado_em desc;
