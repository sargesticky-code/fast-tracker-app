# FT-20261009-015-R1 production scheduler audit
All times UTC 2026-10-09. Read-only production evidence; no manual calls, replay, migrations, deployments, changes or expense.

## Repository and CI
PR44 verified starting docs head `031ee7161d232b7e9395167e002a30a843cd60e2` via GitHub compare against `refs/pull/44/head`: identical, ahead/behind 0. Previously tested application/test head `418d09cd7bc6a34ae44ed42d3cc579733528b2c6` as documented in FT014. Workflow CI #535 / run `37881891681`, checked GitHub job: completed **failure** at "Fail acceptance job when browser assertions failed". Static build and rendered flow steps passed; overall 25/34 remains reported red; NOT A GREEN RELEASE.
Production Supabase project `hekqxhgjexzxnecwhyao`.

## Actual active schedules
- job 38 `flashscore-bet365-cloud-ingest`, `*/15 * * * *`, pg_cron command `net.http_post` to `/functions/v1/flashscore-bet365-ingest`.
- job 23 `phase4-market-refresh`, `0,6,12,16,20,26,30,36,40,46,50,54 * * * *`, `select phase4.refresh_core();`. 04:00/04:06/04:12/04:16 runs are **84404/84414/84430/84438**: distinct from job38; never count as ingestion.
- job 15 `phase3-identity-registry-1min`, `9,19,29,39,49,59 * * * *`, `select public.ft_refresh_phase3_identity_registry();`.

## Scheduled job-38 runs and correlation
| Cron run | UTC start -> end | net HTTP response | downstream Edge/RPC | staged / verified / unresolved / ambiguous | decision |
|---|---|---|---|---|---|
| 84375 | 03:45:02.888880 -> 03:45:03.998152 | 43482: timeout | commit RPC HTTP **500** at 03:45:10.173; no demonstrated success | unknown / unknown / unknown / unknown | NOT qualified |
| 84405 | 04:00:00.356878 -> 04:00:00.425306 | 43497: timeout | commit RPC HTTP **200** at 04:00:05.416, Edge Function HTTP **200** at 04:00:08.154 | unknown / unknown / unknown / unknown | processing evidenced, but historical per-run persisted writes not attributable; NOT fully qualified |
| 84437 | 04:15:00.093471 -> 04:15:00.114588 | 43516: timeout | commit RPC HTTP **200** at 04:15:02.736, Edge Function HTTP **200** at 04:15:05.648 | unknown / unknown / unknown / unknown | processing evidenced, but historical per-run persisted writes not attributable; NOT fully qualified |
| 84466 | 04:30:00.086133 -> 04:30:00.109897 | request ID not independently correlated | commit RPC HTTP **200** at 04:30:03.226, Edge Function HTTP **200** at 04:30:06.646 | **186 / 182 / 4 / 0** in contemporaneous health state | **1 qualifying cycle**, with below caveat |

Source and persistence for 04:30:
`public.source_health` source `FLASHSCORE_BET365`, metric `cloud_ingest`, status OK, value_text 182, observed_at **04:30:03.890149**; raw: staged 186, verified 182, unresolved 4, ambiguous 0, alias_resolved 15, fixture_staged 360, market_refresh.rows 546, movement_refresh.rows 182, canonical_created 0, captured_at **04:17:25.742046**. `public.flashscore_bet365_current`: **186** records with max updated_at **04:30:03.069**, captured_at **04:17:25.742046**. This proves recorded downstream data and provenance but the snapshot was from before the collector invocation. `source_health` is overwritten current state, NOT historical count proof for 04:00 or 04:15. `public.ingest_runs` returned zero latest records. No immutable request ID associated with persisted writes was identified.

**Conservative full-cycle count: 1.** Do not inflate this based on pg_cron success, HTTP enqueue, HTTP 200 alone, or unrelated job23. Earlier 04:00 and 04:15 might have successfully processed but lack enduring per-invocation counts and attribution. Avoid fabricating missing fields.

Failure preserved: job 15 run **84422** failed 04:09:00.084972–04:09:00.175450 duplicate constraint `phase3_live_identity_map_source_source_match_id_key` on `(FOOTBALL_LIVE_API_SELF_HOSTED,5103646)`; also 84444 (04:19), 84464 (04:29) same failure. Separate from job38.

Next natural job38 executions **04:45, 05:00, 05:15 UTC**. Wait >=10 minutes between future external ingestion/CI checks; do not invoke manually. Next: correlate native per-cycle source_health history if available or identify immutable collector/result identifiers and per-cycle downstream writes without changing production. Last operation before checkpoint: read-only scheduler, net HTTP, unified Edge/RPC logs, source_health + current table and GitHub PR/CI verification.
