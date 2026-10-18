-- Phase 26c: READ ONLY. Never use all >14d lineup rows as a deletion list.
-- Historical match-detail RPC reads this same table without a 14-day cap.
-- Preserve latest observed snapshot for EVERY match/source, even completed fixtures.
WITH latest_source AS (
  SELECT match_id, source_name, MAX(fetched_at) AS latest_at
  FROM public.phase2_match_lineup_evidence
  GROUP BY match_id, source_name
), older AS (
  SELECT l.id, l.match_id, l.source_name, l.fetched_at,
         s.latest_at,
         (l.fetched_at < s.latest_at) AS has_newer_source_snapshot,
         EXISTS (SELECT 1 FROM public.flashscore_primary_fixture_current f
                 WHERE f.match_id=l.match_id) AS present_in_current_fixtures
  FROM public.phase2_match_lineup_evidence l
  JOIN latest_source s ON s.match_id=l.match_id AND s.source_name=l.source_name
  WHERE l.fetched_at < now() - interval '14 days'
)
SELECT
  COUNT(*) AS old_lineup_rows,
  COUNT(DISTINCT match_id) AS old_fixtures,
  COUNT(*) FILTER(WHERE present_in_current_fixtures) AS current_fixture_rows_protected,
  COUNT(*) FILTER(WHERE NOT has_newer_source_snapshot) AS latest_source_snapshot_rows_protected,
  COUNT(*) FILTER(WHERE has_newer_source_snapshot AND NOT present_in_current_fixtures) AS potential_superseded_rows_for_further_review,
  pg_database_size(current_database())::bigint AS database_bytes,
  524288000::bigint AS assumed_free_quota_bytes
FROM older;
-- A newer timestamp alone does NOT prove its XI/bench coverage is complete.
-- Before any separate retention operation verify per-row backups, full snapshot completeness,
-- route/history usability, exact IDs and hashes, and source changes in one transaction.
-- SQL DELETE, TRUNCATE, DROP, VACUUM FULL and INDEX removal are intentionally absent.
