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


## Completed offline batch results (verified 2026-10-11)
- `football_alias_supertable`: **22,215 scoped source records**, 9,330 VERIFIED, 542 CANDIDATE, 153 AMBIGUOUS, 12,190 UNMATCHED. These are scoped rows, not unique teams. Earlier baseline was 21,612 total and 8,805 VERIFIED. Never claim 100% coverage.
- Verified 205 new historical/current fixture + stable-provider-ID contexts for Flashscore/FotMob, plus 174 played-football-data contexts across 103 uniquely matched historical fixtures. Imported 398 league/team pairs into the supertable from 1,385 already-held football-data match rows, no paid web calls.
- Provider-name collisions: 79 repeated source-name keys across leagues/provider IDs; 146 unsafe NON-VERIFIED rows quarantined as ambiguous. Existing stable-ID-backed verified rows left untouched.
- Generated **13** candidate-only cross-provider historical fixture/opponent evidence entries, with one-to-one fixture and bounded lexical checks. Do not auto-promote those candidates.
- Backfilled **32** unique source-backed Forebet predictions with HDA, predicted score, average goals and original source references; `forebet_predictions` now **588**. Source data remain 1,285 unique Forebet events from previous acquisition.
- Supabase cron jobs 11 and 41 confirmed **inactive**. Forebet collector is deployed but no scheduled jobs nor fresh Firecrawl expenditure for this batch; Firecrawl connected team showed **950/1000 remaining**.
- UI model-support chart correction committed to exact current Railway release branch (git `87793ba6`), but the last observed LIVE Railway deployment still used `7318338a` and displayed stale wording. **Live deployment verified 2026-10-11:** Railway production successfully deployed `45d3064c8b99e1978a510d87f3293b99b8cbf3e0`; the rendered match-detail page shows `Market no-vig` and `above market no-vig` and no HKJC label. Supabase `app-phase1-feed` v93/`ft_fast_flashscore_summary` now use `flashscore_primary_fixture_current` as the authoritative fast read lane. HTTP 200 public Edge API acceptance returned 82/82 `FS:` identities, zero legacy `FB` rows, zero HKJC strings. Six previously day-shifted FS fixtures were cross-checked against provider raw Unix AD timestamps, repaired, and six FB redirects confirmed. Two additional FB fixtures were freshly reanchored (Liverpool–Man City and Coventry–Newcastle), preserving two Forebet forecasts. Existing `matches.hkjc_event_id` is a backward-compatibility database column, **not** source authority. No fabricated deploy claim.

### Exact offline replay order (no scheduled invocation)
1. `select private.ft_verify_offline_context_aliases();`
2. `select private.ft_verify_historical_football_data_contexts();`
3. `select private.ft_refresh_football_alias_supertable();`
4. `select private.ft_seed_played_football_data_to_supertable();`
5. `select private.ft_seed_offline_backwards_fixture_aliases();`
6. `select private.ft_quarantine_provider_name_collisions();` — **important last identity stage**, as a general supertable refresh recomputes candidates.
7. `select private.ft_publish_historical_verified_forebet_pairs();`
Run as an on-demand, audited offline batch only. Never let Codex or scheduled workers independently rerun these. Reconcile conflicting identities manually before any further VERIFIED promotion.

## Final operating pattern
Collect public sources in a *single finite batch* only when evidence is missing. Persist source-specific records. Run offline event / league / historical match reconciliation. Quarantine collisions. Publish only uniquely verified matches and provider-attributed probabilities. Render from the same stable Supabase feed. No recurring alias crawlers, no duplicate source producers, no new HKJC market capture.


## Display and statistics verification — 2026-10-11
- Production Railway release: `dba437885b28f6fceb31d3ba86e99f2e710cfde2` successfully deployed and confirmed; homepage inspected as a rendered mobile page.
- Supabase `app-phase1-feed` v94 is the source-backed 48-hour summary. HTTP 200 / 81 `FS:` fixtures, 0 legacy ids and 0 HKJC strings; forecasts available for 28/81 fixture records, bookmaker HDA for 71/81. Pre-kickoff observed match-stat coverage is genuinely sparse and stays unknown.
- **New observed historical team-form lane**: `ft_historical_form_by_team` reads `football_data_matches` without creating new captures or tables. The function requires ≥3 valid completed domestic-league matches, matches exact league/team labels (no fuzzy links), and uses only result dates strictly earlier than kickoff. It emits newest-first W/D/L, last-five GF/GA and observed `throughDate`; no live status or predictive probability is inferred. 17/81 home sides and 11/81 away sides have form, 9/81 fixtures both, 19/81 fixtures at least one side. The source file can lag the present (e.g. source results through 19/20 September), and the UI explicitly labels the cutoff.
- Homepage now has functional `Forecasts` navigation and `Forecasts only` toggle (replacing an inert Show form toggle), default `Data first` ordering with alternate chronological order, truthful pagination, exact 1X2 validity checks and row-level historical form. The front page prioritizes actual independent predictions over blank model rows while retaining access to all fixtures.
- Corrected presentation semantics: `FS ✓` means a verified Flashscore **fixture identity**, independent of whether live shots/xG exist. Value/edge cells state the actual market outcome `1/X/2`; the forecast winner can differ from the best-value selection. The mobile forecast toggle remains visible with responsive wrapping and keyboard-accessible input.
- Live mobile Firecrawl QA: status 200, Forecasts controls present, data-first present, 30/30 visible rows show `FS ✓`, 12 rows with rendered Last 5, zero HKJC strings. This is rendered content validation, not a claim that every outside source has live stats. No new background polling, alias job, football-data download or Firecrawl crawl schedule was added.
- One-time Firecrawl budget reading after rendered QA: **942 of 1,000** credits remaining. Further page automation is not required for this improvement.
