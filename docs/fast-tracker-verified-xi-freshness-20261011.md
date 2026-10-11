# Fast Tracker — Source-backed XI visibility and bookmaker freshness (2026-10-11)

## Fix delivered
- Public fast Phase-1 homepage summary previously forced `lineupAvailable: false` even where the verified Flashscore canonical fixture has an official source XI in storage.
- The single `ft_fast_flashscore_summary(48)` RPC now exports a lightweight, provider-exact, 72-hour-bounded XI presence/observed-at flag using an existing indexed `phase15_source_shadow_current` row. No new crawler, job, alias scan or fanout.
- The v96 `app-phase1-feed` fast path preserves this source XI evidence whether Flashscore match statistics are present or absent. The displayed badge does not imply FotMob player identities have been canonicalized.
- Runtime source-health now checks **snapshot captured time** against the existing 20-minute bookmaker freshness gate, independent of cron success. Cached `source_health.status='OK'` no longer means bookmaker price is fresh.
- No change to the prematch odds price gate or to in-play odds claims.

## Direct verified evidence
- Before change, all 35 source-backed official XI events in the active 81-fixture window were falsely labelled unavailable by the summary API.
- Cross-check of `phase15_source_shadow_current.lineup_available` (with 72h source detail freshness) against `ft_verified_lineup_fast(match_id) IS NOT NULL` had 0 false positives and 0 false negatives (35/81 at first inspection).
- Later, new producer writes raised both to **42/81** with 0 false positives/negatives.
- Production read-only query of indexed XI row join took approximately 6ms; complete fast RPC measured approximately 126ms in one observed database run, not a sustained-load benchmark.
- HTTPS public `app-phase1-feed?view=summary&hours=48` returned 200 / 81 matches / 42 labelled XI / 28 Forebet predicted scores / 43 fresh 1X2 quote rows at the observed snapshot.
- In the same response, `systemHealth.FLASHSCORE_BET365.status='OK'` and `raw.snapshotFresh=true`; logic emits `STALE` when age exceeds the original 20-minute limit even if stored job status is `OK`.

## Correctly unresolved data
- Only 28 of 81 active fixtures had a joined Forebet score/HDA at the inspection. **None of those 28 contained Over/Under or corner predictions.** The database contains hundreds of historical O/U/corner records for *other fixtures*, which must not be reassigned by name matching.
- Legacy model forecasts are allowed on the single-fixture API only when canonical fixture redirect and model quality pass existing checks; no general legacy ID cross-join or bulk backfill.
- Four retired HKJC Edge endpoints may remain deployed as inert 410 stubs; deleting Git source did not physically undeploy them.
- The production `20261011145312_neutralize_canonical_identity_schema` migration exists but its source file was **not** found in the checked release branch. Reconcile before any clean-schema rebuild. No attempt to reverse that already-applied schema change was made.
- Browser screenshot and mobile viewport QA remain unverified by this session. Deployment checks, RPC queries and API responses are not replacements for a rendered screenshot.

## Acceptance/rollback
- Confirm v96 Edge API returns 81 rows, with source XI flags consistent with current verified lineups; no duplicate fixture IDs or forced unknown lineups.
- Validate current quote freshness, staleness-label behavior, and unchanged 20-minute decision gate.
- Production SQL migration: `ft_fast_summary_verified_source_xi_flag_20261011`; source reflected in `supabase/migrations`.
- For a regression, revert the Edge function source to the previous v95 version and restore the previous SQL RPC definition from the immediately preceding migration. Do not truncate match, player, or odds history.
