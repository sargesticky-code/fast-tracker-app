-- Phase 44: remove ONLY 15+15 obsolete FB-only live-score/stat rows
-- proven Oct7–10, all present in private immutable SHA256 archives (Phase43).
-- No current Flashscore fixture and no active source. Tables, indexes,
-- UPDATE triggers, permissions and FK schemas remain intact after reset.
BEGIN;
SET LOCAL lock_timeout='750ms';
SET LOCAL statement_timeout='7000ms';
LOCK TABLE public.live_score_current,public.live_stats_current
 IN ACCESS EXCLUSIVE MODE NOWAIT;
DO $guard$
DECLARE
 v_score integer;
 v_stats integer;
 v_invalid_score integer;
 v_invalid_stats integer;
 v_archives integer;
 v_inbound_fk integer;
 v_total_bytes bigint;
BEGIN
 SELECT count(*) INTO v_score FROM public.live_score_current;
 SELECT count(*) INTO v_stats FROM public.live_stats_current;
 IF v_score<>15 OR v_stats<>15 THEN
   RAISE EXCEPTION 'LIVE_TABLE_COUNTS_CHANGED_ABORT score %, stats %',v_score,v_stats;
 END IF;
 SELECT count(*) INTO v_invalid_score FROM public.live_score_current s
 WHERE s.canonical_event_id !~ '^FB[0-9]{4,}$'
   OR s.kickoff_hkt>=now()-interval '7 days'
   OR s.source NOT IN ('FOOTBALL_LIVE_API_SELF_HOSTED','SPORTSCORE')
   OR EXISTS(select 1 from public.flashscore_primary_fixture_current f
     where f.match_id=s.canonical_event_id);
 SELECT count(*) INTO v_invalid_stats FROM public.live_stats_current s
 WHERE s.canonical_event_id !~ '^FB[0-9]{4,}$'
   OR s.kickoff_hkt>=now()-interval '7 days'
   OR s.source<>'FOOTBALL_LIVE_API_SELF_HOSTED'
   OR EXISTS(select 1 from public.flashscore_primary_fixture_current f
     where f.match_id=s.canonical_event_id);
 IF v_invalid_score<>0 OR v_invalid_stats<>0 THEN
   RAISE EXCEPTION 'CURRENT_OR_UNTRUSTED_LIVE_ROWS_ABORT';
 END IF;
 SELECT count(*) INTO v_inbound_fk FROM pg_constraint
   WHERE contype='f' AND confrelid IN (
     'public.live_score_current'::regclass,'public.live_stats_current'::regclass);
 IF v_inbound_fk<>0 THEN
   RAISE EXCEPTION 'INBOUND_LIVE_TABLE_FK_ABORT';
 END IF;
 SELECT count(*) INTO v_archives FROM storage.objects o
 WHERE o.bucket_id='fast-tracker-ingest'
   AND ((o.name ~ '^legacy-live/v1/score/[a-f0-9]{64}[.]json[.]txt$')
     OR (o.name ~ '^legacy-live/v1/stats/[a-f0-9]{64}[.]json[.]txt$'))
   AND (o.metadata->>'size')::integer>100;
 IF v_archives<>2 THEN
   RAISE EXCEPTION 'IMMUTABLE_LEGACY_LIVE_ARCHIVES_MISSING_ABORT';
 END IF;
 v_total_bytes:=pg_total_relation_size('public.live_score_current'::regclass)
     +pg_total_relation_size('public.live_stats_current'::regclass);
 IF v_total_bytes<7000000 THEN
   RAISE EXCEPTION 'LEGACY_LIVE_SPACE_ALREADY_RECLAIMED_ABORT';
 END IF;
 -- Only obsolete non-Flashscore source-current tables, not the history table.
 TRUNCATE TABLE ONLY public.live_score_current,ONLY public.live_stats_current;
 IF (SELECT count(*) FROM public.live_score_current)<>0
   OR (SELECT count(*) FROM public.live_stats_current)<>0 THEN
   RAISE EXCEPTION 'NONEMPTY_AFTER_RECLAIM_ROLLBACK';
 END IF;
END;
$guard$;
COMMIT;
