# FT — Forebet replacement collector checkpoint (2026-10-11)

## Current state: draft / not cut over
- Review PR: https://github.com/sargesticky-code/fast-tracker-app/pull/47
- New collector: `scripts/forebet-lean-capture.py`
- New parser: `scripts/forebet_lean_parser.py`
- Offline test: `tests/test_forebet_lean_parser.py`
- Pinned optional dependencies: `scripts/requirements-forebet-lean.txt`
- CI: `.github/workflows/forebet-lean-pilot.yml`; PR base is `phase0/international-authority`.
- Validated CI #38067777260 (head `c7321b455ccd78d94ee8d9f2c11b343d1aa0bd9e`) passed parser and normalization steps. Later incremental parser change must pass its own new CI run before being called CI-verified.
- Local six offline HTML unit-test cases pass. This is not live provider acceptance.

## Root-cause reconciliation
1. Legacy `mantaslv/forebet-scraper` code last changed in November 2023; old pilot still targeted `/en/football-predictions/predictions-1x2/YYYY-MM-DD`.
2. September 2026 `Alm77ar/Forebet-Scraper` uses `/en/football-tips-and-predictions-for-today` and `...-for-tomorrow`, modern home/away anchors and more selectors. The current pilot now uses those source routes, skips bookmaker/Telegram/H2H fetches, and uses offline-testable HTML parsing.
3. Direct Forebet requests from the available external verification environment returned HTTP 403 on both routes. A previous GitHub Runner attempt also received HTTP 403. Do not infer that any GitHub repo or selector update establishes access. No FlareSolverr, CAPTCHA bypass, stealth evasions, rotated proxy requests or paid service was added.
4. Existing stored current model coverage was 20 fresh rows among 256 fixtures in the 48-hour summary on Oct 10; historic 545 records were not a current 545-match coverage guarantee.
5. Website terms at `https://www.forebet.com/ro/termsofuse` restrict reproduction, duplication, copying and exploitation of the service. Clarify authorized data use before any recurring acquisition or redistribution on the public dashboard.

## Data contract
- Candidate record fields: source, source competition, home, away, unconverted source local kickoff text, possible date formats, 1/X/2 probabilities (0-100), exact score, avg goals, source detail URL if safe, and timestamp/provenance at batch level.
- Identity: `canonical_match_id=null`, `identity_status=UNVERIFIED`, `source_kickoff_timezone=null`. Do not publish to model tables before a unique canonical fixture, timezone and source authorization are established.
- Keep `coverage_complete=false` until genuine full-page and source-window proof. An optional single MORE click is not total-horizon proof.
- Never show stale records as current, invent a predicted score, derive Forebet probabilities from odds, or label external content FOREBET without provenance.
- No production migration, cron schedule, scraper service, extra Supabase table, Edge deployment, alias rewrite or old producer retirement in PR #47.

## 2026-10-11 source-to-publication audit (verified, supersedes the previous "403 only" diagnosis)

- **Confirmed successful one-off production path:** [football-fast-tracker run 38061748513](https://github.com/sargesticky-code/football-fast-tracker/actions/runs/38061748513) executed on 2026-10-10. It reported 44 initially visible source rows and 1115 expanded page rows, but applied strict exact/verified-alias team allowlisting **before** parsing. Actual normalized candidates = **25**, not 1115. Strict verification accepted 20; rejected 3 for league/time/identity nonuniqueness and 2 for invalid fields/clock. Hence the final stage passed **20/25 (80%)** of parsed candidates; it is false to claim 1095 matches were rejected by canonical matching.
- Production OIDC-published 20 via `forebet-canonical-publish` and `ft_publish_forebet_canonical`. Live database `forebet_prediction_current` holds 545 total historical records; 20 fresh Oct 11 predictions at audit time. `ft_fast_flashscore_summary(48)` had 113 fixtures / 20 Forebet predictions when checked on 2026-10-11 00:22 UTC.
- **Real limitation:** old one-off source job captured a single day (`2026-10-11`), not entire 48h kickoff horizon; strict candidate allowlist based on only canonical team pairs, a hand-verified 14-code league map and source-clock match further narrows eligible rows. An expanded page count is not the count of relevant canonical fixtures or native model availability.
- **Access caution:** that successful run used a browser helper with a clearance mechanism. Direct Forebet page requests from other contexts returned 403. Its success is not evidence of permission to run a persistent bypass or scheduled bulk scraper. Do not re-enable or expand such access techniques. Check provider authorization first.
- **Provenance defect:** its current publisher RPC accepts `source_event_url` but does not persist it to `forebet_predictions.forebet_detail_url` or `raw`. All 20 fresh records consequently have no stored source detail URL. Fix only as a reviewed, additive future migration after a permitted source feed is established; do not manufacture missing historical URLs.
- **Decision:** retain the existing functioning 20-row read/publication path; keep PR47 as an isolated, bounded **offline HTML validation adapter** and candidate producer, not an automatic replacement scheduled source. Future coverage improvement needs independent allowed source access plus day-scoped capture, then verified canonical mapping; never disable a working collector without three natural parity checks.
- **New PR47 capabilities:** provenance-labelled offline `--html-today` and `--html-tomorrow` options, per-snapshot SHA256 and no implied source freshness, quarantine of conflicting duplicate predictions, no production write path. CI run [38098329208](https://github.com/sargesticky-code/fast-tracker-app/actions/runs/38098329208) passed its offline parser and snapshot safety tests.

## Go/no-go for cutover
1. Confirm permitted source access; capture bounded Today/Tomorrow HTML and source-local clock meaning from the actual provider, with no access-control circumvention.
2. Parse at least three real upcoming matches with H/D/A, predicted score and average goals. Validate against the original source page.
3. Map those matches via existing canonical aliases + league + kickoff with strict uniqueness. Quarantine ambiguity.
4. Stage/write only verified fresh evidence to existing tables; verify DB -> existing `ft_fast_flashscore_summary(48)` -> Edge API -> real browser desktop/mobile.
5. Confirm three natural capture cycles, idempotency and source freshness. Only then retire the previous Forebet producer; do not remove valid history.

## Manual safe QA (no live source requests)
```bash
python -m pip install beautifulsoup4==4.14.3
python -m unittest discover -s tests -p 'test_forebet_lean_parser.py' -v
python -m py_compile scripts/forebet-lean-capture.py scripts/forebet_lean_parser.py
```
