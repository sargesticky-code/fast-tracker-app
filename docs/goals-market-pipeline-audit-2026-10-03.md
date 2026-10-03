# Goals Market Pipeline Audit — 2026-10-03

Status: **CONCRETE WIRING DEFECT FOUND AND REPAIRED IN PR #2**  
Production deployment: **not performed**

## Pipeline traced

The goals-market path is:

1. historical/results inputs → upstream Team Form Poisson / Dixon-Coles / Forebet model artifacts;
2. Supabase `form_predictions`, `model_predictions`, `forebet_predictions`;
3. canonical Phase 1 feed and `app-match-analysis`;
4. market-specific goals model family list;
5. `buildBinaryAdvice` using the current HKJC line/price and only goals-specific probabilities;
6. English evidence article / rendered match detail.

## Root cause of widespread NO_MODEL

The stored Team Form model already produces:

- `form_xg_home`
- `form_xg_away`
- explicit sample counts
- source attribution
- fail-closed quality state (`FORM_MODELED` vs `FORM_INSUFFICIENT:...`)

The public Phase 1 feed also already reads these fields into `formDetail`.

However, `app-match-analysis` only used:

- Forebet average-goals/O-U evidence,
- Dixon-Coles xG,
- multisource native O/U 2.5 evidence.

It **did not query or use Team Form expected goals for the goals market**, even though it used Team Form's 1X2 probabilities for HDA.

This was a wiring defect, not a missing-model problem.

The production internal feed confirms the defect for FB6231: its 1X2 Team Form probabilities are present, while `form_xg_home/form_xg_away` are not exposed in the raw analysis-feed row. The direct `form_predictions` row does contain valid xG and sample metadata.

## Real evidence: FB6231 India vs Brazil

At review:

- status: `PREEVENT`
- kickoff: 2026-10-03 22:00 HKT
- HKJC price observation: 2026-10-03 13:02:21 HKT
- source fetch: 2026-10-03 14:20:05 HKT
- goals line: 4.5
- Over: 1.80
- Under: 1.90

Team Form evidence:

- quality: `FORM_MODELED`
- home sample: 14 matches
- away sample: 25 matches
- home venue sample: 5
- away venue sample: 9
- expected goals: India 1.09304 / Brazil 1.65055
- total mean: 2.74359
- source: `martj42/international_results + HKJC recent · recency-weighted Team-Form Poisson`
- upstream model fetched: 2026-10-03 07:05:52 HKT
- external archive latest date recorded by the model: 2026-08-26

The upstream Team Form implementation itself requires at least 8 matches per side plus minimum recency-weighted effective sample mass before it emits `FORM_MODELED`. It labels insufficient rows explicitly instead of emitting xG.

Using the existing Poisson total model at line 4.5:

- Team Form P(Over 4.5) ≈ 14.36%
- Team Form P(Under 4.5) ≈ 85.64%
- HKJC no-vig fair from 1.80 / 1.90 ≈ Over 51.35% / Under 48.65%

That produces a large nominal single-model lean to Under 4.5. It is **not promoted to Value** because `buildBinaryAdvice` requires at least two market-specific evidence families before a Value class can be reached. With only Team Form, the correct class is `WATCH_SINGLE_SOURCE` / WATCH.

This preserves the project rule: HDA consensus is not borrowed into the goals market.

## Repair

PR #2 now makes `app-match-analysis` query `form_predictions` directly for the canonical match and adds Team Form as a distinct goals family only when:

- quality is exactly `FORM_MODELED`;
- home sample >= 8;
- away sample >= 8;
- both expected-goals fields form a valid positive total;
- a real goals market line is present.

Method label:

- prematch: `FORM_XG_POISSON`
- live residual: `LIVE_FORM_RESIDUAL`

The model remains one independent family. It does not increase HDA family counts and it does not borrow HDA probabilities.

The English article now exposes:

- goals action / line / selection;
- current/reference price;
- market observation time;
- number of independent goals families;
- named goals models and method;
- Team Form expected goals;
- sample counts and source;
- explicit statement that model xG is derived, not observed xG;
- explicit boundary that HDA consensus is not reused for goals/corners/handicap.

## Genuine input insufficiency versus wiring defects

Current upcoming-selling snapshot:

- 48 fixtures have `FORM_MODELED`;
- 9 current fixtures have no form row;
- the remaining fixtures are explicitly `FORM_INSUFFICIENT:n/n` variants;
- only 2 fixtures currently combine a <6h price observation, a goals market and `FORM_MODELED`;
- 0 of those 2 currently also have a second usable DC goals family.

Examples of genuine insufficiency include current rows with 0/0, 1/1, 2/2, 4/3, 7/8 or 38/7 samples. The Team Form generator requires at least 8 usable matches for **both** sides and also checks effective recency weight. These remain correctly unavailable.

Therefore:

- **fixed defect:** valid Team Form goals estimates existed but analysis ignored them;
- **still genuine coverage gap:** many competitions/teams do not yet meet Team Form sample gates;
- **still genuine independent-family gap:** the fresh fixtures examined do not have a second goals family, so Value classification remains unavailable.

## Verification boundary

Verified with real stored evidence:

- source/sample/xG fields for FB6231;
- current HKJC goals line and prices;
- separate price observation and fetch times;
- current form coverage distribution;
- absence of a second goals family in the two fresh priced/form-modeled fixtures.

Verified in branch code/tests:

- Team Form xG is queried directly;
- sample/quality gates are preserved;
- Team Form is a separate goals family;
- one goals family remains WATCH, not Value;
- rendered article shows market-specific evidence and the no-HDA-borrowing boundary.

Not verified:

- actual post-fix production `app-match-analysis` JSON, because the Edge Function has not been deployed;
- a real fresh two-family goals recommendation;
- production article behavior against the post-fix function.

The active production function remains unchanged. Any post-fix FB6231 outcome described here is a **branch-code reconstruction**, not an observed production endpoint response.
