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
