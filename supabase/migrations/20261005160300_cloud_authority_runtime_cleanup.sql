
insert into private.source_registry(
  source_key,display_name,source_group,phase,is_independent,enabled,notes,metadata,created_at,updated_at,decision_enabled
)
values(
  'FLASHSCORE_BET365','Bet365 via Flashscore cloud','market_authority',1,true,true,
  'Active cloud bookmaker authority. Strict canonical fixture identity; HDA only until additional markets are verified.',
  jsonb_build_object(
    'owner','phase0_cloud_cutover',
    'acquisition_mode','railway_headless_flashscore',
    'bookmaker','Bet365',
    'fixture_identity','strict_unique_verified',
    'market_scope',jsonb_build_array('1X2'),
    'live_price_role','reference_only_until_verified_in_play'
  ),
  now(),now(),false
)
on conflict(source_key) do update set
  display_name=excluded.display_name,
  source_group=excluded.source_group,
  phase=excluded.phase,
  is_independent=excluded.is_independent,
  enabled=true,
  notes=excluded.notes,
  metadata=excluded.metadata,
  updated_at=now();

update private.source_registry
set enabled=false,
    notes='Retired as active authority on 2026-10-05; retained only for historical/source-key compatibility.',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('retired_at','2026-10-05','replacement','FLASHSCORE_BET365'),
    updated_at=now()
where source_key='HKJC';

update private.source_registry
set enabled=false,
    notes='Legacy Bet365 static/API bridge retired; cloud Bet365 authority uses FLASHSCORE_BET365.',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('retired_at','2026-10-05','replacement','FLASHSCORE_BET365'),
    updated_at=now()
where source_key='BET365';


CREATE OR REPLACE FUNCTION private.ft_safe_refresh_phase1_core()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'private', 'api', 'pg_temp'
AS $function$
begin
  begin
    perform public.ft_internal_refresh_phase1_core();
    perform public.ft_refresh_cloud_market_current();
    perform public.ft_refresh_cloud_odds_movement();

    insert into public.source_health(source,metric,value_text,status,notes,observed_at,raw)
    values(
      'PHASE1_CORE_REFRESH','decoupled','OK','OK',
      'Phase 1 core refresh completed with cloud Bet365 market authority and independent prediction evidence.',
      now(),
      jsonb_build_object('mode','CLOUD_MARKET_AUTHORITY','market_source','FLASHSCORE_BET365')
    )
    on conflict(source,metric) do update set
      value_text=excluded.value_text,
      status=excluded.status,
      notes=excluded.notes,
      observed_at=excluded.observed_at,
      raw=excluded.raw;
  exception when others then
    insert into public.source_health(source,metric,value_text,status,notes,observed_at,raw)
    values(
      'PHASE1_CORE_REFRESH','decoupled',sqlerrm,'WARN',
      'Phase 1 core refresh failed; cloud bookmaker staging/current data is preserved independently.',
      now(),
      jsonb_build_object('mode','CLOUD_MARKET_AUTHORITY','sqlstate',sqlstate,'error',sqlerrm)
    )
    on conflict(source,metric) do update set
      value_text=excluded.value_text,
      status=excluded.status,
      notes=excluded.notes,
      observed_at=excluded.observed_at,
      raw=excluded.raw;
  end;
end
$function$

CREATE OR REPLACE FUNCTION public.ft_refresh_cloud_market_current()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
declare
  v_rows integer := 0;
begin
  delete from private.market_current
  where source_key in ('HKJC','FLASHSCORE_BET365');

  insert into private.market_current
    (hkjc_event_id,source_key,market_key,selection_key,line_text,odds,captured_at,raw,updated_at)
  select
    b.hkjc_event_id,
    'FLASHSCORE_BET365',
    '1X2',
    x.selection_key,
    '',
    x.odds,
    b.fetched_at,
    jsonb_build_object(
      'source',b.source,
      'fixture_id',b.bet365_fixture_id,
      'match_quality',b.match_quality,
      'raw',b.raw
    ),
    now()
  from public.bet365_current b
  cross join lateral (values
    ('HOME',b.bet365_home),
    ('DRAW',b.bet365_draw),
    ('AWAY',b.bet365_away)
  ) x(selection_key,odds)
  where b.source='FLASHSCORE_BET365'
    and x.odds is not null
    and x.odds>1
  on conflict (hkjc_event_id,source_key,market_key,selection_key,line_text)
  do update set
    odds=excluded.odds,
    captured_at=excluded.captured_at,
    raw=excluded.raw,
    updated_at=now();

  get diagnostics v_rows = row_count;

  insert into public.source_health(source,metric,value_text,status,notes,observed_at,raw)
  values(
    'FLASHSCORE_BET365','private_market_current',
    v_rows::text,
    case when v_rows>0 then 'OK' else 'ATTENTION' end,
    'Private current market cache contains verified cloud Bet365 1X2 only; retired HKJC market rows are removed.',
    now(),
    jsonb_build_object('rows',v_rows,'market','1X2','source','FLASHSCORE_BET365')
  )
  on conflict(source,metric) do update set
    value_text=excluded.value_text,status=excluded.status,notes=excluded.notes,
    observed_at=excluded.observed_at,raw=excluded.raw;

  return jsonb_build_object('rows',v_rows,'source','FLASHSCORE_BET365');
end
$function$

CREATE OR REPLACE FUNCTION public.ft_refresh_cloud_odds_movement()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_rows integer := 0;
begin
  delete from public.odds_movement_current;

  insert into public.odds_movement_current (
    hkjc_event_id,captured_at,kickoff_hkt,home,away,
    movement_side,now_odds,
    odds_24h,move_24h_pp,
    odds_2h,move_2h_pp,
    odds_1h,move_1h_pp,
    vol_24h_pp,signal,
    model_side,model_prob,model_alignment,
    match_confidence,alert_score,raw,updated_at
  )
  with ids as (
    select distinct s.hkjc_event_id
    from public.odds_snapshots s
    join public.bet365_current b
      on b.hkjc_event_id=s.hkjc_event_id
     and b.source='FLASHSCORE_BET365'
    where s.source='FLASHSCORE_BET365'
      and s.market='ML'
      and s.hkjc_event_id is not null
  ),
  base as (
    select
      i.hkjc_event_id,
      m.kickoff_hkt,
      m.home_en home,
      m.away_en away,
      b.match_quality,
      c.captured_at,
      c.home_price ch,c.draw_price cd,c.away_price ca,
      o.home_price oh,o.draw_price od,o.away_price oa,
      h1.home_price h1h,h1.draw_price h1d,h1.away_price h1a,
      h2.home_price h2h,h2.draw_price h2d,h2.away_price h2a,
      h24.home_price h24h,h24.draw_price h24d,h24.away_price h24a
    from ids i
    join public.matches m using(hkjc_event_id)
    join public.bet365_current b
      on b.hkjc_event_id=i.hkjc_event_id
     and b.source='FLASHSCORE_BET365'
    cross join lateral (
      select s.*
      from public.odds_snapshots s
      where s.hkjc_event_id=i.hkjc_event_id
        and s.source='FLASHSCORE_BET365'
        and s.market='ML'
      order by s.captured_at desc
      limit 1
    ) c
    cross join lateral (
      select s.*
      from public.odds_snapshots s
      where s.hkjc_event_id=i.hkjc_event_id
        and s.source='FLASHSCORE_BET365'
        and s.market='ML'
      order by s.captured_at
      limit 1
    ) o
    left join lateral (
      select s.*
      from public.odds_snapshots s
      where s.hkjc_event_id=i.hkjc_event_id
        and s.source='FLASHSCORE_BET365'
        and s.market='ML'
        and s.captured_at <= c.captured_at-interval '1 hour'
      order by s.captured_at desc
      limit 1
    ) h1 on true
    left join lateral (
      select s.*
      from public.odds_snapshots s
      where s.hkjc_event_id=i.hkjc_event_id
        and s.source='FLASHSCORE_BET365'
        and s.market='ML'
        and s.captured_at <= c.captured_at-interval '2 hours'
      order by s.captured_at desc
      limit 1
    ) h2 on true
    left join lateral (
      select s.*
      from public.odds_snapshots s
      where s.hkjc_event_id=i.hkjc_event_id
        and s.source='FLASHSCORE_BET365'
        and s.market='ML'
        and s.captured_at <= c.captured_at-interval '24 hours'
      order by s.captured_at desc
      limit 1
    ) h24 on true
  ),
  probs as (
    select b.*,
      case when ch>1 and cd>1 and ca>1 then (1/ch)/(1/ch+1/cd+1/ca) end cph,
      case when ch>1 and cd>1 and ca>1 then (1/cd)/(1/ch+1/cd+1/ca) end cpd,
      case when ch>1 and cd>1 and ca>1 then (1/ca)/(1/ch+1/cd+1/ca) end cpa,
      case when h1h>1 and h1d>1 and h1a>1 then (1/h1h)/(1/h1h+1/h1d+1/h1a) end p1h,
      case when h1h>1 and h1d>1 and h1a>1 then (1/h1d)/(1/h1h+1/h1d+1/h1a) end p1d,
      case when h1h>1 and h1d>1 and h1a>1 then (1/h1a)/(1/h1h+1/h1d+1/h1a) end p1a,
      case when h2h>1 and h2d>1 and h2a>1 then (1/h2h)/(1/h2h+1/h2d+1/h2a) end p2h,
      case when h2h>1 and h2d>1 and h2a>1 then (1/h2d)/(1/h2h+1/h2d+1/h2a) end p2d,
      case when h2h>1 and h2d>1 and h2a>1 then (1/h2a)/(1/h2h+1/h2d+1/h2a) end p2a,
      case when h24h>1 and h24d>1 and h24a>1 then (1/h24h)/(1/h24h+1/h24d+1/h24a) end p24h,
      case when h24h>1 and h24d>1 and h24a>1 then (1/h24d)/(1/h24h+1/h24d+1/h24a) end p24d,
      case when h24h>1 and h24d>1 and h24a>1 then (1/h24a)/(1/h24h+1/h24d+1/h24a) end p24a,
      case when oh>1 and od>1 and oa>1 then (1/oh)/(1/oh+1/od+1/oa) end oph,
      case when oh>1 and od>1 and oa>1 then (1/od)/(1/oh+1/od+1/oa) end opd,
      case when oh>1 and od>1 and oa>1 then (1/oa)/(1/oh+1/od+1/oa) end opa
    from base b
  ),
  chosen as (
    select p.*,
      case
        when abs(cph-coalesce(p24h,p2h,p1h,oph)) >= greatest(
             abs(cpd-coalesce(p24d,p2d,p1d,opd)),
             abs(cpa-coalesce(p24a,p2a,p1a,opa))) then 'H'
        when abs(cpd-coalesce(p24d,p2d,p1d,opd)) >=
             abs(cpa-coalesce(p24a,p2a,p1a,opa)) then 'D'
        else 'A'
      end side
    from probs p
    where cph is not null and cpd is not null and cpa is not null
  )
  select
    x.hkjc_event_id,x.captured_at,x.kickoff_hkt,x.home,x.away,
    x.side,
    case x.side when 'H' then x.ch when 'D' then x.cd else x.ca end now_odds,
    case x.side when 'H' then x.h24h when 'D' then x.h24d else x.h24a end odds_24h,
    case x.side when 'H' then round((x.cph-x.p24h)*100,2)
                when 'D' then round((x.cpd-x.p24d)*100,2)
                else round((x.cpa-x.p24a)*100,2) end move_24h_pp,
    case x.side when 'H' then x.h2h when 'D' then x.h2d else x.h2a end odds_2h,
    case x.side when 'H' then round((x.cph-x.p2h)*100,2)
                when 'D' then round((x.cpd-x.p2d)*100,2)
                else round((x.cpa-x.p2a)*100,2) end move_2h_pp,
    case x.side when 'H' then x.h1h when 'D' then x.h1d else x.h1a end odds_1h,
    case x.side when 'H' then round((x.cph-x.p1h)*100,2)
                when 'D' then round((x.cpd-x.p1d)*100,2)
                else round((x.cpa-x.p1a)*100,2) end move_1h_pp,
    (
      select round((max(z.p)-min(z.p))*100,2)
      from (
        select case x.side
          when 'H' then (1/s.home_price)/(1/s.home_price+1/s.draw_price+1/s.away_price)
          when 'D' then (1/s.draw_price)/(1/s.home_price+1/s.draw_price+1/s.away_price)
          else (1/s.away_price)/(1/s.home_price+1/s.draw_price+1/s.away_price)
        end p
        from public.odds_snapshots s
        where s.hkjc_event_id=x.hkjc_event_id
          and s.source='FLASHSCORE_BET365'
          and s.market='ML'
          and s.captured_at >= x.captured_at-interval '24 hours'
          and s.home_price>1 and s.draw_price>1 and s.away_price>1
      ) z
    ) vol_24h_pp,
    case
      when coalesce(
        abs(case x.side when 'H' then (x.cph-x.p24h)*100 when 'D' then (x.cpd-x.p24d)*100 else (x.cpa-x.p24a)*100 end),
        abs(case x.side when 'H' then (x.cph-x.p2h)*100 when 'D' then (x.cpd-x.p2d)*100 else (x.cpa-x.p2a)*100 end),
        abs(case x.side when 'H' then (x.cph-x.p1h)*100 when 'D' then (x.cpd-x.p1d)*100 else (x.cpa-x.p1a)*100 end)
      ) is null then 'COLLECTING'
      when greatest(
        coalesce(abs(case x.side when 'H' then (x.cph-x.p24h)*100 when 'D' then (x.cpd-x.p24d)*100 else (x.cpa-x.p24a)*100 end),0),
        coalesce(abs(case x.side when 'H' then (x.cph-x.p2h)*100 when 'D' then (x.cpd-x.p2d)*100 else (x.cpa-x.p2a)*100 end),0),
        coalesce(abs(case x.side when 'H' then (x.cph-x.p1h)*100 when 'D' then (x.cpd-x.p1d)*100 else (x.cpa-x.p1a)*100 end),0)
      ) >= 2 then 'MOVE'
      else 'STABLE'
    end signal,
    null::text model_side,
    null::numeric model_prob,
    'NO_MODEL'::text model_alignment,
    coalesce(x.match_quality,1)::numeric match_confidence,
    greatest(
      coalesce(abs(case x.side when 'H' then (x.cph-x.p24h)*100 when 'D' then (x.cpd-x.p24d)*100 else (x.cpa-x.p24a)*100 end),0),
      coalesce(abs(case x.side when 'H' then (x.cph-x.p2h)*100 when 'D' then (x.cpd-x.p2d)*100 else (x.cpa-x.p2a)*100 end),0),
      coalesce(abs(case x.side when 'H' then (x.cph-x.p1h)*100 when 'D' then (x.cpd-x.p1d)*100 else (x.cpa-x.p1a)*100 end),0)
    )::numeric alert_score,
    jsonb_build_object(
      'source','FLASHSCORE_BET365',
      'method','NO_VIG_PROBABILITY_MOVEMENT',
      'baseline_priority',jsonb_build_array('24h','2h','1h','opening'),
      'opening_odds',jsonb_build_object('home',x.oh,'draw',x.od,'away',x.oa),
      'current_odds',jsonb_build_object('home',x.ch,'draw',x.cd,'away',x.ca)
    ),
    now()
  from chosen x;

  get diagnostics v_rows = row_count;

  insert into public.source_health(source,metric,value_text,status,notes,observed_at,raw)
  values(
    'FLASHSCORE_BET365','odds_movement',
    v_rows::text,
    case when v_rows>0 then 'OK' else 'ATTENTION' end,
    'Current odds movement cache rebuilt only from verified cloud Bet365 ML snapshots.',
    now(),
    jsonb_build_object('rows',v_rows,'source','FLASHSCORE_BET365','windows',jsonb_build_array('1h','2h','24h'))
  )
  on conflict(source,metric) do update set
    value_text=excluded.value_text,status=excluded.status,notes=excluded.notes,
    observed_at=excluded.observed_at,raw=excluded.raw;

  return jsonb_build_object('rows',v_rows,'source','FLASHSCORE_BET365');
end
$function$

CREATE OR REPLACE FUNCTION public.ft_refresh_phase1_coverage_guard()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
declare
  v_target_count integer := 0;
  v_missing_availability integer := 0;
  v_forebet_models integer := 0;
  v_fixture_only integer := 0;
  v_source_absent integer := 0;
  v_stale_forebet integer := 0;
  v_zero_evidence integer := 0;
  v_zero_expected_absent integer := 0;
  v_zero_unclassified integer := 0;
  v_missing_ids text[] := array[]::text[];
  v_zero_evidence_ids text[] := array[]::text[];
  v_zero_unclassified_ids text[] := array[]::text[];
  v_status text;
  v_payload jsonb;
begin
  insert into public.forebet_availability (
    hkjc_event_id,checked_at,match_date,kickoff_hkt,league_zh,home_en,away_en,
    state,reason,raw,updated_at
  )
  select
    u.hkjc_event_id,null,
    to_char(u.kickoff_hkt at time zone 'Asia/Hong_Kong','YYYY-MM-DD'),
    u.kickoff_hkt,u.tournament,u.home_en,u.away_en,
    'UNRESOLVED','pending_forebet_refresh_new_canonical_target',
    jsonb_build_object(
      'materialized_by','ft_refresh_phase1_coverage_guard',
      'pending_real_source_check',true,
      'canonical_fetched_at',u.fetched_at
    ),
    now()
  from public.matches u
  left join public.forebet_availability fa using(hkjc_event_id)
  where u.kickoff_hkt >= now()
    and u.kickoff_hkt < now()+interval '48 hours'
    and upper(coalesce(u.status,'')) not in ('FINISHED','FT','FULLTIME','FULL_TIME','ENDED','CANCELLED','POSTPONED')
    and fa.hkjc_event_id is null
  on conflict(hkjc_event_id) do nothing;

  with targets as (
    select u.hkjc_event_id
    from public.matches u
    where u.kickoff_hkt >= now()
      and u.kickoff_hkt < now()+interval '48 hours'
      and upper(coalesce(u.status,'')) not in ('FINISHED','FT','FULLTIME','FULL_TIME','ENDED','CANCELLED','POSTPONED')
  ),
  coverage as (
    select
      t.hkjc_event_id,
      fa.state forebet_state,
      fa.reason forebet_reason,
      fa.checked_at forebet_checked_at,
      (
        fp.hkjc_event_id is not null
        and fp.prob_home is not null
        and fp.prob_draw is not null
        and fp.prob_away is not null
      ) has_forebet_model,
      coalesce(h.evidence_channel_count,0) evidence_channel_count,
      (
        coalesce(h.evidence_channel_count,0)=0
        and fa.state='UNRESOLVED'
        and fa.reason in (
          'forebet_source_surface_unavailable',
          'no_forebet_source_rows_for_date',
          'forebet_fixture_absent_from_fetched_model_surfaces'
        )
      ) zero_is_expected_source_absence
    from targets t
    left join public.forebet_availability fa using(hkjc_event_id)
    left join public.forebet_predictions fp using(hkjc_event_id)
    left join private.phase1_data_health_current h using(hkjc_event_id)
  )
  select
    count(*)::int,
    count(*) filter(where forebet_state is null)::int,
    count(*) filter(where has_forebet_model)::int,
    count(*) filter(where forebet_state='FIXTURE_ONLY')::int,
    count(*) filter(where forebet_state='UNRESOLVED')::int,
    count(*) filter(
      where forebet_state is not null
        and (forebet_checked_at is null or forebet_checked_at < now()-interval '14 hours')
    )::int,
    count(*) filter(where evidence_channel_count=0)::int,
    count(*) filter(where zero_is_expected_source_absence)::int,
    count(*) filter(where evidence_channel_count=0 and not zero_is_expected_source_absence)::int,
    coalesce(array_agg(hkjc_event_id order by hkjc_event_id)
      filter(where forebet_state is null),array[]::text[]),
    coalesce(array_agg(hkjc_event_id order by hkjc_event_id)
      filter(where evidence_channel_count=0),array[]::text[]),
    coalesce(array_agg(hkjc_event_id order by hkjc_event_id)
      filter(where evidence_channel_count=0 and not zero_is_expected_source_absence),array[]::text[])
  into
    v_target_count,v_missing_availability,v_forebet_models,v_fixture_only,
    v_source_absent,v_stale_forebet,v_zero_evidence,v_zero_expected_absent,
    v_zero_unclassified,v_missing_ids,v_zero_evidence_ids,v_zero_unclassified_ids
  from coverage;

  v_status := case
    when v_missing_availability>0 then 'FAIL'
    when v_stale_forebet>0 or v_zero_unclassified>0 then 'WARN'
    else 'PASS'
  end;

  v_payload := jsonb_build_object(
    'window_hours',48,
    'target_count',v_target_count,
    'missing_forebet_availability',v_missing_availability,
    'forebet_model_count',v_forebet_models,
    'forebet_fixture_only_count',v_fixture_only,
    'forebet_source_absent_count',v_source_absent,
    'stale_forebet_checks',v_stale_forebet,
    'zero_independent_evidence_count',v_zero_evidence,
    'zero_evidence_expected_source_absence_count',v_zero_expected_absent,
    'zero_evidence_unclassified_count',v_zero_unclassified,
    'missing_availability_ids',to_jsonb(v_missing_ids[1:50]),
    'zero_evidence_ids',to_jsonb(v_zero_evidence_ids[1:50]),
    'zero_evidence_unclassified_ids',to_jsonb(v_zero_unclassified_ids[1:50])
  );

  insert into public.source_health(source,metric,value_text,status,notes,observed_at,raw)
  values(
    'PHASE1_COVERAGE_GUARD','48h',v_payload::text,v_status,
    case
      when v_missing_availability>0 then
        'Canonical fixtures still lack an availability row after materialization; source recovery required.'
      when v_stale_forebet>0 then
        'Coverage is materialized, but one or more Forebet availability checks are pending or stale.'
      when v_zero_unclassified>0 then
        format('%s current target(s) have no independent evidence without a confirmed source-absence classification.',v_zero_unclassified)
      when v_zero_expected_absent>0 then
        format('Coverage is healthy; %s target(s) are explicitly classified no-data because current Forebet source evidence is unavailable or does not contain the fixture.',v_zero_expected_absent)
      when v_target_count=0 then
        'No current canonical fixtures in the 48h window; guard idle.'
      else
        'Canonical 48h fixture coverage is classified and independent evidence is available where sources provide it.'
    end,
    now(),v_payload
  )
  on conflict(source,metric) do update set
    value_text=excluded.value_text,status=excluded.status,notes=excluded.notes,
    observed_at=excluded.observed_at,raw=excluded.raw;

  return v_payload||jsonb_build_object('status',v_status);
end
$function$
