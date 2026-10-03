# Goals Source, Identity and Independence Audit — 2026-10-03

Status: **BOUNDED DEFECTS FOUND / FIXES IN REVIEW ONLY**

Production deployment, migration and PR merge were not performed.

## Scope

This audit traced absent Dixon-Coles and Forebet goals evidence through:

- upstream result/model sources;
- fixture/team identity matching;
- sample and quality gates;
- Supabase synchronization;
- `app-match-analysis`;
- English evidence article / rendered detail.

It also audits whether method agreement is genuinely independent evidence.

## 1. Dixon-Coles coverage

Current upcoming-selling production snapshot:

| Stored state | Fixtures |
| --- | ---: |
| `SPARSE_GRAPH_REJECTED` / HKJC sparse graph | 77 |
| `MODELED` / football-data.co.uk main | 15 |
| `MODELED` / football-data.co.uk extra | 9 |
| no Supabase model row | 9 |

The 77 sparse rows are **genuine quality-gate rejections**. The upstream quality gate deliberately prevents Dixon-Coles/Pi from treating target-team-only HKJC history as a complete competition graph.

The modeled rows use full-league external history:

- `football-data.co.uk main / penaltyblog 1.12.2`;
- `football-data.co.uk extra / penaltyblog 1.12.2`.

Training samples on the current overlap checked here range from hundreds of league matches (for example 370, 626 and 700). These are distinct from the small HKJC Team Form samples.

### Nine apparently missing rows were synchronization lag

All nine production fixtures with no `model_predictions` row are present in the current upstream `data/model_current.csv`.

Source-health evidence explains the mismatch:

- latest uploaded `model_current.csv`: 2026-10-03 05:42:58 UTC, hash `273f1471...`;
- latest uploaded `form_current.csv`: 2026-10-03 05:42:58 UTC, hash `7645265e...`;
- last applied model hash in canonical tables: older 2026-10-03 00:25:03 UTC state;
- sync attempt at 2026-10-03 05:45:05 UTC failed with:
  `hkjc_odds_current: canceling statement due to statement timeout`.

So “no model row” for these nine fixtures is not proof of model-source absence. It is a **canonical sync application defect**.

PR #2 now changes the generic sync upsert helper to accept a bounded batch size and writes `hkjc_odds_current` in batches of 50 instead of one large <=300-row statement. This is not deployed yet; production still reflects the failed sync state.

## 2. Concrete Dixon-Coles identity defect

Upstream `model_current.csv` contained this row:

- event: `FB6258`
- target: Spartak Moscow Women vs Zenit St. Petersburg Women
- model teams: Spartak Moscow vs Zenit
- model league: Russia top flight
- source: `football-data.co.uk extra / penaltyblog 1.12.2`
- match quality: 0.940
- quality: `MODELED`

This is a false cross-variant identity match: women's teams were matched to the senior men's league because the generic substring similarity returned 0.94.

That model evidence must not be consumed.

A separate upstream review branch `model-identity-variant-guard` now:

- blocks Women ↔ senior, youth ↔ senior and AM ↔ senior similarity matches before model discovery;
- adds a defense-in-depth quality gate that blanks model probabilities/xG and writes `IDENTITY_VARIANT_REJECTED`;
- includes a unit test reproducing Spartak Moscow Women → Spartak Moscow and proving it is rejected while same-variant senior identity remains accepted;
- prevents model artifact publication from review branches.

No upstream production model artifact was changed by this audit.

## 3. Evidence independence audit

### HDA

Dixon-Coles and Pi remain one `INTERNAL` family, as before.

Team Form is not automatically independent merely because it is a different algorithm. PR #2 now assigns evidence provenance from the actual source lineage and collapses families sharing that lineage before HDA consensus/value gating.

### Goals

The same rule now applies to market-specific binary models.

Examples of provenance groups:

- Forebet → `FOREBET`;
- HKJC result history → `HKJC_RESULTS`;
- football-data.co.uk → `FOOTBALL_DATA_CO_UK`;
- martj42 international result archive → `MARTJ42_INTERNATIONAL_RESULTS`;
- shared BrazilianFootball lineage → `BRAZILIANFOOTBALL_SHARED`.

If Team Form and Dixon-Coles share a provenance group, they are collapsed into **one independent evidence group** before:

- consensus probability;
- support count;
- support ratio;
- dispersion;
- Value/Strong Value gating.

Their methods may still be reported as multiple model signals, but they cannot create false independent corroboration.

### Current real overlap

For the ten currently stored upcoming fixtures where Team Form and Dixon-Coles are both valid:

- Team Form source is HKJC result history;
- Dixon-Coles source is football-data.co.uk full-league history.

Those are currently treated as two source lineages. The audit found no current stored same-lineage Team Form/DC pair among those ten.

This does **not** mean all future method pairs are independent. The new grouping protects future shared-source cases such as Brazilian data lineages.

## 4. Forebet goals evidence

Production currently has zero active upcoming `forebet_predictions` rows and therefore zero current Forebet goals rows.

This is not presently an identity-match failure.

Latest upstream Forebet run evidence shows:

- source pages were classified `FOREBET_SOURCE_UNHEALTHY`;
- targets were explicitly classified `forebet_source_surface_unavailable`;
- no healthy free Forebet model rows were retrieved.

A second workflow defect then hid that useful diagnosis:

- the source scan produced explicit availability classifications;
- `forebet_current.csv` contained zero active rows;
- `reconcile_forebet_availability.py` treated zero model rows as fatal;
- the workflow stopped before publishing current availability;
- production therefore remained on stale `pending_forebet_refresh_new_hkjc_target` records.

Current production state reflects that stale application:

- 108 current upcoming availability rows;
- 108 `UNRESOLVED`;
- 108 reason `pending_forebet_refresh_new_hkjc_target`;
- no current checked timestamp on those rows.

A separate upstream review branch `forebet-outage-availability-reconcile` now:

- allows zero model rows when current availability/targets exist;
- never promotes an outage row to `MODEL`;
- preserves explicit `forebet_source_surface_unavailable` reasons;
- materializes missing targets as explicit unresolved rows;
- skips model-only O/U/corner/form enrichment when the Forebet model feed is empty;
- adds a zero-feed reconciliation unit test.

This does not create Forebet coverage. It only makes the outage state truthful and observable.

## 5. English detail provenance

PR #2 now carries source provenance into the deterministic goals response and English article.

For Team Form it can show:

- source;
- history source;
- model fetch time;
- home/away sample size;
- venue sample size;
- derived expected goals;
- external archive latest date when recorded;
- provenance group;
- method.

For Dixon-Coles it can show:

- source;
- competition/model league;
- training match count;
- team identity match quality;
- model fetch time;
- derived expected goals;
- provenance group;
- method.

The current Dixon-Coles artifact does **not** record an exact training-period start/end. The article therefore says the historical period is **not recorded in the current model artifact** instead of inventing one.

Both Team Form and Dixon-Coles expected goals remain explicitly labelled derived/model expected goals, not observed xG.

## 6. Fresh goals coverage after this audit

The previous fresh-price scan found two fixtures with usable Team Form goals evidence and no second usable goals family.

The broader current snapshot does contain fixtures where Team Form + full-league Dixon-Coles both exist, but their stored HKJC price observations are currently old enough that they must not be presented as fresh actionable recommendations.

Therefore this audit does **not** manufacture a two-family fresh Value fixture.

## Verification boundary

### Verified from real data / logs

- production DC quality/source distribution;
- model/form upload-vs-applied hash mismatch;
- exact Supabase sync timeout;
- current Forebet zero coverage and stale availability state;
- Forebet source-surface outage reason from workflow logs;
- FB6258 women-to-men model identity mismatch;
- current Team Form/DC source-lineage combinations.

### Verified in review code/tests

- correlated source groups collapse before HDA/goals Value gating;
- Team Form and DC goals provenance is carried separately;
- HKJC odds sync uses smaller bounded statements;
- English detail exposes model provenance/sample context;
- upstream outage reconciliation does not invent Forebet models;
- upstream variant guard rejects cross-variant model identity.

### Still unverified

- post-fix production sync, because `sync-fast-tracker` is not deployed;
- post-fix production Forebet availability, because upstream branch is unmerged and sync is not deployed/applied;
- post-fix production FB6258 model row, because model branch is unmerged;
- actual post-fix `app-match-analysis` JSON;
- a fresh real two-independent-family goals recommendation.

All post-fix behavior is review-branch behavior until the relevant production gates are separately approved.
