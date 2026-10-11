# Fast Tracker — source-first, 24h non-overlapping, durable design
**Checkpoint: 2026-10-11 HKT.** Supabase project: `hekqxhgjexzxnecwhyao`; GitHub `sargesticky-code/fast-tracker-app`; frontend production: `https://fast-tracker-public-production.up.railway.app/`; collector service: `fast-tracker-dashboard` under Railway project `496c4795-e8f6-4f54-9ab0-406981b41669`.

## Product contract (owner decision)
One dense Forebet-style table: date/time (HK), league, home/away, actual score/live, Forebet 1/X/2, **predicted correct score**, **average goals**, independent bookmaker prices, confidence/freshness and link to match detail. Unknown values are NULL/—. Never replace absent Forebet predictions with bookmaker odds or other models as if they were Forebet. Flashscore is identity/score/lineup/stats authority; Forebet is predictions; bookmaker provider is prices; FotMob enriches historical or squad detail. HKJC not odds authority.

## The simple logical flow
`Official permitted source read ONCE → immutable daily 24h snapshot → ID-first team alias lookup → exact kickoff/league/fixture crosswalk → existing canonical fixtures + phase1 feed → existing Forebet-inspired frontend`.

**Calendar window:** Asia/Hong_Kong midnight to next midnight, exclusive upper bound. One `(source_key, source_day)` unique snapshot, ON CONFLICT DO NOTHING. Every daily run targets the **next HK date** at 23:35 HK (15:35 UTC). Today's source data therefore cannot overlap tomorrow's 24h calendar window. Changes after the one-off capture (lineups, postponements, result) remain in existing `*_current` tables; those deltas may *legitimately* update a known event without repeating its immutable daily bulk snapshot. If a day's archive fails/has zero source data, write no empty fake snapshot, keep current live tables intact, and expose a missing-source condition.

## Storage & data flow implemented today
- ONE private archive `private.ft_source_day_snapshot`, RLS on, anon/authenticated revoked. Fixed 24h exclusive windows; payload JSONB contains **full original stored source rows including `raw` and `detail_raw`** and timestamps; content MD5 for idempotence, provenance, record counts. `coverage_complete=false` until source enumeration can be validated (do not promote a few rows to 'complete').
- Archived existing **2026-10-11 HKT** source data: **1,383 Flashscore rows** (shadow records, not brand new network crawl) and **20 Forebet stored prediction rows** (historical source backfill; NOT whole Forebet dataset). Verified same-day function retry inserts zero, date sources unique, private anon denied. Physical archive relation size ~1.2MB at first proof.
- Deployed `private.ft_archive_source_day(date)` function, SECURITY INVOKER, no execute for public roles. On fresh source rows it creates only previously absent source/day entries; caps rows to 5,000 per source/day; old archives cannot be overwritten by later failed fetches. Runs no browser/API.
- Activated cron job **40**, `ft-source-next-day-archive-24h`, `35 15 * * *` (UTC) = 23:35 HKT each day. It archives the already-captured source caches, *not* a new Forebet crawler. First next-day scheduled run has not yet been observed at this checkpoint. Monitor `cron.job_run_details` and `private.ft_source_day_snapshot`; verify natural next-day operation before promising full autonomous capture.
- Source canonical/master identity: `private.team_alias_reference` + `public.team_name_master` unified by `private.all_in_one_team_alias_lookup`. **58,073 source-reference rows** after inserting **2,831 existing FotMob team IDs** (219 with verified canonical links), alongside 47,407 Reep CC0 names and 7,835 Flashscore ID/name links. Forebet (953 VERIFIED name aliases), FotMob (581 verified names) and Flashscore (610 verified names) also remain in master. Reep identity is a reference, NOT automatically a verified Forebet/Flashscore alias; exact provider IDs take precedence, names require unique entity+competition+kickoff checks.
- Existing `phase15_source_shadow_current` contains Flashscore raw/detail with provider team IDs. Existing `ft_fast_flashscore_summary(48)` already joins canonical fixtures, Forebet where verified, fresh bookmaker odds and Flashscore recent match detail; public frontend CSS already styled like Forebet. Do not create a second duplicate match feed or extra collector.
- Existing hourly alias-maintenance job **11** was changed from hourly to **`45 15 * * *`** (23:45 HK; legacy jobname still says hourly). Observed previous 24h: 24 runs / five failures / max 138 seconds. This reduces **23 redundant alias-maintenance runs/day** while keeping same function, one run after archive. No new alias scheduled worker.
- Removed only already-disabled duplicate cron jobs **31,33**, after confirming active job 32 remains sole hourly forced Flashscore scout. No active live-score/odds/lineup ingestion deactivated. Reassess Phase4 scheduled sources separately before any removal; the source functions are not identical to these alias/archival jobs.

## Forebet real capture — actual tested blocker
- Reusable Forebet HTML reader/strict field parser was **merged in PR #47** (source in `scripts/forebet-lean-capture.py`, `scripts/forebet_lean_parser.py`; unit tests passed). It requires full 1X2 probabilities (sum approx 100), actual predicted score, average goals, real date, source evidence; unknown timezone cannot be silently converted to UTC.
- `https://www.forebet.com/en/football-tips-and-predictions-for-today` returned 403 from web.
- A legitimate alternate official public route `/index.php/en/football-predictions/predictions-1x2` appears in search/open results, but that is NOT proof a scheduled GitHub runner can access it.
- **One-shot GitHub Actions proof** run **38105701918** on 2026-10-11 from the optional `fix/forebet-official-public-route-probe-20261011` branch: Selenium/Chromium loaded, exact access attempt failed `FOREBET_ACCESS_RESTRICTED`. No Forebet JSON produced, no database writes; do not enable recurring this worker, automate clearance tools or call predictions complete. The experimental branch is NOT production.
- Previously considered GitHub Forebet scrapers have mixed quality: old 2023 selectors; 2026 repos relying on challenge/clearance sidecars. A parser library or a README-only hosted scraper is not evidence of authorized reliable public access. Avoid an unnecessary fourth crawler. Accept a documented permitted data feed / legitimate saved HTML snapshot / export if and when available, then publish through the verified normalizer. The production fallback is **NULL Forebet** with stale/missing badge, not fake current model probabilities.

## Real baseline and measurable acceptance
At 2026-10-11 around 02:23 UTC, `ft_fast_flashscore_summary(48)`: **98 current/recent canonical fixtures**, **20 Forebet scored 1X2 predictions**, **73 fresh (<20min) Bet365 H/D/A snapshots**, **20 Flashscore detail**. Source-shadow 4,107 Flashscore rows; 1,518 upcoming next 48h but only 82 originally canonical linked in future-only cohort, so don't claim that alias import alone fixed fixture coverage. The confirmed ID reconciliation from previous run restored 10 match details. Lineup coverage in same horizon still missing on 72 of 79 rows, seven complete predicted. No end-to-end desktop/mobile/tablet render proof during this checkpoint.

Acceptance to call the requested final solution done:
1. A real, permitted Forebet 24h source batch has rows (not 403) with 1/X/2, correct score and avg-goals, source timestamp+known timezone; demonstrate two **natural** different 24h non-overlapping runs (not re-importing stale examples).
2. Flashscore complete daily 24h fixture rows + stable team IDs are stored with raw provenance, with unknown detail fields distinguished from zero. Match against Forebet and advisor odds by provider ID/entity & league + kickoff. Don't silently force ambiguous homonyms.
3. One archive per provider HK day, exactly once, and live changes update only mutable current tables. One consistent provenance/freshness source per field; no duplicate scraper.
4. The public desktop, mobile and tablet Forebet-style rows actually display verified fields; systemHealth and coverage labels correspond to source records.
5. Monitor daily record counts, stale source age, content hash, provider failures and DB footprint. At ~1–2MB daily Flashscore raw data, one-year archives can use hundreds MB; review long-term retention/cheap object storage before large growth rather than silently exploding Postgres.

## Files committed
- `ops/sql/ft-20261011-24h-source-snapshot-archive.sql`
- `ops/sql/ft-20261011-daily-archive-24h-function-and-cron.sql`
- `ops/sql/ft-20261011-all-in-one-fotmob-provider-id-addition.sql`
- `ops/sql/ft-20261011-reduce-alias-maintenance-to-once-daily.sql`
- `ops/sql/ft-20261011-remove-disabled-duplicate-flashscore-jobs.sql`

## Safe recovery/rollback
- Daily archiver only: `select cron.unschedule('ft-source-next-day-archive-24h');`; archive rows left intact.
- Alias-maintenance old cadence: `select cron.alter_job(11,schedule:='10 * * * *');`
- Archive is private & additive. No old original provider tables were replaced, and no frontend deploy was initiated. Never truncate or delete the source data to roll back the view.
