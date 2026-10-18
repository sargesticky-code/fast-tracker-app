# Phase 50 — Existing Football-Data names in the all-in-one alias table

## Root cause
Production contains 3,960 football-data.co.uk result rows from 22 league codes, **417 distinct league/team source names**, but `football_alias_supertable` has **zero source='FOOTBALL_DATA' names**. An older sync path `private.ft_sync_football_data_aliases()` imports into a different `private.team_alias_reference` table, invisible to the private native-model E1 freeze function that joins the supertable. This is a source-inventory architecture gap; model output cannot be activated merely by importing names.

## Idempotent fix
`public.ft_sync_fd_super_alias_inventory()` runs with service_role only. It reads **already-ingested** Football-Data RESULTS, checks 20–30 league codes, 300–1200 team-league pairs and zero normalized-name collisions, and inserts all Football-Data source names into the existing public supertable with `source='FOOTBALL_DATA'`, competition code (E0, E1, ...), provider's original team name and `resolution_status='UNMATCHED'`, `confidence=0`, no verified/suggested team key, no provider-native fake ID. Existing source rows are not changed. `ON CONFLICT DO NOTHING` makes repeat execution safe.

The existing `football-data-direct` source collector already captures these 22 CSVs once daily. When a **complete** daily run actually upserts changed result rows (and never for ad-hoc history backfills), it calls the inexpensive local alias-inventory RPC **once**. There are zero extra HTTP source requests or new cron jobs, and no daily expensive football-team identity matching. Source health `FOOTBALL_DATA/alias_inventory` reports success/error separately from ingestion heartbeat.

This is only phase one of repairing form and experimental Dixon–Coles/Power Index coverage. **No identity is promoted until verified within a native Flashscore competition and exact oriented team match**, with manual exceptions/confirmations as the owner prefers. Don't silently equate a Premier League in Armenia with the English Premier League, nor `Manchester Utd` with `Man United` without independently grounded alias evidence.

## QA
- Before: `FOOTBALL_DATA` supertable rows 0, distinct source names 417, leagues 22.
- After one service_role import: ~417 `UNMATCHED` rows, 22 leagues, **zero verified links**; read-only anon/authenticated DB grants remain denied.
- No changes to Flashscore fixtures, Forebet forecasts, raw odds, lineups or model_predictions/form_predictions; preserve historic source evidence.
- CI source contract and full Next build. Production deployment only after gate passes and expected current football-data-direct Edge source v11 identical to release has been verified.
- Follow-up: verified exact native team-to-source links to activate prospective models; no model accuracy claims until out-of-sample validation.
