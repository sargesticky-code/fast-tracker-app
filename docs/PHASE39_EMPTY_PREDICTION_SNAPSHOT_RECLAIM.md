# Phase 39 — Reclaim allocation from an empty, retained snapshot table

## Preflight 2026-10-18
`private.prematch_prediction_snapshot` has **0 rows**, **6,160,384 physical bytes**, no user triggers, no incoming FK, no active relation locks. Its schema and query interface are referenced by `phase4.refresh_model_consensus`, `phase4.refresh_model_evaluation`, and `ft_internal_refresh_validation`. **Do not DROP the table**, remove indexes, or touch other model tables.

## Operation
The transactional SQL script `scripts/sql/phase39-reclaim-empty-prematch-table.sql` takes an immediate `ACCESS EXCLUSIVE` lock (NOWAIT), aborts unless the table is still empty and has no referencing FK, then TRUNCATEs **only** the empty table to reset heap/index allocation. Lock waits are bounded to 750ms; total statement to 5s; no CASCADE. This is a one-time guarded maintenance step, not a cron.

TRUNCATE is a DDL-like table reset despite zero rows; apply only when live preflight and PR checks pass and user-approved capacity cleanup remains in scope. Verify no rows disappeared, table functions stay available, actual `pg_database_size` dropped, Flashscore/Forebet/adviser counts stable. DB size target is below 80%, so ~6MB reclaimed alone may not be enough.

## Rollback
The table/schema remain intact and have zero rows. If model functions fail, diagnose before re-enabling refresh; restoring table allocation would not restore historical data (there were zero rows). No maintenance on live lineup/odds/forecast tables.
