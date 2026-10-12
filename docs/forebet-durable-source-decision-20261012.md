# Forebet durable source decision — 2026-10-12

## Verified blocker / why one-time Firecrawl is not a solution
- Existing Forebet Firecrawl ingestion captured 1,285 listing rows, mostly one day old; only 19 had any verified fixture identity and zero mapped prospective fixtures at audit time.
- Official website has consistent `div.schema div.rcnt` structures for three separate listing markets. A bounded six-page HTML parser was implemented and passed offline tests, joining only by the stable Forebet numeric fixture ID; no per-match browser and no full-site crawl.
- **Actual GitHub Actions network probe failed for all six pages with HTTPStatusError** (run 38223410276, provider-reachability). This proves that *the proposed direct-http producer is not currently a working long-term source*. No proxies, anti-bot evasion, rapid retries or expansion of page budget are authorised.
- PR #78 remains DRAFT and must not be deployed/merged for automatic capture. `FOREBET_ENABLED` defaults to `0`. The SQL contract is *staged only* and the recurring cron line is commented, so production cron remains eight jobs. No cost or production Forebet requests were activated.

## Clean long-term boundary
```
source adapter (licensed/authorised and reliably reachable)
  -> bounded snapshot: {source, captured_at, ok, rows[]}
  -> strict source_id + verified alias pair + unique FS fixture/date
  -> existing ft_publish_forebet_canonical (source pre-kickoff gate)
  -> existing 180d immutable archive + exact-Flashscore final results
  -> existing compact UI and private prospective assessment
```
- Flashscore remains the only canonical fixture authority. Forebet numeric event ID is a secondary stable key, not a canonical ID.
- Source failures are visible `SOURCE_UNAVAILABLE`; cached prior forecasts retain their original capture time and do not become newly published as “fresh”.
- No daily alias maintenance, no team-name-only joins, no fake Forebet numbers, no new Firecrawl dependencies.
- A new source synchronisation cron is justifiable **only after** one provider has passed two consecutive real captures, verified quotas/terms, one valid ahead-of-kickoff FS match and a no-duplicate deployment smoke test.
- Suggested cadence for any permitted source: no more than 6 listing HTTP requests per four hours, with a 12-second timeout and 650-ID parsed cap; capture only today and tomorrow. Monitor success rate, market completeness and unique-FS matched coverage. If blocked, stop, don't switch to aggressive retries.

## Source options in priority order
1. **An authorised Forebet feed** or explicit right to use their data, if available. Forebet doesn't advertise an official public API; never assume site HTML is reliably machine-accessible.
2. **A monitored third-party Forebet data API** if terms and budget are acceptable. Parse.bot advertises `get_predictions` (up to 20 matches per call), a 200-credit/month free allowance, and ongoing priced tiers. This needs a separate connection/API key and cannot be represented as zero-cost full global coverage. Its data availability and licensing must be confirmed. It is *not* the official Forebet API.
3. **An independent Fast Tracker model**, trained from owned/authorised Flashscore match-result observations or appropriately licensed historical stats; label as `FAST_TRACKER_MODEL`, never `FOREBET`. This is the only route to guaranteed prediction continuity without dependence on a blocked proprietary source. Over/Under and corners probabilities should only be generated from properly observed goal/corner distributions, not filled from missing Forebet values.

## Release criteria
- `CI offline`: Python source parser/identity/timeout and bookmaker regression tests green.
- `CI real source`: three markets reachable via ordinary requests, with nonzero validated pregame rows; otherwise feature flag off.
- `DB`: importer compile/transaction rollback smoke test, zero writes for invalid ID, late capture, ambiguous alias, missing forebet availability and post-kickoff row; positive insert for an eligible already-verified FS match.
- `Production`: **do not** deploy or schedule PR #78 until criteria pass. Current Flashscore/Bet365/FotMob and independently archived predictions remain operational.
