## Phase 25: actual stored-results evaluation adapter

New authenticated `football-data-backtest` Edge Function reuses the private Vault-backed cron credential RPC. No public CORS and no write grants to frontend clients. Call only from internal operator tooling with a POST and `?league=E0` (also D1, SP1, I1, F1, N1, P1). It reads up to 600 SQL `football_data_matches` rows for one league from source_kind RESULTS, returns only aggregate Brier and log-loss versus league-only baseline and skipped-count diagnostics, never stores predictions.

The `first_seen_at` column is used as the genuine database provenance timestamp; it is *not backdated* to previous kickoffs. Even when a historical match played earlier than an evaluation target, newly backfilled files cannot claim those earlier predictions were actually issued. Each evaluation is prominently `RETROSPECTIVE_ONLY`.

The 20-fixture maximum protects Supabase free-tier CPU; one league per request; the explicit allowlist avoids Austrian/German or other league collisions. Results are experimental even if retrospective performance appears better than baseline, and insufficient samples remain unavailable. No HKJC, no new cron, no public accuracy stats, no change to ordinary Match Details API.

Any long-running production benchmark should be a manual operator request with slow repetition and monitoring. Before advancing to real prospective validation, freeze each new prediction and training source snapshot before kickoff and evaluate only truly out-of-sample data.


## First actual production backtest — 2026-10-18

Executed against Supabase `football_data_matches` after deploying isolated authenticated `football-data-backtest` Edge v1. These numbers are real retrospective computations, **not predictions genuinely issued before kickoff**. Each request was limited to a single exact source league, 600-row SQL read, and first 20 holdout candidates.

All seven authenticated requests returned HTTP 200. Requests 51097 E0, 51098 D1, 51099 SP1, 51100 I1, 51101 F1, 51103 N1, 51104 P1. A separate unauthenticated POST (51107) returned HTTP 401. No published predictions, model accuracy rows, or database history rows were changed; `football_data_matches` remained at 3,960 rows.

| League | Examined history | Evaluated | Skipped | DC Brier | PI Brier | League-only baseline Brier | DC log loss | PI log loss | Baseline log loss |
|:--|--:|--:|--|--:|--:|--:|--:|--:|--:|
| E0 Premier League | 440 | 20 | 0 | .219459 | .215891 | .217838 | 1.087995 | 1.074443 | 1.081214 |
| D1 Bundesliga | 351 | 20 | 0 | .222825 | .220406 | .228513 | 1.104346 | 1.100970 | 1.127587 |
| SP1 La Liga | 458 | 13 | 7 (2 stale / 5 team history) | .200828 | .188136 | .226764 | 1.005248 | .951325 | 1.116945 |
| I1 Serie A | 440 | 20 | 0 | .178196 | .182203 | .215745 | .906609 | .926129 | 1.065854 |
| F1 Ligue 1 | 360 | 20 | 0 | .212042 | .200444 | .218082 | 1.046544 | .999870 | 1.075069 |
| N1 Eredivisie | 378 | 15 | 5 team history | .229387 | .224253 | .228927 | 1.137954 | 1.110780 | 1.122747 |
| P1 Primeira Liga | 377 | 16 | 4 (1 stale / 3 team history) | .178394 | .174263 | .216890 | .914675 | .886622 | 1.078270 |

**Exploratory evaluated-fixture-weighted mean across these 124 fixtures**: DC Brier .206099, PI Brier .201425, baseline Brier .221416; DC log-loss 1.029695, PI 1.010025, baseline 1.093615. These are descriptive means on a cherry-pick-prone bounded sample, not a statistically significant or separately replicated improvement. Small cohort and selected earliest 20 holdout dates per league limit generalizability. The PI model and DC share the same data and are **not independent advisers**.

Release gate remains `NOT_PROMOTED_NO_VERIFIED_ACCURACY`. Next: preregister larger date/time-scoped chronological samples and confidence intervals, then collect immutable **genuine future prematch forecasts before kickoff** without turning on automatic betting advice.
