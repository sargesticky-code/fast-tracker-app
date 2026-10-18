# Phase 41 — Immutable source-day archive and SQL restore-proof

As of 2026-10-18 10:51 UTC, `private.ft_source_day_snapshot` has **14 actual rows (11–18 October)** and **4,767,744 bytes of total allocated table/TOAST space**. These snapshots contain historical Flashscore and Forebet provider output. The only stored SQL reference is the daily writer `private.ft_archive_source_day(date)`; there are no public match-detail/forecast SQL reads. All current source-day snapshots have `coverage_complete=false` and must NOT be recast as authoritative complete provider capture.

## Archival, no deletion
New service-role-only, `SECURITY INVOKER` RPC `ft_source_day_archive_read` returns one source/day row. The REST endpoint `source-day-cold-archive` accepts **POST only**, requiring the existing trusted `x-ft-cron-key` secret. One existing source/day snapshot per request, current HKT date or previous 30 days. It produces deterministic content-addressed files `fast-tracker-ingest/source-day/v1/YYYY-MM-DD/SOURCE-<SHA256>.json.txt`. The Storage bucket is private; uploads never overwrite existing objects.

The worker re-downloads the ENTIRE archive file, checks length and SHA-256, parses all eleven source snapshot columns and full `source_rows` JSONB, then calls `ft_source_day_archive_restore_check`. The DB performs a **read-only restoration dry-run**: source JSONB hash equality with the stored content_md5, fixed allowed source keys, HKT 24-hour window, payload record count, capture origin, field count, and full JSONB equality against the original row. If any check fails, no DB source row is removed (this phase has no delete path).

## Next step
Run one small FOREBET snapshot first; verify its response and Storage object; then all existing snapshots one at a time. **Only after all backups pass** discuss a single transaction preserving current/recent rows, safely resetting only the small 4.77 MB TOAST-heavy snapshot table, and restoring the retained rows with fully validated data. Do not delete current source observations, football stats, aliases, or production models. This archive alone WILL NOT decrease database size.

Never enable a new scraper/cron, never add paid providers, and never reactivate HKJC. Monitor database size (>80%) and protect the existing hourly lineup cleanups.
