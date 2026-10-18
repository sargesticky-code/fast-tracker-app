# Phase 37 — Lean Flashscore lineup evidence (2026-10-18)

## Measurement
- 54,444 `FLASHSCORE_OFFICIAL` player evidence rows stored roughly 31.3 million bytes of JSONB `raw`.
- A read-only SQL projection `raw - 'flash_record'` would store about 9.7 million bytes at the same row population, or **~21.6 MB less logical JSON**. The figure is a projection, not a physically reclaimed PostgreSQL file size.
- The `phase15-flashscore-scout` collector sets `flash_record:r` **for every player**, then writes through `ft_upsert_lineup_evidence_generic`. The deployed Edge source (v11) matched repository source exactly before this PR.
- Database `ft_verified_lineup_fast` consumes `raw.formation`; verified FotMob rows consume `raw.verticalLayout`. Match detail and analysis use typed player/team/position fields. No database function consumes `flash_record`. Flashscore manager evidence remains untouched.

## Bounded change
- Stop adding full `flash_record` to **new or updated Flashscore lineup rows**. Preserve typed lineup source fields, `raw.classification`, `squad_role`, `formation`, `flash_position`, provider event ID and record index.
- Do not alter FotMob sources, player profiles or stored historical rows; those follow the separately tested SHA-archived after-use retention job.
- No new cron, provider, queries or paid scraping. Existing Phase 36 archive/delete mechanism remains unchanged.
- CI checks lineup parser fields, the existing generic upsert, unchanged manager evidence and Next build.
- Deploy only if release CI passes; compare Edge function content SHA and verify at least one newly fetched Flashscore lineup lacks `raw.flash_record` while player and formation attributes remain available. Actual database size may not fall immediately.

## Rollback
Re-deploy the previous `phase15-flashscore-scout` Edge source v11, retaining its `raw.flash_record` field, if a source/consumer regression occurs.
