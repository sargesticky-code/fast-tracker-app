-- FT-20261011: archive existing verified provider source-day records once daily.
-- Zero provider HTTP calls, no new scraper, no duplicate source-day replays.
-- HKT day D = [D 00:00, D+1 00:00), PostgreSQL timestamps are UTC.
CREATE OR REPLACE FUNCTION private.ft_archive_source_day(p_day date)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_start timestamptz := (p_day::timestamp AT TIME ZONE 'Asia/Hong_Kong');
  v_end timestamptz := ((p_day+1)::timestamp AT TIME ZONE 'Asia/Hong_Kong');
  v_payload jsonb;
  v_count integer;
  v_last timestamptz;
  v_added integer;
  v_flash integer := 0;
  v_forebet integer := 0;
BEGIN
  -- One db transaction per source-day; concurrent cron retries skip safely.
  IF NOT pg_try_advisory_xact_lock(hashtext('ft_source_day_snapshot_daily'), 20261011) THEN
    RETURN jsonb_build_object('status','BUSY_RETRY_NEXT_RUN','source_day',p_day);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM private.ft_source_day_snapshot
                 WHERE source_key='FLASHSCORE' AND source_day=p_day) THEN
    SELECT jsonb_agg(to_jsonb(s) ORDER BY s.kickoff_utc,s.external_event_id),
           count(*)::integer,max(s.fetched_at)
      INTO v_payload,v_count,v_last
    FROM public.phase15_source_shadow_current s
    WHERE s.source_key='FLASHSCORE'
      AND s.kickoff_utc>=v_start AND s.kickoff_utc<v_end
      AND s.fetched_at>=now()-interval '30 hours';

    IF v_count BETWEEN 1 AND 5000 THEN
      INSERT INTO private.ft_source_day_snapshot
      (source_key,source_day,window_start_utc,window_end_utc,capture_origin,
       source_fetched_at,record_count,source_rows,content_md5,coverage_complete)
      VALUES ('FLASHSCORE',p_day,v_start,v_end,'EXISTING_SOURCE_SHADOW_BACKFILL',
              v_last,v_count,v_payload,md5(v_payload::text),false)
      ON CONFLICT(source_key,source_day) DO NOTHING;
      GET DIAGNOSTICS v_added=ROW_COUNT;
      IF v_added>0 THEN v_flash:=v_count; END IF;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM private.ft_source_day_snapshot
                 WHERE source_key='FOREBET' AND source_day=p_day) THEN
    SELECT jsonb_agg(to_jsonb(f) ORDER BY f.hkjc_event_id),
           count(*)::integer,max(f.fetched_at)
      INTO v_payload,v_count,v_last
    FROM public.forebet_predictions f
    WHERE f.forebet_match_date=p_day::text
      AND f.fetched_at>=now()-interval '36 hours';

    IF v_count BETWEEN 1 AND 5000 THEN
      INSERT INTO private.ft_source_day_snapshot
      (source_key,source_day,window_start_utc,window_end_utc,capture_origin,
       source_fetched_at,record_count,source_rows,content_md5,coverage_complete)
      VALUES ('FOREBET',p_day,v_start,v_end,'EXISTING_FOREBET_HISTORY_BACKFILL',
              v_last,v_count,v_payload,md5(v_payload::text),false)
      ON CONFLICT(source_key,source_day) DO NOTHING;
      GET DIAGNOSTICS v_added=ROW_COUNT;
      IF v_added>0 THEN v_forebet:=v_count; END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('status','ARCHIVE_ATTEMPTED','source_day',p_day,
      'new_flashscore_rows',v_flash,'new_forebet_rows',v_forebet,
      'flashscore_exists',EXISTS (SELECT 1 FROM private.ft_source_day_snapshot
          WHERE source_key='FLASHSCORE' AND source_day=p_day),
      'forebet_exists',EXISTS (SELECT 1 FROM private.ft_source_day_snapshot
          WHERE source_key='FOREBET' AND source_day=p_day));
END
$$;
REVOKE ALL ON FUNCTION private.ft_archive_source_day(date)
 FROM PUBLIC,anon,authenticated;

-- HKT 23:35 is UTC 15:35; archive NEXT HKT day, 24h exclusive window.
-- Run only once daily after existing upstream source captures.
-- Do not schedule a second Flashscore/Forebet crawler.
SELECT cron.schedule('ft-source-next-day-archive-24h', '35 15 * * *',
  $$SELECT private.ft_archive_source_day(
    ((now() AT TIME ZONE 'Asia/Hong_Kong')::date + 1)
  )$$
);
