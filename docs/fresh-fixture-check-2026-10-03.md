# Fresh Fixture Qualification Check — 2026-10-03

Status: **NO FULLY QUALIFYING REAL FIXTURE FOUND**

This bounded review looked for one genuinely upcoming match that simultaneously had:

1. confirmed pre-event/upcoming status,
2. a separately recorded market-price observation timestamp and fetch timestamp,
3. a price observation within the current six-hour actionability ceiling,
4. usable HDA evidence,
5. at least one usable market-specific model path for goals, corners or Asian handicap.

No fixture met all five conditions at the review snapshot.

## Fresh-price candidates

The current HKJC upcoming table contained multiple genuinely upcoming pre-event fixtures with price observations inside six hours. Most had no usable prediction family.

The strongest partially qualifying candidate was **FB6231 — India vs Brazil**:

- match status: `PREEVENT`
- kickoff: 2026-10-03 22:00 HKT
- source price observation: 2026-10-03 13:02:21 HKT
- source fetch: 2026-10-03 14:20:05 HKT
- price observation age at review: about 84 minutes
- fetch age at review: about 6 minutes
- HKJC HDA: 50.00 / 14.50 / 1.01
- goals: 4.5, Over 1.80 / Under 1.90
- corners: 10.5, Over 2.20 / Under 1.59

The price observation and fetch timestamps are materially different and must never be conflated.

## HDA evidence

Only Team Form is usable:

- Form probabilities: Home 25.1784%, Draw 24.4535%, Away 50.3681%
- sample: Home 14 matches / Away 25 matches
- venue sample: Home 5 / Away 9
- external history latest date recorded in the model raw data: 2026-08-26
- model source: `martj42/international_results + HKJC recent · recency-weighted Team-Form Poisson`
- DC/Pi: `SPARSE_GRAPH_REJECTED`
- Forebet: unavailable
- multisource consensus: unavailable

HKJC no-vig H/D/A from 50.00 / 14.50 / 1.01 is approximately:

- Home 1.85%
- Draw 6.39%
- Away 91.76%

Using Team Form alone gives nominal price EVs of approximately:

- Home +1158.9%
- Draw +254.6%
- Away -49.1%

These numbers are a useful stress test, not a Value signal. With only **one independent evidence family**, the deterministic analysis family gate limits HDA to **WATCH**, not Value/Strong Value. The extreme disagreement itself is a reason to demand corroboration, not to loosen the gate.

## Market-specific verification

FB6231 does **not** qualify for a real goals/corners model comparison:

- goals line/price exists, but Forebet goals evidence is absent;
- DC expected goals is absent because the internal model is sparse-graph rejected;
- no native multisource O/U evidence is available;
- corners line/price exists, but no usable corner prediction family is present;
- no current Asian-handicap model verification was selected as a substitute for missing totals evidence.

Therefore the correct market-specific state is **NO_MODEL / PASS (or equivalent non-actionable state)**, not a fabricated Value recommendation.

This is why FB6231 is not counted as a fully qualifying fixture even though its HKJC price observation is recent enough for the current actionability window.

## Price action and human evidence

- No `odds_movement_current` row is stored for FB6231, so there is no verified 24h/2h/1h movement claim.
- Lineup evidence: 22 predicted starters + 30 predicted substitutes/bench from `FOTMOB_PREDICTED`; none are confirmed.
- Player-status evidence: 3 confirmed away-side injury rows from FotMob.
- Manager evidence: unavailable.

Missing movement/manager/model data remains unknown; it is not converted to a neutral or zero value.

## Endpoint-response limitation

An actual `app-match-analysis?id=FB6231` JSON response could not be obtained through the available authorized read paths:

- Supabase exposes function source and execution logs, but no invoke/read-body action.
- The public Edge Function URL is not accessible through the generic web reader.
- The connected browser path is unavailable in this runtime.
- No FB6231 request was present in the inspected function logs during this review window.

Any FB6231 analysis described above is therefore explicitly a **reconstruction from current stored evidence plus deterministic branch/active-function rules**, not an observed endpoint response.

## Evidence-revealed fixes

The English article now:

- uses source price-observation time before fetch/update time for the displayed market `As of`;
- shows source fetch time separately;
- exposes expected value and model-vs-market probability gap;
- exposes independent-family count and support count;
- explicitly says model disagreement is not measurable when fewer than two families exist.

The analysis response contract now exposes `priceObservedAt` and `fetchedAt` separately under Phase 1 health.

## Outcome

Because no fresh upcoming fixture also had a usable market-specific prediction path, this phase did not promote or invent a Value recommendation.

The bounded fallback task was therefore executed: a Bet365 unsupported-competition admission census was implemented separately in upstream draft PR #31 without adding scraper competitions or requests.
