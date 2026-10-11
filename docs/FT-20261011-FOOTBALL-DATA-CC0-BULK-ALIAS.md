# 2026-10-11 Bulk team aliases — source-first checkpoint

**Production Supabase applied.** No new cron / external HTTP calls for this change.

Existing Football-Data job #18 already holds 1,385 2026/27 completed matches (22 league CSV files, 398 unique names). Optional latest-fixtures download returned HTML, not usable CSV. These historic prices are **not live odds**.

Imported into the EXISTING private.team_alias_reference & all-in-one view:
- FOOTBALL_DATA_CSV: 398 league-scoped name keys, **229 canonical verified** (225 cross-source consensus, 4 previously verified FD).
- OPENFOOTBALL_CC0: 176 names from 9 CC0 2026/27 + Brazil 2026 JSON files, 18 linked.
- OPENFOOTBALL_CLUBS_CC0: 997 aliases from **partial** England/Germany CC0 club-name groups, 446 linked. **NOT all 101 national files**. Removed exactly 130 duplicate short-key entries when full-path equivalents existed.
- Existing REEP_CC0 47,407 aliases, Flashscore Team ID 7,835, FotMob Team ID 2,831. Applied unique provider-ID group consensus to grow their verified links respectively to 1,021 / 568 / 503.
- Total source-reference aliases **59,644**, plus existing verified master names. BetClan, SportyTrader, Forebet source names remain in master.
- Unverified names remain REFERENCE_ONLY, not zero nor a forced identity. Local DIV/CLUB identifiers are grouping keys, NOT invented official provider IDs.

Added function private.ft_sync_football_data_aliases() to reuse already-stored CSV data, with no source downloads. Rerun showed **new_alias_rows=0, source_requests=0**. Original cron #11 (23:45 HKT daily) now invokes private.ft_daily_alias_bulk_and_health(): CSV incremental sync + unchanged original alias maintenance. No extra hourly job. Source CSV remains daily job #18. EXPLAIN one indexed name lookup: 0.147 ms (individual sample only).

Polymarket public API is already integrated, 814 captured events / 1,579 quotes / 539 mapped matches / 69 active quote rows at verification time. Market consensus is not an independent tipster prediction. Do not add a fourth crypto collector; phase4 jobs 25/26/28 already exist. Other possible public-API sources: Manifold and Kalshi, but soccer three-way H/D/A actual coverage remains unverified.

Keep existing frontend and odds authority. Historic HKJC-prefixed canonical team keys are legacy identifiers, not HKJC odds usage. No new scrape/bot traffic to Football-Data; its current usage statement restricts automated bots.

Recovery: cron.alter_job(11,command:='select public.ft_alias_maintenance_v2();') restores old daily job behavior. Never drop original source tables.
