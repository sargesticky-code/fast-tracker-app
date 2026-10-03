# Dashboard Redesign Handover — 2026-10-03

## Scope completed in this batch

Dashboard-first public UI work on draft PR #2 / branch `homepage-forebet-v1`.

Implemented:
- football-only primary navigation for Today / Live / Value / Tomorrow / All matches;
- dense Forebet-inspired English homepage with Fast Tracker navy/blue/yellow identity;
- date, league, search, live and value filtering retained;
- explicit HDA / Goals / Corners market switch using existing feed prices only;
- combined H/D/A probability strip preserved;
- removed the empty weather column and used the space for useful market odds;
- explicit live ribbon and live score/clock presentation without manufacturing missing live values;
- responsive mobile match cards instead of a compressed wide desktop table;
- right rail changed from static “model coverage” wording to a user-facing board-reading guide;
- coordinated match-detail and evidence-article visual system;
- reserved homepage/right-rail/article advertising spaces;
- missing values remain unknown / em-dash rather than zero;
- existing evidence/freshness/player-identity safety logic remains in place;
- diagnostics remain internal at `/system`.

## Review verification

`tests/public-flow.spec.js` now verifies the visible HDA/Goals/Corners controls and market switching in both desktop and mobile homepage→detail→article flows.

The PR workflow captures:
- `dashboard-desktop-home.png`
- `dashboard-desktop-detail-article.png`
- `dashboard-mobile-home.png`
- `dashboard-mobile-detail-article.png`

and uploads them in the `dashboard-redesign-<sha>` Actions artifact for 14 days.

No production deployment, merge, Edge Function deployment, migration application, generated-feed publication, wider scraping or spend was performed.

## Data gaps deliberately not expanded in this UI batch

- no verified current second-bookmaker overlap;
- Forebet current outage remains unresolved;
- unresolved FotMob / Flashscore canonical player identities remain unresolved;
- missing source URLs and model training periods remain unknown;
- quote migration remains unapplied;
- real endpoint-body/public latest-branch verification remains a separate gate.

## Next UI-focused bounded step

Review the rendered screenshot artifact from the latest PR-head CI. Fix only concrete visual/readability issues found there (spacing, overflow, hierarchy, mobile density, ad placement), then verify a branch preview/public review URL if an existing safe preview path is available. Do not reopen broad provenance/provider audits until this visible review pass is settled.
