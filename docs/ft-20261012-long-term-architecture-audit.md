# Fast Tracker long-term root-cause repair — 2026-10-12

## Audit (source-backed)
- GitHub release head was a4f2bda3; Railway front was on team-logo UI commit 300e8b1c and the collector on 36e624a3. The SQL-only canonical fixture/odds repair remained live and did not require another collector.
- Natural job 38 produced 83 valid quotes at 01:58 UTC Oct 12, and at 05:05 UTC the publisher was `UNCHANGED` with 84 fresh H/D/A. Temporary snapshot reuse is not failure; no extra collector is justified.
- DB size 259 MB, 8 active cron jobs; primary storage footprint is large player lineup evidence (49 MB), source shadow (26 MB), player master (24 MB), odds snapshots (23 MB). Do NOT run blanket DELETE/REINDEX to manufacture savings.
- `forebet_predictions` dropped 32 -> 21 -> 17 over the cleanup window because it FK-cascades from `matches`. More critically, the *existing* `forebet_archive` also had an `ON DELETE CASCADE` FK to `matches`: it did not preserve a durable forecast history.
- The current source pipeline `ft_ingest_forebet_firecrawl_batch` writes a listing-level source shadow with 1X2, average goals and score, not independently observed goals/corners. The prior added forecast-market publisher supports strictly sourced optional markets, but it cannot produce absent input. No provider-name matching or inferred markets should fill the gap.
- The full canonical 48h summary is around 620 KB for 329-331 fixtures, fetched every 4 minutes per visible browser tab; homepage uses only canonical IDs, predictions, observed-stat badge and XI/score evidence.

## Changes completed
1. **Independent, compact Forebet archive**: remove the cascading FK only on the existing `forebet_archive`. Preserve its RLS and default private access. A fail-closed `SECURITY INVOKER` trigger snapshots forecasts on INSERT/UPDATE *only* if the captured time is before the known kickoff, is within 30 days of kickoff, source match quality >=0.94 and complete H/D/A sum 98..102. Existing archive rows are retained; same-capture optional goal/corner fields may be filled if missing, but original H/D/A never revised. Existing 17 valid source rows were backfilled, leaving 20 archive rows at migration.
2. **Bounded retention with no new job**: job 48 continues pruning ordinary parent fixtures after 12h; it now separately removes only archived forecast rows with kickoff older than 180 days. No infinite forecast accumulation. No new table or cron job. FKs from other source tables remain unchanged.
3. **Compact homeowner read-through**: existing `app-phase1-feed` v97 single fast SQL RPC remains identical; `view=compact` returns only the exact FS ID, kickoff, team names, score, source-confirmed XI flag, historical source match statistics, Forebet 1X2/OU/corners and bookmaker health. Current `view=summary` contract is unchanged for other clients. Homepage requests compact, while match-detail retains full source API only when opened. No N+1 network calls or new provider access.

## Test / rollout
- SQL migration already applied to production as `ft_forebet_verified_independent_archive_180d_20261012`; do not replay automatically.
- Verify archive 3->20, 17 new source-backed pre-kickoff rows, zero archive FK, existing job 48 appended 180-day prune and same 8 scheduled jobs, anon/authenticated no EXECUTE for private helper.
- CI/Playwright: static migration contracts; exact `view=compact` HTTP request on desktop/mobile; existing official-XI, score, raw fallback, stale price and wrong-FS-ID tests continue.
- After PR CI succeeds, merge branch. Deploy only `app-phase1-feed` Edge and public Railway frontend service to reviewed release SHA, with no collector redeploy.
- Compare production `view=compact` vs `view=summary` same 48-hour window: returned fixture counts and IDs, forecasts/confirmed XIs, HTTP 200 and size reduction. Check booking/scores and borrower finances: not in scope.

## Verified outcome archiving (additional live migration)
- Forecasts alone are not sufficient for a reproducible evaluation. Existing Flashscore shadow uses exact `FS:` provider IDs, verified finish flags `AB=3`, `AC=3` and source score fields `AG/AH`.
- An additional **already applied** lightweight migration adds a `BEFORE DELETE` trigger on `public.matches` that records the verified final score inside the independent `forebet_archive.raw.verified_final_result` only when exact FS ID, kickoff within 20 minutes, post-kickoff source capture and both finish flags pass. It does not backdate forecast capture or edit H/D/A predictions. No new table/API/cron.
- One-time source-verified backfill froze **14 final results** for the 17 pregame source predictions; the other 3 historical archive rows remain without invented outcomes. Compact archive size was **192 KB** at verification.
- This supports future evaluation, but 14 matches is too small/selected to publish a claimed model hit rate.

## Remaining, not falsely claimed solved
- **Forebet ingestion freshness:** the Firecrawl listing input does not carry reliable per-match O/U/corners. Existing source ingestion has no independent scheduled refresh in currently active 8 jobs; full automatic coverage requires the *upstream* collector to observe official match-detail markets and supply fresh verified evidence. Do not start more scraping until availability and provider permission reviewed.
- **Evaluation sample size:** exact FS final outcomes are now preserved only where source-confirmed. No hit-rate or calibration claims until prospective sample is sufficiently large and missingness is accounted for.
- **Recent-48h historical UI:** compact archive preserves evidence; raw public match pages intentionally prune 12h after kickoff. A separate on-demand historical UI or a bounded quality-gated model evaluation feed can consume archive in a later change without bloating the live homepage.
- **Operational gating:** the 20-minute H/D/A freshness gate and 15-minute collector cadence are deliberately retained. Cron `succeeded` and `UNCHANGED` do not imply failure or quote recapture; check age/status/coverage.

## Rollback
- Revert public frontend to prior Railway successful deployment and Edge v97 if compact client mismatch occurs; the old `view=summary` remains available.
- For archive rollback, disable the trigger before considering a re-addition of the old cascading FK. Do not re-add cascading FK unless history loss is explicitly accepted. Preserve existing rows.
