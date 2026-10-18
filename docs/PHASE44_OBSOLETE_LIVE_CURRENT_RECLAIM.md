# Phase 44 — Archive old non-Flashscore LIVE data, reclaim physical space

The 15 `live_score_current` and 15 `live_stats_current` rows contain only **FB####** canonical IDs from Oct7–10; none are present in `flashscore_primary_fixture_current`. Last write Oct10. 27 rows incorrectly still say LIVE. Old sources: FOOTBALL_LIVE_API_SELF_HOSTED and SPORTSCORE. No live-score/stats writer cron is active; the only similarly named cron prunes separate live history.

PR181 Phase43 archived **both 15-row original tables**, full JSON, into two private Storage objects with full SHA256 download readback and exact PostgreSQL JSONB restoration dry-run. A deleted row is recoverable from Storage. This guarded transaction requires exactly 15 rows per table; every ID must match FB legacy, every kickoff at least seven days old, every source one of the known legacy sources, NO current Flashscore fixture, no incoming FKs, both immutable Storage archives present, and >7MB allocation before it can TRUNCATE ONLY these two obsolete tables.

Short NOWAIT exclusive lock (750ms), max statement 7s. No CASCADE and no other table changed. All schemas, indexes and UPDATE triggers remain defined. If any precondition fails, transaction rolls back with no rows lost.

Expected physical reclamation up to 7.5MB, enough to bring database size from ~80.8% below 80%; measure actual after execution. This is a one-off operation, not a cron or new feed. Do not re-enable obsolete FB self-hosted writers in place of Flashscore.
