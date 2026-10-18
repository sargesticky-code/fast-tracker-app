# Phase 13 — Four-adviser unmatched audit and reject/undo design
**Production snapshot:** October 18, 2026, ~01:40 UTC. Evidence: read-only Supabase SQL against `hekqxhgjexzxnecwhyao`. Counts depend on the rolling 36h–72h fixture windows and will change after kickoff.

## Provider source inventory (not a future-coverage percentage)

| Provider | Stored source records | Verified source observations | Unmatched source observations | Upcoming/current matching |
| --- | ---: | ---: | ---: | --- |
| BetClan | 263 | 42 | 221 | 23 upcoming unmatched: 15 **already provisional**, 8 no qualifying counterpart |
| SportyTrader | 353 | 3 | 350 | 345 of 350 unmatched lack source-confirmed kickoff. All 5 with kickoff are old, none upcoming |
| PrimaTips | 893 | n/a | n/a | 331 fresh source-date records: 221 provisional, 110 not linked |
| Statarea | 1,221 | n/a | n/a | 289 fresh source-date records: 148 provisional, 141 not linked |

The verified observations include past matches; don't equate 42 BetClan stored verified observations with currently visible future fixtures. The 25% minimum is a **source-name similarity gate for provisional review**, not a correctness probability. Never lower existing validation of oriented home/away teams, verified source kickoff, one-to-one source/event mapping or calibrated clock agreement.

### PrimaTips / Statarea — 251 current source rows not linked
A bounded **date ±1 day and oriented home/away ≥25%** Flashscore evidence scan found:

| Provider | No name candidate in date window | Exactly one name candidate in date window | Competing candidates |
| --- | ---: | ---: | ---: |
| PrimaTips | 59 | 51 | 0 |
| Statarea | 112 | 29 | 0 |

The **80 potentially recoverable** name/date pairs are **NOT yet matched**: the same exact verified kickoff and supported country/competition/clock calibration must still be validated. A subsequent production probe using the currently stored per-provider/per-date calibration offsets, a ≥0.5 league-similarity gate and ≤60-second source-to-Flashscore kickoff tolerance found **0/110 PrimaTips and 0/141 Statarea remaining unlinked source records passing those combined checks**. This is a real source-time/competition coverage gap; do not count the 80 day/name pairs as actionable confirmed matches. Investigate by provider/source_date, existing calibration offset and each candidate's time delta. If calibrated time is absent/uncertain, keep unmatched. The **171 no-name-candidate** rows first need genuine Flashscore fixture coverage, a fixed source parsing field, or an independently proven alias record — not invented clock offsets or random same-day clubs.

### BetClan — eight currently unlinked despite a scheduled kickoff
The source IDs are `1504584` (BK Olympic–Utsikten, Sweden Ettan Södra), `1505302` (Piteå–Sollentuna, Sweden Ettan Norra), `1504582` (Kristianstad–Trollhättan, Ettan Södra), `1505301` (Hammarby Talang–IF Karlstad, Ettan Norra), `1498890` (Deportivo Morón–Atlético Mitre, Primera Nacional), `1498888` (Club Atlético Güemes–Almagro), `1498893` (Godoy Cruz–CA Estudiantes), and `1498896` (San Martín SJ–Temperley).

The matches take place at times also shared by OTHER Flashscore fixtures; a same-kickoff JOIN alone does NOT prove the source match is in Flashscore. Search the canonical fixture listing by both oriented names, league and day, and only repair a verified provider competition alias if there is a unique genuinely corresponding target. The other 15 upcoming unmatched source events are already in the provisional tier; one uses `ODD Ballklubb` vs `Odd` but is linked uniquely to `FS:UilQ56TQ` with league and exact kickoff corroboration. Do not count those 15 as entirely inaccessible.

### SportyTrader — upstream data, not alias threshold
Five historical unmatched items have independently verified timezone-aware kickoffs; **345 unmatched have none**. The collector's Phase 11 change already prioritizes the same capped eight linked-event page fetches toward useful fixtures, without more HTTP calls. The next actual capture must be checked for verified timestamp count. If it remains low, inspect the captured HTML saved as linked source-evidence artifacts and determine how to extract `SportsEvent.startDate` independently. Do not guess timezone from HTML page display.

## Durable human review & rejection
- `/details?id=FS:<id>` displays each provider's original home and away team names and predictions, with **Reject pairing locally**, **Undo local rejection**, and **Copy correction report**.
- Browser-local rejects hide that provider's prediction **only on the same browser** and persist via `localStorage`. They do NOT submit authenticated or public API requests and are NOT a project-wide deletion.
- The copied report carries the complete exact tuple `(provider, canonical_event_id, source_url)` and source/canonical team names. The user can paste it back into their project chat, enabling human verification without logging into the public website.
- After explicit confirmation, the administrator stores the tuple under `private.ft_adviser_pair_rejections` using restricted SQL. The unique tuple is checked by both periodic provisional rechecks and both public read RPCs. Raw observed predictions remain available for forensic checks; false links do not reappear on the next scheduler cycle.
- This table has RLS enabled and NO `anon`/`authenticated` writes; there is no unauthenticated dashboard POST route, shared review secrets, or auto-verification of rejected predictions.
- A verified prediction's local rejection is **report-only** for the shared data: a verified source record requires a separate provenance/audit correction before production removal or canonical identity change.

## Smallest next actions
1. Audit the 80 extra-adviser day/name candidates against existing calculated 10+-event clock offsets (90% agreement) and same-league identity. Prefer no extra scraping: use existing source records and Flashscore schedule.
2. Check the eight BetClan items against Flashscore verified actual team/event identities; don't invent low-league matches where the primary source is missing.
3. Check next scheduled SportyTrader source capture for the number of source-timezone-verified linked pages and closed 345-item gap; improve collection from **real** source evidence rather than relaxing similarity below 25%.
4. When a user reports an incorrect Details pairing, add the exact tuple to the private denylist, rerun the already-existing recheck functions, and compare public read counts. Don't delete source observations or promote a candidate into model accuracy.
