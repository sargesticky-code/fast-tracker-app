# BetClan / Flashscore one-time alias comparison — 15 Oct 2026

## State before the fresh authenticated run

Read-only production queries at 09:10 HKT found 100 stored BetClan source events: 10 had verified fixture links, 90 were unmatched, and 28 had future scheduled kickoffs. Two future rows were verified. The active source capture was from the preceding day, which explains why the page left open by the user had already passed kickoff.

The production alias supertable contained 389 BetClan (`BCL`) VERIFIED alias rows across 386 team keys. All 389 resolved to `HKJC:` keys. The last refresh was 11 Oct 2026. A read-only comparison against `FLASHSCORE_TEAM_ID` found a single Flashscore team ID for 189 alias rows, multiple IDs for 5 legacy keys, and no Flashscore team ID for 195 alias rows. The single-ID rows covered 187 distinct IDs, so aliases still need collision checks before any rewrite.

## Fixture comparison

I joined the 100 saved BetClan observations to Flashscore canonical matches using exact home name, exact away name in the same orientation, and kickoff within 60 seconds. This found 23 unique source events with one exact fixture; every one had a zero-second kickoff difference and none was reversed. Ten were already marked VERIFIED. Thirteen remained UNMATCHED because the provider competition name did not equal the canonical competition label. `competition_name_lookup` had no BetClan rows for these names.

| BetClan competition | Flashscore competition | Exact pair + kickoff rows | Already verified |
|---|---|---:|---:|
| USA Major League Soccer | MLS | 9 | 9 |
| Norway 1. Division | OBOS-ligaen | 6 | 0 |
| England Championship | Championship | 4 | 1 |
| Türkiye 1. Lig | 1. Lig | 1 | 0 |
| Estonia Meistriliiga | Meistriliiga | 1 | 0 |
| England Non League Premier - Isthmian | Isthmian League Premier Division | 1 | 0 |
| Argentina Liga Profesional Argentina | Liga Profesional - Clausura | 1 | 0 |

The mismatch is concrete: the current RPC accepts exact competition equality or a suffix match, plus an explicit MLS exception. The thirteen historical exact fixtures above were not covered by an alias map. Candidate competition aliases should remain explicit source-to-canonical pairs and be backed by these one-time event comparisons; no fuzzy name or kickoff rule is needed.

## Fresh capture

The collector parser tests passed **9/9**. A bounded local capture at 09:16 HKT downloaded 100 BetClan detail records, all with timezone-qualified source kickoffs and no detail-page parse failures; 84 were still scheduled for a future kickoff. SportyTrader returned HTTP errors and produced no records. Local capture SHA-256: `58739018ec39628ba83d428f0db6c011e379c0be141651d6445562876024346d`.

The local capture is evidence only and has not been inserted directly into production. At 09:20 HKT I started the existing `main` GitHub Actions workflow, which uses the established OIDC-verified publication path. Reconcile that run before replaying or starting another capture. Record its run ID, captured artifact digest, accepted/matched counts, and live API result below when complete.

## Result and safety

No alias-table or observation rows were changed by the comparisons. Do not mark a source identity VERIFIED solely because a team alias matches: require the unique, current, scheduled Flashscore fixture, both teams in the same orientation, exact scheduled kickoff, and an explicit competition alias. Preserve the existing HKJC-keyed rows as history until the provider-neutral/Flashscore-keyed replacement is built and its consumers are migrated.

## Next actions

1. Reconcile the in-flight OIDC capture/publication and verify the public full and compact feeds and match detail.
2. Add the explicit, evidence-backed BetClan competition aliases to the matching contract and test the 13 historical exact cases without promoting past fixtures as current.
3. Rebuild the supertable as a one-time, versioned comparison that carries canonical Flashscore team IDs, keeps candidates provisional when IDs collide or are absent, and never creates a verified alias from spelling alone.
4. Map and cut over HKJC-backed scheduled pipelines to Flashscore/non-HKJC sources; preserve historical rows and rollback until dependent consumers are migrated.
5. Remove the four deployed 410 HKJC Edge Function tombstones when authorized Supabase Management API access is available. The local Supabase CLI is installed but has no access token; the Dashboard session opened to the project is signed out. No credentials were read or entered.
