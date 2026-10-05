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

## Iteration 7 — coherent producer scheduling snapshots

Resumed checkpoint head 0bbb8da on SAME PR43; draft/unmerged, accepted prior source 6de5b267/CI 37273561943. Raw scheduling code counted every retained source row across captures and counted confirmed bench rows toward confirmation. New source `8700a248bd291a9fa1ec14639a49cfa6b041ff21` selects one latest capture per fixture/source, refuses missing/invalid/future capture timing, deduplicates identical source players and fails closed on contradictory identities/roles/sides. Source-complete scheduling requires exactly eleven distinct starters per side; source-confirmed scheduling requires those starters all confirmed. Bench totals cannot confirm predicted starters. Any latest official observation takes scheduling precedence over complete predictions; partial official source evidence remains incomplete and is prioritised for capture. This is source coverage state, not public canonical player confirmation or football strength.

Added lineup-only cached promotion preflight against the source evidence already read by the producer: older captures cannot replace newer known captures of the same fixture/source; equal captures remain idempotent; mixed, missing, invalid or future capture times reject promotion. Added cachedLineupCaptureSkips health count. No additional upstream requests, provider routes, concurrency/request limits, fixture window, schedule or identity mapping changes. This read-snapshot guard is NOT an atomic compare-and-write/lease and does not claim protection against concurrent writes after the read; coach/status cache paths are not changed by this lineup-only gate. Future transactional temporal protection requires separately reviewed DB/provider lease work.

Read-only genuine verification: stored historical FB6045 FOTMOB_PREDICTED has 46 retained rows across three captures and 14 accumulated away starters. Latest capture 2026-10-01 20:22:02.557 UTC has 43 current rows and 11 away starters. Actual new helper returns full=true/confirmed=false and rejects replay of a real older capture. Other stored historical examples FB5799 and FB5813 also have accumulated overfull counts but current 11/11 captures. These are historical stored checks, not current upcoming/live recovery. Current upcoming -2h/+24h census found no mixed capture groups, so no new present-day coverage total is claimed.

New check:lineup-snapshot executes actual helper logic for old-complete/new-partial, official precedence, duplicate/conflicting/missing identities, confirmed bench inflation, invalid/future capture and older/equal/newer/unrelated-cache scenarios. Added to existing CI. All local snapshot/ingestion/public/authority/player/story/real-evidence/market/independence checks, static build, TypeScript syntax parse (not full Deno runtime type-check) and diff whitespace passed. Final CI pending. UI source and accepted rendered evidence unchanged. No DB write, schema/view change, producer trigger, source expansion, function release, merge or deployment.

Next priorities: unclassified standard source lineup types need truthful public/source classification (no speculative official upgrade); temporal coach/status protection and atomic lineup upserts remain distinct work; actual provider/team player mappings and importance baseline still missing. Latest capture per provider can hide older confirmation if a provider emits prediction under the SAME source_name after official status; current source names separate FotMob official/predicted, but audit before changing class selection.

### Iteration 7 final acceptance

Accepted executable `8700a248bd291a9fa1ec14639a49cfa6b041ff21`, CI `37275077600` SUCCESS: new actual snapshot/cache tests, prior parser/partial/counter/authority/public/evidence contracts, build/routes and 41/41 browser regressions (30.5s). Artifact `11329313635`, name `dashboard-redesign-987935cea736e4c252c0f645bc362dd2ea95b02a`, digest `sha256:900fa6b20eaa252cdbd5f8d85bb5eaa1c98219bd7e7b0191804879d1c85265fd`; artifact metadata confirms source head, artifact name is merge-test SHA. UI files remain unchanged from accepted/reviewed 73dc5ee4 desktop/mobile batch. Browser tests are mocked regressions; real historical helper verification is separately documented above.

Fresh read-only deployed function still v7 without latestLineupRows scheduling. PR43 remains draft/unmerged; no DB write, deployment, migration, manual producer invocation, schedule or provider change. Cache protection applies to known lineup captures at read time, not concurrent transactions or coach/status writes. Current upcoming mixed-snapshot census is zero; do not claim a new live/upcoming coverage recovery or production fix.

Resume same branch/PR. Next bounded human-layer gap is truthful handling of standard/unclassified source lineup types, followed by sourced player/team mapping coverage; temporal DB protection needs a separately reviewed path. Source XI scheduler flags must never be repurposed as public canonical confirmation or strength percentages.


### Iteration 8 — honest source classification

Source 45535f3b7158534c794d8c3ca977d3aead329adb distinguishes explicit predicted, previous-XI and unclassified kinds in parser raw classification. Unknown types (including standard) retain complete genuine rosters, confirmed=false and confidence=null. Existing FOTMOB_PREDICTED storage key is deliberately preserved for upsert/view compatibility; it is not evidence that the unknown roster is a prediction. Fresh ingestion health now separates referenceMatches and unclassifiedMatches from predictedMatches. Official precedence, partial official identity guards, timestamps and snapshot safeguards remain unchanged.

Read-only stored FB6279 / external 6369013, capture 2026-10-05 06:27:07.768 UTC, standard type: actual parser retains 48 rows / 22 starters, all UNCONFIRMED with null confidence and original capture. No official upgrade inferred from the upstream integration name. Local actual-parser, snapshot, public and authority contracts and static build passed. CI pending. No UI edits in this batch; public helper still defaults unknown kinds to prediction wording, an explicit remaining gap to fix next with desktop/mobile rendered evidence. This is producer preparation, not an end-to-end public classification repair. No deployed change, DB write, migration, manual producer run, schedule change or source expansion.


### Iteration 9 — public unclassified source XI semantics

Producer source 45535f3b passed CI 37276786198: all contracts/build/routes and 41/41 mocked browser regressions (36.6s); artifact 11330079222, digest sha256:906b345a43855e5326715ace021b7a9c0a1611e6f1563979720fc97d29b73b3e.

Public source 10697ea3e6f8b5449c0fb5f41245b35ccd3323d7 uses shared UNVERIFIED classification for explicit unknown raw types or UNCONFIRMED raw classification. Team News, article safety strip, tool badge/notice, coverage and confidence captions say source-reported XI / confirmation unavailable. Legacy .82 confidence is suppressed for unknown-type display rows. Mixed unknown evidence uses neutral source language; official rows never enter provisional classification. Historical reference and explicit prediction handling remain intact, including legacy rows with no type metadata. This compatibility path is not an inference that a new missing-type capture is predicted: the updated parser explicitly marks those UNCONFIRMED.

Actual stored FB6279 capture passed through the real parser and shared public summary returns UNVERIFIED / UNCONFIRMED SOURCE XI with 48 rows retained. That is a stored payload/helper verification, not a deployed API or real public fixture rendering. Local public/authority/story/real-evidence contracts, build and whitespace checks pass. Added 1280px/390px mocked browser cases; CI 37278228130 pending, screenshots not yet reviewed. Deployed producer fresh read remains v7 without classification fix. No deployment/merge/DB change.


### Iteration 9 final acceptance

Accepted executable 10697ea3e6f8b5449c0fb5f41245b35ccd3323d7, CI 37278228130 SUCCESS: all contracts/build/routes and 43/43 mocked browser cases (40.0s). Artifact 11330764804, dashboard-redesign-156c591f91d3438b19d03258bfd3b42d0bb2aee0, digest sha256:54b0225a6c7f3d25815c5969751eb46180a00e17cdf9fdab32621225355d4200; source head verified in artifact metadata. Reviewed both new unverified 1280px/390px full-page screenshots: article/Team News neutral labels, UNCONFIRMED SOURCE XI badge, null confidence, honest 10/11 versus 11/11 coverage, unknown strength and readable wrapping. Names are deterministic synthetic tests, not actual confirmed players. No production deployment or public real-data rendered claim.

Resume same branch/PR. Source roster classification gap is now addressed in review code (producer and public UI); production remains older. Next highest-value Phase 2 dependency is genuine canonical player/team mapping coverage, using sourced IDs and existing registry constraints, never name-only speculative linkage. Importance/baseline still unavailable; keep strength percentage unknown. Atomic temporal protection and coach/status timing remain separate work.


### Iteration 10 — canonical identity parity and stability

Inspected persisted head ed934b2 / accepted executable 10697ea3 before continuing. Actual registry census still 3342 rows, 2513 missing team keys, source_ids only api_football, zero unnamespaced numeric registry keys and zero direct FotMob lineup matches. Genuine FotMob reconciliation remains blocked by sourced external-ID/team mapping; no name matching or registry writes performed.

Found independent consumption bugs: analysis computed but omitted canonical_player_identity and called playerClaimFingerprint without its canonical argument; detail/analysis also formed identity from normalized team+name, which is not unique or stable. Source 57387569700d4c6fbbfcad0da9fdc825e9ecd0b3 uses phase2_players:<exact matched registry key> in both APIs, emits canonical identity in analysis and passes it into claim grouping. Exact registry lookup and source-confirmation gates are unchanged. No cross-provider mapping, player fabrication or identity upgrade for unresolved FotMob keys. Treat both API releases as a coherent identity-contract batch; old/new cached responses can have different record-group encodings, so do not combine them as independent observations.

New tests execute both actual TypeScript annotation functions, not a mirrored implementation: detail/analysis parity, same-name distinct players, stable transfer/name identity, duplicate provider spelling collapse, unresolved source-only rows, predictions remaining unconfirmed, and actual analysis output meeting canonical XI helper requirements. Local contracts/build/whitespace checks pass. CI 37280350489 pending. UI files unchanged from reviewed source 10697ea3.

Read-only stored reality: Juninho APIF:9842 (Goias), APIF:196966 (Londrina), APIF:197038 (Novorizontino), all team_key=null, formerly shared :juninho identity. Actual stored lineup rows 2718/1586/1477 now produce three separate registry identities. Historical FB5843 API_FOOTBALL has 22 stored canonical starters; actual new analysis annotator + confirmation helper returns true, whereas omitting identity returns false. This is historical raw-data/helper verification, not authoritative current display eligibility, current lineup coverage or a public endpoint assertion. No old historical fixture is reintroduced into the upcoming display. Fresh deployed reads: detail v22 and analysis v38 without stable identity fix. No DB write, migration, producer invocation, merge, deployment, provider or schedule change.

Next: preserve missing mapping/importance dependencies; investigate sourced identity metadata available in existing stored provider captures rather than assigning identities by player names.


### Iteration 10 final acceptance

Accepted executable 57387569700d4c6fbbfcad0da9fdc825e9ecd0b3, CI 37280350489 SUCCESS: actual API annotation/identity tests, all existing contracts, build/routes and 43/43 mocked browser regressions (40.0s). Artifact 11332136600, dashboard-redesign-7a53803300e774e17c52658487100a51509d85b4, digest sha256:532d6c27f636acabf604a2c397ffaf4e6e5e6f6af9a281aff3fe198a9993f960, source head verified in metadata. No UI source changed; visual acceptance remains reviewed 10697ea3. Full API TypeScript syntax parsed locally, not a Deno deployment typecheck. Both APIs remain undeployed (detail v22 / analysis v38).

Current registry and historical stored verification are separate from mocked regression CI. This fixes a review-code identity omission/collision, not external mapping coverage or current confirmed-XI coverage. Continue from this branch/PR; do not retry settled name-matching approaches or invent importance percentages.


### Iteration 11 — refresh sourced player-status observations

Resumed persisted e1b5f43 / accepted source 5738756. No new sourced registry bridge is available; existing identity/importance blockers remain. Inspected cached/fresh availability ingestion and found both paths only insert missing player/status keys, silently ignoring later captures and any future changed return text. Fresh path also treated a failed read as an empty result.

Source aa45d2dde6283fbee0836d405cf0d7ef7b138ca8 adds shared explicit-report refresh planning and an actual producer writer used by cached/fresh availability paths. Match/source/player/status/side must agree; side conflicts, duplicate/ambiguous existing rows, conflicting incoming reports, unknown/future timing and equal/older captures fail closed. Updates retain durable row ID, creation date and original valid_from/valid_until; captured fields/raw/source capture refresh from the actual newer report. Missing players are not marked recovered, deleted or zeroed. Provider source_updated_at remains unknown. Insert/update/skip health counters are distinct. Coach and lineup paths remain unchanged.

Conditional update filters include exact row/event/side/player/source/status and previously read fetched_at, then select affected id. This prevents overwrite if another writer changes capture before the update. It does not prevent concurrent first inserts without a uniqueness constraint and does not provide a general fixture/provider transaction or lease. No migration added/applied. Failed reads/writes throw rather than manufacture coverage or success.

Read-only candidate census: 31 newer cached reports across 10 upcoming fixtures (-2h/+24h), zero changed normalized return values. These are freshness candidates, not newly discovered absences or proven all-parser-eligible promotions. Stored FB6316 capture 2026-10-05 07:52:04.134 UTC passes actual parser with matched source event/team IDs: Noah Mbamba id836 and Stanis Idumbo id837 plan newer-capture updates from 05:52:03.141, no inserts, both original validity dates preserved. Same return text remains unchanged. Dry-run/helper results only; database untouched.

New check:player-status-refresh executes actual pure helper and actual producer writer with deterministic DB doubles: same-text/new-text revisions, durable identity/dates, exact fixture/source/side, invalid/equal/older/future capture rejection, ambiguous/duplicate claims, missing-not-recovery, failed-read rejection, insert path and concurrent newer-write preservation. Added to existing CI. Local parser/snapshot/player/public/authority/evidence checks, static build, TypeScript syntax parse and whitespace pass. CI 37282613316 pending. UI files unchanged. Deployed producer fresh read remains v7 without refresh writer. No source scope, schedule, credentials, registry write, DB write, producer run, migration, merge or deployment.

Next: independent coach temporal protection, duplicate first-insert protection and injury expiry/recovery need separately evidenced designs; sourced canonical mappings and importance baseline remain unknown. Do not infer recovery from omitted upstream players.


### Iteration 11 final acceptance

Accepted executable aa45d2dde6283fbee0836d405cf0d7ef7b138ca8, CI 37282613316 SUCCESS: new actual status planner/writer tests, all existing contracts, static build/routes and 43/43 mocked browser regressions (39.6s). Artifact 11332444912, dashboard-redesign-77d55ee7aa2873ab030c64dce9ce6ffc20fde9ac, digest sha256:33b68944829d9494510965a9c6793a3ae9a224472e0f232a782c7da595ea287e; source head verified in metadata. UI unchanged from visually reviewed 10697ea3. Stored FB6316 verification is a separate read-only dry run, not a deployed refresh or public endpoint coverage claim. Producer remains undeployed v7.

Continue same branch/PR. Preserve exact ID/provenance and newer-only status semantics; concurrent first inserts remain unprotected, coach timing is unchanged, and missing players cannot be inferred recovered. Source canonical mapping/importance still blocked. No database, migration, schedule, deployment or provider expansion occurred.
