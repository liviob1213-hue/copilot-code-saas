-- ===========================================================================
--  LIBERAR UM PLANO PARA ALGUEM, PELO E-MAIL
--  ---------------------------------------------------------------------
--  COMO USAR: Supabase das CONTAS -> SQL Editor -> New query -> cole ESTE
--  ARQUIVO INTEIRO (do começo ao fim) -> troque as tres linhas marcadas la
--  embaixo -> Run.
--
--  ATENCAO: COLAR SO AS TRES LINHAS NAO LIBERA NADA. Elas apenas anotam o
--  e-mail e o plano; quem grava o acesso e o bloco "do $$" que vem depois.
--  Se o resultado vier so com uma coluna "set_config" e o numero 1, foi isso
--  que aconteceu: faltou colar o resto.
--
--  Serve para:
--    - consertar um pagamento que a Kiwify nao avisou direito
--    - liberar quem comprou com um e-mail e usa o app com outro
--    - dar acesso de cortesia
--    - tirar acesso de alguem (plano 'free')
--
--  Espaco sobrando e MAIUSCULA nao atrapalham: normalizar_email() cuida disso.
--
--  Funciona mesmo se a pessoa AINDA NAO TIVER CONTA: o acesso fica guardado e
--  entra sozinho no dia em que ela se cadastrar com esse e-mail.
--
--  Pode rodar quantas vezes quiser. Rodar de novo com outro plano TROCA o
--  plano (nao soma).
--
--  ---------------------------------------------------------------------
--  SINTOMA TIPICO DE QUEM PRECISA DISTO: a pessoa pagou, mas o app pede
--  assinatura — no seletor de IA ("so no plano pago") e na hora de gerar.
--  Quase sempre e um destes tres:
--    a) ela comprou com um e-mail e entra no app com outro;
--    b) o aviso da Kiwify nao chegou (veja /api/diagnostico);
--    c) o plano venceu e a renovacao nao foi avisada.
--  Nos tres, a saida e a mesma: liberar aqui, no e-mail com que ela ENTRA NO
--  APP (nao no da compra).
-- ===========================================================================


-- >>>>>>>>>>>>>>>>>>  TROQUE ESTAS TRES LINHAS  <<<<<<<<<<<<<<<<<<

-- 1. O e-mail COM QUE A PESSOA ENTRA NO APP (nao o da compra, se forem
--    diferentes — e quem entra no app que precisa do plano).
select set_config('prumo.email', 'email-da-pessoa@exemplo.com', false);

-- 2. QUAL PLANO. Escreva exatamente um destes:
--
--      'basico'   R$ 24,97/mes  -> libera a DeepSeek
--      'pro'      R$ 34,97/mes  -> libera o Claude (e o gateway TeamSocLo) e o xAI Grok
--      'premium'  R$ 47/mes     -> libera TODAS as IAs pagas
--      'anual'    R$ 297/ano    -> o Premium, com o bonus do Prumo Edit
--      'free'                   -> TIRA o acesso pago
select set_config('prumo.plano', 'basico', false);

-- 3. POR QUANTOS MESES. Use:
--
--      1   assinatura mensal (o normal: Basico, Pro, Premium)
--      12  assinatura anual
--      0   nunca vence — acesso vitalicio, para cortesia
--
--    Nao precisa ter medo de errar para menos: quando a Kiwify avisar a
--    renovacao, a data e empurrada sozinha. E a data ganha 3 dias de folga,
--    porque a renovacao nem sempre cai no minuto exato — sem a folga, um
--    cliente em dia veria o acesso sumir por algumas horas.
select set_config('prumo.meses', '1', false);


-- ---------------------------------------------------------------------------
-- Daqui para baixo nao precisa mexer em nada.
-- ---------------------------------------------------------------------------
do $$
declare
  v_email  text := current_setting('prumo.email', true);
  v_plano  text := coalesce(nullif(current_setting('prumo.plano', true), ''), 'basico');
  v_meses  int  := coalesce(nullif(current_setting('prumo.meses', true), '')::int, 1);
  v_vence  timestamptz;
  v_norm   text;
  v_quantas int;
begin
  if v_email is null or v_email = '' or position('@' in v_email) = 0 then
    raise exception 'E-mail vazio ou sem @. Rode o script INTEIRO (as linhas do set_config vao junto).';
  end if;

  if v_email = 'email-da-pessoa@exemplo.com' then
    raise exception 'Troque o e-mail de exemplo na primeira linha pelo e-mail da pessoa.';
  end if;

  -- Nome de plano errado (um "premiun" da vida) gravaria no banco um plano que
  -- a ferramenta nao conhece. Como ela trata plano desconhecido como Premium,
  -- o erro passaria despercebido ate alguem receber mais do que comprou.
  if v_plano not in ('free', 'basico', 'pro', 'premium', 'anual') then
    raise exception 'Plano "%" nao existe. Use free, basico, pro, premium ou anual.', v_plano;
  end if;

  -- 0 meses = nao vence. Os 3 dias de folga valem so para quem tem prazo.
  v_vence := case when v_meses > 0
    then now() + (v_meses || ' months')::interval + interval '3 days'
    else null end;

  v_norm := public.normalizar_email(v_email);

  update public.perfis
     set plano           = v_plano,
         plano_expira_em = v_vence,
         plano_origem    = 'manual'
   where email_normalizado = v_norm;

  get diagnostics v_quantas = row_count;

  if v_quantas > 0 then
    -- A conta esta com o plano CERTO agora, entao qualquer pagamento antigo na
    -- lista de espera deixou de valer. Apagar e OBRIGATORIO: o banco aplica o
    -- que esta guardado la sempre que a pessoa abre o app (ver
    -- public.aplicar_acesso_pendente). Sem esta limpeza, tirar o acesso de
    -- alguem aqui seria desfeito por um pendente velho na abertura seguinte.
    delete from public.acessos_pendentes where email_normalizado = v_norm;

    raise notice 'PRONTO: % conta(s) de % no plano %. %',
      v_quantas, v_email, v_plano,
      case when v_vence is null then 'Nao vence.'
           else 'Vence em ' || to_char(v_vence, 'DD/MM/YYYY') || '.' end;
    raise notice 'Peca para a pessoa recarregar a pagina (F5).';
  else
    insert into public.acessos_pendentes (email_normalizado, plano, plano_expira_em, origem)
    values (v_norm, v_plano, v_vence, 'manual')
    on conflict (email_normalizado)
      do update set plano = excluded.plano,
                    plano_expira_em = excluded.plano_expira_em,
                    origem = 'manual';

    raise notice 'ATENCAO: % ainda NAO TEM CONTA no app.', v_email;
    raise notice 'O acesso ficou guardado e entra sozinho quando ela se cadastrar com ESSE e-mail exato.';
    raise notice 'Se ela ja usa o app, entao ela entra com OUTRO e-mail — rode de novo com o e-mail certo.';
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- CONFERE (nao precisa mexer: usa o mesmo e-mail de cima)
--
-- O que voce quer ver: uma linha, com "acesso" dizendo SIM e as IAs liberadas.
-- Se vier VAZIO, a pessoa nao tem conta com esse e-mail -- o acesso ficou
-- guardado, e a segunda consulta abaixo mostra essa espera.
-- ---------------------------------------------------------------------------
select
  p.email,
  p.plano,
  coalesce(to_char(p.plano_expira_em, 'DD/MM/YYYY'), 'nao vence') as vence,
  p.plano_origem as origem,
  case when public.plano_pago_vale(p.plano, p.plano_expira_em)
       then 'SIM'
       else 'NAO — so automatico e IAs gratuitas'
  end as acesso,
  case p.plano
    when 'basico'  then 'DeepSeek'
    when 'pro'     then 'Claude (direta e TeamSocLo) e xAI Grok'
    when 'premium' then 'todas as IAs pagas'
    when 'anual'   then 'todas as IAs pagas'
    when 'free'    then 'nenhuma IA paga'
    else 'todas as IAs pagas (plano fora da lista conta como Premium)'
  end as ias_pagas_liberadas
from public.perfis p
where p.email_normalizado = public.normalizar_email(current_setting('prumo.email', true));


-- Esperando o cadastro? (so aparece linha se a pessoa ainda nao tem conta)
select email_normalizado, plano, origem, criado_em
from public.acessos_pendentes
where email_normalizado = public.normalizar_email(current_setting('prumo.email', true));


-- Quem esta em cada plano hoje (sem mostrar e-mail de ninguem)
select plano,
       count(*) as pessoas,
       count(*) filter (where plano_expira_em is null) as sem_vencimento,
       count(*) filter (where plano_expira_em is not null
                          and plano_expira_em <= now()) as vencidos
from public.perfis
group by plano
order by plano;
