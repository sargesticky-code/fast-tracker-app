# Fast Tracker overnight recovery — 14–15 October 2026

## Execution contract
Deadline 08:00 HKT 15 October; stop new packages 07:00. BetClan end-to-end first, SportyTrader second, preserve Forebet V2. One worker/release. Original user brief and approved plan govern provenance, release gates and rollback. No spending. Original dirty checkout is untouched.

## Working locations
- Dashboard: `/home/ymf/Documents/ChatGPT/Supabase Dashboard/fast-tracker-overnight`, branch `codex/overnight-advisers-20261014`, base `eec898431adb3a2de10e876cfd2cc6709ac1ca12`.
- Collector: sibling `football-fast-tracker-overnight`, same branch name, cloned main.
- Evidence: sibling `work/overnight-20261014/` (private working evidence, not committed).
- Heartbeat: `fast-tracker-verified-overnight-recovery`, ACTIVE hourly, bounded through 08:00. Other three browser supervision automations PAUSED.

## Baseline 21:15–21:20 HKT
- Railway project `496c4795-e8f6-4f54-9ab0-406981b41669`, service `3621679c-9fbf-4e61-b46f-82d153b4b697` (`fast-tracker-public`), production environment `3fdb9317-58a4-47bb-b09e-e5c219e97105`.
- Latest successful deployment `03b4422f-8e03-4883-8c4f-3942c59f9789`, source branch `release/ft-advisors-fotmob-20261011`, SHA `eec898431adb3a2de10e876cfd2cc6709ac1ca12`.
- Public URL https://fast-tracker-public-production.up.railway.app ; health `/api/health`. No staged Railway changes.
- Rollback: preserve this deployment ID and SHA; use existing rollback mechanism after verifying no concurrent release. No production writes yet.
- Supabase project `hekqxhgjexzxnecwhyao`; connected SQL works. No adviser/BetClan/SportyTrader named tables found. Existing Forebet, model, form and alias tables present.
- GitHub connector works; local `gh` is unauthenticated. Public git fetch works. Use connector for authenticated operations; do not expose credentials.
- Artifact run `38552084178`, artifact `11886489297`, generated `2026-10-14T10:48:09Z`, downloaded and extracted. Contains JSON only, no original HTML.
- 100 BetClan and 56 SportyTrader observations are UNRESOLVED with unverified timezone. BetClan predicted scores include date fragments (`10-15`, `10-14`): parser searches beyond real score market. Must repair before publication.

## Root-cause matrix
|Provider|First demonstrated gap|Next action|
|---|---|---|
|BetClan|Semantic score parsing; no verified canonical links|Inspect 10 bounded source pages; fix parser, extract competition/time evidence, reuse aliases|
|SportyTrader|Unresolved identity; no ingestion demonstrated|Inspect saved observations after BetClan path|
|Forebet|Not yet established live; release already has average-goals/provisional fixes|Trace current live rows, do not repeat fixed projection work|
|Dixon–Coles/Power/Form|Freshness and pipeline not yet queried|Bounded live counts after primary path|

## Pending
Ten targeted BetClan HTML pages were fetched because the artifact lacked HTML. The remaining application release is not yet deployed. Preserve the existing production deployment as rollback target.

## Checkpoint 02:20 HKT, 15 October — awaiting public application release
- Additive migration `external_adviser_observations` applied. Local migration file `supabase/migrations/20261014131904_external_adviser_observations.sql`. Service-only table/RPC/current view; anon read, authenticated write and anon RPC execution all false. Existing data untouched.
- Exact candidate matching requires both literal team names, competition equality/suffix (no fuzzy inference), explicit source offset and kickoff within 60 seconds, unique fresh verified scheduled Flashscore fixture. No existing useful BetClan aliases found for tested teams. Alias expansion deferred; conservative initial coverage intentionally limited.
- Real sampled Paide–Tammeka matches `FS:hUFd2eIq`. Original capture 60/20/20 HDA retained; corrected score 3-1; over2.5=.63; BTTS=.61. Source kickoff 2026-10-14T17:00:00+01:00 equals canonical 16:00Z.
- SQL transaction tests passed then rolled back: matching, idempotence, invalid HDA rejection, reversed teams, unknown timezone, stale capture. Stored observations remain zero until authenticated workflow publication.
- `adviser-source-publish` deployed v1, custom GitHub OIDC main/workflow/repository/event/run validation, anonymous POST returns 401. Rollback: stop publication workflow/revert collector; retain additive data for audit.
- Collector PR https://github.com/sargesticky-code/football-fast-tracker/pull/61 merged as `11b23230ffb405c5044a6db695ff38466c684768`; CI run `38571926391` passed. Workflow run captured and published live data (OIDC authorized).
- Live database contains 100 BetClan and 57 SportyTrader source observations. Six BetClan rows have exact verified canonical IDs, 0 SportyTrader. Six BetClan matches verified in full/compact APIs and match-detail API; all were scheduled Oct 14 16:00–19:00Z, and have since kicked off. Their observations must be treated as stale and not displayed as current at this checkpoint.
- Dashboard API+client integration implemented locally, not deployed. One optional bounded service read enriches fast, fallback and full responses; no new browser requests. External adviser probabilities, score, goals/BTTS and capture time rendered with freshness and duplicate-provider checks. Match details include linked source evidence.
- Build passed (`CF_PAGES=1 npm run build`). New Node validator tests passed 4/4; full Playwright browser suite passed 60/60 across desktop/mobile; `git diff --check` passed. Logs `work/overnight-20261014/{build,browser-tests}.log`.
- Live compact baseline returned fixture-only fallback `canonical-fixtures-flashscore-bet365`, 208 fixtures, zero Forebet. The fast RPC itself returns JSON array when called as postgres; Edge timeout/role issue not yet proven. Do not claim JSON return type is a bug.
- Forebet 57 stored, latest 2026-10-14T06:21:38Z; model/form latest still 5 October.
- Live Supabase Edge deployments: `app-phase1-feed` v102 SHA `bc19f85df89e469aefe14bf2ea4aee6d6db4c34f19e9dd2d0b2704f7754d59a9`; `app-match-detail` v65 SHA `130c0eea6f91151ca950331f3e846c50a4302ace6ea09176c24122e1616f8999`; `adviser-source-publish` v1. Compact response returned 208 fixtures + 6 adviser links; full fallback returned 208 + 6; detail response preserved exact source values and IDs. Evidence JSON is private under `work/overnight-20261014/`.
- Current local app base is production release SHA `eec898431adb3a2de10e876cfd2cc6709ac1ca12`; implementation edits are local only (not committed/pushed). Current deployment and rollback target still `03b4422f-8e03-4883-8c4f-3942c59f9789`.
- Next: publish the tested app changes as one PR to `release/ft-advisers-fotmob-20261011`, check CI, merge under the user’s explicit overnight release authorization, and verify Railway deployment and actual desktop/mobile Dashboard. Then wait for/check one natural scheduled provider capture; re-evaluate current forecast data before claiming the milestone. No pending uncertain writes or deployment operations at this checkpoint.
