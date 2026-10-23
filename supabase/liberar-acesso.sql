-- ===========================================================================
--  LIBERAR ACESSO COMPLETO PARA UMA PESSOA
--  ---------------------------------------------------------------------
--  COMO USAR: troque o e-mail na linha marcada abaixo e clique em Run.
--  Supabase das CONTAS -> SQL Editor -> New query -> cole tudo -> Run.
--
--  Funciona mesmo se a pessoa AINDA NAO TIVER CONTA: o acesso fica guardado
--  e entra sozinho no dia em que ela se cadastrar com esse e-mail.
--
--  ---------------------------------------------------------------------
--  POR QUE ALGUEM "QUE JA ESTAVA NO BANCO" APARECE COMO GRATIS
--
--  O contas.sql promoveu a 'anual' quem existia NAQUELE MOMENTO. Foi uma
--  foto, nao uma regra: quem se cadastrou depois nasce 'free'. E por isso
--  que existe este script (e a pagina /acesso-anual, que faz o mesmo pela
--  tela, sem SQL).
--
--  SINTOMA TIPICO DE PLANO GRATIS: a pessoa so consegue usar o modo
--  Automatico e nao consegue escolher DeepSeek, Claude ou outra API paga --
--  mesmo tendo a chave dela. Isso nao e defeito: e a trava do plano.
-- ===========================================================================

do $$
declare
  -- >>>>>>>>>>>>  TROQUE SO ESTA LINHA  <<<<<<<<<<<<
  v_email text := 'email-da-pessoa@exemplo.com';

  -- 'anual' = acesso completo. Use 'mensal' ou 'free' se quiser outro.
  v_plano text := 'anual';
  -- NULL = nunca vence. Para dar 12 meses: now() + interval '12 months'
  v_vence timestamptz := null;

  v_norm   text;
  v_quantas int;
begin
  v_norm := public.normalizar_email(v_email);

  update public.perfis
     set plano           = v_plano,
         plano_expira_em = v_vence,
         plano_origem    = 'manual'
   where email_normalizado = v_norm;

  get diagnostics v_quantas = row_count;

  if v_quantas > 0 then
    raise notice 'Pronto: % conta(s) de % agora estao no plano %.', v_quantas, v_email, v_plano;
  else
    -- Ainda nao tem conta: guarda para aplicar no cadastro.
    insert into public.acessos_pendentes (email_normalizado, plano, plano_expira_em, origem)
    values (v_norm, v_plano, v_vence, 'manual')
    on conflict (email_normalizado)
      do update set plano = excluded.plano,
                    plano_expira_em = excluded.plano_expira_em,
                    origem = 'manual';
    raise notice '% ainda nao tem conta. Acesso guardado: quando ela se cadastrar, ja entra no plano %.', v_email, v_plano;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- CONFERE: mostra como a pessoa ficou.
-- Troque o e-mail aqui tambem.
-- ---------------------------------------------------------------------------
select
  p.email,
  p.plano,
  coalesce(p.plano_expira_em::text, 'nao vence') as vence,
  p.plano_origem as origem,
  case when public.plano_pago_vale(p.plano, p.plano_expira_em)
       then 'SIM — pode usar as APIs pagas'
       else 'NAO — so automatico e IAs gratuitas'
  end as acesso_completo
from public.perfis p
where p.email_normalizado = public.normalizar_email('email-da-pessoa@exemplo.com');

-- ---------------------------------------------------------------------------
-- BONUS: quem esta em cada plano hoje (sem mostrar e-mail de ninguem)
-- ---------------------------------------------------------------------------
select plano,
       count(*) as pessoas,
       count(*) filter (where plano_expira_em is null) as sem_vencimento
from public.perfis
group by plano
order by plano;
