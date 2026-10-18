# Fast Tracker — Future-only database policy (effective 2026-10-18)

## New direction

**No more historical migration timestamp repair.** The current production Supabase database is the operational baseline. Existing files under supabase/migrations/ are archived evidence, NOT a safe clean-room replay chain.

Use the dedicated folder supabase/future_migrations/ for all future schema changes. Never run supabase db push against the old migrations folder until a separately reviewed, restore-tested clean baseline is created.

## One-change release procedure

1. Inspect the live table/function/permissions, storage size, source health and intended callers using read-only SQL.
2. Write additive forward-only SQL as one numbered file in supabase/future_migrations/.
3. Add a rollback and bounded post-deployment verification. Do not embed data deletion or unsolicited new collectors/crons in routine migrations.
4. Open a PR. The Future-Only Database Safety job blocks edits to old SQL and unsafe new changes.
5. After review, apply exactly one migration using the Supabase migration API; record its returned live version and byte-identical source in GitHub. Do not rerun an already-applied migration.
6. Verify grants, actual source freshness and returned data; only then change dashboard code that consumes the new state.

## Applied Phase 53 baseline

Production has already applied 20261018143302_phase53_future_pipeline_health_readonly. Its exact SQL is stored in the future_migrations folder and must never be applied a second time.

The RPC is public.ft_future_health_snapshot(bigint). It is read-only, zero-ingest and service-role-only. The function returns independent freshness evidence for the current Football-Data results season (minimum 22 files, 36-hour freshness window), Flashscore canonical fixtures (30-minute freshness), frozen-before-kickoff model records, and PostgreSQL database size.

If a verified database quota is unavailable, quotaBytes and usagePercent stay NULL with quotaState=UNKNOWN; 0 is not a substitute for missing quota data. Database quotas and Supabase Storage bucket quotas must be considered separately.

Pass a real database quota in bytes to calculate the 80% threshold. An arbitrary example limit is not proof of the account's plan allocation.

The health RPC does not run itself periodically, send alerts, repair ingestion or authorize model predictions. In particular, having pre-kickoff frozen forecasts does not establish prospective forecast accuracy. Public prediction promotion needs a separate, validated release gate.

## Existing data boundaries

- Flashscore: verified identity, kickoff, score, XI
- Football-Data: historical match results and team form
- Independent provider quotes: market observations, not model truth
- Adviser aliases: source names/league/date match first; provisional links are never silently verified
- Retired HKJC pipelines: do not restore or reconnect
- Lineups and source snapshots: archive, verify full checksum and readback, then bounded retire only after retention proof

No new paid sources, no unnecessary scraping, no duplicate crons or tables.

## Current known limitation

The repository's old migration history is not fully consistent with the live Supabase ledger. A new, empty project cannot safely be recreated by blindly applying the old migration folder. Rebuilding new environments requires a separate schema-snapshot/restore project. Until then, continue to use forward-only migrations against the existing project.

Historical reconciliation PRs #191–#198 are obsolete under this policy and must not be deployed simply to make old timestamps line up.