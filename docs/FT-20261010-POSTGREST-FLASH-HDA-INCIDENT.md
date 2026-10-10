# FT-20261010 — PostgREST and Flashscore HDA continuity

Status: **degraded; not production accepted**. UTC date: 2026-10-10. Repository branch `phase0/international-authority`, draft PR #44.

## Observations verified in production

- Railway Flashscore collector captured 164 complete genuine bookmaker H/D/A events around 04:07:50 UTC, and 157 around 03:52:04 UTC. Its direct `/snapshot` endpoint responded HTTP 200 with captured timestamps and provider IDs.
- Supabase `bookmaker_odds_current` remained last committed at 03:20:46 UTC; the 20-minute fresh quote count became zero even as the collector continued capturing. Ingest callbacks logged `ReadTimeout`; current `source_health` can remain `OK` with stale `observed_at` and is not a fresh-price proof.
- PostgREST logs repeatedly reported `PGRST002` and `57014`: **Failed to load schema cache** for `db-schemas=public,graphql_public`, database statement timed out. Cron jobs also intermittently reported startup timeouts, including the scheduled ingest. Do not reinterpret this as fixtures or quotes being absent.
- Temporarily raised authenticator role `statement_timeout` from 8s to 20s and notified PostgREST; no verified recovery. **Reverted to original 8s** and notified config reload; `lock_timeout=8s` unchanged. Do not claim this attempt fixed the schema cache.
- Directly validated public Railway fallback in the Opera browser: 159 Flashscore provider-snapshot fixtures, all with captured H/D/A (e.g. C-Osaka vs Yokohama M.: 2.30 / 3.50 / 2.82). Detail linked and displayed correct teams and market prices even with optional detail service unavailable. This is **collector reference/degraded mode**, not independent modeling or live scores. Stats and independently backed prediction coverage remained 0/159 in that snapshot.
- Full CI on commit `c12dcc215f`: static build passed, browser acceptance did **not** pass. 35 real-production acceptance failures and 12 rendered-flow failures. Keep these failures visible until source/provenance or UI issues are separately established and fixed.

## Applied actions and rollback

1. One verified provider identity redirect: `FS:hQ2NzTJb` → `FB6344` for Man Utd/Manchester Utd vs Tottenham. Based on Flashscore epoch, scout confidence >=0.99 and matching opponent. The other five one-day-off EPL provider duplicates already had verified redirects. Identity fix is stored as a Supabase migration and mirrored in the PR branch.
2. Indexed, service-role-only `ft_fast_flashscore_fixture_by_id(text)` added for exact canonical fixture/HDA/observed stats. PostgREST may still fail; an SQL fix is not API acceptance.
3. The Edge match detail fast path uses the indexed RPC and fails closed (HTTP 503) on the PostgREST error instead of a large secondary query fan-out. Unavailable is not proof of empty data.
4. Railway frontend has bounded SSR last-verified feed and direct read-only collector fallback, with original 20-minute quote validity checks and explicit degraded provenance. It retains fixture identities without inventing models, live status, goals/corners odds, or stale prices.
5. PR CI now cancels superseded production acceptance and uses a single worker to avoid amplifying PostgREST outages.
6. **Operational cron adjustment**: job 38, `flashscore-bet365-cloud-ingest`, retains 5-minute cadence but shifted from minutes `2,7,12,17,22,27,32,37,42,47,52,57` to `3,8,13,18,23,28,33,38,43,48,53,58` to avoid exact collision with Phase 4 Polymarket job 28 and to run after common collector capture times. Roll back using `select cron.alter_job(job_id := 38, schedule := '2,7,12,17,22,27,32,37,42,47,52,57 * * * *');`. Phase 4 core job 23's approved schedule was **not changed**.

## Remaining P0 acceptance gates

1. Resolve PostgREST's failed schema-cache load/statement-timeout issue, ideally using Supabase's database/PostgREST observability and vendor escalation if this persists. No destructive schema/RLS action or spending increase was approved.
2. Verify at least three consecutive naturally scheduled *fresh* Flashscore captures successfully publish into `bookmaker_odds_current` with correct source timestamp, exact IDs, opening/closing price rules and 20-minute freshness. A green cron run or HTTP 200 alone is not sufficient.
3. Verify publicly rendered All-in-One and an opened priced Match Detail agree on provider ID, home/away, kickoff, H/D/A timestamp and expired quote gating across desktop/tablet/mobile.
4. Reconcile independent model, full match statistics, lineup provenance, and today's unsupported `Unknown` fields. No bookmaker-implied values should be labeled an independent DC/model probability.
5. Rerun real CI after upstream recovery. Do not fake tests, weaken stale data gates, or claim the application is completely repaired based on Railway deployment status alone.

Official Supabase troubleshooting: https://supabase.com/docs/guides/troubleshooting/postgrest-error-pgrst002-could-not-query-the-database-for-the-schema-cache-c396e9 and https://supabase.com/docs/guides/troubleshooting/canceling-statement-due-to-statement-timeout-581wFv.
