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
- Deploy input pinned to `8be83c727643c59281090a1a3fcbffe08dfb77bd`; isolated public frontend service only, Flashscore collector unchanged.
- Prior production Railway deployment `ec95f869-30b7-4aa5-b551-b0590f2b547d`; previous source branch `phase0/international-authority` at `eccc62af728afda8bb037b9ba9d934829aaada98`.
- On regression, redeploy prior successful Railway image and use previous v90 Supabase Edge revision. No database table or migration destructive rollback required: old readers ignore new 500-specific columns/table. 
- ***Do not*** merge unfinished PR #44 or PR #40 just to make this release work.

## Remaining acceptance
- Verify Railway deployment id `23840ae1-d0ee-4e3f-ba97-2dc9c50aa8bc` reaches SUCCESS with /api/health green.
- Verify rendered public odds label (desktop/tablet/mobile) reflects `500.com · China Sports Lottery SPF`; only then call public UI fully accepted.
