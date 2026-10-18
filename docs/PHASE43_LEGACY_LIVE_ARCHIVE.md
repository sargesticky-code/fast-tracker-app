# Phase43 — Old “LIVE” values are not real current matches

Live audit on 2026-10-18 found `public.live_score_current` and `public.live_stats_current` contain **15 rows each**, kickoff Oct7–10, 100% legacy `FB####` canonical IDs, no link to any active Flashscore fixture. 27 total statuses remain misleadingly `LIVE`, despite source's last write Oct10. Sources: 12 FOOTBALL_LIVE_API_SELF_HOSTED score, 3 SPORTSCORE score, 15 FOOTBALL_LIVE_API_SELF_HOSTED stats. These are stale legacy current-table records, not verified active Flashscore results.

Actual DB size: score table 3,817,472 bytes + stats table 3,710,976 bytes (~7.53 MB). Physical storage is mostly prior TOAST allocation, not 30 rows' current logical JSON. No pg_cron job currently inserts either; sole named live cron prunes a separate history table.

Archive first, without deletion:
- New role-protected read and exact PostgreSQL JSONB restore-check functions.
- Authenticated Edge `legacy-live-cold-archive` with existing x-ft-cron-key, POST kind score/stats only.
- Immutable private Storage archive, SHA256 full download/compare, then full row array PostgreSQL equality against the live table, 15 rows expected, all kickoff >7d past, legacy FB IDs and no current Flashscore match.
- No table changes, provider calls, cron, business logic writes.

Only AFTER BOTH archives return proven SUCCESS may a one-time short-lock transaction TRUNCATE the two stale legacy tables to reclaim allocated disk space. Preserve schemas, FKs, triggers, reader interfaces and source records in Storage. Never delete current FS-aligned results. Manual future regeneration would require separate explicit source authority review.
