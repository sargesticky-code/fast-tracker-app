# FT — Source authority and lean dashboard contract (2026-10-10)

This contract supersedes all earlier "collect everything" instincts. Owner explicitly requests useful data only, no HKJC, no wasteful provider overlap, minimal ongoing load and reuse of existing repository and public upstream code.

## Exactly four source lanes

| Display | Authority | Required data | Capture responsibility | Fallback |
|---|---|---|---|---|
| Pre-match / in-play H/D/A, O/U and AH odds | **OddsPortal** | source event, market, outcome, price, bookmaker, capture time, true in-play flag | ONE bounded snapshot collector, scheduled only for relevant active/upcoming matches | Unknown; do not relabel old Flashscore Bet365 as OddsPortal |
| Forebet prediction | **Forebet** | 1/X/2 probabilities, 1/X/2 tip, **correct/predicted score**, **average goals**, forebet match identifier and capture time | ONE bounded batch update; existing `forebet_predictions` and `forebet_prediction_current`, **no new prediction table** | Unknown; no probability derived from bookmaker margins or stale 2026-09-28 data |
| Match detail and lineup | **Flashscore** | period, score, xG, shots, on target, corners, cards, confirmed/predicted XI provenance, player identity | ONE source-specific scout; prioritize selected/current matches and detail requests, not all match pages | Unknown; player/FotMob optional, never block details |
| Live score | **Flashscore** | score, status, period/minute, observed time | integrate with same Flashscore match detail process, no second blanket crawler | status unverified; never synthetic live status |

FotMob is only for enrichment when a required field is genuinely absent. HKJC must not be fetched, referenced as a primary identity, or shown in user-facing labels.

## Existing work to REUSE, not rebuild

- Match identity: `team_alias_current`, `team_alias_registry_v2`, `team_alias_resolved_v2`, `fixture_identity_redirects`. Reuse the All-in-One alias lookup with exact teams, competition, kickoff, source event ID; ambiguous IDs stay unresolved. Never create a second match registry.
- Forebet: `forebet_prediction_current` already stores `predicted_score`, `avg_goals`, three probabilities, OU and corners. 525 stored rows held complete score/avg fields as of 2026-10-10, but latest `fetched_at` was **2026-09-28**. Restore its producer and freshness, not its schema.
- Existing `app/forebet-dashboard.css` contains a dense Forebet-inspired design; keep match rows compact and filters functional.
- Flashscore `phase15-flashscore-scout` and `app-match-detail` already parse observed match statistics; avoid loading full player profiles per homepage request.
- Existing code in `services/flashscore-odds-collector` is a legacy Bet365 HDA source and should be phased out only AFTER verified OddsPortal cutover. It is NOT an OddsPortal producer.
- OddsPortal implementation candidate: `jordantete/OddsHarvester` (MIT, Playwright, 1x2, BTTS, O/U, AH). Reuse and test before deploying; check source usage terms. No new Railway service/cost until existing capacity and coverage verified.

## Minimal architecture (no new capture duplication)

1. Source adapters capture **one compact timestamped source snapshot** each; deduplicate on (provider,provider_event_id,market,selection,captured_at), ignore unchanged captures.
2. A single canonical alias resolver maps events, quarantines ambiguous identities; never infer canonical from odds alone.
3. Existing Supabase persistence stores only current verified evidence plus necessary lineage; do not create multiple source-shadow layers.
4. Dashboard reads one **bounded, indexed summary** for rows. Detail route independently loads only requested match; optional model, FotMob or profile calls must not block core teams/score.
5. In-play odds must be verified at their source and independently fresh; pre-match price may not masquerade as live.
6. Split operational health into: provider capture, ID match, publication, display. Green cron status alone is NOT data freshness. Monitor source freshness and rendered browser, not only HTTP 200.

## Phased acceptance

- **A — stabilize and simplify:** Remove duplicate capture/callbacks, preserve baseline and correct stale-data gates. Verify browser with exact source label; never blank the page because optional data is unavailable.
- **B — Forebet first:** Current Forebet probabilities, predicted/correct score and average goals in same compact row, with captured times and canonical ID; verify ≥3 sample rows against source.
- **C — OddsPortal:** Verify actual 1X2 and at least one additional market on ≥3 named exact upcoming matches; then make OddsPortal the sole authoritative odds provider, disable legacy bookmaker capture and publication, and verify rolling freshness.
- **D — Flashscore detail/live:** Verify ≥3 recent + ≥3 upcoming matches with source-confirmed score/stats/lineups; unknown stays unknown.
- **E — operational:** Monitor three natural cycles, clean up dead jobs only after coverage parity, and run desktop/tablet/mobile acceptance.

**No claim of completion until all gates are visibly verified. No HKJC. No extra provider, dashboard panel, database table, or infrastructure without evidence that the specific requirement needs it.**

## 2026-10-10 19:35 HKT — read-only source pilots and production truth checks

This checkpoint supersedes any earlier suggestion that Forebet or OddsPortal capture was restored. The two sources remain **UNVERIFIED / NOT CUT OVER**.

- Forebet: separate `football-fast-tracker` draft PR #40 (branch `fix/ft-forebet-canonical-lean-20261010`) reuses `scrape_forebet.parse_forebet_rows` and reads the existing public canonical summary. It requires exact team names and an explicit timezone-aware provider kickoff, checks all three probabilities, predicted score and average goals, rejects ambiguity, and writes only a local `/tmp` dry-run candidate. Its 6 Python regression tests passed in GitHub run `38048414545`. The sole GitHub-runner source attempt returned **Forebet HTTP 403** on 2026-10-10, with **no production prediction writes**. After this evidence, the source probe became strictly manual-only; do not bypass access controls or turn on a schedule. Existing `forebet_predictions`: 525 stored historical rows, all with HDA/score/average goals but most recent `fetched_at` **2026-09-28**.
- Crucial FK check: all 251 active canonical fixtures in the next 48h had matching `matches` and `forebet_availability` rows, including 242 `FS:` fixture IDs. Legacy `hkjc_event_id` column **names** are not evidence of HKJC source dependency for these rows. The producer is the blocker; do not drop existing FK columns as a speculative fix.
- OddsPortal: existing upstream `jordantete/OddsHarvester` commit `eefcaddac2aa6462ad2e03a1bd361ea4404b364e` was inspected using real checked-in football JSON fixtures. New `lib/oddsportal-candidate.js` and `scripts/check-oddsportal-candidate.mjs` validate full 1X2 bookmaker boards and source capture freshness, keep `canonicalMatchId:null` and `identityStatus:UNVERIFIED`, and do **not** write prices, create aliases or deploy a scraper. The old provider is **not cut over**.
- **Source terms:** OddsPortal publicly prohibits unapproved scraping, automated requests and content reuse in its terms. MIT licensing of a scraper does not license the provider's data; do not activate bulk scraping or commercial/public reproduction without suitable authorization. Forebet also returned a direct access refusal.
- Operational read-only evidence at **2026-10-10 11:28:58 UTC**: 0 fresh HDA quotes within 20m; last stored bookmaker capture `11:08:25 UTC`. Cron job 38 recorded 12 successful runs in the preceding hour while quote freshness still failed. Scheduler success/health heartbeat `OK` cannot be equated with fresh source publication. `app-phase1-feed` fast summary on this PR now marks public bookmaker health `NO_FRESH_PRICES` when there are summary matches but zero usable fresh HDA boards; this is **branch code, not deployed production verification**.
- Storage: `odds_snapshots` ~23 MB / ~28,457 rows; `forebet_predictions` ~1.16 MB / 525 rows. This does **not** justify paying for or operating a second live database. Do not add a new DB, Railway service, alias registry, shadow data layer or repeated crawler on speculative capacity concerns.
- Keep existing snapshot collector and single canonical identity flow stable. Live scores and player details remain separate Flashscore responsibilities; FotMob only fills proven gaps. No extra recurring fetch was enabled in this pass.

**Next gates:** verify an authorized usable Forebet feed against three real source events, then OIDC publication and end-to-end public UI; verify legally usable OddsPortal data and three strict alias-bound markets before any bookmaker cutover. Validate natural scheduled freshness, dynamic health, and rendered desktop/tablet/mobile pages. Until then missing data remain unknown, not zero.
