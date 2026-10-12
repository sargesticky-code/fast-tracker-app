-- Durable Forebet source ingestion. Uses existing Railway container and the
-- existing FOREBET+FLASHSCORE VERIFIED alias keys, never HKJC API/provider.
-- No new alias maintenance. One small private state row, one bounded cron.
CREATE TABLE IF NOT EXISTS private.ft_forebet_ingest_state(
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  pending_request_id bigint,
  pending_since timestamptz,
  last_capture_at timestamptz,
  last_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.ft_forebet_ingest_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.ft_forebet_ingest_state FROM PUBLIC,anon,authenticated;
INSERT INTO private.ft_forebet_ingest_state(singleton) VALUES(true)
ON CONFLICT(singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION private.ft_ingest_forebet_direct_snapshot(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','public','private','pg_temp'
AS $func$
DECLARE
  r jsonb; v_id text; v_ts timestamptz; v_source_date date;
  v_match_id text; v_kickoff timestamptz; v_home text; v_away text;
  v_count integer; v_source_count integer; v_matched integer:=0;
  v_applied integer:=0; v_unchanged integer:=0; v_rejected integer:=0;
  v_forecast jsonb; v_response jsonb; v_run text;
BEGIN
  IF p_payload->>'source' IS DISTINCT FROM 'FOREBET_DIRECT_LISTINGS'
    OR p_payload->>'ok' IS DISTINCT FROM 'true'
    OR jsonb_typeof(p_payload->'rows') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'FOREBET_SOURCE_ENVELOPE_INVALID'; END IF;
  v_source_count:=jsonb_array_length(p_payload->'rows');
  IF v_source_count NOT BETWEEN 10 AND 650
  THEN RAISE EXCEPTION 'FOREBET_SOURCE_BUDGET_INVALID'; END IF;
  v_ts:=(p_payload->>'captured_at')::timestamptz;
  IF v_ts < now()-interval '6 hours' OR v_ts > now()+interval '2 minutes'
  THEN RAISE EXCEPTION 'FOREBET_SOURCE_STALE'; END IF;
  IF (SELECT count(DISTINCT x->>'source_event_id')
       FROM jsonb_array_elements(p_payload->'rows') x) <> v_source_count
  THEN RAISE EXCEPTION 'FOREBET_DUPLICATE_SOURCE_ID'; END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(p_payload->'rows') LOOP
    BEGIN
      v_id:=r->>'source_event_id';
      IF v_id !~ '^[0-9]{5,12}$'
        OR coalesce(r->>'source_url','') !~
           '^https://www[.]forebet[.]com/en/football/matches/[a-z0-9-]+-[0-9]{5,12}$'
        OR right(r->>'source_url',length(v_id)+1) IS DISTINCT FROM '-'||v_id
        OR r->>'source_date' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
        OR r->>'home' IS NULL OR r->>'away' IS NULL
        OR length(r->>'home') NOT BETWEEN 2 AND 140
        OR length(r->>'away') NOT BETWEEN 2 AND 140
        OR r->>'home'=r->>'away'
        OR (r->>'prob_home')::numeric NOT BETWEEN 0 AND 100
        OR (r->>'prob_draw')::numeric NOT BETWEEN 0 AND 100
        OR (r->>'prob_away')::numeric NOT BETWEEN 0 AND 100
        OR ((r->>'prob_home')::numeric+(r->>'prob_draw')::numeric+(r->>'prob_away')::numeric) NOT BETWEEN 98 AND 102
      THEN v_rejected:=v_rejected+1; CONTINUE; END IF;
      v_source_date:=(r->>'source_date')::date;

      -- Existing manually verified provider identity wins if its kickoff
      -- is consistent; otherwise match only two VERIFIED team keys and
      -- a unique current Flashscore fixture in the source date window.
      WITH candidates AS (
        SELECT m.canonical_event_id,m.kickoff_hkt,m.home_en,m.away_en
        FROM public.matches m
        WHERE m.canonical_event_id ~ '^FS:[A-Za-z0-9]{6,16}$'
          AND m.kickoff_hkt > v_ts + interval '1 minute'
          AND m.kickoff_hkt < v_ts + interval '48 hours'
          AND abs(((m.kickoff_hkt AT TIME ZONE 'UTC')::date - v_source_date))<=1
          AND NOT EXISTS (
            SELECT 1 FROM public.fixture_identity_redirects d
             WHERE d.active AND d.source_match_id=m.canonical_event_id
          )
          AND (
            EXISTS (
              SELECT 1 FROM public.phase15_source_shadow_current prior
              WHERE prior.source_key='FOREBET'
                AND prior.external_event_id=v_id
                AND prior.match_id=m.canonical_event_id
                AND prior.identity_status='VERIFIED_IDENTITY'
                AND prior.match_confidence>=0.995
                AND prior.kickoff_utc IS NOT NULL
                AND abs(extract(epoch FROM(prior.kickoff_utc-m.kickoff_hkt)))<=1200
            )
            OR (
              EXISTS (
                SELECT 1
                FROM public.football_alias_supertable f
                JOIN public.football_alias_supertable s
                  ON s.verified_team_key=f.verified_team_key
                 AND s.source='FLASHSCORE' AND s.resolution_status='VERIFIED'
                 AND s.alias_key=regexp_replace(lower(m.home_en),'[^a-z0-9]','','g')
                WHERE f.source='FOREBET' AND f.resolution_status='VERIFIED'
                  AND f.verified_team_key IS NOT NULL
                  AND f.alias_key=regexp_replace(lower(r->>'home'),'[^a-z0-9]','','g')
              )
              AND EXISTS (
                SELECT 1
                FROM public.football_alias_supertable f
                JOIN public.football_alias_supertable s
                  ON s.verified_team_key=f.verified_team_key
                 AND s.source='FLASHSCORE' AND s.resolution_status='VERIFIED'
                 AND s.alias_key=regexp_replace(lower(m.away_en),'[^a-z0-9]','','g')
                WHERE f.source='FOREBET' AND f.resolution_status='VERIFIED'
                  AND f.verified_team_key IS NOT NULL
                  AND f.alias_key=regexp_replace(lower(r->>'away'),'[^a-z0-9]','','g')
              )
            )
          )
      )
      SELECT count(DISTINCT canonical_event_id),max(canonical_event_id),
        max(kickoff_hkt),max(home_en),max(away_en)
        INTO v_count,v_match_id,v_kickoff,v_home,v_away FROM candidates;
      IF v_count<>1 THEN
        v_unchanged:=v_unchanged+1; CONTINUE;
      END IF;
      v_matched:=v_matched+1;
      v_forecast:=jsonb_build_object(
        'match_id',v_match_id,'captured_at',v_ts,'kickoff',v_kickoff,
        'canonical_home',v_home,'canonical_away',v_away,
        'source_home',r->>'home','source_away',r->>'away',
        'home',r->>'prob_home','draw',r->>'prob_draw','away',r->>'prob_away',
        'pick',r->>'pick','score',r->>'predicted_score',
        'avg_goals',r->>'avg_goals','match_score',0.995,
        'forebet_detail_url',r->>'source_url',
        'match_date',r->>'source_date','kickoff_text',r->>'source_time',
        'league',r->>'league');
      IF r ? 'prob_under25' AND r ? 'prob_over25' THEN
        v_forecast:=v_forecast || jsonb_build_object(
          'prob_under25',r->>'prob_under25','prob_over25',r->>'prob_over25',
          'prediction_ou25',r->>'prediction_ou25',
          'ou_predicted_score',r->>'ou_predicted_score');
      END IF;
      IF r ? 'corner_prob_under95' AND r ? 'corner_prob_over95' THEN
        v_forecast:=v_forecast || jsonb_build_object(
          'corner_prob_under95',r->>'corner_prob_under95',
          'corner_prob_over95',r->>'corner_prob_over95',
          'corner_prediction',r->>'corner_prediction',
          'corner_predicted_score',r->>'corner_predicted_score',
          'avg_corners',r->>'avg_corners');
      END IF;
      -- Do not re-write source forecast when nothing changed, keeping
      -- independent archive small and first pregame evidence stable.
      IF EXISTS(
        SELECT 1 FROM public.forebet_predictions f
        WHERE f.canonical_event_id=v_match_id AND
          f.prob_home=(r->>'prob_home')::numeric
          AND f.prob_draw=(r->>'prob_draw')::numeric
          AND f.prob_away=(r->>'prob_away')::numeric
          AND f.prediction_1x2=r->>'pick'
          AND f.predicted_score=r->>'predicted_score'
          AND f.avg_goals=(r->>'avg_goals')::numeric
          AND (NOT(r?'prob_over25') OR f.prob_over25=(r->>'prob_over25')::numeric)
          AND (NOT(r?'corner_prob_over95') OR f.corner_prob_over95=(r->>'corner_prob_over95')::numeric)
      ) THEN v_unchanged:=v_unchanged+1; CONTINUE; END IF;

      INSERT INTO public.forebet_availability(
        match_id,match_date,kickoff_hkt,home_en,away_en,
        state,reason,raw,updated_at)
      VALUES(v_match_id,v_source_date::text,v_kickoff,v_home,v_away,
        'UNRESOLVED','PENDING_VERIFIED_FOREBET_DIRECT',
        jsonb_build_object('source_id',v_id,'source_url',r->>'source_url'),now())
      ON CONFLICT(match_id) DO NOTHING;

      v_run:=to_char(v_ts AT TIME ZONE 'UTC','YYYYMMDDHH24MISS');
      v_response:=public.ft_publish_forebet_canonical(jsonb_build_array(v_forecast),v_run);
      IF (v_response->>'applied')::int=1 THEN v_applied:=v_applied+1;
      ELSE v_unchanged:=v_unchanged+1; END IF;
    EXCEPTION WHEN OTHERS THEN
      -- A single malformed or ambiguous source observation is quarantined,
      -- never blocks other verified games or changes the odds producer.
      v_rejected:=v_rejected+1;
    END;
  END LOOP;
  RETURN jsonb_build_object('status','SOURCE_PROCESSED','source_count',v_source_count,
    'identity_matched',v_matched,'applied',v_applied,
    'unmatched_or_unchanged',v_unchanged,'rejected',v_rejected,
    'captured_at',v_ts);
END
$func$;

CREATE OR REPLACE FUNCTION private.ft_forebet_source_cycle()
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','private','public','net','pg_temp'
AS $cycle$
DECLARE st private.ft_forebet_ingest_state%ROWTYPE;
        res record; payload jsonb; v_out jsonb; req bigint;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('ft_forebet_source_cycle')) THEN
    RETURN jsonb_build_object('status','ALREADY_RUNNING');
  END IF;
  SELECT * INTO st FROM private.ft_forebet_ingest_state WHERE singleton FOR UPDATE;
  IF st.pending_request_id IS NOT NULL THEN
    SELECT id,status_code,timed_out,content INTO res FROM net._http_response
     WHERE id=st.pending_request_id;
    IF FOUND AND res.status_code=200 AND NOT res.timed_out AND
       length(res.content)<800000 THEN
      BEGIN
        payload:=res.content::jsonb;
        IF payload->>'source'='FOREBET_DIRECT_LISTINGS'
          AND payload->>'ok'='true'
          AND (payload->>'captured_at')::timestamptz
                > coalesce(st.last_capture_at,'2000-01-01'::timestamptz)
        THEN
          v_out:=private.ft_ingest_forebet_direct_snapshot(payload);
          UPDATE private.ft_forebet_ingest_state
          SET last_capture_at=(payload->>'captured_at')::timestamptz,
              last_result=v_out,updated_at=now()
          WHERE singleton;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        UPDATE private.ft_forebet_ingest_state SET
          last_result=jsonb_build_object('status','SOURCE_INVALID',
                      'error',left(SQLERRM,100)),updated_at=now()
        WHERE singleton;
      END;
    END IF;
  END IF;
  -- Fetch a single ready-made Railway snapshot only once per 30-minute cycle.
  -- The Railway side alone performs at most six upstream HTTP pages per 4h.
  req:=net.http_get(
    url:='https://fast-tracker-dashboard-production.up.railway.app/forebet-snapshot',
    timeout_milliseconds:=12000
  );
  UPDATE private.ft_forebet_ingest_state SET
    pending_request_id=req,pending_since=now(),updated_at=now()
  WHERE singleton;
  RETURN coalesce(v_out,jsonb_build_object('status','NO_NEW_VERIFIED_CAPTURE'))
    || jsonb_build_object('queued_request',req);
END
$cycle$;
REVOKE ALL ON FUNCTION private.ft_ingest_forebet_direct_snapshot(jsonb)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.ft_forebet_source_cycle()
 FROM PUBLIC,anon,authenticated;
-- Only schedule after a live production snapshot has been successfully proven.
-- SELECT cron.schedule('ft-forebet-source-once-per-30m',
--   '11,41 * * * *','SELECT private.ft_forebet_source_cycle()');
