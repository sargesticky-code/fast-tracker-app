-- Phase 42: physically release historical source-day JSONB TOAST allocations.
-- STRICT ONE-TIME guard: exactly 14 source-day snapshots from Oct 11-18,
-- all 14 separately backed up to private Storage and independently
-- SHA-256-readback + SQL restore-dry-run verified in Phase41.
-- Preserve FOUR current/recent (Oct 17-18) snapshots, metadata and source_rows.
-- One atomic transaction: any mismatch reverts TRUNCATE and all changes.
BEGIN;
SET LOCAL lock_timeout='750ms';
SET LOCAL statement_timeout='12000ms';
LOCK TABLE private.ft_source_day_snapshot IN ACCESS EXCLUSIVE MODE NOWAIT;
DO $guard$
DECLARE
  v_all bigint;
  v_recent bigint;
  v_archived bigint;
  v_foreign bigint;
  v_bytes bigint;
  v_before_hash text;
  v_after_hash text;
  v_inserted bigint;
BEGIN
  SELECT count(*),count(*) FILTER(WHERE source_day>=date '2026-10-17')
  INTO v_all,v_recent FROM private.ft_source_day_snapshot;
  IF v_all<>14 OR v_recent<>4
     OR (SELECT max(source_day) FROM private.ft_source_day_snapshot)<>date '2026-10-18'
     OR (SELECT min(source_day) FROM private.ft_source_day_snapshot)<>date '2026-10-11' THEN
    RAISE EXCEPTION 'SOURCE_DAY_CONTENT_CHANGED_ABORT: total %, recent %',v_all,v_recent;
  END IF;
  SELECT count(*) INTO v_foreign FROM pg_constraint
    WHERE contype='f' AND confrelid='private.ft_source_day_snapshot'::regclass;
  IF v_foreign<>0 THEN RAISE EXCEPTION 'SOURCE_DAY_REFERENCED_ABORT'; END IF;
  v_bytes:=pg_total_relation_size('private.ft_source_day_snapshot'::regclass);
  IF v_bytes<4500000 THEN RAISE EXCEPTION 'SOURCE_DAY_ALREADY_COMPACTED_ABORT'; END IF;
  SELECT count(*) INTO v_archived FROM private.ft_source_day_snapshot s
  WHERE md5(s.source_rows::text)=s.content_md5 AND EXISTS(
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id='fast-tracker-ingest'
      AND o.name LIKE 'source-day/v1/'||s.source_day::text||'/'||s.source_key||'-%'
      AND o.name ~ '[a-f0-9]{64}[.]json[.]txt$'
      AND (o.metadata->>'size')::bigint>100
  );
  IF v_archived<>14 OR
     (SELECT count(*) FROM storage.objects WHERE bucket_id='fast-tracker-ingest'
       AND name LIKE 'source-day/v1/%')<>14
  THEN RAISE EXCEPTION 'SOURCE_DAY_ARCHIVE_NOT_COMPLETE_ABORT'; END IF;

  CREATE TEMP TABLE phase42_retain_snapshot ON COMMIT DROP AS
    SELECT * FROM private.ft_source_day_snapshot
    WHERE source_day>=date '2026-10-17' ORDER BY source_key,source_day;
  SELECT md5(string_agg(md5(to_jsonb(t)::text),'|' ORDER BY source_key,source_day))
    INTO v_before_hash FROM pg_temp.phase42_retain_snapshot t;
  IF (SELECT count(*) FROM pg_temp.phase42_retain_snapshot)<>4 OR v_before_hash IS NULL
  THEN RAISE EXCEPTION 'SOURCE_DAY_RETAIN_COPY_FAILED'; END IF;

  TRUNCATE TABLE ONLY private.ft_source_day_snapshot;
  INSERT INTO private.ft_source_day_snapshot(
    source_key,source_day,window_start_utc,window_end_utc,capture_origin,
    source_fetched_at,stored_at,record_count,source_rows,content_md5,coverage_complete)
  SELECT source_key,source_day,window_start_utc,window_end_utc,capture_origin,
    source_fetched_at,stored_at,record_count,source_rows,content_md5,coverage_complete
  FROM pg_temp.phase42_retain_snapshot;
  GET DIAGNOSTICS v_inserted=ROW_COUNT;
  IF v_inserted<>4 THEN RAISE EXCEPTION 'SOURCE_DAY_RESTORE_COUNT_MISMATCH'; END IF;
  SELECT md5(string_agg(md5(to_jsonb(t)::text),'|' ORDER BY source_key,source_day))
    INTO v_after_hash FROM private.ft_source_day_snapshot t;
  IF v_after_hash IS DISTINCT FROM v_before_hash THEN
    RAISE EXCEPTION 'SOURCE_DAY_RESTORE_BYTES_MISMATCH';
  END IF;
END;
$guard$;
COMMIT;
