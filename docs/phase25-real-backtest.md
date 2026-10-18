## Phase 25: actual stored-results evaluation adapter

New authenticated `football-data-backtest` Edge Function reuses the private Vault-backed cron credential RPC. No public CORS and no write grants to frontend clients. Call only from internal operator tooling with a POST and `?league=E0` (also D1, SP1, I1, F1, N1, P1). It reads up to 600 SQL `football_data_matches` rows for one league from source_kind RESULTS, returns only aggregate Brier and log-loss versus league-only baseline and skipped-count diagnostics, never stores predictions.

The `first_seen_at` column is used as the genuine database provenance timestamp; it is *not backdated* to previous kickoffs. Even when a historical match played earlier than an evaluation target, newly backfilled files cannot claim those earlier predictions were actually issued. Each evaluation is prominently `RETROSPECTIVE_ONLY`.

The 20-fixture maximum protects Supabase free-tier CPU; one league per request; the explicit allowlist avoids Austrian/German or other league collisions. Results are experimental even if retrospective performance appears better than baseline, and insufficient samples remain unavailable. No HKJC, no new cron, no public accuracy stats, no change to ordinary Match Details API.

Any long-running production benchmark should be a manual operator request with slow repetition and monitoring. Before advancing to real prospective validation, freeze each new prediction and training source snapshot before kickoff and evaluate only truly out-of-sample data.
