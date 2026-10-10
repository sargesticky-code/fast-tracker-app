# FT500 production rollout checkpoint — 2026-10-10

## Verified observations
- Official `trade.500.com` XML and match-index HTML matched 67/67 provider events by exact source ID and match number on GitHub-hosted Actions.
- 10 offline identity/time/quote tests passed and source dry-run matched 8 existing EPL canonical IDs from 54 eligible records.
- `football-fast-tracker` PR #41 merged into `main` at `646f4b2d740a8233876d80f5047b44c09f773d55`.
- Initial official GH publication run [38052352528](https://github.com/sargesticky-code/football-fast-tracker/actions/runs/38052352528) passed on controlled retry: 8 accepted, 8 written; all 8 mapped kickoffs differed from canonical by 0 seconds.
- Supabase DB project `hekqxhgjexzxnecwhyao` has service-only RLS-protected `ft_500_spf_current`; no changes to Bet365/Forebet/Flashscore tables; writes allowed only via GitHub-OIDC-locked `ft-500-spf-publish` Edge.
- DB applied migrations `20261010122318` (`ft_500_spf_service_only_authority`), `20261010122839` (`ft_fast_summary_fresh_forebet_and_500_spf`), `20261010123908` (`ft500_dated_reference_window_only`). Last RPC definition is committed in this release branch.
- Current `app-phase1-feed` Edge v91 deploy is a small function-only patch of previously deployed v90; public summary live smoke test run [38053191267](https://github.com/sargesticky-code/fast-tracker-app/actions/runs/38053191267) passed: 259 canonical fixtures; dated China 500 reference odds on `FB6346`, `FB6345`, `FB6338`; all decisions, decisionEdge and independent `market` null on SPF rows.
- End-to-end GitHub release QA run 38053191267 passed TS check, existing evidence contract, static Next build and real public API check.

## Honest semantics
- 500.com is **China Sports Lottery SPF** (national sports lottery 1X2), **not** OddsPortal, Bet365, bookmaker aggregation or true real-time sportsbook quotes.
- Display only prematch quotes, source-updated <=24 hours, database-captured <=75 minutes, with precise source-updated date/time and clearly marked *reference only*.
- No derived value/EV from China SPF, no live odds, no guessed HDA/handicap/corners/lineup values.
- Historical Forebet models are stored but **zero fresh Forebet predictions** currently meet model validation. Do not present those as current.
- Source collectors run only twice/hour at 13/43 UTC in existing GitHub Actions; no extra cron/DB/project/job.
- If the source capture fails, preserve old rows but let reader freshness expire; do not promote collector time as source price update time.

## Frontend release and recovery
- Release branch: `release/ft500-spf-label-20261010`, based on last confirmed Railway production source `eccc62af728afda8bb037b9ba9d934829aaada98` rather than merging unfinished PR #44.
- Railway `fast-tracker-public`, project `496c4795-e8f6-4f54-9ab0-406981b41669`, service `3621679c-9fbf-4e61-b46f-82d153b4b697`.
- Deploy input pinned to `3d58073107830e397373c3f35cf64ca0d7e618dd`; isolated public frontend service only, Flashscore collector unchanged.
- Prior production Railway deployment `ec95f869-30b7-4aa5-b551-b0590f2b547d`; previous source branch `phase0/international-authority` at `eccc62af728afda8bb037b9ba9d934829aaada98`.
- On regression, redeploy prior successful Railway image and use previous v90 Supabase Edge revision. No database table or migration destructive rollback required: old readers ignore new 500-specific columns/table. 
- ***Do not*** merge unfinished PR #44 or PR #40 just to make this release work.

## Completed public release acceptance
- Backend deployed `app-phase1-feed` v91; SQL and source age gates verified, 3 upcoming priced EPL rows on the public source-backed API (259 canonical fixtures retained).
- Browser fallback root cause fixed: degraded collector SSR seed was treated as fresh canonical and deferred refresh for 3 minutes. Revised SSR hedging, canonical-only seed gate and cache source-time expiry are in the pinned Railway release.
- Railway deployment `2779f040-3657-4e92-946b-dd315f729aa3` SUCCESS. Earlier `23840ae1-d0ee-4e3f-ba97-2dc9c50aa8bc` now retired.
- End-to-end CI `38053727086` green: source provenance, TypeScript, full Next build and live public Edge response.
- Public browser acceptance [38053965869](https://github.com/sargesticky-code/fast-tracker-app/actions/runs/38053965869) green on desktop 1440x900, tablet 820x1180, mobile 390x844; all rendered exact `500.COM · CHINA SPORTS LOTTERY SPF · REFERENCE ONLY · SOURCE UPDATED 10 OCT, 20:12 HKT` label.
- [Three real browser screenshots](https://github.com/sargesticky-code/fast-tracker-app/actions/runs/38053965869/artifacts/11670627782) retained with acceptance run.
- Legacy 30-minute HKJC/CSV watchdog was shown to falsely flag 266/266 fixtures, dispatch retired workflows, and has been changed to manual-only diagnostics by merged [PR #42](https://github.com/sargesticky-code/football-fast-tracker/pull/42).

## Remaining honest gaps
- China 500 SPF initial curated team map covers only verified EPL fixtures; no all-league/multi-bookmaker claim.
- Forebet source is still 403 from GitHub runner and no fresh predictions met validation. Avoid showing any historical model as fresh.
- Next routine 500 capture is scheduled by GitHub, not by a new Supabase cron; availability and quote timestamps determine whether public odds remain visible.

## 2026-10-10 holistic continuation — five leagues live and no-reference-EV guard
- Fast Tracker public frontend final code pin `f4f1bc539de7a7128755af4577466ba4da586eda`, Railway `fast-tracker-public` deployment `a5fc1ebf-3e73-4eb1-af00-c50e3f904910` SUCCESS.
- Existing `valueEdge(match)` now refuses `CHINA_500_SPF`, `PREMATCH_REFERENCE_ONLY`, `CHINA_500_SPF_REFERENCE` or `REFERENCE_ONLY` in every source lane; model enrichment cannot override this and cannot inject decision/decisionEdge/oddsMovement.
- UI separately renders transparent, normalized bookmaker-implied H/D/A shares labelled `SPF implied · not a prediction`; it does not fill Forebet prediction/score/average-goals fields.
- Runtime regression script `scripts/check-ft500-reference-value.mjs` verifies genuine bookmaker quote path still works and 500 source cannot produce EV even with valid independent model. CI run [38054869845](https://github.com/sargesticky-code/fast-tracker-app/actions/runs/38054869845) green, nine assertions plus Edge types and Next build.
- Five-league strict source+league+team+kickoff mapping was published on `football-fast-tracker` PR43 merge `92ab2520134f50fba62ffbacfe167f101a3e445f`.
- OIDC GitHub release run [38055671689](https://github.com/sargesticky-code/football-fast-tracker/actions/runs/38055671689): 36/54 official quote rows verified and 36/36 published. Supabase migration `20261010132309` extends invoker RPC without new table/cron; DB joins confirm 36 distinct event and fixture IDs, 0 kickoff/league mismatches.
- Fast RPC sampled 258 canonical fixtures, 21 rows with dated SPF reference. Upstream 24-hour updated, unstarted quotes were 18 (different time criteria).
- Real public browser acceptance rerun [38055113285](https://github.com/sargesticky-code/fast-tracker-app/actions/runs/38055113285) succeeded on desktop 1440×900, tablet 820×1180, mobile 390×844; each view displayed 6 500 source-labelled prematch references and visible SPF implied H/D/A shares. Not all 21 backend references must appear in the date-filtered homepage.
- Existing live/Flashscore/Supabase jobs were left intact after a read-only two-hour run-duration audit; no assumptions that cron scheduling success proves provider freshness.
- Forebet: `forebet_predictions` historical 525 rows, latest `2026-09-28T15:30:17Z`, zero fresh valid current models. GitHub runner direct capture previously HTTP 403; Apify actor requires an account/token and usage; redistribution permission is a separate issue. No unsupported substitute is labelled Forebet.

