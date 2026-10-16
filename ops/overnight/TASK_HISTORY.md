# Overnight task history

## FT-OVERNIGHT-001 — Forebet accepted forecasts missing from cards

- Start: 2026-10-17 01:59 HKT
- End: 2026-10-17 02:04 HKT
- Defect: fresh raw fixture snapshots omitted canonical fixtures that carried current accepted/tentative Forebet forecasts.
- Evidence: 16/67 accepted and 4/14 tentative IDs absent from 360 raw discoveries but present in the 475-row canonical summary; all provisional data remained current and kickoff matched.
- Change: append only missing valid `FLASHSCORE_CANONICAL` fixture rows by exact ID, preserving raw row precedence.
- Verification: full production build passed; public-flow Playwright 63/63 passed (mocked endpoints; desktop and mobile cases included).
- Git: branch `codex/overnight-001-forebet`; [PR #134](https://github.com/sargesticky-code/fast-tracker-app/pull/134), GitHub head `4b1fd8613719628400d063f48aedc5fca14080c0`; relevant exact-head workflows passed.
- Production: unchanged.
- Data impact: the local corrected pipeline can render 16 additional accepted and 4 additional tentative rows in this measured snapshot. Production impact is not verified until deployment.
- Blocker: review/PR and separately authorized production deployment.
- Next: FT-OVERNIGHT-002, inspect one-team matching counterchecks and automatic revocation.

## Scheduler registration

- Created active Codex heartbeat `fast-tracker-overnight-repair-through-09-00-hkt` attached to this task. Its 30-minute rule ends at 09:00 HKT on 2026-10-17; next run is 02:30 HKT.
- Paused the previous daily 05:30 Fast Tracker recovery heartbeat so two repair tasks cannot run concurrently. No further nightly schedule is authorized by this request.

## FT-OVERNIGHT-002 — Forebet identity counterchecks

- Start: 2026-10-17 02:29 HKT
- End: 2026-10-17 02:32 HKT
- Scope: read-only review of the production view, reconciliation function, audit trail, and current advisory rows; no database writes or deployments.
- Evidence: 76 current fresh/upcoming rows with 76 unique canonical IDs: 62 HOME/AWAY one-side rows and 14 SIMILARITY rows. All 76 have `is_verified=false`; zero source-clock deltas exceeded 60 seconds; zero Flashscore ordered-team or league mismatches; zero stale canonical fixture checks; zero overlaps with strict Forebet rows. Uniqueness is enforced by event primary key and partial unique active source URL index, with batch duplicate guards in the reconciliation function.
- Counterchecks: reconciliation validates source/target league and kickoff, exact ordered canonical teams, verified Flashscore identity freshness, and source identity drift. It promotes only strict two-sided records, never copies provisional forecast data into verified predictions, expires stale rows, disconnects identity conflicts, and revokes on missing rows only for fully rendered source dates. Current seven-day audit contained 25 stale expirations and 14 fuzzy admissions; no concrete defect was demonstrated.
- Fuzzy tier: the Edge feed maps SIMILARITY records to `TENTATIVE_NAME_SIMILARITY`, enforces both similarities in [0.30, 1] with at least one >=0.70 and a fixed similarity method, and leaves `acceptedForDisplay=false`.
- Change/verification: no code changes; inspected production metadata, view definition, SQL function, active rows, and audit counts using read-only queries. Production unchanged.
- Next: FT-OVERNIGHT-003, inspect existing BetClan/SportyTrader coverage and loss points.

## FT-OVERNIGHT-003 — BetClan and SportyTrader coverage path

- Start: 2026-10-17 03:00 HKT
- End: 2026-10-17 03:04 HKT
- Scope: inspected existing production observations, verified and provisional views, read-only public candidate function output, existing collector code/workflow, and frontend admission/rendering gates. No source collection was triggered.
- Evidence: `adviser_prediction_current` contains 1 future verified SportyTrader event; the 16 verified BetClan observations all refer to past kickoffs. Current public provisional function emits 2 rows (1/provider); 21 BetClan and 1 SportyTrader rows remain in the private provisional table, mostly past kickoff and correctly excluded. The frontend joins by canonical ID and enforces phase/kickoff/provider gates; no current feed-to-card loss was demonstrated.
- Largest source-side gap: 261/262 unmatched SportyTrader observations lack normalized kickoff, 253 lack competition; 185 are additional revisions across 77 source IDs. Only one unmatched observation has a future kickoff. Existing source evidence does not verify timezone for missing kickoffs. No alias, timezone, or association was inferred.
- Freshness: no adviser observations have been seen in the last 24 hours; latest existing source capture is 2026-10-15 17:15 UTC. The checked workflow schedules one capture per day at 13:30 HKT, but a GitHub scheduled-run lookup for 2026-10-16 13:00–14:00 HKT returned no adviser-source-capture run. Execution failure is not established; no manual run or schedule change was made.
- Change/verification: no code change and no production mutation. Read-only checks confirm public candidate output (1 BetClan + 1 SportyTrader) and current verified view; frontend gates inspected.
- Next: FT-OVERNIGHT-004, inspect PrimaTips/Statarea name identity cues on main cards and details.

## FT-OVERNIGHT-004 — PrimaTips and Statarea identity cues

- Start: 2026-10-17 03:30 HKT
- End: 2026-10-17 03:34 HKT
- Scope: read-only inspection of the public provisional candidate result and existing homepage/detail rendering code. No source collection was started.
- Evidence: current public function returned 193 PrimaTips and 160 Statarea provisional rows; none lacked source team names. Punctuation/case-normalized ordered names aligned exactly for 85 PrimaTips and 84 Statarea rows, with zero exact reversed pairs. Rows that differ are intentionally surfaced as `different` or `reversed` for review, not silently verified.
- Rendering: homepage external adviser chips and match-detail provisional cards both use `SourceTeamComparison`, which displays canonical Flashscore home/away beside each provider's original home/away and labels aligned, reversed, different, or incomplete evidence.
- Change/verification: no code change; production and data unchanged. Reviewed the current read-only function result and relevant component/helper code. No concrete display defect demonstrated.
- Next: FT-OVERNIGHT-005, inspect existing odds and match-statistics freshness and source-to-fixture mapping.


## FT-OVERNIGHT-005 — Odds and match-statistics freshness/mapping

- Start: 2026-10-17 04:01 HKT
- End: 2026-10-17 04:03 HKT
- Scope: read-only current database sample and review of existing feed freshness gates; no database writes or deployments.
- Odds evidence: 219 future `bookmaker_odds_current` rows; all fetched in the last 24 hours, all 1X2 prices complete and within 1.01–100. Every row joined to `flashscore_primary_fixture_current`; exact ordered English team names, kickoff within 60 seconds, and no terminal fixtures.
- Stats evidence: 15 rows remain in `live_stats_current`/feed, all carrying old LIVE statuses; newest capture is 2026-10-10 18:13 UTC and none are within 24 hours. They no longer join to the current canonical fixture view. This is stale retained storage, but existing public feed paths require recent live score/stat timestamps (5–10 minutes); app phase feed admits current captured stats at <=10 minutes and history fallback at <=20 minutes; match analysis also requires recent live evidence before entering live mode. No stale live-stat display defect demonstrated.
- Change/verification: no code change; read-only SQL aggregates/samples plus source inspection. Production and data unchanged.
- Next: FT-OVERNIGHT-006, inspect the existing HKJC live-layer dependency and guard path.


## FT-OVERNIGHT-006 — HKJC dependency and live-layer guard audit

- Start: 2026-10-17 04:28 HKT
- End: 2026-10-17 04:32 HKT
- Scope: read-only source, Supabase catalog/schedule, and Vercel deployment inspection. No live endpoint was invoked, so no new data was collected. No production changes.
- Remaining dependency: Vercel project `football-fast-tracker-live` has a READY production deployment (`dpl_2ihmx95NHsCGZ1mJaHvXteWnvYRh`) with a deployed `src/api/live_scores.py`. The deployment file contents include an `HKJC_CURRENT_CSV` default pointing to `football-fast-tracker/main/data/hkjc_current.csv`. The current backend checkout’s matching API code uses the HKJC live-target endpoint first and falls back to the same static HKJC CSV if that endpoint fails. The project is a live production deployment, though request traffic was not probed.
- Retired Supabase endpoints: `hkjc-native-probe`, `hkjc-live-direct`, `hkjc-upcoming-direct`, and `hkjc-live-targets` remain registered ACTIVE, but each deployed body returns HTTP 410 with `RETIRED_SOURCE_ENDPOINT` and names Flashscore as fixture authority.
- Supabase current paths: 12 active cron jobs; zero job command/name HKJC references. The deployed `ft_refresh_live_layer_guard()` reads `live_score_feed_current`, `live_stats_feed_current`, and related provider-neutral views. No HKJC references found in current public/private function bodies. Ten public views still contain legacy names/fields/source labels and require use/dependency classification before final acceptance.
- Replacement independence: prior FT-001/005 evidence showed the Flashscore canonical feed supplying current rows and all 219 current future odds fixtures, with exact team orientation and kickoff identity. Current job names include Flashscore detail refresh and cloud Bet365 ingest.
- Blocker/action: a production Vercel runtime still packages an HKJC-based source path. The code needs a separately reviewed migration to Flashscore-native live identity and deployment; runtime removal is not authorized in this unattended cycle. No calls, schedule changes, or infrastructure/function deletions.
- Workspace: `football-fast-tracker-overnight` remained on `codex/overnight-advisers-20261014`; all pre-existing dirty adviser capture files and untracked files were preserved.
- Verification: deployment metadata/file tree and deployed source read; Supabase function list/body, cron metadata, function definitions and view inventory read. No tests or code changes.
- Next: FT-OVERNIGHT-007, inspect current database/storage usage, retention schedules and backup evidence read-only.


## FT-OVERNIGHT-007 — Database size, retention, and Storage archive

- Start: 2026-10-17 05:00 HKT
- End: 2026-10-17 05:01 HKT
- Scope: read-only database/storage catalog, retention run history, archive workflow/source, ledger and object metadata. No data deletion or schedule changes.
- Database: `pg_database_size` = 396,151,955 bytes (378 MB). Largest relations: `phase2_match_lineup_evidence` 77 MB, `phase15_source_shadow_current` 49 MB, `phase2_players` 40 MB, `football_alias_supertable` 24 MB, `odds_snapshots` 23 MB, `private.team_alias_reference` 21 MB. Prior Oct 12 audit recorded 259 MB. `get_project` metadata did not expose storage quota; percentage toward the 80% target is unknown.
- Retention: jobs 45, 48, 49, 50 each had 24 successful runs in the last 24h; job 50 had 96 successful 15-minute refreshes. Job 44 succeeded once. Recent delete results included 3 private matches, 0 public matches, and 0 live-history rows. No retention changes were made.
- Archive mechanism: main workflow `.github/workflows/retired-storage-archive.yml` is scheduled daily at 02:00 HKT. It checks/types the Edge handler and runner, then on main uses GitHub OIDC, uploads to private Storage, reads back and SHA256-verifies, and only then commits/deletes exact source rows transactionally. Current archive ledger has 521 unique object paths, 104,063 archived source rows, 55,433,060 ledger bytes, valid SHA256 hex values, and 2 GitHub run IDs. All 521 ledger paths exist in `fast-tracker-ingest` with matching object sizes. `private.ft_identity_retired_rows` has zero rows. Latest ledger receipt is 2026-10-16 05:44:56 UTC.
- Exception: one 96,338-byte archive object at `retired/ft_identity_retired_rows/2026-10-16/bfd2b3d3c88ad54431e1e1c44ed9b92f056bc1b852d5fb3a12a86b14fc49094b.json` has no ledger receipt. It remains untouched; no contents were fetched. GitHub workflow-run listing was unavailable through the connector and was not retried.
- Change/verification: no code changes; read-only SQL and project metadata, workflow source, archive Edge implementation. Production and data unchanged.
- Next: FT-OVERNIGHT-008, inspect existing Supabase security/reliability evidence read-only; no auth/RLS/schedule changes.


## FT-OVERNIGHT-008 — Supabase security and system reliability

- Start: 2026-10-17 05:30 HKT
- End: 2026-10-17 05:34 HKT
- Scope: read-only Supabase advisors and grants, scheduled job results, and Railway production service/deployment status. No database, auth, RLS, schedule, or production changes.
- Security evidence: the Supabase advisor returned 97 `rls_enabled_no_policy` INFO findings (72 public, 13 private, 12 phase4) and one `extension_in_public` WARN for `pg_net`. For the 72 flagged public tables, anon/authenticated have no SELECT or write grants; anon also lacks schema usage on private/phase4. No public/phase4 SECURITY DEFINER routine was executable by anon or authenticated. The `pg_net` placement remains a reviewed hygiene item; no exploit path was demonstrated.
- Performance evidence: one unindexed FK and 18 unused-index INFO notices; no index or schema change.
- Reliability evidence: 12 cron jobs recorded 722 successful and zero non-success runs in the last 24 hours. Railway production reports `fast-tracker-dashboard` SUCCESS at commit `7420f65f38b1726a0dea2866ec42da8a8201fde0` and `fast-tracker-public` SUCCESS at `f6ac341b5e6d85ad7ad7dc9cdef4e360b7aa83a0`; no staged/pending work. Existing archive workflow OIDC boundary proof remains as documented under FT-007.
- Log limitation: Supabase source counts were returned, but a severity query used a nonexistent field and the subsequent bounded query failed with a backend error. No identical retry was made; recent log error-severity distribution remains unknown.
- Change/verification: no code change or production mutation. Advisor findings were counterchecked against table grants and RPC execution privileges; cron statuses and Railway deployments read.
- Next: FT-OVERNIGHT-009, inspect existing dashboard presentation for one concrete source-backed usability defect.


## FT-OVERNIGHT-009 — Dashboard presentation and test fixture clock

- Start: 2026-10-17 06:00 HKT
- End: 2026-10-17 06:06 HKT
- Scope: review the existing presentation and acceptance tests. No live UI or production endpoints were used.
- Presentation evidence: Featured is the default scope; Featured/Other are an exhaustive filtered partition with deterministic live/competition/kickoff/evidence/ID order; the Finished status filter provides access to ended matches; home and away use the same emphasis; source team names are rendered alongside canonical names via the shared comparison component. No UI defect was demonstrated.
- Verified defect: the shared `summary.generatedAt` test fixture was hard-coded to 2026-10-11. `verifiedSummaryMap` rejects canonical feed snapshots older than 20 minutes, so later test runs lost all mocked fixtures and could not exercise dashboard layout assertions. Changed the shared test timestamp to `new Date().toISOString()`.
- Verification: `npm run build` passed all repository contract checks and the Next.js production build. Focused Playwright checks for Featured/Other ordering and home/away emphasis passed 2/2 against `next start`, with endpoint responses mocked. The first attempts against `next dev` failed before hydration because Next 16 blocked the tests’ 127.0.0.1 HMR origin; those were treated as invalid harness runs and not product failures. No production API was called.
- Change: `tests/public-flow.spec.js`; overnight checkpoint and redesign handover updated. Published the commit through the GitHub integration to existing PR #134: `de051adf825f578091accf8223990d12b6dd18c1`. CLI push was unavailable because local Git credentials were not configured; branch update was a fast-forward guarded by expected head `2d3549fd87e7dd7ed536ba975f447c2d1bd7288f`.
- Production: unchanged; PR #134 remains open. After publication, GitHub reported `mergeable=false` for head `ad0505d26aa122ee681763f7d742e97f7f257d05`; the reason and exact-head CI were not inspected in this cycle and are the next task.
- Next: FT-OVERNIGHT-010, check exact-head PR #134 CI after this fixture-clock update; no merge or deployment.
