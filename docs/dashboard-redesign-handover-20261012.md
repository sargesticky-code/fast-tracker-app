# Dashboard redesign handover — 2026-10-12

## Current batch

- Branch: `codex/forebet-style-fixture-board`
- Base: release branch head `0642c636c429dc8d575afad024125749caf9a57b`
- Scope: simplify the public fixture board to a Forebet-inspired, fixture-first presentation without changing data providers or enrichment logic.
- Changed: competition-grouped fixture rows, compact date tabs, team names/logos, 1/X/2 price cells, concise verified insights only when the complete values exist, and a short stale/unavailable odds label. Search, competition filtering, details links and full detail-page context remain available.
- Removed from the main board: event IDs, collector/snapshot copy, timestamps, source-time caveats, linkage diagnostics and historical-stat explanations.
- Default date selection prefers today in Hong Kong, then the nearest future date, then the first available source date; users can still select another available day or All.
- Updated the existing public-flow assertions to match the new visible UI and date default.

## Review state and next step

- Local verification on the updated release base: `CF_PAGES=1 npm run build` passed all UI, raw-feed, native-model, prospective-freeze, FotMob-refresh, and Next.js production-build checks; `npx playwright test tests/public-flow.spec.js --workers=1 --reporter=line` passed all 11 mocked desktop/mobile flows; `git diff --check` passed.
- Screenshots reviewed: `test-results/today-board-1440.png`, `test-results/today-board-390.png`, `test-results/enriched-board-1440.png`, and `test-results/enriched-board-390.png`. These are deterministic mocked-data previews, not live endpoint verification.
- GitHub connector confirmed PR #2 was merged on 2026-10-03; the durable redesign brief was corrected. The CLI is not authenticated; this follow-up branch has no review PR yet.
- No production, database, or deployment action was taken.
- Next: publish this branch and open a review PR; then use the repository workflow and inspect its artifacts. The repo instructions prohibit merging or deploying without explicit instruction.
