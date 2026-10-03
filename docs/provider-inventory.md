# Provider, Bookmaker and Market Inventory

Last audited: 2026-10-03

This inventory distinguishes genuine bookmaker prices from prediction/model/statistics providers. A provider is not treated as a bookmaker merely because it exposes an odds-looking number.

## Canonical identity

Fast Tracker's production match key remains the HKJC `FBxxxx` event id. External sources must join to that canonical match through the existing identity/alias layer. Unknown or low-confidence identity remains unresolved; it is not forced to a match.

## Current providers

| Provider | Type | Current evidence | Markets / data | Identity + timestamp | Credentials / dependency | Current status |
| --- | --- | --- | --- | --- | --- | --- |
| HKJC | Bookmaker + fixture authority | `football-fast-tracker/data/hkjc_current.csv`, direct public GraphQL, Supabase `hkjc_*_current` consumers | HDA; goals O/U; corners O/U; Asian handicap through Supabase upcoming/live authority where available | Canonical `FBxxxx`; `fetched_at_hkt` / `odds_updated_at` | Public endpoint; pinned scraper client | Working primary price source |
| Bet365 | Bookmaker | `bet365_daily.yml`, `filter_bet365.py`, `data/bet365_current.csv` | Full-time HDA only in the validated pipeline | Matched back to `FBxxxx`; `fetched_at_hkt`; match quality gate >= 0.80 | Chromium/Playwright scrape; supported competition overlap required | Pipeline exists, but current audited file is header-only (0 matched rows), so no live multi-bookmaker comparison can be claimed |
| OddsMath | Market aggregator / secondary market signal | `snapshot_oddsmath.py`, `oddsmath_current.csv`, `oddsmath_history.csv` | HDA aggregate/reference prices + de-vig probabilities + movement history | Matched to `FBxxxx`; 30m/hourly snapshot timestamps; identity confidence | Public HTML | Working aggregate signal; not a named bookmaker and not counted as a second bookmaker |
| Forebet | Prediction provider | `forebet_daily.yml`, `forebet_current.csv` | HDA probabilities, predicted score, average goals, O/U 2.5, corners 9.5, predicted corner score | `FBxxxx` after alias matching; `fetched_at_hkt` | Public rendered pages via Jina; routine path uses zero ScraperAPI credits | Working prediction source |
| Opta Power | Strength provider | Forebet enrichment step / power fields | Club strength/rank signal, not match prices | Team-name confidence matching; update timestamp | Public enrichment path in current worker | Working where coverage matches |
| Dixon-Coles | Internal model | `model_daily.yml`, `model_current.csv`, app analysis | HDA, expected-goal-derived totals, Asian handicap score distribution | `FBxxxx`; model fetched/run timestamp | Free historical results + HKJC history | Shadow/internal evidence family |
| Pi Rating | Internal model | `model_daily.yml`, `model_current.csv`, app analysis | HDA / strength-derived match probabilities, AH support | `FBxxxx` | Free historical results + HKJC history | Shadow/internal evidence family |
| Team Form | Internal model | `form_current.csv` | HDA, form xG estimates, sample counts/home-away samples | `FBxxxx`; `fetched_at_hkt` | HKJC result history; some international history enrichment | Working only when sample-quality gate passes |
| FotMob | Stats/H2H/identity provider | `fotmob_h2h.yml`, Phase 3 identity runner | H2H, identity/context; separate live/source-shadow work | Verified identity mapping + source freshness | Public requests in worker | Enrichment, not bookmaker |
| SofaScore | Stats/H2H provider | `sofascore_h2h.yml` | H2H enrichment | Verified mapping/quality states | Public requests in worker | Enrichment, not bookmaker |
| APWin | Prediction provider | `prediction_source_registry.csv` | Prediction fallback/second opinion for registered competitions | Competition-scoped mapping | Public source URL registry | Limited configured fallback, not bookmaker |
| ACC / BCL / FST / FRB / PRE / STA | Prediction-provider family | Multibetter V1 branch and workflow | External prediction consensus inputs | Grouped around Forebet then bridged into HKJC identity | Public source collectors | Experimental prediction evidence, not bookmaker prices |

## Important interpretation rules

- **Current verified bookmaker count is one in the active app price path: HKJC.**
- Bet365 is a genuine second bookmaker pipeline, but the current audited `bet365_current.csv` contains no rows. Until a real matched row exists and is ingested into Supabase, Fast Tracker must not display “multi-bookmaker” or a best-bookmaker-price badge.
- OddsMath currently has real timestamped HDA observations and history, but it is treated as a market aggregator/reference signal because the stored row does not identify each constituent bookmaker. Its `bn` field is preserved as source metadata, not expanded into invented bookmaker identities.
- Forebet's odds-like fields are source-page reference fields and are not promoted to named bookmaker quotes.
- “Multisource” prediction consensus is model/prediction evidence, not bookmaker coverage.

## Canonical quote contract

The app-level contract lives in `lib/market-provider-contract.js`.

Each quote carries:

- canonical match id;
- provider key/label/type;
- bookmaker boolean;
- normalized market;
- selection;
- line;
- decimal price;
- observation/as-of timestamp;
- source record id when available;
- identity confidence when available;
- freshness/status.

Missing line, price, timestamp or identity fields remain `null`/unknown. No zero filling is permitted.

Cross-bookmaker comparison is only considered verified when at least two distinct providers classified as `BOOKMAKER` supply usable quotes for the same canonical match, normalized market, line and selection.

## Market coverage gaps

- **HDA:** HKJC working; Bet365 pipeline exists but current rows are zero; OddsMath aggregate history working.
- **Asian handicap:** HKJC Supabase upcoming/live authority is consumed by `app-match-analysis`; upstream CSV schema does not yet expose a durable normalized AH history artifact.
- **Goals:** HKJC prices/line + model estimates available; Forebet O/U 2.5 prediction evidence available.
- **Corners:** HKJC prices/line + Forebet corner prediction evidence available.
- **BTTS:** model/multisource probability fields exist, but a verified current bookmaker-priced BTTS feed has not yet been established in the audited pipeline.
- **Multi-bookmaker best price:** blocked until at least one real second-bookmaker row (for example Bet365) is successfully matched, ingested and fresh for the same normalized market/line.

## Connected-data note

A direct Supabase schema/query audit was attempted from this chat, but the connected database calls terminated on connection timeout. Repository workers and current committed data were therefore used as the evidence source for this inventory. This is an access/runtime limitation, not evidence that the underlying Supabase tables are absent.


### Bet365 admission boundary

The current Bet365 collector is intentionally admission-gated. The pinned upstream scraper has validated competition ids only for:

- Spain La Liga (`spain`)
- UEFA Europa League (`uel`)

The Fast Tracker detector only launches the browser collector when current HKJC targets overlap one of those supported competitions. The latest scheduled run found no overlap and wrote an empty benchmark by design.

For FB6114 (Mexico expansion league / `MD1`), no scrape was attempted. Therefore zero Bet365 rows are caused by **unsupported competition admission**, not a failed team-identity match after a scrape.

A bounded authorized improvement is possible without increasing scraping scope: add/report an unsupported-HKJC-competition census so future competition candidates can be reviewed. Expanding actual Bet365 collection is **not** currently unblocked because each added league needs a verified current Bet365 competition id and one successful end-to-end validation against HKJC fixtures. No paid API key or extra scraping is justified merely to manufacture multi-bookmaker coverage.
