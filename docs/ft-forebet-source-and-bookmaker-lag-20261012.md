# FT-FOREBET-ODDS-20261012 — source gap and collector lag

## Verified root causes
- Forebet exact match page exposes independent 1X2, O/U 2.5 and Corners 9.5 predictions. Existing DB publisher `ft_publish_forebet_canonical` wrote 1X2, avg-goals, predicted-score but ignored the optional O/U and corners columns already present in `forebet_predictions`. Existing bulk Firecrawl source stage also stores only 1X2; it must supply market fields in future verified batches before coverage can expand automatically.
- Production snapshot: 32 current Forebet prediction rows, 28 canonical `FS:`; O/U and corners coverage was 0/32. A separate old `forebet_archive` contains three rows (one O/U, three corners), not usable as current predictions.
- Provider sample match pages, independently observed on 2026-10-11: San Lorenzo–Deportivo Riestra (Forebet ID 2417532) goals Under 2.5 75/25, corners Under 9.5 52/48, projected 5-4, avg 8.91; Coquimbo Unido–Colo Colo (ID 2419836) goals Under 2.5 51/49, corners Over 9.5 44/56, projected 5-7, avg 9.73.
- Both samples were published exactly once using the identity-verified `FS:` canonical fixture and a fresh pre-kickoff source capture; `ft_publish_forebet_canonical` accepted/applied 2/2. Stored HDA forecast remains unchanged; added market percentages appear in the compact per-fixture RPC.
- IMPORTANT: the public source pages can show the prediction after kickoff. Do not backdate a late fetch or retroactively treat a post-match capture as prospective prediction input. New SQL contract rejects optional-market payloads captured after canonical kickoff.
- The public Edge v96 direct summary had hard-coded null for both market groups; v97 now reads validated source columns from the same single indexed SQL RPC and does not make new API fetches.

## Bookmaker latency
- Railway collector `REFRESH_SECONDS` default 900s and old code loop executed `run_refresh()` before `sleep(900)`. One measured capture began 17:10:48 UTC and finished 17:11:49 UTC, yielding roughly 16-minute capture-to-capture intervals, not 15.
- Supabase job 38 consumes the previous HTTP response on the next five-minute tick. The combined delay can push quote age over 20 minutes even when both components are healthy.
- Fix serial collector loop to use monotonic start-to-start scheduling: sleep `max(0,900 - capture_duration)`. Existing 300-second watchdog, 2-worker odds budget and 360-fixture cap unchanged. A 60-second capture now yields ~15m start-to-start instead of ~16m. This may modestly increase actual cycles (~6.7%) but does not create a second collector, a new job or polling retries.
- Continue enforcing the strict 20m bookmaker freshness gate. The scheduler alignment does NOT guarantee 100% zero-gap availability under network latency; distinguish job success, quote publication and freshness.

## Supabase usage / safe data management
- Reuse existing `forebet_predictions`, `ft_fast_flashscore_summary` and `app-phase1-feed`. No new tables or polling fanout, no alias scans. Both migrations are already recorded in production and mirrored under `supabase/migrations`; do not rerun them as part of deploy.
- Preserve fixture identity, source URLs and capture timestamps. No historical deletion or expansion of the raw database.
- This PR does not yet implement an automatic O/U and corners extractor in the upstream Firecrawl/Forebet capture mechanism (not present in the current release repo). Existing future 1X2-only batches remain accepted, leaving extra fields unknown. That upstream capture must supply explicitly verified market observations before claiming broad coverage.

## Acceptance and rollback
- PR desktop 1440px and mobile 390px Playwright tests: forecasts visible with exact `FS:` identity; incomplete market pairs remain unknown. Python collector offline syntax and start-to-start cadence check. No provider calls from CI.
- Verify Supabase `ft_fast_flashscore_summary(48)` returns San Lorenzo and Coquimbo OU/corners; verify new Edge API returns normalized fractions. Then pin Railway collector+public to matching reviewed commit, only when independent QA passes.
- Safe rollback: restore prior Edge v96 source if necessary and prior collector fixed `sleep(REFRESH_SECONDS)` while retaining stored verified markets; do NOT truncate forecast tables or relax price freshness.

## Verified source pages
- https://www.forebet.com/en/football/matches/san-lorenzo-deportivo-riestra-2417532
- https://www.forebet.com/en/football/matches/coquimbo-unido-colo-colo-2419836
