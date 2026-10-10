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
