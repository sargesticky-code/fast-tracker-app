-- Phase 36A - one-time retirement of a VERIFIED 600-row cold backup.
-- Explicit owner decision: after-use lineup details are disposable, only after
-- private immutable source backup with SHA-256 readback.
-- 1-200: 127857 bytes, previously verified v1 on Oct18.
-- 201-400: 137236 bytes, v2 SHA-256 readback on Oct18.
-- 401-600: 136386 bytes, v2 SHA-256 readback on Oct18.
-- Do not use this as a template for arbitrary ID ranges; a future scheduled
-- service MUST archive/readback/verify each exact batch prior to deletion.
begin;
set local lock_timeout='3s';
set local statement_timeout='25s';
do $guard$
declare
  v_count integer;
  v_removed integer;
begin
  if (select count(*) from storage.objects
      where bucket_id='fast-tracker-ingest'
      and ((name='lineup-cold/2026-10-18/1-200-630bf43c86ed49fd4729c539129320483fa6d15c676babe613083c6cd247805a.jsonl.txt' and metadata->>'size'='127857')
        or (name='lineup-cold/v2/201-400-4db4b2245346e19f8eb5a527bb5c549a1f12618ec32b6e02fe732acb8f8adb01.jsonl.txt' and metadata->>'size'='137236')
        or (name='lineup-cold/v2/401-600-ec8f8d3f76aeeb66a06c9a9942c1844dfe7823920b2e497aedcf416041ab71ad.jsonl.txt' and metadata->>'size'='136386')))<>3
  then raise exception 'ARCHIVED_IMMUTABLE_OBJECTS_NOT_PRESENT';
  end if;
  select count(*) into v_count from public.phase2_match_lineup_evidence l
  where l.id between 1 and 600
    and l.source_name='API_FOOTBALL'
    and l.fetched_at<now()-interval '14 days'
    and not exists(select 1 from public.flashscore_primary_fixture_current f where f.match_id=l.match_id)
    and not exists(select 1 from public.canonical_fixture_current f
                   where f.match_id=l.match_id and f.kickoff_hkt>now()-interval '2 days');
  if v_count<>600 or (select count(*) from public.phase2_match_lineup_evidence where id between 1 and 600)<>600
  then raise exception 'ARCHIVED_SOURCE_ROW_IDENTITY_CHANGED';
  end if;
  delete from public.phase2_match_lineup_evidence l
    where l.id between 1 and 600 and l.source_name='API_FOOTBALL'
      and l.fetched_at<now()-interval '14 days'
      and not exists(select 1 from public.flashscore_primary_fixture_current f where f.match_id=l.match_id)
      and not exists(select 1 from public.canonical_fixture_current f
          where f.match_id=l.match_id and f.kickoff_hkt>now()-interval '2 days');
  get diagnostics v_removed=row_count;
  if v_removed<>600 then raise exception 'PARTIAL_RETIREMENT_ROLLED_BACK (%)',v_removed; end if;
end;
$guard$;
commit;
-- Ordinary DELETE does not guarantee immediate lower pg_database_size.
