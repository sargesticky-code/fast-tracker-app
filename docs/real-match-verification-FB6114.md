# Real Match Verification — FB6114

Verified: 2026-10-03

This is a **real stored-data verification** for one canonical match. It is separate from the Playwright fixture tests used to verify browser behavior.

## Canonical fixture

- Canonical match id: `FB6114`
- Home: Atletico La Paz
- Away: Venados
- Tournament code: `MD1`
- Kickoff: 2026-10-03 11:00 HKT
- Canonical identity source: HKJC match key

The production database row and upstream HKJC artifact agree on the canonical match id, teams and kickoff.

## Stored HKJC market evidence

Current production database evidence in `hkjc_odds_current`:

| Market | Selection | Line | Decimal price |
| --- | --- | ---: | ---: |
| HDA | Home | — | 1.41 |
| HDA | Draw | — | 4.70 |
| HDA | Away | — | 4.75 |
| Goals | Over | 3.5 | 1.63 |
| Goals | Under | 3.5 | 2.13 |
| Corners | Over | 10.5 | 1.87 |
| Corners | Under | 10.5 | 1.83 |

Stored row:
- `fetched_at`: 2026-10-03 10:50:01 HKT
- `odds_updated_at`: 2026-10-02 09:46:41 HKT

The reviewed canonical quote mapping converts these rows to provider `HKJC`, provider kind `BOOKMAKER`, canonical match `FB6114`, normalized market/selection/line/decimal price and the stored observation timestamp. No write was required for this verification.

The upstream GitHub HKJC artifact was older at inspection time and contained different HDA/total/corner prices. Therefore the database row, not the older repository CSV, is the authoritative snapshot for this verification. The difference also demonstrates why an explicit as-of timestamp is mandatory.

## Model/statistical evidence

### Team Form

Stored `form_predictions` evidence:

- Source: `HKJC matchResult · recency-weighted Team-Form Poisson`
- Fetched: 2026-10-03 07:05:52 HKT
- Home probability: 0.544726
- Draw probability: 0.206812
- Away probability: 0.248462
- Model expected goals: 2.14826 / 1.40682
- Sample sizes: home 13 matches / away 11 matches
- Venue samples: home 6 / away 6
- Quality: `FORM_MODELED`

Public article treatment: these values are model estimates and the UI explicitly labels the goals values as **model expected goals, not observed xG**.

### Internal model family

Stored `model_predictions` row exists but has no usable DC/Pi probabilities for this fixture:

- Quality: `SPARSE_GRAPH_REJECTED`
- Team match quality: 1.0
- Source: `HKJC history reserved for Team-Form Poisson`

This must not be turned into zero probability or false consensus.

### Forebet

No stored `forebet_predictions` row was present for FB6114 at verification time. This is unavailable evidence, not a zero-strength Forebet view.

### H2H

Stored H2H evidence:

- Source: `HKJC accumulated matchResult history`
- Quality: `NO_PREVIOUS_H2H_IN_AVAILABLE_HISTORY`
- Prior meetings in available history: 0

Zero previous meetings is a valid evidence state. The article component does not invent an H2H trend when the sample is zero.

## Phase 2 evidence

- `phase2_match_lineup_evidence`: 39 rows
- All 39 rows are `confirmed = true`
- Source: `FLASHSCORE_OFFICIAL`
- `phase2_player_status_evidence`: 0 rows
- `api_football_event_map`: no row for FB6114

This exposed a real integration edge case: the English article previously depended on `eventMap.lineup_confirmed_at` to label a lineup confirmed. With no event-map row, it could call fully confirmed Flashscore lineup evidence “predicted”. Commit `854afcdc` fixes this by accepting unanimous row-level confirmed evidence when the event-map timestamp is absent. Missing player-status rows still render as **unknown coverage**, never “zero injuries”.

## English article state

At verification time:

- English cached interpretation row for FB6114: none
- zh-HK cached interpretation row for FB6114: none

The article therefore cannot rely on a pre-existing cache row. The PR browser tests separately verify that the public detail article remains readable when the English story endpoint/cache is unavailable and does not leak legacy Chinese narrative text.

For this real match, the factual article fields that were cross-checked against stored evidence are:

- canonical teams / kickoff;
- Team Form sample sizes and source;
- model expected-goal values and their model-estimate label;
- confirmed lineup state and source;
- unknown player-status coverage;
- HKJC market provider identity;
- normalized HDA/goals/corners prices, lines and observation timestamp;
- zero-H2H semantics.

A real recommendation headline/selection is **not claimed as verified in this document**, because the live `app-match-analysis` HTTP response could not be invoked directly through the current chat runtime. Recommendation/action claims remain gated until that response or an equivalent stored decision snapshot is inspected.

## Bet365 finding

Bet365 remains unavailable for current comparison:

- Production `bet365_current`: 0 rows
- Production `bet365_event_map`: 0 rows
- Latest upstream Bet365 workflow succeeded, but deliberately skipped scraping.
- Workflow reason: `no_supported_hkjc_competitions`
- Log: `Supported HKJC overlap: none`
- Result: `BET365_FILTER rows=0 reason=no_supported_hkjc_competitions`

This is currently a **competition-overlap/source-admission limitation**, not evidence of failed identity matching for a scraped fixture. No second-bookmaker price is invented.

## New quote migration status

The reviewed migration is committed as:

`supabase/migrations/202610030530_market_provider_quote_contract.sql`

Production verification shows:

- `market_provider_registry`: not present
- `market_quote_observations`: not present
- migration not present in production migration history

The migration has been hardened so the new canonical market tables have RLS enabled and no anon/authenticated access. It has **not** been applied to production in this phase.

Applying it would be a production schema change and remains an explicit release/approval gate.

## Verification boundary

### Real stored evidence verified
Everything above sourced from current production database rows, current upstream artifacts/workflow logs, or repository source code.

### Fixture-tested behavior
The Playwright suite verifies browser behavior for:
- desktop homepage → article;
- mobile homepage → article;
- English-story unavailable fallback;
- stale-price fail-closed behavior;
- confirmed-lineup rendering without an event-map timestamp.

Fixture tests prove UI behavior, not that a specific live recommendation is correct.

### Not yet verified
- real live `app-match-analysis` response for FB6114;
- production application of the new quote migration;
- populated canonical quote table;
- any genuine current Bet365/HKJC same-market comparison;
- production deployment of PR #2.


## Decision-snapshot validation

Direct response-body inspection of the production `app-match-analysis` endpoint is not available through the current connector set: the browser connector is disconnected, the generic web fetch cannot access the function URL, and the Supabase connector exposes function source/logs but no invoke action.

This is a **read-access limitation**, not evidence of a model failure.

Production function evidence that is available:

- `app-match-analysis` is ACTIVE, version 32.
- Supabase function logs record a successful `GET 200` for `FB6114` at 2026-10-03 12:47:23 HKT (execution 2820 ms, response length 3772 bytes).
- An earlier request at 11:54 HKT returned 500, followed later by a successful request. This indicates a transient/runtime episode rather than proof that the current endpoint is unavailable.
- The active v32 source was retrieved and inspected.

### Reconstructed real decision state

The following is reconstructed from **active v32 deterministic source plus current stored FB6114 evidence**, not copied from an unread response body:

- The canonical active Phase 1 feed excludes passed-kickoff upcoming fixtures. FB6114 therefore falls back to stored database evidence when analyzed after kickoff.
- Fallback mode is a hard fail-closed gate in v32: HDA becomes `DATA_RISK / NO_BET`, `currentOdds = null`, and the stored HDA quote is reference-only.
- Only Team Form supplies a usable 1X2 probability family. Forebet is unresolved, DC/Pi are `SPARSE_GRAPH_REJECTED`, and no multisource consensus row exists. Even without the fallback/staleness gate, fewer than two independent families cannot become Value/Strong Value; the family gate caps it at WATCH.
- The historical HKJC HDA numbers would mathematically make the away price look positive under Team Form alone (Form away 24.8462% versus HKJC no-vig fair about 18.59% at 4.75), but this is **not an actionable edge** because the price is historical, kickoff has passed, and there is only one usable family.
- Goals 3.5 and corners 10.5 are stored historical HKJC lines. There is no usable Forebet totals/corners model and no DC expected-goal row for this match, so market-specific model evidence is missing. HDA Team Form evidence must not be borrowed for these markets.
- `hkjc_upcoming_current` no longer contains FB6114, so a current Asian-handicap line/price is unavailable. Asian handicap is therefore unavailable/data-risk rather than inferred from the stored HDA quote.

### Current match state and lineup roles

At the latest read:

- `matches.status` still said `SECONDHALF`.
- `live_score_current` said `finished`, score Atletico La Paz 1-2 Venados, source `SPORTSCORE`.
- The status disagreement is source-lag evidence. The finished live-score state must prevent a prematch quote being represented as current.
- The 39 confirmed Flashscore lineup rows break down into **22 confirmed starters** and **17 confirmed substitutes/bench**. They are not 39 starters.
- Player-status evidence remains absent, so injury/suspension coverage is unknown.

### Real-evidence fixes added after this check

- `app-match-analysis` branch code now fails closed on terminal/post-kickoff prematch state and checks actual price-observation age, not merely recent fetch age.
- HDA and binary market outputs null `currentOdds` and mark stale data reference-only.
- Match-detail fallback now uses `odds_updated_at`, suppresses old/post-kickoff prices, and may replace a cached prematch card with authoritative stale/terminal state.
- The public evidence article independently rejects post-kickoff or >6-hour prematch quotes even if another layer incorrectly calls them current.
- Article lineup counts now separate starters from substitutes/bench.

These are PR changes only. Production Edge Function version 32 has not been replaced in this phase.
