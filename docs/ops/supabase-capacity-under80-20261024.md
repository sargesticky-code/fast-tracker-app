# Fast Tracker Supabase database capacity recovery — 2026-10-24

## Result
- Existing `pg_database_size(current_database())` initially: **433,851,539 bytes** (~414 MiB; 82.8% of 500 MiB reference quota).
- After bounded native PostgreSQL REINDEX operations: **~405 MB bytes** (~386 MiB; ~77.3% of reference quota).
- No football records deleted by the index rebuilds; source identity, odds, verified lineup, and aliases retained.
- The database `public.source_health` row `SUPABASE_DATABASE/capacity_500mb` was refreshed from WARNING to **OK**.
- IMPORTANT: This measures database allocation, not disk usage inclusive of Write-Ahead Log. The official quota/plan figures must be checked in Supabase Billing/Infrastructure.

## Changes performed

### Bounded REINDEX, by table, with quick lock timeout
Applied separately, verified table row counts before/after:
```sql
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30000ms';
REINDEX TABLE public.phase2_match_lineup_evidence;

-- In separate short transactions, not one multi-table transaction:
REINDEX TABLE public.team_name_master;
REINDEX TABLE public.football_alias_supertable;
```
Do NOT run all three together in production. REINDEX takes table/index locks and may briefly block writers, so perform one table at a time. The operations above succeeded; don't repeat on an automatic cadence without checking index bloat, traffic, and free disk. Do NOT use VACUUM FULL against active live collectors as routine maintenance.

### Auto-vacuum for churn-heavy lineup evidence
Applied and verified:
```sql
ALTER TABLE public.phase2_match_lineup_evidence SET (
  autovacuum_vacuum_scale_factor = 0.06,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_analyze_threshold = 500
);
```
Reason: >100k rows with ~17k dead tuples while default vacuum threshold was roughly 20% of live rows. The tighter per-table threshold improves reuse; ordinary VACUUM does not promise immediate physical file shrinkage.
Rollback:
```sql
ALTER TABLE public.phase2_match_lineup_evidence RESET (
  autovacuum_vacuum_scale_factor, autovacuum_vacuum_threshold,
  autovacuum_analyze_scale_factor, autovacuum_analyze_threshold
);
```

### Retention integrity
- Job **56** `ft-lineup-cold-retire-200-hourly`, configured at minutes 02, 17, 32, 47: `2,17,32,47 * * * *`.
- Each batch (max 200 cold rows, >14 days) is archived to `fast-tracker-ingest/lineup-cold/v3`, SHA-256 verified via Storage readback, then retired by exact-row RPC. This mechanism was tested, and one batch of 200 rows was archived and retired successfully.
- Jobs 61 & 62 keep native Flashscore fixture promotion and bookmaker odds collection active. No active Railway-based cron jobs.
- Job 66 checks database reference usage every 6h and marks `SUPABASE_DATABASE/capacity_500mb` OK / WARNING (>=80%) / CRITICAL (>=90%); user-facing ChatGPT capacity watch is separate.
- Health job 60 now correctly records collector interval 10 minutes; actual Bet365 quote freshness remains 20 minutes.

## Verify
```sql
SELECT pg_database_size(current_database()) AS database_bytes,
  round(100.0 * pg_database_size(current_database())/524288000,2) AS pct_of_500mib_reference;

SELECT source,metric,status,value_text,observed_at
FROM public.source_health
WHERE (source,metric) IN (
 ('SUPABASE_DATABASE','capacity_500mb'),
 ('FLASHSCORE_BET365','odds_pipeline_health'),
 ('FLASHSCORE_BET365','native_graphql_collect'));

SELECT jobid,jobname,active,schedule
FROM cron.job WHERE jobid IN (56,60,61,62,66);

SELECT pg_size_pretty(pg_indexes_size('public.phase2_match_lineup_evidence'::regclass))
 AS lineup_indexes;
```

## Limits and next steps
- Source evidence remains substantial: `phase15_source_shadow_current` ~85 MiB (mostly table/TOAST), `phase2_match_lineup_evidence` was ~98 MiB including indexes before compaction. Do not delete or bulk truncate those tables without separately verified, recoverable archive/identity guards.
- Preserve daily football-data historical results and verified predictions.
- Storage `fast-tracker-ingest` contains ~101 MiB of objects as of this checkpoint; watch Storage as archived lineup files accumulate.
- Keep aliases accept-first and human-correctable, with Flashscore native IDs canonical; no HKJC/Railway restoration.
