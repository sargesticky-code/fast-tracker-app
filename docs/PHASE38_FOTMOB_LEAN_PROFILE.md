# Phase 38 — Keep FotMob football evidence, omit unused profile widgets

The live FotMob Edge collector v25 exactly matches the release repo before this change. A direct source audit found player data stores redundant `traits` and `nextMatch` widget blobs not consumed by `ft_verified_lineup_fast` or the `FotMobPlayerInsights` view. **Never remove `statSeasons` or `recent`**: those season and recent-match stats are valuable for the user's football analysis. Keep position, age, nationality, height, injury, primary team, source ID and player names.

Change only `compactPlayerProfile` in the existing collector so future/upserted player profiles exclude `traits` and `nextMatch`. No change to the source requests, per-run profile ceiling, score/lineup evidence, model stats, alias table, snapshot jobs, current stored profiles, or database schema.

CI verifies the exact retained fields and missing widgets, FotMob source contract and Next build. After merging and deploying, compare the new deployed function's content with the release and inspect newly updated `phase2_players` `profile` rows for absence of these fields, presence of `recent` and `statSeasons`. The older profile values are left alone until separately archived and reviewed. PostgreSQL JSONB compression and TOAST mean a naïve sum of nested-field sizes is NOT a physical storage reduction estimate.
