# Fast Tracker

A read-only, English football dashboard that combines the Flashscore fixture snapshot with exact-ID canonical match evidence already stored by the existing services. It may display provider forecasts and historical result summaries when their source records pass validation; it does not turn historical results into current odds or forecasts.

## Data flow

- Public dashboard: Railway — <https://fast-tracker-public-production.up.railway.app/>
- Snapshot collector: Railway — <https://fast-tracker-dashboard-production.up.railway.app/>
- The browser reads the raw fixture snapshot and a compact canonical evidence response. Exact fixture IDs are required for joins; missing enrichment does not remove a fixture.
- The dashboard preserves source values and provenance. It does not synthesize missing kickoff times, prices, scores, statistics, lineups, or predictions.
- Match details retain the source payload and expose available odds, forecasts, historical observations, lineup evidence, and player statistics.
- `/health` and `/system` show snapshot availability and source timing.
- Supabase provides canonical fixture identity and existing stored match evidence, odds, and forecasts through read-only public endpoints. It does not authorize new data collection by itself.

## Local development

```sh
npm ci
npm run dev
```

Build and static acceptance checks:

```sh
npm run build
npx playwright test tests/public-flow.spec.js --workers=1
python3 -m unittest discover -s services/flashscore-odds-collector/tests -v
```

## Collector safeguards

The collector limits concurrent odds requests to two, enforces a wall-clock deadline for an odds batch and a watchdog for browser subprocesses, and omits non-data browser assets. Its Docker image explicitly includes the worker and browser-resource modules. The public snapshot endpoint is read-only.

## Team logo matching

Team names are normalized and resolved from the public Supabase `football-logos` index. The persistent source-name-to-logo mapping is version-controlled in `data/team-logo-aliases.json` and bundled with the dashboard; a reviewed alias is added once and then applies to every later refresh. League-scoped aliases handle names shared by clubs in different countries. The sprite keeps each badge in a 22 px tile to limit storage and page transfer size. Additional assets and their source/license notes are recorded in `data/team-logo-supplements.json` and the bucket notice. Rebuild the current supplemental atlas from the checked-in 22 px tiles with `python3 scripts/build-supplemental-team-logo-atlas.py`.

Run `node scripts/audit-team-logo-coverage.mjs` to compare the full current `discovered` feed (not the smaller filtered `fixtures` list) with the Supabase sprite index and the bundled alias registry. It reports new, ambiguous, or currently unavailable badges and invalid alias, contextual-alias, or source-disambiguation targets before a release. Add each verified source name once to the registry, include league context for ambiguous names, and deploy the dashboard; no index upload or sprite rebuild is required for a name alias. Do not map ambiguous names to a badge unless the source feed context identifies the club; leave them unmatched until an explicit unique mapping or badge is available. The `v20261012b` atlas adds 10 current-feed badges; names without a verified reusable source remain explicitly unmatched rather than receiving a guessed or unrelated mark.

## Current scope

The public experience is source-backed and read-only. Missing values remain unavailable. Clearly separate actual results, provider forecasts, historical frequencies, and internal model output. Historical database migrations remain tracked as schema history; provider-specific production objects and retired collection jobs were removed by the 2026-10-11 cleanup migrations. HKJC remains retired. Do not add providers, speculative models, expanded scraping, or paid services.
