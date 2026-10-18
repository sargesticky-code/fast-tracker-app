# Phase 45 — Daily verified archive and bounded cold snapshot retirement

**Purpose:** keep Fast Tracker's PostgreSQL source history small without losing the original Flashscore/Forebet capture. Existing job #40 `ft-source-next-day-archive-24h` at 15:35 UTC remains UNCHANGED. It writes immutable per-day records; no additional scraper or daily fetch is added.

## Data retention policy
- **HOT:** source day equal to *today or yesterday in Asia/Hong_Kong*, all original columns/JSON retained in `private.ft_source_day_snapshot`.
- **COLD:** source days older than yesterday, only from past 30 days; preserve complete source records in private bucket `fast-tracker-ingest` with immutable content-addressed SHA-256 paths `source-day/v1/YYYY-MM-DD/SOURCE-DIGEST.json.txt`.
- A new POST-only Edge function `source-day-retention` authenticated by the existing Vault cron secret does **one bounded pass** over at most **3 rows per invocation**. It delegates backup/readback/SQL source-row restore proof to the already verified `source-day-cold-archive` worker. Only then does it call `ft_source_day_retire_proven` for exact source/day, full JSONB source-row MD5, record count, archive SHA-256, Storage path and length.
- SQL retirement is SECURITY INVOKER, service_role-only; PostgreSQL rechecks immutable Storage object metadata and SHA path, HKT cutoff, archive recency, row identity, full source JSONB MD5, and locks exact row before deletion. A transactionally inserted private ledger records the archive path/checksum. Any changed source row, missing archive or failed proof triggers **zero new deletion for that item** and an actionable failed HTTP response.
- **Fail closed** on backlog older than 30 days: the existing archive-only worker cannot prove an older snapshot. Handle with explicitly reviewed batch backup, never silently purge.
- Does not modify canonical fixtures, lineups, odds, Football-Data, aliases, models, adviser predictions or provider collectors.
- A DELETE may only reclaim reusable space in the existing small table. A separate, rarely needed off-peak guarded repack would be required to return physical TOAST allocation if bloat grows substantially. Never VACUUM FULL large live tables.

## Rollout and checks
1. CI (all PR checks) and service role privilege checks.
2. Deploy SQL RPC and Edge; invoke once with valid Vault key. Since current Oct17–18 records are HOT on Oct18, the correct response is `NO_COLD_SNAPSHOTS` and **0 deletes**.
3. Negative cases: GET/anonymous request fail, function permissions deny anon/authenticated.
4. Only after smoke checks pass, schedule **one** daily pg_cron POST at **16:25 UTC = 00:25 HKT** (at least 50 minutes after existing 15:35 UTC snapshot creation), using existing Vault secret; one request per day, maximum 3 source rows.
5. Verify the first actual scheduled archive→delete result (as opposed to merely pg_cron success); check new private ledger, preserved current+yesterday records, original Storage objects and database size.
6. Check existing job #56 lineup archive/delete continues to be healthy.

## Rollback
Unschedule the single new daily retention job. The archive-only endpoint and previous snapshot writer remain working; old snapshots are recoverable from the immutable archive and ledger. **Never** rerun broad TRUNCATE to recover a few bytes, and never claim allocated bytes reclaimed just because rows were deleted.
