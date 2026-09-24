# Fast Tracker 2026

Fast Tracker is a mobile-first football intelligence dashboard built around HKJC-authoritative fixtures, multi-source model comparison, human factors, live match intelligence and long-term model calibration.

## Architecture boundary

- HKJC naming remains the authoritative fixture/team key.
- The public dashboard is read-only.
- Supabase is the canonical production platform for the app, dashboard and long-term data model.
- The Google Sheet dashboard is frozen legacy and is no longer a development target.
- Do not add new production dependencies on Google Sheets or Apps Script.
- Existing Google Sheet automation may remain temporarily available only as rollback reference during cutover validation; it must not be allowed to overwrite fresher Supabase authority.
- Public clients must never expose Supabase service-role credentials.
- Data quality, freshness, alias coverage and missing-source states must remain visible.

## Current public app

- Frontend repository: `sargesticky-code/fast-tracker-app`
- Production frontend: Railway
- Public URL: `https://fast-tracker-public-production.up.railway.app/`
- Supabase project: Fast Tracker 2026
- Main data contract: `app-phase1-feed`

## Product roadmap — Phase 0 to Phase 10

### Phase 0 — Living Dashboard
Make the dashboard dynamic, attractive and immediately readable without increasing scrape/API load.

Principles:
- Prefer CSS `transform` and `opacity` animations.
- No continuous JavaScript animation loops.
- Do not increase API polling frequency for visual effects.
- Animate only when values actually change.
- Pause/avoid animation for hidden tabs and off-screen content where possible.
- Support `prefers-reduced-motion`.
- Avoid expensive blur, particle, canvas and large-shadow animations.

Target effects:
- subtle LIVE breathing pulse
- short odds-change flash
- short Edge-change highlight
- score-change animation
- new Top Bet slide/fade-in
- light card hover/lift on desktop
- smooth filter/section transitions
- freshness/status pulse only when meaningful

### Phase 1 — Pre-match Intelligence
HKJC bettable matches are the canonical match universe. Compare HKJC fair probabilities and markets with Forebet, Dixon-Coles, Pi Rating, Team-Form and multi-source evidence.

Outputs:
- H/D/A probabilities
- Goals and Corners markets
- Edge
- model coverage
- data freshness and source health

### Phase 2 — Human Intelligence
Add player, lineup, injury, suspension, manager and other human-factor intelligence.

Outputs:
- confirmed/projected lineup impact
- key-player absence/return
- manager change
- tactical/personnel warnings
- human-factor contradiction against model output

### Phase 3 — Live Intelligence
Use live match state and live statistics to compare pre-match expectation with actual match control.

Inputs/outputs:
- score and minute
- xG / xGOT
- shots / shots on target
- possession
- big chances
- box touches
- corners
- Expected vs Actual
- live-control contradiction

### Phase 4 — Market Intelligence
Understand how the market moves through time rather than only showing the latest price.

Target outputs:
- opening → current odds
- steam / drift
- line movement
- price momentum
- value persistence
- model-before-market / market-before-model signals
- Edge decay or expansion

### Phase 5 — Model Calibration Lab
Measure which models are actually reliable by league, market and situation.

Metrics:
- Brier score
- log loss
- calibration curves
- ROI tracking
- league-specific performance
- market-specific performance
- dynamic model weighting

### Phase 6 — Match Simulation Engine
Combine Phase 1–3 intelligence into scenario distributions.

Target outputs:
- scoreline distribution
- H/D/A distribution
- goals distribution
- corners distribution
- scenario stress tests
- live re-simulation as match state changes

### Phase 7 — Risk & Portfolio Engine
Move from “which bet?” to “how much risk should be taken across all bets?”

Target outputs:
- capped Kelly sizing
- bankroll exposure
- team/league/market concentration
- correlated-bet detection
- maximum daily exposure
- drawdown controls

### Phase 8 — Smart Alerts / Autopilot
Surface meaningful changes automatically instead of requiring constant dashboard watching.

Example alerts:
- Edge crosses threshold
- odds steam/drift
- lineup shock
- model consensus change
- live expected-vs-actual contradiction
- data source failure or stale feed

### Phase 9 — Explainability & Trust Layer
Every recommendation must show why it exists and what could invalidate it.

Target outputs:
- Why highlighted
- source lineage
- model agreement/disagreement
- confidence
- missing data
- contradictions
- sample-size context
- freshness and calibration status

### Phase 10 — Adaptive Intelligence
Close the feedback loop from prediction → market context → outcome → calibration → future weighting.

Target outputs:
- dynamic model weights
- league/market regime learning
- drift detection
- strategy performance memory
- adaptive confidence
- long-term model governance

## Recommended build order

`Phase 0 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10`

Phase 1–3 collect intelligence.  
Phase 4–6 interpret intelligence.  
Phase 7–8 turn intelligence into controlled action.  
Phase 9–10 add trust, calibration and adaptation.

## Supabase-first cutover

Production direction from 2026-09-22:

- public dashboard reads Supabase only
- HKJC upcoming/live authority is captured directly into Supabase
- canonical match/market rows are promoted inside Supabase immediately
- external model workers may still run on GitHub Actions, but Supabase is the storage and serving authority
- Google Sheet dashboard work is stopped
- Google Sheet automation should be disabled only after the Supabase health gate confirms canonical fixture coverage, current HKJC markets, model recovery and dashboard availability
- rollback must never overwrite a newer Supabase snapshot

Cutover health gate:
1. upcoming HKJC canonical gap = 0
2. HKJC direct heartbeat fresh
3. app Phase 1 feed reachable and non-empty
4. no unexplained missing Forebet availability for newly discovered canonical targets
5. model workers recover newly discovered HKJC targets automatically
6. Railway production deployment healthy

## Development rule

Prefer durable system-level fixes over one-off match patches. New features should preserve:

1. HKJC authority
2. explicit missing-data states
3. alias durability
4. freshness/stale detection
5. source traceability
6. mobile readability
7. low-cost automation
8. isolation from the Google Sheet production workflow


## Dashboard design system

The production dashboard uses a Forebet-inspired information-dense layout rather than large app-style cards.

Rules:
- desktop upcoming fixtures use one-row-per-match table scanning
- preserve readable team names and key numbers; reduce whitespace before reducing font size
- use thin borders, light row striping and restrained shadows
- keep Best Bets prominent but vertically compact
- show model H/D/A, model pick, Edge, HKJC H/D/A, goals line and corners line without opening match details
- mobile collapses each fixture into a compact multi-tier row instead of forcing the desktop table into tiny columns
- presentation changes must not alter Supabase data contracts, capture cadence, alias logic or the separate Google Sheet workflow

- visual hierarchy: Edge / material odds movement / model disagreement / data-health warnings are primary signals; ordinary market prices are visually quieter
- MODEL SPLIT is descriptive only: it is shown when at least two independent HDA models (Forebet / Dixon-Coles / Pi / Team-Form) have different dominant outcomes
- strong Edge currently means HDA model-market edge >= 10%; standard Value highlighting begins at >= 5%


### Review Priority

The default upcoming view is sorted by an explainable Review Priority rather than kickoff time alone.

Review Priority is an inspection-order signal, not a win probability or expected-return model. It combines:
- model/data coverage
- absolute model-vs-market divergence
- positive HDA Edge
- material raw odds movement
- cross-model disagreement
- data freshness
- kickoff urgency

Bands:
- P1: 75–100
- P2: 55–74
- P3: 35–54
- P4: 0–34
- DATA RISK: stale or missing current market data

The dashboard may show REVIEW 0–100 to help decide which match to inspect first. Betting decisions remain based on the underlying evidence shown in the match detail, not the Review Priority number itself.

## App Core deployment guard (2026-09-22)

- GitHub `main` is the canonical source of truth for `supabase/functions/app-match-analysis/index.ts` and `supabase/functions/app-match-story/index.ts`.
- Any automation or manual run that changes these functions must re-read the current GitHub source first. Never redeploy an older server-only copy over a newer GitHub version.
- `app-match-analysis` owns deterministic probabilities, Edge, selection and action.
- `app-match-story` may interpret verified evidence but must not override deterministic selection, Edge, odds, action, score, lineup or injury facts.
- Missing canonical-active-feed rows use `DB_FALLBACK_FAIL_CLOSED`: analysis may explain available evidence but action is forced to `NO_BET`.
- Fallback HKJC prices are reference only: `currentOdds=null`, `referenceOdds=<stored price>`, `oddsStatus=REFERENCE_STALE`. Never display fallback prices as current HKJC odds.
- Phase 9 story contract is V4 and includes deep-detail evidence plus provenance/freshness metadata. Preserve backward-compatible response fields used by the production detail page.
- After changing either Edge Function, smoke-test at least one canonical-active match and one DB-fallback match, then sync the deployed source back to GitHub if the deployed copy changed.

<!-- railway-production-watch: all-files -->


### Dashboard visual source of truth

- `app/dashboard-polish.css` is the final authoritative visual layer for the public dashboard and is imported after `forebet-dashboard.css`.
- New homepage typography, spacing, row-height, column-width and badge decisions should be made in `dashboard-polish.css` rather than appending another legacy override block.
- Normal healthy states should stay visually quiet: do not repeat `DATA RICH`, `EDGE`, or equivalent labels when the same meaning is already communicated by selection, value and highlighting.
- Desktop information density target: readable 9–14px hierarchy, compact 48–53px data rows, four-column upcoming board, four-column Best Bets board, three-column Live board.


### Match detail visual source of truth

- `app/detail-polish.css` is the final authoritative visual layer for the public match-detail page and is imported after `dashboard-polish.css`.
- The first screen should answer, in order: fixture → decision/pick → current/reference odds → Edge/model gap → model-vs-market probability → concise advice/blockers.
- Avoid repeating team names, normal health states, EDGE labels, or price context in multiple adjacent cards.
- Detail desktop density target: compact match header, one-row decision board, readable 8–18px hierarchy, 5px–9px internal spacing, thin separators rather than large card gaps.
- Existing deeper evidence panels can remain expandable/detailed, but their typography and panel rhythm should follow `detail-polish.css`.

- Lower detail evidence boards should stay compact: Analyst Brief keeps only gate / summary / thesis / counter-case above the fold; repeated Market / Models / Human interpretations belong in the expandable deep dive.
- Team Form uses horizontal comparison rows, not two large standalone cards.
- Phase 4 uses one compact market-intelligence board; detailed value/arbitrage rows remain expandable.
- Model Consensus visual height should scale tightly with actual model count and should not reserve large empty chart space.

- Final detail-board rhythm: HKJC totals use two compact market rows; Phase 3 scenario uses table rows rather than timeline cards; Live Trading uses contiguous scoreboard/control/pressure/market boards; Technical diagnostics remain collapsed and visually quiet.
- Avoid restoring large standalone cards for these sections unless the information cannot be represented as a compact evidence row.


## Phase 1 multi-market recommendation contract (2026-09-24)

Phase 1 is not a 1X2-only layer. Every HKJC-match detail view should treat the following as parallel market lanes:

- **1X2 / H-D-A** — deterministic market-vs-model comparison, selection, price, fair probability, model probability, Edge, evidence coverage, action/gate.
- **Goals O/U** — always label the HKJC line explicitly (for example `入球大細 · 盤口 2.5`), show both prices, then show `大 2.5` / `細 2.5` / `PASS`, Edge in percentage points, evidence-family/source count and model basis. Never display a naked `2.5` without saying what market it belongs to.
- **Corners O/U** — same contract (for example `角球大細 · 盤口 8.5`). Never display a naked `8.5`; always show whether the candidate is `大 8.5`, `細 8.5`, or `PASS`.

Current deterministic totals evidence:
- Goals: Forebet current-line/native-or-anchored O/U, Dixon-Coles xG Poisson, and multi-source O/U when the source line is comparable.
- Corners: Forebet current-line/native-or-anchored corner O/U. Until another independent corner family is validated, single-source corner signals must remain WATCH/PASS rather than being promoted as high-confidence value.
- Current HKJC O/U prices are converted to no-vig fair probabilities before Edge is calculated.
- Phase 5 calibration gate still controls promotion. Phase 1 may identify and explain candidates but should not silently turn unvalidated signals into automatic stakes.

### Editorial / pundit evidence

`public.match_commentary_evidence` is the canonical store for attributed preview/commentary evidence. Store source metadata, URL, headline, a short excerpt, structured summary, lean/context and provenance — not full copied articles.

Editorial commentary is a **context lane**, not a probability family. `app-match-story` may use it to explain tactics, support/counter-case and what to watch, but commentary must not directly alter probability or Edge until a later calibrated model demonstrates predictive value.

`app-match-analysis` owns deterministic HDA, goals O/U and corners O/U outputs. `app-match-story` explains those outputs and must never overwrite them.


### Structured editorial evidence and Match Script (2026-09-24)

Phase 1 now treats editorial previews as a separate, attributed context layer:

- `match_commentary_evidence.opinion_signals` stores only explicit, rule-grounded signals such as 1X2, goals O/U, corners O/U and BTTS. Ambiguous “prediction / tips / lineup” headlines stay neutral.
- `relevance_score` and `parser_version` record the quality/parser context. Current deterministic parser: `EDITORIAL_RULES_V1`.
- Editorial signals are compared with deterministic model directions as `SUPPORT`, `CONTRADICT`, `DIFFERENT_LINE` or `CONTEXT_ONLY`.
- Editorial evidence NEVER changes model probability, fair probability, Edge, betting gate or stake sizing. It is explanatory evidence only.
- Internal commentary storage is server-side only; anon/authenticated table privileges are revoked.

The detail view must surface the comparison directly, rather than forcing the user to read article headlines and infer the conflict.

#### Match Script

`app-match-story` also returns a grounded `matchScript` with:
- opening-phase inference;
- middle-game shape;
- goals environment;
- corners environment;
- turning points / invalidators;
- Forebet reference score and average-goals context where available.

A Match Script is a Phase 1 pre-match inference, not a live simulation.

**Critical interpretation rule:** “value direction” and “most likely outcome” are different concepts. A side can have positive Edge because the offered odds are generous even when its absolute model probability is below 50%. The UI and story must state this explicitly whenever relevant.


### Quant Edge display contract (2026-09-24)

The dashboard label **精算投注 / QUANT EDGE** means a deterministic probability-price comparison, not a guaranteed return or an actuarial promise.

- **Model probability** is shown in percent (`%`).
- **HKJC fair probability** is the de-vig market probability and is shown in percent (`%`).
- **Quant Edge = model probability - HKJC fair probability**.
- Probability Edge is always displayed in **percentage points (`pp`)**, never as a return percentage.
- Example: model 39.0% - HKJC fair 31.9% = **+7.1pp Edge**.
- **EV / ROI** remain separate concepts and may be displayed in percent (`%`) only where they are actually calculated.
- The homepage Quant Edge shortlist currently requires at least **+5pp** and remains a candidate/watch layer while the Phase 5 calibration gate is pending.
- Homepage fixture cards may show a compact Match Script tag (shape, reference score, editorial support/contradiction) so the likely match shape is visible before opening the detail page.
