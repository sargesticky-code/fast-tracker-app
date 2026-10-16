-- Production was applied through approved Supabase SQL operations on 2026-10-16.
-- This migration tracks exact live function definitions for future environments.
-- All original provider forecasts remain source observations, NOT verified match identities.
CREATE TABLE IF NOT EXISTS private.ft_extra_adviser_source_observations (
 provider text NOT NULL CHECK(provider IN ('PRIMATIPS','STATAREA')),
 source_event_id text NOT NULL,
 source_date date NOT NULL,
 source_wall_time text NOT NULL,
 source_home text NOT NULL,
 source_away text NOT NULL,
 source_competition text NOT NULL,
 source_url text NOT NULL,
 hda jsonb NOT NULL,
 observation jsonb NOT NULL,
 captured_at timestamptz NOT NULL,
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 run_id text NOT NULL,
 PRIMARY KEY (provider,source_event_id,source_date)
);
CREATE INDEX IF NOT EXISTS ft_extra_adviser_source_day_idx
 ON private.ft_extra_adviser_source_observations(source_date,provider);
ALTER TABLE private.ft_extra_adviser_source_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ft_extra_adviser_source_observations FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS private.ft_extra_adviser_provisional_04 (
 provider text NOT NULL CHECK(provider IN ('PRIMATIPS','STATAREA')),
 source_event_id text NOT NULL,
 source_date date NOT NULL,
 canonical_event_id text NOT NULL CHECK(canonical_event_id ~ '^FS:[A-Za-z0-9_-]{5,32}$'),
 home_similarity numeric NOT NULL CHECK(home_similarity BETWEEN 0.4 AND 1),
 away_similarity numeric NOT NULL CHECK(away_similarity BETWEEN 0.4 AND 1),
 league_similarity numeric NOT NULL CHECK(league_similarity BETWEEN 0 AND 1),
 league_evidence text NOT NULL CHECK(league_evidence IN ('NAME_SIMILAR','NEEDS_REVIEW')),
 source_clock_offset_minutes integer NOT NULL CHECK(source_clock_offset_minutes BETWEEN -720 AND 719),
 calibration_samples integer NOT NULL CHECK(calibration_samples>=10),
 calibration_agreement numeric NOT NULL CHECK(calibration_agreement>=0.9 AND calibration_agreement<=1),
 time_delta_seconds numeric NOT NULL CHECK(time_delta_seconds BETWEEN 0 AND 300),
 last_checked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(provider,source_event_id,source_date),
 UNIQUE(provider,canonical_event_id)
);
ALTER TABLE private.ft_extra_adviser_provisional_04 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ft_extra_adviser_provisional_04 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.ft_extra_adviser_publish_source_only(p_rows jsonb, p_captured_at timestamp with time zone, p_run_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE n integer; accepted integer; uniq integer; invalid integer;
BEGIN
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' THEN
   RAISE EXCEPTION 'INVALID_EXTRA_SOURCE_ARRAY'; END IF;
 n:=jsonb_array_length(p_rows);
 IF n<1 OR n>1500 OR length(p_rows::text)>1800000
   OR p_run_id !~ '^[0-9]{6,20}$'
   OR p_captured_at<now()-interval '24 hours'
   OR p_captured_at>now()+interval '2 minutes'
 THEN RAISE EXCEPTION 'INVALID_EXTRA_SOURCE_BATCH'; END IF;

 SELECT count(*) FILTER (WHERE
   x->>'source' NOT IN ('PRIMATIPS','STATAREA')
   OR x->>'source_event_id' IS NULL
   OR length(x->>'source_event_id') NOT BETWEEN 4 AND 80
   OR length(x->>'source_home') NOT BETWEEN 1 AND 120
   OR length(x->>'source_away') NOT BETWEEN 1 AND 120
   OR x->>'source_home'=x->>'source_away'
   OR length(x->>'source_competition') NOT BETWEEN 1 AND 160
   OR x->>'source_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   OR x->>'source_wall_time' !~ '^[0-2][0-9]:[0-5][0-9]$'
   OR (x->>'source_wall_time')::time >= '24:00'::time
   OR x->'source_kickoff' IS DISTINCT FROM 'null'::jsonb
   OR x->'kickoff_timezone_verified' IS DISTINCT FROM 'false'::jsonb
   OR x->>'identity_status'<>'UNRESOLVED'
   OR jsonb_typeof(x->'hda')<>'object'
   OR jsonb_typeof(x#>'{hda,home}')<>'number'
   OR jsonb_typeof(x#>'{hda,draw}')<>'number'
   OR jsonb_typeof(x#>'{hda,away}')<>'number'
   OR (x#>>'{hda,home}')::numeric NOT BETWEEN 0 AND 1
   OR (x#>>'{hda,draw}')::numeric NOT BETWEEN 0 AND 1
   OR (x#>>'{hda,away}')::numeric NOT BETWEEN 0 AND 1
   OR abs((x#>>'{hda,home}')::numeric+
          (x#>>'{hda,draw}')::numeric+
          (x#>>'{hda,away}')::numeric-1)>.02
   OR (x->>'source'='PRIMATIPS' AND (
      x->>'source_event_id' !~ '^[0-9]{4,12}$'
      OR x->>'source_url' !~ '^https://primatips[.]com/tip/'))
   OR (x->>'source'='STATAREA' AND (
      x->>'source_event_id' !~ '^[a-f0-9]{24}$'
      OR x->>'source_url' !~ '^https://www[.]statarea[.]com/olddevices/prediction/'))
 ) INTO invalid
 FROM jsonb_array_elements(p_rows) x;
 IF invalid>0 THEN RAISE EXCEPTION 'INVALID_EXTRA_SOURCE_OBSERVATIONS'; END IF;

 SELECT count(DISTINCT (x->>'source')||'|'||(x->>'source_event_id')||'|'||(x->>'source_date'))
 INTO uniq FROM jsonb_array_elements(p_rows) x;
 IF uniq<>n THEN RAISE EXCEPTION 'DUPLICATE_EXTRA_SOURCE_IDS'; END IF;

 INSERT INTO private.ft_extra_adviser_source_observations(
 provider,source_event_id,source_date,source_wall_time,
 source_home,source_away,source_competition,source_url,hda,observation,
 captured_at,last_seen_at,run_id)
 SELECT x->>'source',x->>'source_event_id',(x->>'source_date')::date,
 x->>'source_wall_time',x->>'source_home',x->>'source_away',
 x->>'source_competition',x->>'source_url',x->'hda',x,
 p_captured_at,now(),p_run_id
 FROM jsonb_array_elements(p_rows) x
 ON CONFLICT (provider,source_event_id,source_date) DO UPDATE SET
   source_wall_time=EXCLUDED.source_wall_time,
   source_home=EXCLUDED.source_home,source_away=EXCLUDED.source_away,
   source_competition=EXCLUDED.source_competition,source_url=EXCLUDED.source_url,
   hda=EXCLUDED.hda,observation=EXCLUDED.observation,
   captured_at=EXCLUDED.captured_at,last_seen_at=now(),run_id=EXCLUDED.run_id;
 GET DIAGNOSTICS accepted=ROW_COUNT;
 IF accepted<>n THEN RAISE EXCEPTION 'EXTRA_SOURCE_WRITE_MISMATCH'; END IF;
 RETURN jsonb_build_object('source','EXTRA_ADVISER_SOURCE_ONLY','received',n,'stored',accepted,
   'verified_identity_count',0,'kickoff_timezone_verified_count',0);
END $function$;

CREATE OR REPLACE FUNCTION public.ft_public_extra_adviser_provisional()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
WITH selected AS (
 SELECT
  p.canonical_event_id AS id,p.provider,p.home_similarity,p.away_similarity,
  p.league_similarity,p.league_evidence,
  p.source_clock_offset_minutes,p.calibration_samples,p.calibration_agreement,
  p.time_delta_seconds,p.last_checked_at,
  s.source_url,s.source_home,s.source_away,s.source_competition,
  s.source_date,s.source_wall_time,s.captured_at,s.hda,s.observation,
  f.kickoff_hkt,f.home_en,f.away_en,f.league
 FROM private.ft_extra_adviser_provisional_04 p
 JOIN private.ft_extra_adviser_source_observations s
  ON p.provider=s.provider AND p.source_event_id=s.source_event_id
  AND p.source_date=s.source_date
 JOIN public.flashscore_primary_fixture_current f
  ON f.match_id=p.canonical_event_id
  AND f.status='SCHEDULED'
  AND f.identity_authority='FLASHSCORE'
  AND f.provider_identity_status='VERIFIED_IDENTITY'
  AND f.fetched_at>=now()-interval '36 hours'
  AND f.kickoff_hkt>now()
  AND f.kickoff_hkt<=now()+interval '48 hours'
 WHERE p.last_checked_at>=now()-interval '36 hours'
  AND s.captured_at>=now()-interval '36 hours'
  AND p.home_similarity>=0.4 AND p.away_similarity>=0.4
  AND p.calibration_samples>=10 AND p.calibration_agreement>=0.9
  AND abs(extract(epoch FROM
    (((s.source_date+s.source_wall_time::time) AT TIME ZONE 'UTC') -
      p.source_clock_offset_minutes * interval '1 minute')-f.kickoff_hkt))<=300
  AND (
    (p.provider='PRIMATIPS' AND s.source_url ~ '^https://primatips[.]com/tip/')
    OR (p.provider='STATAREA' AND s.source_url ~ '^https://www[.]statarea[.]com/olddevices/prediction/')
  )
 ORDER BY f.kickoff_hkt,p.provider,p.canonical_event_id
 LIMIT 600
)
SELECT jsonb_build_object(
 'source','EXTRA_ADVISER_PROVISIONAL_04',
 'quality','PROVISIONAL_NOT_VERIFIED_CALIBRATED_WALL_TIME',
 'generatedAt',now(),
 'rows',coalesce(jsonb_agg(jsonb_build_object(
  'id',id,'provider',provider,'status','PROVISIONAL_NOT_VERIFIED',
  'kickoff',kickoff_hkt,'sourceDate',source_date,'sourceWallTime',source_wall_time,
  'kickoffTimezoneVerified',false,
  'clockEvidence','CALIBRATED_FROM_DAY_COHORT_NOT_SOURCE_VERIFIED',
  'clockOffsetMinutes',source_clock_offset_minutes,
  'clockCalibrationSamples',calibration_samples,
  'clockCalibrationAgreement',calibration_agreement,
  'timeDeltaSeconds',time_delta_seconds,
  'sourceUrl',source_url,'sourceHome',source_home,'sourceAway',source_away,
  'canonicalHome',home_en,'canonicalAway',away_en,
  'sourceCompetition',source_competition,'canonicalCompetition',league,
  'homeSimilarity',home_similarity,'awaySimilarity',away_similarity,
  'leagueSimilarity',league_similarity,'leagueEvidence',league_evidence,
  'lastChecked',last_checked_at,'sourceCapturedAt',captured_at,
  'hda',hda,
  'over25',CASE WHEN jsonb_typeof(observation->'over25')='number'
        AND (observation->>'over25')::numeric BETWEEN 0 AND 1
      THEN observation->'over25' ELSE NULL END,
  'bttsYes',CASE WHEN jsonb_typeof(observation->'btts_yes')='number'
        AND (observation->>'btts_yes')::numeric BETWEEN 0 AND 1
      THEN observation->'btts_yes' ELSE NULL END,
  'tip',CASE WHEN length(observation->>'tip')<=6 THEN observation->>'tip' ELSE NULL END
 )),'[]'::jsonb)
) FROM selected
$function$;

CREATE OR REPLACE FUNCTION private.ft_recheck_extra_adviser_provisional_04()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'private', 'public', 'extensions'
AS $function$
DECLARE matches_count integer; prior_count integer;
BEGIN
 PERFORM pg_advisory_xact_lock(20261016, 404);
 SELECT count(*) INTO prior_count FROM private.ft_extra_adviser_provisional_04;
 DELETE FROM private.ft_extra_adviser_provisional_04;

 WITH s AS (
  SELECT provider,source_event_id,source_date,source_wall_time,
   regexp_replace(lower(extensions.unaccent(source_home)),'[^a-z0-9]+','','g') AS home_key,
   regexp_replace(lower(extensions.unaccent(source_away)),'[^a-z0-9]+','','g') AS away_key,
   regexp_replace(lower(extensions.unaccent(source_competition)),'[^a-z0-9]+','','g') AS league_key,
   (source_date+source_wall_time::time) AT TIME ZONE 'UTC' AS source_wall_utc
  FROM private.ft_extra_adviser_source_observations
  WHERE captured_at>=now()-interval '36 hours'
    AND source_date BETWEEN (now() AT TIME ZONE 'UTC')::date-1
        AND (now() AT TIME ZONE 'UTC')::date+2
 ), f AS (
  SELECT match_id,kickoff_hkt,status,
    regexp_replace(lower(extensions.unaccent(home_en)),'[^a-z0-9]+','','g') AS home_key,
    regexp_replace(lower(extensions.unaccent(away_en)),'[^a-z0-9]+','','g') AS away_key,
    regexp_replace(lower(extensions.unaccent(league)),'[^a-z0-9]+','','g') AS league_key
  FROM public.flashscore_primary_fixture_current
  WHERE identity_authority='FLASHSCORE'
   AND provider_identity_status='VERIFIED_IDENTITY'
   AND fetched_at>=now()-interval '36 hours'
   AND kickoff_hkt>now()-interval '12 hours'
   AND kickoff_hkt<=now()+interval '48 hours'
 ), high_confidence_seeds AS (
  SELECT s.provider,s.source_date,s.source_event_id,f.match_id,
     ((round(extract(epoch FROM (s.source_wall_utc-f.kickoff_hkt))/60)::integer+720+1440*3)%1440)-720 AS offset_min
  FROM s JOIN f ON f.kickoff_hkt::date BETWEEN s.source_date-1 AND s.source_date+1
  WHERE extensions.similarity(s.home_key,f.home_key)>=0.72
    AND extensions.similarity(s.away_key,f.away_key)>=0.72
 ), offset_counts AS (
  SELECT provider,source_date,offset_min,count(DISTINCT source_event_id) AS n
  FROM high_confidence_seeds GROUP BY 1,2,3
 ), offset_rank AS (
  SELECT oc.*,sum(n) OVER(PARTITION BY provider,source_date) AS total,
   row_number() OVER(PARTITION BY provider,source_date ORDER BY n DESC,abs(offset_min),offset_min) AS priority
  FROM offset_counts oc
 ), calibrated AS (
  SELECT provider,source_date,offset_min,n,total
  FROM offset_rank
  WHERE priority=1 AND n>=10 AND total>0 AND n::numeric/total>=0.9
 ), candidates AS (
  SELECT s.provider,s.source_event_id,s.source_date,
    f.match_id AS canonical_event_id,
    extensions.similarity(s.home_key,f.home_key)::numeric AS hs,
    extensions.similarity(s.away_key,f.away_key)::numeric AS aws,
    extensions.similarity(s.league_key,f.league_key)::numeric AS ls,
    o.offset_min,o.n,o.total,
    abs(extract(epoch FROM
      ((s.source_wall_utc - o.offset_min*interval '1 minute') - f.kickoff_hkt)))::numeric AS delta
  FROM s
  JOIN calibrated o ON o.provider=s.provider AND o.source_date=s.source_date
  JOIN f ON f.kickoff_hkt BETWEEN
   s.source_wall_utc-o.offset_min*interval '1 minute'-interval '5 minutes'
   AND s.source_wall_utc-o.offset_min*interval '1 minute'+interval '5 minutes'
  WHERE f.status='SCHEDULED' AND f.kickoff_hkt>now()
    AND extensions.similarity(s.home_key,f.home_key)>=0.4
    AND extensions.similarity(s.away_key,f.away_key)>=0.4
 ), unique_candidates AS (
  SELECT c.*,
    count(*) OVER(PARTITION BY provider,source_event_id,source_date) AS matching_targets,
    count(*) OVER(PARTITION BY provider,canonical_event_id) AS matching_sources
  FROM candidates c
 )
 INSERT INTO private.ft_extra_adviser_provisional_04(
  provider,source_event_id,source_date,canonical_event_id,home_similarity,
  away_similarity,league_similarity,league_evidence,source_clock_offset_minutes,
  calibration_samples,calibration_agreement,time_delta_seconds,last_checked_at)
 SELECT provider,source_event_id,source_date,canonical_event_id,hs,aws,ls,
   CASE WHEN ls>=.35 THEN 'NAME_SIMILAR' ELSE 'NEEDS_REVIEW' END,
   offset_min,n,n::numeric/total,delta,now()
 FROM unique_candidates
 WHERE matching_targets=1 AND matching_sources=1 AND delta<=300;

 GET DIAGNOSTICS matches_count=ROW_COUNT;
 RETURN jsonb_build_object('previous',prior_count,'provisional',matches_count,
   'source','LIVE_FLASHscore_DATE_CALIBRATED_NOT_SOURCE_VERIFIED');
END $function$;

REVOKE ALL ON FUNCTION public.ft_extra_adviser_publish_source_only(jsonb,timestamptz,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ft_extra_adviser_publish_source_only(jsonb,timestamptz,text)
  TO service_role;
REVOKE ALL ON FUNCTION public.ft_public_extra_adviser_provisional()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ft_public_extra_adviser_provisional()
  TO service_role;
REVOKE ALL ON FUNCTION private.ft_recheck_extra_adviser_provisional_04()
  FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('ft-extra-adviser-calibrated-provisional-recheck','50 7 * * *',
  $$SELECT private.ft_recheck_extra_adviser_provisional_04()$$);
NOTIFY pgrst, 'reload schema';
