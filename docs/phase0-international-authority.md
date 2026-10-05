# Phase 0 — international authority replacement checkpoint

Date: 2026-10-05 Hong Kong / 2026-10-04 UTC.
Base: application main `60dcd75`; ingestion main `e0a06f1`.
Status: implemented shadow adapters and safety contracts, NOT a production cutover.

## Persisted evidence, inspected before implementation

Supabase project `hekqxhgjexzxnecwhyao` was queried read-only. At 23:33:51 UTC:

| Evidence | Actual result |
| --- | --- |
| public.matches | 1,103 rows; 31 future kickoffs; last fetched 23:32:01 UTC |
| hkjc_odds_current | 1,041 rows; last updated 23:20:02 UTC |
| bet365_current | 0 rows |
| api_football_event_map | 187 historical mappings; 0 upcoming; latest seen 2026-09-27 |
| market_quote_observations | not deployed |
| Railway fast-tracker-public | SUCCESS, deployment 99442fd2-a0e0-4f52-a373-715c13ccee2d |
| Railway fast-tracker-runtime | FAILED; do not replace the working public service with this path |

Deployed Edge Functions, not only repository source, were inspected:
`bet365-api-football` v4, `bet365-hourly` v3 and `api-football-phase2-base` v12.
They establish three separate provider namespaces: API-Football, Odds-API.io,
and the newly implemented The Odds API adapter. These are different companies.

The latest stored health explicitly says API-Football was RETIRED on September
28 after its account was suspended. Jobs 21/22 are inactive. Its old mappings
are historical provenance, not an active fixture authority. The optional
Bet365 API-Football collector was disabled to reserve quota. The stored
Odds-API.io health says its key was missing and its path intentionally disabled.
No retired jobs were restarted. No secrets were extracted from the database.

## Dependency map

`phase0-dependency-files.json` inventories HKJC references in source, workflows
and SQL across both repositories at the inspected heads. It is a lexical
inventory; each listed reference still requires semantic cutover verification.

| Layer | Dependencies / assumptions | Replacement requirement |
| --- | --- | --- |
| Fixture identity | public.matches and private.matches primary key is named hkjc_event_id; models, lineups, H2H, live and snapshots join it | Preserve existing keys as opaque canonical IDs; add provider bindings rather than rename/re-key every table |
| Upcoming feed | app-phase1-feed direct HKJC -> Supabase HKJC snapshot -> GitHub HKJC CSV | Replace all three authority paths together after international shadow coverage passes |
| Detail / analysis / stories | HKJC lookup, market fields, fetchedAt health, provider-specific labels | Consume canonical fixture + named-bookmaker quotes; keep model/enrichment joins stable |
| Live feed | app-live-feed starts with HKJC markets; phase3_hkjc_live_authority_v uses SELLINGSTARTED and HKJC half statuses | Separate event status from market availability; a bookmaker does not decide whether football is live |
| SQL views | fast_tracker_live_v2 joins matches to hkjc_odds_current and bet365_current; admission/health depend on HKJC freshness | Replace authority joins with reviewed service-role observations; do not destroy current views prematurely |
| Team names | HKJC-oriented aliases/name master and contextual lookup RPCs | Retain evidence; append provider-scoped, competition-scoped, oriented team bindings; preserve youth/women/reserve suffixes |
| Ingestion/models | HKJC CSV target list, model/form/result-history inputs, odds movement and Bet365 admission | Remove target-list dependency independently of retaining legitimate historical training data |
| Public product | legacy channel labels and HKJC-specific market/timestamp fields | Carry bookmaker and feed provider separately; no silent relabelling of old quotes |

Historical HKJC data need not be deleted to remove HKJC from normal operation.
Existing canonical IDs may retain their legacy spelling without fetching HKJC.
New fixtures cannot be allocated safely in this batch: the existing canonical
schema has no neutral allocation route and downstream FB-id assumptions remain.
Do not create an incompatible second fixture universe in a side table.

## Provider decision, based on official routes

Select **Sportmonks for the proposed fixture authority and premium prematch
market foundation**, with **The Odds API as a separate HDA/basic-market
fallback**. This selection is conditional on authenticated coverage, accessible
subscription leagues and public-use rights verification. It is not a claim
that either is already supplying this production dashboard.

| Candidate | Strength / sustainable route | Limitation / decision |
| --- | --- | --- |
| Sportmonks + TXODDS premium | English API, stable fixture/team/league IDs, named bookmakers, HDA/totals/AH, per-odd timestamps and stopped state, odds history | Strongest rich prematch candidate; premium is NOT live; paid league/add-on entitlement and catalogue required; corners not presumed |
| The Odds API | Official documented v4, named international books, soccer HDA, in-play/upcoming, historical paid route; website display explicitly permitted | Useful fallback; no team IDs; soccer totals coverage varies; generic spreads do not prove Asian settlement; not a guaranteed Bet365 route |
| API-Football | Stable fixture/team IDs, odds + lineups/stats; existing historical mappings | Existing account suspended/retired; compatibility adapter only, explicit opt-in; slow prematch odds cadence unsuitable for current live prices |
| Odds-API.io | Already deployed optional route; advertises Bet365, Asian handicap and live updates | No active credential evidence; terms restrict redistribution absent consent; public dashboard rights must be resolved; preserve optional implementation |
| Betfair Exchange | Genuine official exchange API | Separate exchange, liquidity/commission semantics and commercial licence; delayed key not current odds; not broad bookmaker authority |
| Direct Bet365 scraping | Recognized bookmaker | Existing browser path yields 0 admitted rows; no demonstrated stable authorized general API; do not expand fragile scraping |
| Crypto operators | Potential extra prices | No demonstrated authorized stable route/coverage/licence advantage; not selected as authority |

Published prices checked October 4: The Odds API free 500 credits/month,
20k $30/month; API-Football free 100/day, Pro $19/month. These are research
facts, not purchases. Sportmonks cost depends on leagues and premium add-on;
do not invent a single all-coverage price. Region/bookmaker availability must
be tested from the actual runtime; an API avoids browser anti-bot mechanics
but does not guarantee upstream coverage or geographic access.

Official research sources:

- https://www.sportmonks.com/football-api/premium-odds-feed/ — 110+ books / 42 markets, ~1-minute prematch updates, up to 7 days history, premium explicitly excludes in-play.
- https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/fixtures/get-fixture-by-id — fixture IDs, timestamps, participants includes.
- https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/premium-odds-feed/premium-pre-match-odds/get-all-premium-odds — stopped, total, handicap, latest_bookmaker_update, pagination.
- https://the-odds-api.com/liveapi/guides/v4/ — quota headers, odds, events, scores, history.
- https://the-odds-api.com/sports-odds-data/betting-markets.html — soccer draw in h2h; generic spreads; BTTS requires event odds route.
- https://the-odds-api.com/terms-and-conditions.html — allows storing/UI/analytics, prohibits standalone raw-data redistribution. Do not publish provider snapshots into public GitHub CSVs.
- https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide — separate live/prematch bet catalogues, coverage flags, prematch refresh limitations.
- https://odds-api.io/terms — redistribution restrictions and account/rate-limit terms.
- https://support.developer.betfair.com/hc/en-us/articles/360002464152-Which-API-Licence-Do-I-Require — commercial licence requirements.

## Implemented

- `lib/international-authority.js`: Sportmonks/API-Football fixtures, Sportmonks
  premium/API-Football prematch/The Odds API quote adapters; English provider
  names; explicit team orientation; competition + IDs + kickoff; unique binding;
  reviewed alias/catalogue/settlement gates; bookmaker/feed separation; stopped
  odds rejection; observation/fetch time separation; conflicting duplicate quarantine.
- `scripts/collect-international-authority.mjs`: bounded official API shadow
  collection, Sportmonks default; API-Football requires explicit retired-provider
  opt-in; at most 3 dates / 10 odds sports / 10 fixtures per provider; no DB writes,
  no schedules, no feed publication; HTTP/quota failures do not erase working feeds;
  refuses incomplete paginated snapshots instead of claiming full coverage.
- `lib/authority-coverage.js`: compare old/new upcoming fixture coverage and
  complete fresh single-bookmaker HDA boards; expose unresolved/missing IDs;
  empty baseline is not success; coverage cannot authorize production cutover.
- quote contract now refuses mixed matches/selections/lines, stale/missing/future
  observation timestamps and unknown statuses. Generated article timestamps no
  longer substitute for bookmaker observation time. Same book via two transports
  counts once. Exchanges do not count as bookmakers.
- deterministic regression checks wired into PR CI.

## Running shadow collection

Configure keys in the execution secret environment, not JSON/repository/public
client: `SPORTMONKS_API_TOKEN`, optionally `THE_ODDS_API_KEY`.
API-Football remains retired; its key is only used for explicit compatibility tests.

Config fields:

- dates: explicit UTC dates (max 3); sports: vetted Odds API soccer keys (max 10).
- maxRequests: exactly dates + sports + premiumFixtureIds + apiOddsFixtureIds.
- bindings: verified providerKey/eventId/competitionId/homeTeamId/awayTeamId/
  kickoff/canonicalMatchId records backed by actual canonical identity review.
- competitionMap: sportKey -> providerKey + fixture provider competition ID, verified.
- aliases: providerKey, teamProviderKey, competition ID, teamId, exact alias, verified.
- bookmakerRegistry: stable lowercase book key, label, kind, provider-specific
  bookmaker ID where required, verified. One shared book key across transports.
- marketCatalogue: provider-specific market ID, exact source description, normalized
  market, FULL_TIME, explicit selectionMap for Sportmonks, verified; AH requires
  ASIAN settlement and a reviewed home-vs-selection handicap perspective.
- sourceTimezone: UTC only when provider timestamp interpretation is established;
  missing zones otherwise fail closed, and updated_at is not odds observed_at.

`node scripts/collect-international-authority.mjs config.json evidence.json`

The output is private raw evidence; do NOT commit/upload actual licensed payloads
to public GitHub. An existing output file is not overwritten. API keys and request
URLs are never logged. The Odds API collector requests h2h/totals in uk/eu,
approximately 4 credits/sport per call; maxRequests is NOT the credits budget.
The free allowance cannot sustain broad polling. BTTS parsing supports an
independently obtained event-odds payload but the bounded collector does not yet
request that endpoint. No API-Football live catalogue is reused for prematch.

## Cutover blockers and next coherent implementation

1. Obtain usable Sportmonks fixture/premium entitlement and accessible credentials;
   confirm covered competitions and website/internal-storage licence. Resolve
   the existing API-Football suspension rather than assume its key works.
2. Fetch real provider catalogues and fixtures; review bindings using competition,
   both oriented team IDs, kickoff. Run old/new coverage report over the real horizon.
3. Add a bounded canonical allocation/upsert route for genuinely new fixtures using
   the existing identity schema; preserve every existing model/lineup/live key.
4. Review the UNAPPLIED old quote migration: it groups by feed provider and lacks
   bookmaker identity, so applying it unchanged would collapse multiple bookmakers.
   Design the minimal extension before storage ingestion; service-role/RLS boundary.
5. Wire upcoming/detail first, with explicit source/freshness and rollback; verify
   genuine fixtures, models, lineups. Then separate live event status/market admission.
6. Persist append-only odds observations privately; current snapshots must remove
   suspended/absent markets. Distinguish unchanged price time from successful poll.
7. Retire all HKJC authority producers/fallbacks only after phases 1–3 compatibility
   and replacement coverage pass. Historical provenance can remain.

No migrations, DB writes, Edge releases, production deploys, job changes, purchases,
or fabricated observations occurred in this batch. Production still uses HKJC.
Phase 0 is NOT complete.

## Verification

Local: international adapters/identity/freshness/dedup/stopped/coverage contracts,
existing market/real-evidence/independence/player/story/UI checks passed. Static
Next.js build passed. Local browser installation failed because the Chromium
download was truncated; rendered checks must run in normal GitHub CI. No real
authenticated new-provider quote or production cutover has been verified.

## GitHub schedule continuation — 2026-10-05

Recovered the previously uncommitted OpenFootball adapter/collector, then completed
its integration into package checks and PR CI. Source data is read from an
inspected local checkout; no upstream executable code is installed or run.
The checkout's LICENSE is CC0. Only the exact official GitHub origin is accepted.

Implemented `lib/openfootball-schedule.js`, `scripts/collect-openfootball.mjs`,
and `scripts/check-openfootball.mjs`. Each fixture keeps the pinned repository
revision and the **individual file's last commit timestamp**, not the timestamp
of an unrelated newer repository commit. Working-tree edits cannot masquerade
as committed evidence. A bounded 3-day date-window coverage summary separates
community schedule records from verified kickoff identities and current quotes.
Dates have unknown source timezones: the UTC date window is an inventory filter,
not an exact match admission rule. No canonical IDs or UTC kickoffs are invented.

Actual inspected source revision:
`e6744429ee395bc86f247348c6184bb08d4eb361`, last changed September 22.
Collection on October 5 yielded 2,916 schedule records, 0 rejected, 0 quotes.
October 5–7 UTC date inventory: 0 records. October 5–11: 73 records across 8
competitions, 0 verified kickoffs, 0 current bookmaker quotes. The source is
useful for schedule-gap auditing but does not solve current betting coverage.
Do not promote it to core authority or present its commit time as observation
freshness. Raw collection output stays outside the public repository.

Regression checks cover invalid dates, duplicate records, unknown kickoffs,
invalid times, revision pinning, per-file timestamps, dirty-tree isolation,
non-official origin rejection and coverage windows. International authority
and quote contracts passed alongside the new checks. No public UI changed;
prior rendered CI applies only to the prior head, not this new batch.

Resume: keep this source as shadow inventory. The independent useful next step
is verified fixture bindings/canonical allocation using a source with genuine
competition/team/kickoff evidence. Current bookmaker coverage still needs a
working authorized odds route; installing an open-source client does not supply
an API subscription or odds. Existing production producers remain intact.
