# FT 2026-10-12 — Source-independent model: verified long-term foundation

## Decision
Forebet is optional, not a training dependency. The new Fast Tracker v0 uses verified result-only inputs; its output is **experimental and NOT publishable as a reliable forecast** pending prospective verification. The existing Flashscore canonical fixture registry, bookmaker pipeline, live stats, and public dashboard must stay unchanged.

## Verified production inventory (2026-10-12 08:45–09:05 UTC)
- Existing Football-Data archive: 1,385 real result rows, 22 league codes, one 2026/27 season, 1,385 with goals AND corner counts. Earliest match 2026-07-31, newest 2026-10-05; many leagues' latest results are 2026-09-20. The source is NOT continuously updated currently. Raw result rows must retain their source capture timestamp, not be backdated.
- Existing Flashscore shadow: 4,394 entries; 2,630 flagged completed; 2,597 passed exact final-score / provider fixture, team and league ID / timestamp filters at inventory. 2,596 compact rows were inserted after strict database constraints; one candidate did not qualify at insert time.
- The new persistent `private.ft_verified_flashscore_results` is approximately 1,136 kB INCLUDING indexes, covering 2,596 verified final scores in 481 native Flashscore leagues; no additional provider crawl, cron or Railway service. First-seen source timestamp is preserved and rows are immutable on matching provider ID.
- Flashscore source details for 243 finished matches contain a *potential* corner score; only 53 satisfied the conservative post-kickoff+120min, final-state and exact-ID tests. They are archived as nullable per-side corners with evidence time, NEVER as missing=0.
- Reused existing hourly job #48 to persist compact result observations BEFORE deleting active fixtures, and to purge >730-day compact archive. Its other maintenance remains intact; total active jobs = 8. RLS and private function permissions deny anonymous/authenticated direct execution.
- A bounded private `ft_native_model_training_slice(source,league,asof)` returns at most 250 entries, from either native Flashscore provider IDs or original Football-Data league+club names. Both sources require result played and **captured before requested prediction as-of**; they are not blended using guessed aliases. Example: English Championship E1 returns 95 observed matches, while a tested Flashscore native league returns only 5 and flags it insufficient.
- The model module `lib/fast-tracker-native-model.mjs` consumes exactly those rows. It trains a league-relative shrinkage Poisson scored-goal baseline, returns H/D/A, O/U 2.5 and most likely score from one normalized scoreline grid; observed corners O/U 9.5 is computed from *actual corner observations only* and remains null otherwise. It rejects unknown IDs, stale/sparse source, source captures after as-of, and post-kickoff requests. No bookmaker/Forebet forecast features enter the model.

## Retrospective evaluation — NOT a live proven win rate
An initial chronological-by-match-day, 4-league experiment used games strictly preceding each evaluation date (40+ league training matches, minimum two home/away context fixtures). This is **retrospective replay**, not immutable real-time predictions; source files were imported after historic matches.
| football-data league | evaluated fixtures | shrinkage model multiclass Brier (lower better) | league-only prior |
| --- | ---: | ---: | ---: |
| E1 | 47 | 0.6496 | 0.6611 |
| E3 | 54 | 0.6209 | 0.5966 |
| EC | 95 | 0.6191 | 0.6426 |
| SP2 | 39 | 0.6785 | 0.6559 |
| **Combined** | **235** | **~0.6355** | **~0.6379** |
The tiny aggregate improvement is NOT sufficient: 2/4 leagues underperform baseline. Do not describe this as accuracy improvement or optimize against the same holdout. A league-only model is sometimes better. This validates the need for per-league gates, time-forward data, and immutable prospective snapshots.

## Long-term architecture
1. **Identity:** Flashscore exact native fixture/team/league IDs for continuously observed result training. Football-Data league code and team names are independent; use only explicit, validated competition+club joins, never cross-league matching by name or HKJC.
2. **Outcome facts:** minimal 2-year append-only verified goals and a nullable subset of independently verified full-time corners. Historical Football-Data results supplement the early cold start but require a lawful, reliable periodic source updater before they can be considered fresh beyond autumn 2026.
3. **Model runtime:** the independent module consumes only the bounded, timestamp-auditable private training slice, preferably once per eligible fixture before kickoff. Training is blocked when source league <60, teams <6 each, or latest result >30 days. Outputs are explicitly `EXPERIMENTAL_UNCALIBRATED`.
4. **Prospective evaluation:** future prediction must be frozen before kickoff with model version, time, source IDs, market probabilities, quality gates, training cutoff, and no outcome leakage. Compare to league-only prior and, if allowed, bookmaker de-vigged baseline. Require >=100 verified finished forecasts PER relevant league/segment before any success/accuracy claim. Compare Brier, log loss, calibration, sample coverage, missing results and corner calibration.
5. **Safe promotion:** until genuine prospective quality is demonstrated, do NOT auto-populate `model_predictions.quality='MODELED'` or overwrite Forebet source. If a user chooses experimental views, label `Fast Tracker experimental`, never `Forebet`. Preserve existing public UI and probability-null semantics.
6. **Avoid operational bloat:** no extra crawler/cron job, no daily global alias matching, no repeat capture. Existing shadow + existing job 48 provide sustainable source ingestion at ~1.1 MB for several days' verified outcomes. Keep the private function bounded at 250 training rows per league/source.
7. **Corner risks:** only ~2% of source result rows have strong post-FT corner evidence now (53/2596), so long-term corners require improving accuracy/final-snapshot coverage of an *existing* scout (only after workload tests). Never pretend 243 mentioned-corner details are final or backfill incomplete counters.

## Tests / rollout / recovery
- Versioned migrations already applied to production: compact verified goals, private bounded training export, optional confirmed full-time corners, and training exporter inclusion of verified corners. Do not rerun on deploy.
- `npm run check:native` tests probability sums, scoreline grid, no-leak as-of, retrospective labelling, missing corners, source and league isolation, sparse history, post-kickoff and stale source.
- `npm run build` runs `check:native` and existing production acceptance; no app runtime code, live publisher, Web UI or Railway collector is changed by this PR.
- For rollback, disable the additions to job48 via `cron.alter_job` before dropping functions; retain verified compact result facts and RLS. Protect normal match deletion and Forebet 180-day history. Never switch HKJC back on.
