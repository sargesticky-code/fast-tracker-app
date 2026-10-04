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
