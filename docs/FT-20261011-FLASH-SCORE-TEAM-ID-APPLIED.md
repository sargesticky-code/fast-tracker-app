# FT — Flashscore existing provider TEAM IDs → All-in-One (2026-10-11)

## Live result — production Supabase applied
Project: hekqxhgjexzxnecwhyao. All operations were bounded, index-friendly and **re-used existing tables**.

1. Existing `phase15_source_shadow_current` already has both stable `home_external_id` and `away_external_id` on **4,107 Flashscore source events**, equating to **7,807 distinct case-sensitive team IDs**. This discovery supersedes previous assumption that team IDs needed to be scraped again. **Raw `AU` is not a team ID**: observed values include 0, 1, 3. Actual source team IDs were already extracted by deployed `phase15-source-scout` v10, e.g. `xYe7DwID` is Brentford.
2. Existing `team_name_lookup` verified source-name mapping + exact stored ID associations admitted **351 stable team IDs mapping to 335 canonical teams**. Both `team_alias_registry_v2` and `team_name_master` received **351** new `FLASHSCORE_TEAM_ID` VERIFIED rows. Source IDs are preserved in `alias/source_name`; lowercase normalized key is safe in the current dataset (0 observed lowercase collisions). Conflicting target assignments are always rejected.
3. Exact Flashscore event ID + kickoff UTC equality + both source team names matching between independent `flashscore_fixture_current` and `phase15_source_shadow_current` permitted **264 / 360** existing fixture raw JSONB records to be enriched with `flashscore_home_team_id` and `flashscore_away_team_id`, including `team_id_origin` and source timestamp. Did not alter canonical match ID, fixture status, odds, captured_at or provider requests.
4. Five source-name variants became safely verifiable via the *same already-verified stable team ID*: **Al Ain (Uae)**, **Al Gharafa (Qat)**, **Al Wasl (Uae)**, **Gamba Osaka (Jpn)**, **Kyoto (Jpn)**. Added 5 to existing `FLASHSCORE` registry/master. No approximate name merging.
5. Post-production resolver sample: `ft_resolve_team_name('FLASHSCORE_TEAM_ID','xYe7DwID')` returns Brentford with confidence 0.97. Verified source ID key collisions = 0.
6. Replayed all three SQL files: **0 additional rows each** (idempotent).
7. No new table, migration, index, HTTP request, source capture, API subscription, cron, service or Edge deploy. Provider aliases previously repaired for Birmingham UK versus USL remain protected.

## Important remaining acceptance
- `phase15-source-scout` v10 is live on the existing 6-hour job and has already persisted source stable IDs. `flashscore_fixture_current` is another, older publication path: its 360 fixture rows were most recently sourced on 2026-10-09 14:57 UTC, while source-shadow rows extend to 2026-10-11. The 264-row raw enrichment is **not** a guarantee that future fixture upserts preserve those JSON keys. Implement additive source-ID pass-through in whichever verified fixture producer is active, and verify a natural post-run cycle before claiming automatic freshness.
- Existing older global alias collision for Birmingham was quarantined; the previously written bad canonical fixture display for Championship England still needs separately authorized identity correction. Never cross-map to Birmingham Legion based on the city alone.
- Reep CC0 reference catalogue downloaded in PR #49 has 47,407 entries but only 241 distinct populated Flashscore IDs, so it does not fill all 7,807 source IDs. Keep that catalogue outside the hot verified master until unique provider ID and canonical-team correlation are proven.
- Source ID mapping is **not** same as Forebet prediction coverage or 100% canonical match rate. Unknown status remains unknown.

## Auditable, idempotent SQL
- `ops/sql/ft-20261011-verified-flashscore-provider-team-id.sql`
- `ops/sql/ft-20261011-attach-provider-team-ids-to-fixtures.sql`
- `ops/sql/ft-20261011-team-ids-promote-safe-name-variants.sql`

Next most effective work: preserve exact provider ID data in any future Flashscore fixture updates (without starting another scheduler), then resolve fixture identities by same event ID, timezone-known kickoff, both team IDs and league, rejecting any target collisions. No broad fuzzy or guessed 100% rate.
