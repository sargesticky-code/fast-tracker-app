# Dashboard handover — 2026-10-17 02:04 HKT

## FT-OVERNIGHT-001 — Forebet delivery gap

- Production branch/head: `release/ft-advisers-fotmob-20261011` / `f6ac341b5e6d85ad7ad7dc9cdef4e360b7aa83a0` (Railway `fast-tracker-public`, SUCCESS; production unchanged).
- Supabase `app-phase1-feed` public compact response: 475 canonical fixtures; 135 strict Forebet H/D/A forecasts.
- Supabase `forebet-provisional-feed`: 81 rows, comprising 67 `ACCEPTED_ONE_VERIFIED_TEAM` and 14 `TENTATIVE_NAME_SIMILARITY`. SQL view counts match the public response: verified side HOME 35, AWAY 32, SIMILARITY 14; all 81 are fresh and upcoming. The frontend parser accepted all 81, with no overlap between the 67 accepted rows and strict forecasts.
- Railway raw snapshot at `2026-10-16T17:47:21.100807Z`: 360 discovered fixtures. Of the 67 accepted IDs, 51 appeared in raw discovery and 16 did not. Of the 14 tentative IDs, 10 appeared and 4 did not. All 81 were in the canonical summary and all kickoff timestamps agreed within 60 seconds.
- Root cause: homepage selected raw fixtures alone whenever the raw snapshot passed its freshness gate; it used exact-ID canonical fixture rows only when raw was stale. This dropped 20 current canonical fixtures while raw remained fresh.
- Repair: `mergeCanonicalFallback` appends only absent, valid `FS:` rows whose source is `FLASHSCORE_CANONICAL`. Raw rows win duplicate IDs; no name join or provider behavior changed. Added a rendered regression for an accepted forecast whose fixture is missing from a fresh raw snapshot.
- Verification: `npm run build` passed. `npx playwright test tests/public-flow.spec.js --workers=1 --reporter=line` passed 63/63 after aligning one stale expected summary label with existing product copy. Tests include desktop and 390px mobile flows; endpoint fixtures are mocked. Live sources were separately read and are not production UI verification.
- PR #134 is open for review; the exact PR commit's two relevant GitHub workflows passed. Production remains unchanged; no migration or Edge deployment.
- Next: FT-OVERNIGHT-002 — verify current one-team accepted identity checks and automatic revocation on contradictory evidence.

## Working tree

Feature branch: `codex/overnight-001-forebet`, based on production release head above. The original workspace's unrelated changes remain untouched.
