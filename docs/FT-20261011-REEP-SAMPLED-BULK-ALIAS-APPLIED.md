# FT-20261011 — Trust-but-sample CC0 alias bulk adoption (production applied)

## Owner directive and source
- Owner explicitly permitted pragmatic, sample-based acceptance of the downloaded public Reep team identity catalogue rather than item-by-item review.
- Original source: https://github.com/withqwerty/reep (CC0-1.0).
- GitHub Actions produced exact `reference_team_names.csv` + manifest from 45,337 teams, 2,070 linked aliases (47,407 total rows). Source sample artefact: prior job 38101159022.
- Read source record and observed team names from existing Supabase `hekqxhgjexzxnecwhyao`, without new provider requests, private laptop, extra cron or paid API.

## Auditable bulk mapping method (applied)
- Baseline: 2,799 VERIFIED names (1,255 CANONICAL_EN, 591 FLASHSCORE, 953 FOREBET) plus 1,524 observed source names.
- Normalize spelling consistently for offline entity linking; require an unambiguous *single* Reep entity for anchor name and exactly one existing verified canonical team key.
- Reep entity anchor count: **430**; **255** had known names from 2+ independent internal sources. Seeded random **40** of these 255; 40/40 resolved consistently against the independent verified source names. Zero observed cross-source identity conflicts in those 255. This is a sample of anchors, **not** an estimate of the entire 47,407 record identity error rate.
- For linked entities, accept all Reep names/aliases as REEP_CC0, and exact source-name matches *observed* in Flashscore/Forebet where unique entity evidence exists.
- Global name collisions against a different target: automatic quarantine, no writes. 29 ambiguous public-name candidates excluded. 385 names already verified were skipped before DB checks.
- Generated **816** candidates (796 `REEP_CC0`, 20 `FLASHSCORE`), seven idempotent 120-row SQL chunks.
- Applied all seven SQL chunks to production: **815 aliases added to registry AND master** (796 REEP_CC0, 19 FLASHSCORE). One candidate did not pass actual DB existing-key dedupe; no overwrite. All SQL chunks replayed: **0 additional inserts**.
- Each new row has confidence 0.94, `REEP_CC0_UNIQUE_ENTITY_MULTI_SOURCE_SAMPLE_CHECKED` method, and source evidence in master.
- Collision audit: zero source-specific VERIFIED team-key collisions for FLASHSCORE, FOREBET and REEP_CC0.
- `ft_refresh_team_name_master()` still merges `team_alias_registry_v2` without provider allowlist, so these rows are durable via the registry, not master-only.
- Indexed lookup sample `REEP_CC0/danubiofc`: ~0.196 ms execution. This does not measure site rendering or throughput.

## Before/after result (source-specific)
- Verified FLASHSCORE names: **591 → 610**.
- Verified FOREBET names: **953 → 953**.
- Verified external CC0-name matches: **0 → 796** in a distinct source namespace.
- Direct existing-source resolver across distinct stored fixtures: FLASHSCORE **212/718 → 216/718**, unknown 506 → 502. Some newly source-VERIFIED names were already resolved by cross-source fallback; do not claim 19 entirely newly resolved fixtures.
- FOREBET **795/806**, unchanged.
- No changes to verified models, source schedules, current prediction timestamps, odds or football match identity.

## Recovery
- Source input files in `ops/reference/` are dated read-only snapshots, not a live source.
- Rebuild through `scripts/prepare_reep_bulk_alias_candidates.py` and `scripts/build_open_team_name_reference.py`.
- Bulk SQL chunks and detailed QA in `ops/reep-bulk-output/`. Never auto-run SQL on each deployment.
- New source named `REEP_CC0` is reference only: even as VERIFIED to an *already existing* canonical team, it does not pretend the name appeared on Forebet or Flashscore. 19 source-specific Flashscore names were observed on existing fixture snapshots.
- This does not create canonical identities for the other 44,000+ Reep teams or infer predicted scores. Broader fixture coverage needs stable team IDs, valid competition, kickoff and actual source prediction data.

## Efficiency and safety
No new DB table, index, extra scraper, cron, API credential or Railway service. The public registry is downloaded once for each manual QA run. Branch testing has no automatic recurring schedule. Remaining ambiguous names are not forced to an arbitrary team.
