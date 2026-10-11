# FT-20261011 — Open football team-name download (safe reference)

## Delivered
GitHub Actions run 38101159022 succeeded on 2026-10-11. The one-shot task downloaded CC0 files from https://github.com/withqwerty/reep (no direct requests to Flashscore or Forebet). Output artifact ID 11688175864 is named `open-football-teams-cc0`, containing `reference_team_names.csv` and `manifest.json`.

Dataset validation: 45,337 team entities, 27,591 input alias records, 2,073 aliases linked to exactly one team Wikidata QID, and 47,407 distinct entity/name CSV rows. There were 241 distinct populated Flashscore provider IDs across the reference, which is far below complete Flashscore universe coverage.

File semantics:
- Primary or known Wikidata linked alias, source `REEP_CC0`
- Name, normalized key, country, Wikidata QID, Reep ID, Flashscore team ID when provided, FotMob ID when provided
- All reference rows have `identity_status=REFERENCE_ONLY`; **none may be equated to a production canonical fixture solely by text/name**
- No new Supabase table, no cron or producer, no services, no third-party access-control bypass.

## Production All-in-One master status
Earlier authorized backfill in PR #48: 118 Flashscore and 2 Forebet source-specific aliases inserted into `team_alias_registry_v2` and `team_name_master`, with per-event evidence. Remaining locally observed names: 506 unresolved Flashscore and 11 unresolved Forebet from the older stored snapshots. Those names require competition and stable provider identity to become VERIFIED; reference names are NOT guaranteed provider-named aliases.

## Correctness finding: Birmingham collision (2026-10-11)
The existing global alias “Birmingham” mapped to American Birmingham Legion for BOTH Flashscore and Forebet. Separately, the 2026-10-10 English Championship West Brom vs Birmingham City fixture appears in Flashscore as away “Birmingham”; a preexisting canonical fixture incorrectly displayed it as “Birmingham Legion.” Verified external fixture authority: https://www.efl.com/competitions/efl-championship/ and https://www.skysports.com/football/west-bromwich-albion-vs-birmingham-city/teams/560604.

Applied to production database:
1. Added one VERIFIED league-specific `FLASHSCORE, Birmingham, ChampionshipENGLAND` context mapping to UK entity `HKJC:birmingham`, with fixture identity proof.
2. Marked both source-global Birmingham=>Birmingham Legion mappings AMBIGUOUS in registry and All-in-One master, preventing global conflation of USA and England (2 + 2 records).
3. Preserved existing `FOREBET Birmingham, USA: Usl Championship` -> Birmingham Legion context.

Post-write verification: context resolver maps England Championship to `HKJC:birmingham`; Forebet USA USL to `HKJC:birminghamlegion`; global Flashscore Birmingham lookup returns no guessed team. Original canonical fixture row may still have the wrong displayed team and must be corrected separately through fixture authority without changing alias labels alone.

## How to improve match rate from the public reference
Reep references are supplementary identity evidence. Link only when a stable provider team ID or an exact unique competition+kickoff+two-team fixture identity independently confirms the mapping. A single ambiguous name, unknown time zone, or missing source ID must remain UNKNOWN. Source-global homonyms must use league/event context. Do not bulk-upload all 47k unverified names to the hot matching table: doing so would reduce speed and risk merging teams.
