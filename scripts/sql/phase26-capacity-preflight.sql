-- Phase 26: strictly READ-ONLY production capacity + cold-lineup preflight.
-- Never delete, VACUUM FULL, TRUNCATE or manipulate Storage from this query.
-- This is a factual inventory; archive verified bytes before drafting any prune.
SELECT now() AS observed_utc,
       pg_database_size(current_database())::bigint AS db_bytes,
       524288000::bigint AS planned_free_tier_bytes,
       round((100.0*pg_database_size(current_database())/524288000)::numeric,3) AS usage_pct,
       524288000::bigint-pg_database_size(current_database()) AS headroom_bytes;
SELECT c.relname AS relation_name,
       pg_total_relation_size(c.oid)::bigint AS total_bytes,
       pg_relation_size(c.oid)::bigint AS heap_bytes,
       pg_indexes_size(c.oid)::bigint AS index_bytes,
       coalesce(s.n_live_tup,0) AS estimated_live_rows,
       coalesce(s.n_dead_tup,0) AS estimated_dead_rows
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid
WHERE n.nspname='public' AND c.relkind IN ('r','p')
ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 20;
-- Existing archive verification: directory object presence and byte totals
-- DOES NOT verify SHA-256; actual file-byte checksums remain required.
SELECT count(*) AS archived_batches,
       count(*) FILTER(WHERE o.id IS NULL) AS missing_objects,
       count(*) FILTER(WHERE o.id IS NOT NULL AND
              nullif(o.metadata->>'size','')::bigint <> l.file_bytes) AS byte_mismatches,
       coalesce(sum(l.file_bytes),0)::bigint AS ledger_bytes
FROM private.ft_retired_storage_archive_ledger l
LEFT JOIN storage.objects o ON o.bucket_id='fast-tracker-ingest'
                           AND o.name=l.storage_path;
-- Cold lineup estimate only; never infer safe deletion from date alone.
SELECT count(*) AS older_than_14_days,
       count(DISTINCT l.match_id) AS affected_fixtures,
       count(*) FILTER(WHERE a.match_id IS NOT NULL) AS present_in_active_fixture_universe,
       count(*) FILTER(WHERE l.raw IS NOT NULL) AS rows_with_source_raw
FROM public.phase2_match_lineup_evidence l
LEFT JOIN public.flashscore_primary_fixture_current a ON a.match_id=l.match_id
WHERE l.fetched_at < now()-interval '14 days';
