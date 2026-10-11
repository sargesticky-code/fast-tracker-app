# Fast Tracker — 2026-10-11 holistic production coverage and repairs

## Evidence at audit (Supabase project he...; UTC timestamps)
- `ft_fast_flashscore_summary(48)`: 98 recent/upcoming canonical matches (includes previous 6h).
- Prior to repairs: Forebet 20 complete predicted score + average goals + H/D/A, indexed bookmakers 90 stored but 0 fresh price quotes (<20 min), source-backed Flashscore detail 10, China500 SPF currently 0, in-play identity limited.
- `phase15_source_shadow_current`: 4,107 Flashscore events, 1,518 upcoming within 48h, only 82 canonical linked in that future-only set; FotMob 1,436 events. Over a wider -6h/+48h, Flashscore canonical linked 86 of 98, and 12 `FS:<event-id>` canonical fixtures were still unmatched in the shadow.
- `phase2_lineup_coverage_current`: 85 entries in the same horizon, 6 PREDICTED_FULL / 79 MISSING. Missing lineup remains UNKNOWN, not fake 0/11.
- Internal DC/PI models last refreshed Oct 5; never use as fresh Forebet/EV. Forebet next match scoring currently limited to 20 known predictions.

## Root cause 1: odds stale even though cron runs succeeded
- Railway source service: `Fast Tracker 2026` / `fast-tracker-dashboard` hosted at fast-tracker-dashboard-production.up.railway.app.
- Supabase cron job 38 executed 5-min successfully but only fetched previous Railway snapshot. 2026-10-11 at 02:03 UTC `private.ft_flashscore_direct_request_state.last_result` showed `PREVIOUS_CAPTURE_REJECTED` because source snapshot timestamp stuck at **2026-10-10 15:45:59Z**.
- Railway logs showed refresh started at 2026-10-10 16:01 but no completion for hours; `app.py` background `asyncio.run(refresh_once())` lacked a hard wall-clock limit, leaving Gunicorn HTTP serving a stale snapshot forever.
- Safely restarted only the stateless collector, verified it finished new 228-fixture / 122 complete-price capture.
- Fixes merged into source repo: PR #53, SHA `504b5a76`, bounds a SINGLE existing 15min capture in an isolated child process (300s), process-group kill on timeout, removes duplicate immediate retry, adds stale health signal; PR #54 SHA `c52b5f89` packages required modules in Docker image and tests Docker COPY. PR #54 was necessary because initial new deployment discovered missing module at runtime. Both CI and latest Railway deployment later SUCCESS.
- Railway verified latest production deployment `66a5dd76-bcc9-4588-bb49-c64dfecbb922` at SHA `c52b5f89`. Runtime logged a full successful post-hotfix refresh at **2026-10-11 02:18 UTC**: source discovery 365 today/108 tomorrow, original quote cap 360 with actual 228 requests, 122 complete HDA rows.
- `bet365_current` showed **73 fresh (<20min) valid price rows** after restoring publisher; before restart 0. **No stale price treated as live**. Verify a second natural refresh before considering the infinite-stall risk fully eliminated.

## Root cause 2: source details unavailable due mismatched canonical window
- Dashboard summary deliberately includes last six hours. Deployed `phase15-flashscore-scout` v8 only looked up canonical fixture IDs from the last **three** hours; consequently 12 visible `FS:<provider_event_id>` canonical fixtures had a source-shadow row with null `match_id`. Another one with 19-hour mismatched kickoff was NOT accepted.
- Executed a single **atomic, idempotent** repair SQL `ops/sql/ft-20261011-reconcile-flashscore-sixhour-source-details.sql`, requiring exact FS provider event ID, exact UTC kickoff and unique canonical fixture. **11 new identity links**, of which **10 had real fetched detail in preceding 24h**.
- Immediate `ft_fast_flashscore_summary(48)` detail coverage improved **10 → 20 of 98** without any new HTTP or source capture. Predicted score remained Forebet 20/98, honest unchanged.
- To prevent next ingestion from undoing links, deployed `phase15-flashscore-scout` **version 9**, the exact source stored in `supabase/functions/phase15-flashscore-scout/index.ts` in this PR, with -6h window and exact FS:source-event ID + kickoff within 60sec preferred over fuzzy matching. Other provider/matches still follow preexisting mapping gates.
- Verified Edge function version 9 readback includes both controls. No extra scout schedule or source fetch, no change to FT phase 1 scoring.
- Source detail may be historic and must not be labeled live just because it is accessible. Public browser pixel render not independently verified (web/network access limited); SQL/Railway/Edge proof only.

## Owner standing constraints
No HKJC odds authority, no synthetic predictions, no added provider spend, no duplicate cron, keep the 55,242-entry alias reference and one canonical team master; explicitly label uncertainty. A future change that links uncertain identities or changes priority sources needs fresh exact-identity proof, not blanket promotion.

## Follow-up priorities from evidence
1. Track next two NATURAL capture cycles and fail-closed freshness status, not synthetic extra capture runs.
2. Extend honest Forebet source availability on actual authorized dates; more aliases by itself cannot create model predictions.
3. Improve lineup coverage using preexisting FotMob / Flashscore exact identities, but preserve PREDICTED vs CONFIRMED and quote source timestamps.
4. Verify deployed public Next.js page (Railway `fast-tracker-public`, current release/ft-forebet-horizon-20261010, SHA da6472f) separately from API and DB. Latest SQL counts are not proof of render on desktop/tablet/mobile.
