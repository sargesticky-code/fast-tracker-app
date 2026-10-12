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

Team names are normalized and resolved from the public Supabase `football-logos` index. Reviewed aliases for the current Flashscore feed are kept in `data/team-logo-aliases.json` and published in that index; the browser does not keep a separate hardcoded alias list. The sprite keeps each badge in a 22 px tile to limit storage and page transfer size. Additional assets and their source/license notes are recorded in `data/team-logo-supplements.json` and the bucket `NOTICE.txt`.

Run `node scripts/audit-team-logo-coverage.mjs` to compare the current production snapshot with the published index. It reports new or ambiguous team names before a dashboard release. Exact names and safe suffix variants continue to resolve automatically; new abbreviations should be added once to the reviewed alias registry and published index.

## Current scope

The public experience is intentionally raw and source-backed. Missing values remain missing. Do not present absent goals/corners or odds as zero, forecasts, or derived data. Historical database migrations are retained to preserve the applied schema history; provider-specific production objects and retired collection jobs were removed by the 2026-10-11 cleanup migrations.
