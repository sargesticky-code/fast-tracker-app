# Phase 2 continuation checkpoint

Baseline: main `60dcd75231c5620491dce4a1879ba3de00f3661b`. Working branch: `fix/phase2-authoritative-lineup-display`.

## Verified current implementation

Repository, AGENTS, redesign brief/checklist, latest handover, player identity audit and Supabase views inspected. Railway public root returned HTTP 200. Deployed app-match-detail is active version 22; this batch has not released functions or changed production.

Both detail and analysis read raw `phase2_match_lineup_evidence`, bypassing selected source/snapshot and status conflict exclusions. Public detail feeds lineup tooling and story detail; analysis supplies article confirmation facts. The selected display census was 706 predicted rows, 704 eligible and 2 conflicting rows excluded. FB6292 H Kostas Pileas and FB6301 A Edgar Sevikyan were the real conflict cases. No current confirmed selected snapshot was present in that census.

## Implemented review changes

- Both APIs read `phase2_lineup_display_current` and only expose explicitly eligible rows from the exact requested fixture and a valid side. No raw-history fallback on empty/error. Underlying `phase2_match_lineup_evidence:<id>` provenance is preserved.
- Shared helper requires exactly eleven distinct canonical source-confirmed starters per side. Missing/unresolved identities, partial/overfull/duplicate XIs and predictions cannot confirm 11v11. Event-map timestamps alone cannot confirm an XI; a complete official snapshot does not require an API-Football timestamp.
- Detail publishes lineupAuthority status/confirmation. Team News and the article safety strip consume it; partial official rows get an explicit incomplete-XI label.
- Added executable helper tests and desktop/mobile partial-XI browser regression cases; CI runs the authority check.

## Database authority defect and review SQL

The existing canonical view ranks complete 11v11 before confirmed observations. `docs/phase2-lineup-authority-review.sql` adds confirmed-observation precedence ahead of completeness, preserving existing columns, provider order, snapshot rules and fixture window. NOT APPLIED, not a migration. Supabase CLI is unavailable locally; generate a proper migration with CLI during approved release preparation and review view privileges rather than inventing a migration filename.

Read-only PostgreSQL tests: proposed full SELECT executed against actual current data (706 predicted selected rows); synthetic VALUES regression selected OFFICIAL_PARTIAL over a newer complete prediction. Synthetic inputs are test data only, never stored football evidence.

## Validation and release boundary

All existing UI/story/market/real-evidence/independence/player-identity checks passed. New authority helper test passed. Static production build passed. Local rendered tests could not launch because Chromium is absent and CDN browser downloads returned invalid/truncated ZIPs. Browser verification and screenshot review remain pending in PR CI; do not claim local rendering passed.

No DB writes, migrations, Edge deployment, Railway deployment, producer modification, schedule change, generated feed publication or merge.

## Next independent Phase 2 gaps

- Canonical view has a rolling upcoming window (-2h/+48h); later live and historical detail may legitimately return NO_CURRENT_LINEUP. Preserve unknown state; investigate a current/history authority service before adding raw fallback.
- Latest-fetch selection is still per provider, not per authority class: audit whether a provider can emit predictions after confirmation before changing its snapshot logic.
- Canonical player reconciliation remains the ingestion dependency. Do not manufacture player registry mappings from names.
- LineupPanel still suppresses identity-annotated predicted rows. Actual strength view uses HOME/AWAY (matching this UI), V1_COMPLETENESS_INDEX, and a starter-count formula with raw unavailable-record penalties. Census: 10 known completeness percentages and 14 unknown sides. All 704 eligible predicted rows had zero canonical registry matches. Audit importance, identity, status deduplication and freshness before presenting football strength; never convert null strength to zero or equate XI completeness to team strength.
- This batch does not repair provider coverage or invent missing players. Confirmed-first SQL must be released before claiming end-to-end authority precedence in production.

## Exact rendered acceptance

Draft PR #43: https://github.com/sargesticky-code/fast-tracker-app/pull/43. Executable source head `650174c8ce096cce6fd3192618c793d4f0d8d4d1`. CI run `37244467973` completed SUCCESS: contracts, authority helper/article function tests, static build/routes and 35/35 Playwright cases (33.0s).

Artifact `11318532786`, `dashboard-redesign-7cae6debddef79c1d602dd73a6b460ae59338adc`, digest `sha256:5af151d03389d35f6748418cf63110045b4a56ac1d2dd2fe9c40788683749f3a`. The artifact name is the GitHub merge-test SHA; metadata confirms source head above. Both new desktop 1280px and mobile 390px partial-XI screenshots were downloaded and visually reviewed. Article and Team News show the same incomplete-XI warning, with no visible clipping/overlap. This is mocked rendered acceptance, not production or real-provider confirmation.

Resume this SAME phase from this branch/PR. Do not recreate the investigation or release automatically. Confirmed-first SQL remains unapplied. The next unblocked review improvement is honest lineup-strength semantics: the current percentage is a completeness index with no importance weighting, while canonical player identity coverage remains unresolved.

## Iteration 2 — authoritative prediction coverage and strength semantics

Resumed from PR43 head `33803c431b6a4d6904a2374a04b8a2b6c1d9d741`; main remained `60dcd75231c5620491dce4a1879ba3de00f3661b`. PR43 remained open/draft/unmerged. Deployed app-match-detail still active v22 and still reading raw evidence. Earlier source, view-ranking and CI investigations were not restarted.

Implemented public lineup consumption:
- Current authoritative display predictions are shown with explicit predicted/unresolved-identity warnings; no player identity is invented or upgraded.
- Prediction admission requires matching canonical fixture and requested id, explicit display authority, AVAILABLE status, rawFallback=false, eligible row, provider player key and name. Legacy raw prediction history stays hidden. Source-confirmed rows on a side suppress that side's predictions, including unresolved official evidence. Identical duplicates collapse; contradictory duplicates fail closed.
- XI counts are reported coverage, never player-strength percentages. Incomplete or missing starters remain 10/11 or unknown; no placeholder player fills the eleven.
- Lineup strength stays unavailable because the endpoint has no validated player-importance/full-strength baseline. The old V1_COMPLETENESS_INDEX (starter count minus raw absence-record penalties) is no longer displayed as football strength. Database producer/schema and legacy response fields remain intact.
- Null/empty confidence stays unknown. Provider observation and capture timestamps are shown separately; capture time cannot masquerade as a provider update. A failed refresh with retained lineup evidence exposes unknown freshness.

Current real-data check: FB6292 Cyprus vs Latvia. Applying the actual public selector to a read-only snapshot of the stored authoritative view yielded 10 reported home starters and 11 away starters, plus provider bench rows; all 45 admitted player rows had unresolved canonical identities. Kostas Pileas remained excluded. Source FOTMOB_PREDICTED; lineup confirmed=false; football strength=null. No registry rows or football data were written. The same conflict census also still excluded Edgar Sevikyan for FB6301 A.

Strength census stayed 24 sides: 10 numeric V1 completeness scores, 14 unknown scores; there is no new weighted-strength source in this batch. Public percentage readiness requires a sourced player importance measure, documented team baseline, reconciled identities, deduplicated/current availability and retained source/snapshot provenance. Until that producer is implemented and verified, missing strength stays unavailable.

Local checks: public-display helper tests (including official precedence, wrong fixture, raw history, conflicting duplicates and null strength/confidence), prior authority/article tests and all existing safety/story/market/identity checks passed. Static build passed. New rendered cases cover authoritative prediction names and excluded players at 1280/390px, unknown strength despite legacy 100/null scores, raw-history suppression and cached refresh-failure freshness. Rendered acceptance is pending CI, using the existing path because local Chromium remains unavailable.

No schema change, DB write, ingestion/provider expansion, schedule change, Edge release, production deployment or merge. Continue the same PR; existing confirmed-first SQL still needs separate release preparation.

## Iteration 3 — resume and finish rendered prediction correction

Resumed on 2026-10-05 12:18 Hong Kong from persisted PR43 source `bde3eb7`; local unpushed corrections survived workspace maintenance. First expanded CI run `37245626383` passed 39/39, but its screenshots exposed mobile player-name clipping and Team News saying Not matched despite an eligible current prediction. Those images were not accepted as the final batch.

Corrective source `3872cdb2d3da0ce2e7d8e62d25d9c025a568e835` makes the mobile player list one column with wrapping names, keeps compact XI counts readable, labels each side's prediction independently, and uses the exact same authoritative prediction selector in Team News. Team News now says Predicted XI · awaiting confirmation with reported side counts and fixture mapping evidence. Missing referee provenance no longer fabricates an API_FOOTBALL source. Confidence rejects booleans/objects/arrays as numeric values. Regression assertions cover Team News agreement and mobile name wrapping.

Fresh read-only database check at 2026-10-05 04:20:32 UTC: 615 selected current display rows, 613 eligible, zero source-confirmed rows and zero eligible canonical registry matches; latest capture 03:52:04 UTC. This rolling-window census supersedes earlier 706/704 counts, not the earlier capture's historical evidence. Latest FB6292 remains home 10 / away 11 eligible starters; FB6301 remains home 11 / away 10, each with one excluded row. No blank was filled with an invented player or identity.

Local authority/public/player/real-evidence/story/market/independence checks, diff whitespace check and static build passed. Corrective CI run `37263049954` pending browser completion and screenshot review. No DB write, view release, ingestion/provider/schedule change, deployment or merge. Continue from this exact source and CI, not from the older pending iteration-2 note.

### Iteration 3 final acceptance

Executable head `3872cdb2d3da0ce2e7d8e62d25d9c025a568e835`, CI `37263049954` SUCCESS; 39/39 Playwright cases in 36.4s plus all contracts, static build and route checks. Artifact `11325129181`, `dashboard-redesign-dd96df73dcb84fff22105ee49138c6a4d38b0645`, digest `sha256:974188bc46dd2443b42c646072b3d73eb5353ef32f2d69a280029837d5c3e00f`. Source SHA is confirmed by artifact metadata; artifact name is the merge-test SHA. Downloaded 1280px/390px prediction screenshots visually reviewed: mobile player names readable, XI counts fit, Team News and tool agree on prediction, identity warning and unknown strength/confidence remain visible. Mocked rendered acceptance only.

Fresh FB6292 stored rows also passed this exact public selector: 45 admitted player/bench rows, 10 home / 11 away reported starters, prediction=true, canonical identity unresolved, complete confirmation=false, strength=null; Kostas Pileas absent. Test input authority/fixture wrapper and UNCONFIRMED/UNRESOLVED annotations were constructed only for selector verification from the zero-confirmed/zero-registry census, not fetched from a deployed revised endpoint or written to football tables.

Read-only deployed function inspection still finds app-match-detail v22, raw phase2_match_lineup_evidence and no current-display read. PR43 remains draft/unmerged. Confirmed-first SQL and reviewed detail/analysis Edge changes must be released together through a separately authorised release. No production success is claimed.

Next coherent Phase 2 work: investigate canonical player reconciliation using durable provider/team identities and existing producers; do not equate provider player keys with canonical registry identities. Football strength requires actual importance data and a verified team baseline. Also audit per-provider latest-snapshot selection for predictions arriving after confirmation, preserving the current rolling-window safeguards. Resume this SAME branch/PR from accepted executable head; subsequent checkpoint-only commits do not change the tested source.

## Iteration 4 — prevent cache freshness inflation

Resumed PR43 checkpoint-only head fe7aa49; PR open/draft/unmerged. Accepted rendered UI source remains 3872cdb2 with CI 37263049954 and 39/39 cases. No previous investigation was restarted.

Found and repaired the existing FotMob parser in review source: cached detail promotion used a new Date on every parse and wrote that capture into source_updated_at. Cached lineups/manager/absence rows now preserve the original detail_fetched_at. Fresh fetch parsing and shadow storage share one actual capture timestamp. Missing provider observation timestamps remain null. Invalid capture input fails closed. Original cached absence valid_from no longer moves forward solely because the parser is run again.

Authority parser now requires an exact explicit confirmed/official/actual lineupType (case/outer whitespace normalised); substring matches no longer turn unconfirmed or not official into confirmation. Provider routes, budgets, identity matching, storage contracts, source names, schedules and XI completeness gates are preserved. No provider expansion or production repair is claimed.

Source a312d404238df0cc567d24f4413dde1c3a424e43. New check:lineup-ingestion executes the actual parser without Deno.serve/credentials. It verifies repeated parsing preserves all timestamps, absence validity and unknown observation time; invalid captures reject; negative/unknown/history classification never confirms. Included in existing PR CI. Local checks/build and diff whitespace passed. CI 37264706113 pending.

Read-only real cached FB6292, external event 5181927, capture 2026-10-05 04:22:04.113 UTC, lineupType lastStarting11: revised parser returns 46 raw player/bench rows (22 starters), 2 coaches and 1 absence, all at original capture, provider update null, confirmed false. Repeated parsing yields identical output. This raw parser result does not bypass display eligibility: previously verified authoritative display removes Kostas Pileas, producing 45 admitted rows and 10/11 home starters. No data was written.

Deployed phase2-fotmob-lineups is still v7 with original fabricated source timestamp / cache recapture / substring logic; app-match-detail remains v22. Changes remain review only. Existing confirmed-first view SQL is still unapplied.

Additional genuine gap discovered: lastStarting11 / lastStartingLineups is a previous match XI reference (stored lastMatch ids 5181925/5181926), currently broadly labelled predicted. Next public improvement should explicitly distinguish previous XI reference from a match-specific prediction using retained raw.lineupType; preserve names as sourced reference and official-first authority. Canonical identity remains unresolved; do not manufacture registry mappings or strength scores from these rows.

### Iteration 4 CI acceptance

Source a312d404238df0cc567d24f4413dde1c3a424e43 passed CI 37264706113: new actual-parser capture tests, all existing contracts, static build/routes and 39/39 browser regressions (31.3s). Artifact 11325379327, digest sha256:dc95412f8579ea58ac31eed79177d02de4fe925ecc377bc96c6a631d7aa7550a. No UI source changed in that parser batch; latest revised UI undergoes its own rendered acceptance below. Additional read-only registry census: 3342 players, zero FOTMOB/fotmob source_ids links, 2513 missing team keys. Canonical reconciliation remains blocked by genuine provider/team mapping coverage; no name-only mappings were written.

## Iteration 5 — previous XI references versus predictions

Continuation arrived during acceptance; continued same phase and same PR. Added shared previous-XI recognition from retained raw.lineupType (laststarting11/laststartinglineups) while preserving confirmed official priority and all fixture/display eligibility. Team News, article, full-tool badge/notice, per-side coverage and Sources tab now call historical XIs previous XI references; mixed references/predictions are labelled mixed evidence. Source-reported names remain useful context, not manufactured match-specific predictions or official facts. Strength stays unavailable. Confirmed rows cannot become historical solely because raw metadata says laststarting11.

Fresh current display read: 616 previous-XI raw rows / 614 eligible and 132 true predicted rows / 132 eligible; newest captures 2026-10-05 05:52 UTC. Historical source labels therefore repair an actual majority of this provider's current coverage. Actual stored FB6292 snapshot selector returns 45 admitted rows and REFERENCE label. Previous snapshot date remains explicit; it is not asserted to be the latest production endpoint.

Review executable source c5ad30e6062f1aa0f7e460d7d31a8d25b3378b5e. New deterministic desktop/mobile cases check previous-XI agreement in Team News/article/tool, names retained, strength/reference labels and screenshots. Local shared authority/public/ingestion/story/player/real-evidence/market/independence checks pass; static build passed before final notice/source-tab consistency adjustment. Final CI and screenshot review pending. No DB write, merge, producer/Edge deployment or schedule/provider changes. Deployed producer remains v7 and detail v22.

Intermediate source c5ad30e6 passed CI 37271392214 with 41/41 browser cases (37.7s). Artifact 11328622273 desktop/mobile reference screenshots were downloaded and reviewed. Reference names/warnings/counts and Team News agree; one confidence caption still said prediction evidence. Corrected to previous XI evidence (mixed XI evidence for mixed rows) and added explicit rendered assertions. Final executable source 73dc5ee4ff1a0a9c2432b517dcdddb5436be095e is awaiting renewed CI acceptance; do not treat intermediate screenshots as final acceptance.

### Iteration 5 final acceptance

Accepted executable source `73dc5ee4ff1a0a9c2432b517dcdddb5436be095e`, CI `37271713716` SUCCESS, all contracts including actual ingestion parser and reference/official safeguards, static build/routes, 41/41 Playwright (37.8s). Artifact `11328895365`, name `dashboard-redesign-366a85c552d5605d6e29a78154f8a79c3f06e186`, digest `sha256:782c1fa4d25a6cd9ce4ed02acbf861acb79f57290b1531568e7ac8b5c3793fa3`; metadata confirms source SHA, artifact name is merge-test SHA. Downloaded 1280/390px previous-XI screenshots reviewed. Main reference warnings, player names, counts and unavailable strength remain readable; confidence caption correctly says previous XI evidence (compact mobile caption can truncate, without losing the main reference notice). Team News, article safety-strip assertions and tool agree. Mocked rendered acceptance only; real stored checks are separately documented above.

PR43 still draft/unmerged; main remains 60dcd75231c5620491dce4a1879ba3de00f3661b. Fresh read-only app-match-detail inspection still finds v22 with no authoritative display read. No DB write, function/view release, migration, provider expansion, schedule change, generated publication, production deploy or merge. Source fixes include original cache capture and exact official parser classification plus previous-XI copy. Production remains unchanged.

Resume from this SAME PR/branch. Canonical registry mapping and an importance/full-strength baseline remain upstream dependencies; current registry has no explicit FotMob source-ID links from the bounded census. Next bounded producer coverage issue: parseLineup still drops rows unless both sides have exactly eleven starters, and cached/direct promotion gates do the same. Investigate preserving genuine partial official XIs without admitting malformed fixtures or blending predictions; snapshot membership and provider-class selection require strict evidence. Do not alter source/network budgets or deployment automatically. Previous-XI lastMatch IDs/dates may be surfaced as context only after retained provenance and fixture isolation are verified; do not reattach that past match's XI as current confirmed lineup.

## Iteration 6 — retain genuine partial official XI evidence

Resumed checkpoint-only head 40608bc; PR43 still draft/unmerged and tested UI source 73dc5ee4 remains accepted (CI 37271713716, 41/41). Changed only the existing FotMob producer and its executable parser regression suite. Source dd0b4a529aab9545b09068b4d468c569d6394494.

Parser now retains partial official rows only for exact explicit confirmed/official/actual types, at least one valid starter, exact lineup matchId, both independently supplied mapped team IDs, distinct nonblank player keys and at most eleven starters per side. Provided lineup/general event IDs and mapped sides must agree before any lineup/coach/availability evidence is emitted. Reversed sides or wrong event reject all evidence. Full XIs also require distinct player keys; duplicate/overfull rosters cannot fabricate completeness. Cached and fresh promotion accept parser-approved rows without requiring 22 starters. No predictions fill missing official names; partialOfficial=true remains complete=false. Original capture/unknown provider timestamp safeguards preserved.

Deterministic actual-parser tests preserve a five-player official sample (including sourced bench context) as partial, reject missing mapped sides, wrong source event, side reversal, partial predicted exception, duplicates and overfull XI. Synthetic examples are tests only, never stored football observations. Existing complete predicted/previous-XI fixtures remain supported.

Real verification: latest stored FB6292 Cyprus–Latvia cache at 2026-10-05 06:22:05.694 UTC passes event/mapped-side guards and returns the same 46 raw source rows, laststarting11, complete=true for reference coverage, partialOfficial=false, confirmed=false and provider update=null. Existing display conflict exclusion still belongs to the authoritative display view; raw parser output does not reinstate excluded players in the public selector.

Current 12h matched FotMob cache census: 14 lastStarting11, 6 predicted, 3 standard and 1 without lineup type. No explicit official partial cached sample is present, so real recovered partial-official coverage is NOT claimed. Standard is not automatically upgraded to official: semantics need independent source validation; some standard payloads contain no starters. Next honest source-classification gap is distinguishing unclassified standard evidence from predictions without inferring confirmation.

Local ingestion/public/authority/player/story/real-evidence/market/independence checks and static build passed. No UI source changed in this batch; PR browser regression CI pending. No DB write, view/schema change, producer trigger, schedule/provider expansion, deployment or merge. Deployed producer remains outside this review source. Partial capture keeps existing fixture mapping and storage contracts; reviewed confirmed-first view remains unapplied.

Next producer state gap: scheduler lineupState counts raw rows across captures instead of the latest coherent source snapshot. Audit before changing prioritisation so old complete rows cannot suppress capture of current partial XI. Also audit cache promotion against newer stored evidence before adding temporal conflict handling; avoid synthetic timestamps or source-class blends.

Partial-policy hardening source `2f2a6c4e12466c43b419e6803a7541dc33d1cea6` additionally rejects blank/null/boolean/nonfinite/array/object mapped side IDs. Actual-parser regressions pass, full producer TypeScript syntax is parsed without executing runtime, and read-only deployed function verification still finds v7 with no partialOfficial admission. Final CI `37273263175` is pending. Current source supersedes the initial dd0b4a52 version of this batch.

Intermediate source 2f2a6c4 passed CI 37273263175 with 41/41 Playwright (36.6s), all parser/public/evidence checks and build/routes; artifact 11329711169. Source review then preserved monitoring semantics: partial official captures have partialOfficialMatches / cachedPartialOfficialMatches counters and do not inflate the existing complete confirmedMatches counter. Executable tests run the actual producer counter branch for partial official, complete official and complete predicted parser outputs. Final source `6de5b2679a680c81cccf513b79fd463e8a3d1ba7`, CI `37273561943` pending.

### Iteration 6 final acceptance

Accepted executable `6de5b2679a680c81cccf513b79fd463e8a3d1ba7`, CI `37273561943` SUCCESS: actual-parser partial/identity/roster/capture/counter tests, all existing contracts, static build/routes and 41/41 Playwright in 38.1s. Artifact `11329253063`, name `dashboard-redesign-fccd4bcd0a21a81fba3bbff1bac26eb1515e4e14`, digest `sha256:90b7330d93ec6c6b2818d4ad743cb88c914ee70b56fb5ef336dfbc6fb222a167`, metadata confirms source SHA. This is a producer/test-only batch; accepted UI files and prior reviewed desktop/mobile screenshots are unchanged. Browser CI is regression verification, not a deployed producer/real partial-XI test; no new screenshot visual-acceptance claim.

PR43 remains draft/unmerged, producer v7 remains deployed without this policy, confirmed-first view SQL remains unapplied. No DB write, Edge deploy, merge, schedule change or provider expansion. Fresh stored FB6292 cache preserves its existing names and original acquisition timestamp through new event/side checks; explicit partial official samples remain absent in the current matched cache. No actual recovery count is invented.

Next priorities remain: coherent latest-snapshot scheduling state; prevention of older cache overwriting newer source evidence; truthful classification of standard/unknown source lineup types; genuine player-provider/team mappings and importance baseline. Resume this exact same branch/PR; do not rerun settled previous-XI/mobile or freshness investigations.
