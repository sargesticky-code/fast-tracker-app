# Fast Tracker

A read-only football dashboard that displays the Flashscore collector's raw fixture and odds snapshot. It does not calculate picks, probabilities, goals or corner forecasts.

## Data flow

- Public dashboard: Railway — <https://fast-tracker-public-production.up.railway.app/>
- Snapshot collector: Railway — <https://fast-tracker-dashboard-production.up.railway.app/>
- The browser makes one snapshot request. The dashboard preserves source values, fixture identifiers and unknown fields; it does not synthesize missing times, prices, scores or statistics.
- Dates and competitions in the filters come from the returned fixtures. Match details retain the source payload.
- `/health` and `/system` show snapshot availability and source timing.
- Supabase is retained for the canonical production store and existing collection services. It is not an odds or prediction source in the public dashboard.

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

The public experience is intentionally raw and source-backed. Missing values remain missing. Do not present absent goals/corners or odds as zero, forecasts, or derived data. Historical database migrations are retained to preserve the applied schema history; provider-specific production objects and retired collection jobs were removed by the 2026-10-11 cleanup migrations.
