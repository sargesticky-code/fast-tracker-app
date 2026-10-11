# FT-20261011 — All-in-One Team Alias Backfill (production applied)

## Intent
Preserve ONE existing source of truth: `public.team_alias_registry_v2` for durable assertions, `public.team_name_master` for indexed universal reads, `team_name_context_master` for documented league contexts. Do NOT add a second master table or a new provider-scraping schedule.

## Actual production action
Applied `ops/sql/ft-20261011-backfill-existing-observed-team-aliases.sql` against Supabase `hekqxhgjexzxnecwhyao` on 2026-10-11. Read **only pre-existing stored evidence** from `flashscore_fixture_current`, `active_canonical_fixture_current`, `forebet_prediction_current`, `team_name_lookup`, and `team_entities_v2`.

Required before promotion:
- Flashscore: provider status `EXACT_EXISTING`, same canonical fixture ID, exact stored kickoff timestamp, and **both** home/away normalized team names match the canonical fixture.
- Forebet: already published canonical prediction with `raw.source = FOREBET`, match_score >= 0.995, source captured in preceding 72 hours, source-side name equals canonical name.
- Source + normalized name maps to exactly one canonical team key; name cannot have conflicting targets; candidate/ambiguous or existing keys are NEVER overwritten.
- Writes to registry and master occur in ONE SQL statement; ignores duplicates; nothing changes existing aliases, provenance, model, odds or cron.

Result: 120 eligible, 120 inserted registry, 120 inserted master (**118 FLASHSCORE, 2 FOREBET**). Replaying the exact SQL: 0 eligible, 0 writes, no duplicates.

## Verified resulting master counts
| Source | VERIFIED before | VERIFIED after | Other statuses |
| --- | ---: | ---: | --- |
| FLASHSCORE | 469 | 587 | 151 CANDIDATE, 2 AMBIGUOUS unchanged |
| FOREBET | 952 | 954 | none |

- Stored distinct source names: Flashscore 718 (360 fixture source rows); Forebet 806 (545 prediction records).
- Verified observed source names after: Flashscore 182, Forebet 795. Not in master: **Flashscore 528, Forebet 11**. The 528 are *not* 528 verified aliases waiting to copy: some have no canonical event ID, invalid time, missing canonical entities, or identity ambiguity.
- Existing `team_name_master_lookup_idx` is being used. A sample indexed query on `FLASHSCORE/arsenal` returned ~0.199 ms execution; not a public-page latency SLA. No index added.
- `ft_resolve_team_names_bulk('FLASHSCORE', [...])` resolved Arsenal, Augsburg, Barcelona, Aston Villa and correctly left Bohemians unknown. Source-key VERIFIED collision count remained 0. Critical known cross-entity homonym (e.g. Andorra) stays AMBIGUOUS.
- Last Flashscore snapshot used was Oct 9, 2026; this backfills NAME identity only, **not** fresh match data.
- Existing `ft_refresh_team_name_master()` truncates and reconstructs the master. Registry was updated FIRST, so later refresh can rebuild these aliases; avoid master-only manual insertions.

## What this does NOT do
- Does not download the entire Flashscore or Forebet proprietary website database. Flashscore explicitly restricts substantial database extraction and scraping without express consent: https://www.flashscore.com/terms-of-use/ . Forebet similarly restricts copying/reuse: https://www.forebet.com/en/terms-of-use . A scraper's MIT license does not grant rights over website data.
- Does not turn an unverified match into a verified one or produce missing Forebet predicted scores.
- Does not promise 100% matching or arbitrary low latency. Source identity, kickoff, competition and freshness remain independent correctness gates.
- No HKJC bookmaker capture/re-activation. Some preexisting neutral canonical team-key strings have legacy `HKJC:` prefixes; they are *not* a request to HKJC or a betting authority.

## Remaining prioritized repair
1. Only for source data permitted for collection/reuse, ingest deduplicated source team IDs/names as part of the **existing** bounded fixture/capture, never a separate massive team-name crawl.
2. Link unresolved names using stable provider team IDs and event + league + kickoff; retain `UNKNOWN` when unconfirmed. Never use fuzzy spelling alone or a source-global alias for a homonym.
3. For the 528/11 still absent from master, classify precise blocked reasons and repair candidate identities using audited existing registry/context, without generating synthetic canonical entities.
4. Benchmark source-specific bulk resolutions and live canonical fixture match rate before any release; no extra cron/Railway spend without evidence.
