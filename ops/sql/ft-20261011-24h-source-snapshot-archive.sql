-- FT-20261011: ONE immutable snapshot per provider per HK calendar day.
-- This is the long-term no-overlap batch archive, distinct from live updates.
-- Existing Flashscore / Forebet writes, cron and public APIs remain untouched.
CREATE TABLE IF NOT EXISTS private.ft_source_day_snapshot (
  source_key text NOT NULL CHECK (source_key IN ('FLASHSCORE','FOREBET')),
  source_day date NOT NULL,
  window_start_utc timestamptz NOT NULL,
  window_end_utc timestamptz NOT NULL,
  capture_origin text NOT NULL CHECK (capture_origin IN (
    'EXISTING_SOURCE_SHADOW_BACKFILL',
    'EXISTING_FOREBET_HISTORY_BACKFILL',
    'DIRECT_AUTHORIZED_SOURCE_CAPTURE'
  )),
  source_fetched_at timestamptz,
  stored_at timestamptz NOT NULL DEFAULT now(),
  record_count integer NOT NULL CHECK (record_count BETWEEN 1 AND 5000),
  source_rows jsonb NOT NULL,
  content_md5 text NOT NULL CHECK (content_md5 ~ '^[a-f0-9]{32}$'),
  coverage_complete boolean NOT NULL DEFAULT false,
  PRIMARY KEY (source_key,source_day),
  CONSTRAINT source_day_window_24h CHECK (
    window_end_utc = window_start_utc + interval '24 hours'
  ),
  CONSTRAINT source_day_rows_are_array CHECK (
    jsonb_typeof(source_rows) = 'array' AND
    jsonb_array_length(source_rows) = record_count
  )
);
REVOKE ALL ON private.ft_source_day_snapshot FROM PUBLIC, anon, authenticated;
ALTER TABLE private.ft_source_day_snapshot ENABLE ROW LEVEL SECURITY;

-- Historical validation only: archive the REAL existing raw Flashscore data
-- for 2026-10-11 HKT (2026-10-10 16:00Z through 2026-10-11 16:00Z).
-- Do not mislabel this pre-existing source data as newly recaptured or complete.
WITH captured AS (
  SELECT jsonb_agg(to_jsonb(s) ORDER BY s.kickoff_utc,s.external_event_id) rows,
         count(*)::integer n, max(s.fetched_at) last_fetched
  FROM public.phase15_source_shadow_current s
  WHERE s.source_key='FLASHSCORE'
    AND s.kickoff_utc >= '2026-10-10T16:00:00Z'::timestamptz
    AND s.kickoff_utc < '2026-10-11T16:00:00Z'::timestamptz
), inserted AS (
  INSERT INTO private.ft_source_day_snapshot (
    source_key,source_day,window_start_utc,window_end_utc,
    capture_origin,source_fetched_at,record_count,source_rows,
    content_md5,coverage_complete
  )
  SELECT 'FLASHSCORE','2026-10-11'::date,
         '2026-10-10T16:00:00Z'::timestamptz,
         '2026-10-11T16:00:00Z'::timestamptz,
         'EXISTING_SOURCE_SHADOW_BACKFILL',last_fetched,n,rows,
         md5(rows::text),false
  FROM captured WHERE n>0
  ON CONFLICT(source_key,source_day) DO NOTHING
  RETURNING record_count
)
SELECT count(*) stored_daily_snapshots,coalesce(sum(record_count),0)::integer
 AS archived_source_rows FROM inserted;

-- Separate source snapshot, never inferred to be all Forebet fixtures.
WITH captured AS (
  SELECT jsonb_agg(to_jsonb(f) ORDER BY f.hkjc_event_id) rows,
         count(*)::integer n,max(f.fetched_at) last_fetched
  FROM public.forebet_predictions f
  WHERE f.forebet_match_date='2026-10-11'
), inserted AS (
  INSERT INTO private.ft_source_day_snapshot (
    source_key,source_day,window_start_utc,window_end_utc,
    capture_origin,source_fetched_at,record_count,source_rows,
    content_md5,coverage_complete
  )
  SELECT 'FOREBET','2026-10-11'::date,
         '2026-10-10T16:00:00Z'::timestamptz,
         '2026-10-11T16:00:00Z'::timestamptz,
         'EXISTING_FOREBET_HISTORY_BACKFILL',last_fetched,n,rows,
         md5(rows::text),false
  FROM captured WHERE n>0
  ON CONFLICT(source_key,source_day) DO NOTHING
  RETURNING record_count
)
SELECT count(*) stored_daily_snapshots,coalesce(sum(record_count),0)::integer
 AS archived_source_rows FROM inserted;

-- No DELETE/UPDATE of already captured day: repeated execution must return 0.
-- Subsequent daily capture must select a new source_day, never overwrite an
-- old one. Per-match evolving/live state stays in existing *_current tables.
