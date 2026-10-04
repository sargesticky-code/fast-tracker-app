-- Keep explicit Forebet source-outage states from being misclassified as
-- unclassified zero-evidence failures. This does not create model evidence.
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
    'UNRESOLVED','pending_forebet_refresh_new_hkjc_target',
    jsonb_build_object(
      'materialized_by','ft_refresh_phase1_coverage_guard',
      'pending_real_source_check',true,
      'hkjc_fetched_at',u.fetched_at
    ),
    now()
  from public.hkjc_upcoming_current u
  left join public.forebet_availability fa using(hkjc_event_id)
  where u.fetched_at >= now()-interval '30 minutes'
    and u.selling is true
    and u.kickoff_hkt >= now()
    and u.kickoff_hkt < now()+interval '48 hours'
    and fa.hkjc_event_id is null
  on conflict(hkjc_event_id) do nothing;

  with targets as (
    select u.hkjc_event_id
    from public.hkjc_upcoming_current u
    where u.fetched_at >= now()-interval '30 minutes'
      and u.selling is true
      and u.kickoff_hkt >= now()
      and u.kickoff_hkt < now()+interval '48 hours'
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
        'Canonical HKJC targets still lack an availability row after materialization; upstream recovery required.'
      when v_stale_forebet>0 then
        'Coverage is materialized, but one or more Forebet availability checks are pending or stale.'
      when v_zero_unclassified>0 then
        format('%s current target(s) have no independent evidence without a confirmed source-absence classification.',v_zero_unclassified)
      when v_zero_expected_absent>0 then
        format('Coverage is healthy; %s target(s) are explicitly classified no-data because current Forebet source evidence is unavailable or does not contain the fixture.',v_zero_expected_absent)
      when v_target_count=0 then
        'No current HKJC selling targets in the 48h window; guard idle.'
      else
        'Canonical 48h target coverage is classified and independent evidence is available where sources provide it.'
    end,
    now(),v_payload
  )
  on conflict(source,metric) do update set
    value_text=excluded.value_text,status=excluded.status,notes=excluded.notes,
    observed_at=excluded.observed_at,raw=excluded.raw;

  return v_payload||jsonb_build_object('status',v_status);
end
$function$

