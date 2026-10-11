# FT-20261011: FULL football alias catalogue — production imported

## What changed (completed)
This is the requested bulk import, not another partial 800-name backfill.

- Public-domain source: `withqwerty/reep` (CC0), retrieved once through GitHub Actions run `38103300374`, success.
- Original source record counts: **45,337 unique Reep teams**, **47,407 names/aliases** (45,337 primary and 2,070 additional aliases). Manifest SHA-256 over immutable 24 chunk payloads: `2775541929edcb9e43c0180dcb8d542d3b80a69e22e33ad4f722eb313a906457`.
- GitHub `ops/reep-full-20261011/chunk_001.json` ... `chunk_024.json`: all original source rows, 2,000 per batch, final 1,407. Each JSON record includes Reep stable entity ID, name, country, Wikidata QID, Flashscore team-id string where provided, FotMob ID where provided, and primary/alias role.
- Supabase `hekqxhgjexzxnecwhyao` **private.team_alias_reference**: all **47,407 Reep rows** imported, not filtered by a small canonical master or removed if unrecognized. Source `REEP_CC0` and provenance `REEP_CC0_20261011_FULL_CATALOGUE`.
- **7,835** source-observed Flashscore `team ID + name` rows imported directly from existing 4,107 `phase15_source_shadow_current` fixtures (7,807 unique source team IDs). No extra Flashscore crawling.
- **55,242 total records**, only **17 MB** including indexes (as of verification).
- Linked known canonical IDs without guessing: Reep **431 teams / 827 names**, Flashscore **351 source IDs / 356 name variants**. Remaining names/teams stay `REFERENCE_ONLY`, available for future ID lookup, not discarded.
- Source names duplicated across real entities: **923 normalized Reep name keys** intentionally retain multiple team IDs. Name-only ambiguity is NOT silently resolved to one club.
- Actual collision sample: Liverpool name returns two Reep entities; source ID remains the disambiguator. No synthetic team entities, no global fuzzy merges, no takeover of verified canonical rows.
- Idempotence: replaying chunk 001 added **0 rows**. All other chunks used the same composite key `(source,external_team_id,source_key)` and `ON CONFLICT DO NOTHING`.
- The existing verified master `team_alias_registry_v2` / `team_name_master` remains intact, with a unified private `all_in_one_team_alias_lookup` that reads both verified master and full source reference in one SQL query.
- Private schema, security-invoker read view, RLS enabled, anon and authenticated cannot access table/schema. No public API credential.
- Source and name ID indexes: `(source,source_key)`, primary `(source,external_team_id,source_key)`, optional Flashscore ID/canonical key partial indexes.
- Index timing sample (warm cache): Reep name `Liverpool` ~**0.263 ms** and Flashscore provider ID `xYe7DwID` ~**0.183 ms**. Not an API/website latency SLA.
- Production 48h summary checked at **99 fixtures / 20 Forebet scored predictions**: expected unchanged. Alias reference import doesn't generate missing predicted scores.
- 0 new crawlers, schedulers, external provider requests, data-fee services, match identity overrides or public frontend deployments.

## Why a source-reference layer is required
`team_alias_registry_v2` and `team_name_master` both require a `team_key` that already exists as an active canonical team entity. The user explicitly asked to import **all** GitHub teams. Creating 45,337 fake canonical entities would poison existing match identity. Instead all 47,407 source aliases live unfiltered in ONE compact private alias reference table; the existing master remains the set of proven canonical relationships. A single `private.all_in_one_team_alias_lookup` view reads both. `LINKED_CANONICAL` is only applied where the same source identity correlates with previously verified aliases/provider IDs. Import is complete even for unknown canonical identities.

## Efficient future matching
1. If provider team ID exists: exact lookup by `source,external_team_id`; use its linked canonical key if nonnull.
2. Otherwise look up by `source,source_key` and competition, require unique candidate or quarantine ambiguity.
3. Reep is an entity-linked background source; do not present its aliases as a captured Flashscore/Forebet source without an actual provider confirmation.
4. Match identity still requires correct league and kickoff, and Forebet score availability still requires real predictions.
5. Repeated capture unnecessary: use existing `phase15-source-scout` which already carries stable Flashscore team IDs.

## Rebuild and audit
- GitHub one-off producer `scripts/build_open_team_name_reference.py`, `scripts/prepare_full_reep_alias_chunks.py`, `.github/workflows/prepare-full-reep-reference.yml`.
- Schema DDL `ops/sql/ft-20261011-complete-team-alias-reference-schema.sql`. No auto-migration and no new recurring cron.
- 24 immutable JSON chunks committed to this branch for reproducible, bounded data import.
- Test SQL:
  `select source,count(*),count(distinct external_team_id) from private.team_alias_reference group by source;`
  `select * from private.all_in_one_team_alias_lookup where source='FLASHSCORE_TEAM_ID' and external_team_id='xYe7DwID';`
  `select * from private.team_alias_reference where source='REEP_CC0' and source_key=ft_team_name_key('Liverpool');`
- Review full code diff for confidence/DB changes before future deployments. Nothing in the regular app compile changes the current URL or frontend behavior.
