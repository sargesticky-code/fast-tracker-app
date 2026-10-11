# Fast Tracker source responsibilities and offline alias resolution — 2026-10-11

## Owner decision
Use a **one-time / on-demand historical matching batch**, not daily recurring alias maintenance. Preserve canonical fixture IDs and historical foreign keys for database compatibility, but do not display or collect HKJC odds as an active product source. Never fabricate completeness or prices.

## Executed database changes (project `hekqxhgjexzxnecwhyao`)
- pg_cron job **11** (`team-alias-v2-hourly`) and **41** (`ft-football-alias-super-daily-v1`) were disabled with `cron.alter_job(..., active=>false)`. They are retained for reversible audit, not scheduled.
- `football_alias_supertable` is a service-only / RLS-protected union of observed provider names, leagues, verified legacy identities, scoped verified identities, stable provider IDs and unresolved candidates.
- `football_provider_league_catalog` stores 125 Forebet league URLs as catalog observations; a listed link is **not** a verified canonical competition.
- `football_alias_offline_pair_evidence` quarantines historical fixture/opponent pair suggestions (no automatic global alias promotion).
- Database on-demand methods: `private.ft_verify_offline_context_aliases()`, `private.ft_refresh_football_alias_supertable()`, `private.ft_seed_offline_backwards_fixture_aliases()`; call **in that order** for a reviewed batch. They are not scheduled. `public.ft_alias_super_lookup(source,name,competition,providerTeamId)` is service-role-only and returns only a unique VERIFIED identity; candidate/unmatched stay separate.
- `forebet-firecrawl-collector` Edge function exists as an optional bounded collector, **not scheduled**. It requires a Firecrawl key stored in the Supabase Edge Function secrets; no secret is committed here. `ft_ingest_forebet_firecrawl_batch` is service-only and does not update canonical fixture identity or published prediction tables.

## Source/tool separation
| Stage | One owner | Reads / produces | Never do |
|---|---|---|---|
| Historical reference | football-data.co.uk and approved OpenFootball/GitHub historic results | Played fixtures, date, opposition, competition, score | Treat results as a source of future predictions or market prices |
| Match universe & live detail | Flashscore provider ID+event data | Fixture/time/status, live data when independently verified | Overwrite known fixture identities by fuzzy name |
| Predicted match statistics | Forebet | 1X2, predicted score, average goals, source URL and date | Invent HDA or use scraped prices as model probabilities |
| Editorial/adviser models | BetClan, SportyTrader, other attributed advisers | Independent published model claims | Mix single-outcome chance with a complete 1X2 triple |
| Lineups and player profiles | FotMob / legitimate provider evidence | Player IDs, squad, lineup source/timestamps | Convert predicted into confirmed |
| Web acquisition | Firecrawl (one-time on-demand) | Public HTML and raw evidence | Daily crawling, unbounded website crawling or bypassing access controls |
| Mapping logic | Supabase **offline SQL batch** | Unique provider IDs, history, event-pair evidence, scoped mappings and conflicts | Global fuzzy merge, hidden unknown-to-zero or live scraping |
| Code & reproducibility | GitHub | Versioned parser/migrations/tests and checkpoints | Scrape continuously as an alias repair daemon |
| Presentation | Railway + public app | Provenance-labelled matches, H/D/A market and model values | Display HKJC as current bookmaker or silently re-label HKJC quotes |
| Review | ChatGPT/tools | Source QA, conflict review, releases after validation | Transfer thinking/research to Codex |
| Codex | None by default | Only deterministic execution if deliberately invoked later | Research, matching decisions, open-ended workflow |

## Offline matching acceptance gates
1. Keep the original `source`, `provider_event_id`, `provider_team_id`, `competition`, date/time with timezone and opponent for every source record.
2. Prefer provider stable ID and unique validated full fixture orientation, same event date and competition. Historic fixture links are evidence even after a fixture has completed.
3. Distinct women's, reserves, U21, national, similarly named or cross-country clubs must never be merged globally on normalized name alone.
4. Scoped VERIFIED mapping needs unique canonical fixture, matching home/away position, source confidence >=0.985, bounded kickoff gap, unique provider ID for that name, no cross-event disagreement and a unique canonical target. Unknowns remain null. Generic inferred name similarity is only CANDIDATE.
5. Candidate pair evidence requires a unique one-to-one source fixture pair, same verified opponent, close fixture date and contained second-name ratio >=0.48; remains CANDIDATE until independently corroborated.
6. After each offline pass compare counts at source-event, distinct-name and unique-verified-match levels; do not claim 100% cross-provider mapping from 100% source-local rows.

## Credit and work limits
- Firecrawl plan checked 2026-10-11: **950 / 1000 credits remained**. No further broad crawl, agent monitor or paid dataset job should run without a measured gap. Prefer existing captured 1,285 Forebet matches / 2,498 source team names / 230 observed league codes and 125 league URLs.
- Target **0 Firecrawl credits for SQL alias inference**. Historical matching is purely offline.
- No new recurrent alias maintenance or provider crawl schedules.
- GitHub/Codex should not duplicate captured requests.
- Keep site HTML, response date, model percentages, fixture IDs and source timestamps attributable.

## Visual release status
- The live Railway public service was verified serving `release/ft-advisors-fotmob-20261011` commit `7318338a` before this work.
- Chart correction committed to the same release branch at `87793ba6`: remove obsolete HKJC fair label, exclude bookmaker fair price as its own independent model vote, keep unknown market probability blank.
- **Do not claim a live deployment until Railway reports the new exact commit and the public detail page has no obsolete label.** The service source/deployment action was blocked by platform safety, so this commit may still be pending release.
- Historical database column names and IDs bearing the old prefix are compatibility keys only, not active bookmaking inputs.

## Final operating pattern
Collect public sources in a *single finite batch* only when evidence is missing. Persist source-specific records. Run offline event / league / historical match reconciliation. Quarantine collisions. Publish only uniquely verified matches and provider-attributed probabilities. Render from the same stable Supabase feed. No recurring alias crawlers, no duplicate source producers, no new HKJC market capture.
