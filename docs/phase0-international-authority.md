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
- maxSportmonksPages: integer 1–5, default 1, an explicit maximum per Sportmonks endpoint.
- maxRequests: exactly dates × fixture-provider page budget + sports + premiumFixtureIds × maxSportmonksPages + apiOddsFixtureIds; unused reserved requests are not spent.
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

## Coverage conflict quarantine — 2026-10-05 continuation

Confirmed remote PR44 head `80bcf45e451102013801c11665399d7bf7211eba`
passed full CI run `37263246675`, including rendered desktop/mobile checks.
Local equivalent commit is `450f25b`; their trees are identical. No new database
changes, deployment or provider coverage occurred since that revision.

Fixed a remaining coverage-report defect: duplicate selection rows previously
collapsed into a Set even when their prices contradicted each other. Such a
board could pass the migration gate. Conflicting current prices now quarantine
the canonical fixture's HDA coverage; identical repeated rows still count once.
Coverage also rejects one canonical ID with conflicting provider event/team/
competition/kickoff identity, or one provider event mapped to multiple canonical
IDs. Conflict IDs are reported explicitly; they cannot produce a passing gate,
even when another clean board appears in the same bundle.

Regression tests reproduce price conflicts, identical duplicates, reversed team
orientation, different event IDs/kickoffs and reused provider events. Authority,
OpenFootball and market contracts passed. This is deterministic safety validation,
not authenticated replacement odds validation. The September 22 OpenFootball
revision and its coverage limitations remain unchanged; provider credentials,
verified canonical bindings and quote storage/consumer cutover remain blocked.
Next useful independent task: a reviewed provider-neutral allocation contract;
do not allocate records from date-only community schedules.


## Bounded pagination recovery — 2026-10-05 continuation

Verified prior remote head `9b0d51e09ba6120fc9d6a02792abed98edaeaa64`
passed full CI run `37264538043`. No provider access, database-facing write or
production release was completed between iterations.

Replaced the collector's blanket rejection of multi-page Sportmonks fixture
and premium-market responses with explicitly bounded pagination. Default is
still one page; configuration may reserve up to five pages per endpoint, with
an exact maximum request budget checked before any call. The collector stops
on the final page, preserves each page's fetchedAt, and returns no partial
evidence bundle if pagination metadata is inconsistent, a later request fails
or the page budget ends while more pages remain. Requests are constructed on
the official endpoint; provider next_page URLs are never followed. API-Football
pagination and retired-provider gates remain unchanged.

Official pagination reference inspected:
https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/introduction/pagination
It documents current_page, has_more, page query parameters and per-page rate
limit accounting. The request budget is requests, not Odds API credits.

Tests cover two-page fixtures and markets, invalid metadata, untrusted next-page
URLs, exhausted budgets, early rate limiting and default compatibility. These
are synthetic transport tests; authenticated real coverage remains blocked by
missing provider credentials/entitlement. No new odds or kickoff claims are made.
Local authority, community-schedule and market contracts passed. Next: run this
bounded collector against real accessible provider scope, then review identity
bindings and additive quote storage; existing production feeds remain intact.

## Complete-bundle quote reconciliation — 2026-10-05 continuation

Prior remote head `2cf708dc253225c899ff3207d18b6c9c42467872` passed full
CI run `37271148618`. Its local equivalent is `e4a5144`. No production/database
changes or authenticated replacement coverage appeared between iterations.

The collector now reconciles quotes across all response pages before returning
its evidence bundle. Identical bookmaker observations collapse to one record
with the latest successful fetch timestamp; original observedAt is retained.
Different prices for the same oriented market/selection/line and observation
are quarantined permanently within that bundle, with explicit rejected evidence.
A later duplicate cannot restore the conflicted observation. Distinct bookmaker
observation timestamps remain separate history. HDA conflict rejection also
blocks the coverage gate even when another clean board exists in the bundle.

Regression checks cover cross-page duplicates, price conflicts, third-row
restoration attempts, distinct observations and downstream coverage blocking.
Authority and market contracts pass; no real new-provider prices are claimed.
Current provider access, verified bindings and storage/consumer cutover remain
external dependencies. This improves correctness of the newly paginated path;
existing production producers, schedules and schemas remain unchanged.

## Canonical binding proposal bridge — 2026-10-05 continuation

Prior head `f01bf3efce04910dc72cfd929d183f8df4e5cb9c` passed full CI run
`37272731856`. No new database writes, provider data or deployment occurred.

Added `lib/authority-binding-proposals.js` and the local review CLI
`scripts/propose-authority-bindings.mjs`. This creates candidate bindings into
**existing** canonical IDs from replacement fixtures, explicit verified
competition mappings and provider/competition-scoped oriented team mappings.
Kickoff agreement defaults to 60 seconds (maximum allowed 300). No fuzzy name
matching, ID allocation, verified promotion or database write occurs. Multiple
canonical candidates or competing provider events remain unresolved. Repeated
identical proposals collapse. Proposals carry `verified: false`, so the current
collector's resolver cannot consume them as authoritative bindings before review.

Usage: `node scripts/propose-authority-bindings.mjs input.json output.json`.
Input keys: fixtures (adapter output), canonicalFixtures (existing normalized
canonicalMatchId/canonicalCompetitionId/homeTeamId/awayTeamId/kickoff records),
mappings ({competitions, teams, optional toleranceSeconds}). Competition rows
require providerKey/providerCompetitionId/canonicalCompetitionId/verified; team
rows require providerKey/providerCompetitionId/providerTeamId/canonicalTeamId/
verified. Output is private review evidence, written exclusively without overwrite.
Do not manufacture mappings from similar team names or from date-only schedules.

Tests verify unique proposals, no automatic verification, reversed orientation,
missing mappings, missing canonical matches, ambiguous canonical matches,
competing provider events and identical duplicate collapse. Provider credentials
and reviewed real mappings remain required for genuine coverage validation.
This bridge removes manual record assembly work without weakening identity.

## Binding freshness and review evidence — 2026-10-05 continuation

Prior remote head `5b7aea16ee600ace2f19897055763b8fe0f2c69c` passed full
CI run `37274485359`. No database writes, deployments or new real odds coverage
occurred between iterations.

The proposal bridge now requires an explicitly zoned, non-future fetchedAt
within a default 300-second age window. It rejects unknown/stale fetches rather
than proposing a mapping from an old provider snapshot. Review evidence keeps
the fetch timestamp, evaluation timestamp, canonical candidate kickoff values
and exact kickoff differences. Neither timestamp means the football fact was
observed at fetch time; verified remains false. Options now/maxAgeSeconds allow
reproducible offline review but must not be used to present archived evidence
as currently fresh. CLI inputs carry these options under mappings.

Tests cover missing/unzoned/future/stale fetch times, invalid evaluation time and
review evidence. Genuine persisted OpenFootball inventory was exercised through
the bridge: all 2,916 records remain unresolved for incomplete provider identity
(date-only schedules have no verified UTC kickoff/provider team IDs). Zero
proposals were invented. Real Sportmonks credentials and explicit entity mappings
remain the blocking dependencies for useful authenticated fixture bindings.

## Verified odds admission and alias conflicts — 2026-10-05 continuation

Prior remote head `25b4041d2933c5f6d91407d3c3dd254b79f06a61` passed full
CI run `37276244534`. No new authenticated coverage or production changes.

Sportmonks premium and The Odds API joins now require a verified fixture binding,
not merely an attached canonical ID. Explicit unresolved identity status overrides
a legacy verified flag. This prevents review-only proposal IDs from admitting
prices. Odds API team aliases must resolve to one reviewed team within the fixture
provider and competition; conflicting targets, including conflicts with a direct
team name, fail closed. Blank names cannot match missing names/aliases.

Tests cover unverified/provisional fixtures, explicit unresolved status, valid
verified collector fixtures, legitimate reviewed aliases, conflicting aliases,
blank names and Sportmonks rejection. Tests use synthetic observations, not real
coverage. Credential access and genuine provider mappings remain blocked;
production infrastructure and database schemas are unchanged.

## Per-selection HDA freshness — 2026-10-05 continuation

Prior head `8cf05a808dfdfcfdb25548ccbd56fa154e5bb9da` passed full CI
run `37278138679`. No new real provider coverage or database/deployment changes.

Corrected a coverage false negative for feeds with individual selection update
times. Complete HDA coverage now requires one canonical fixture, transport,
bookmaker and normalized fetch timestamp; each H/D/A selection independently
passes observedAt and fetchedAt freshness checks. Identical bookmaker update
times across all three selections are no longer required. This fits the
Sportmonks per-odd timestamp contract already documented in this checkpoint.
Latest observed selection values are retained within a fetch; equal-time price
contradictions still poison the board. Cross-page conflict rejections continue
to block coverage. Different fetches/transports cannot be stitched into a board.

Regression checks cover staggered fresh selection updates, one stale selection,
mixed fetches, mixed transports and legitimate older-to-newer price changes.
These are synthetic verification cases. Credentials/entitlement and verified
real mappings still block actual replacement coverage, storage and cutover.

## Runnable private coverage comparison — 2026-10-05 continuation

Prior remote head `16ed937cef7633c002382e788bb80ac76d7089e6` passed full
CI run `37280025554`. No new provider access, DB writes or production release.

Added `scripts/compare-authority-coverage.mjs`: baseline array + collected bundle
-> private exclusive report file. Usage:
`node scripts/compare-authority-coverage.mjs baseline.json bundle.json report.json [zoned-evaluation-time]`.
Default evaluation is current time. An explicit archived evaluation timestamp is
for reproducible offline analysis, not a claim of current freshness. Exit 0 means
shadow coverage passed; exit 2 means coverage/baseline is blocked. Neither result
authorizes production cutover. The command cannot overwrite existing evidence.

Coverage now reports unknown kickoff records, stale fixture fetches and rejected
reason counts. Invalid baseline kickoff/IDs cannot silently disappear from the
comparison denominator and yield success. Synthetic checks cover malformed
baselines and these diagnostics. Local contracts and build passed.

Real persisted OpenFootball bundle: 2,916 unknown kickoffs, 0 verified coverage,
0 fresh HDA. Running with an explicitly empty baseline produced
NO_COMPARISON_BASELINE and exit 2. This verifies truthful diagnostics, not actual
old/new production coverage. A current canonical baseline export and real
verified replacement bundle remain required. Provider credentials/entitlement
and mappings still block that acceptance. No fabricated baseline was inserted.


## Bet365 browser-feed cutover direction — 2026-10-05

Product direction is now **no new HKJC authority dependency**. HKJC may remain only as
historical provenance until old tables/jobs are retired safely; it is no longer the
target bookmaker/feed for new dashboard work.

The selected free experimental live source is `joe-bring/bet365-scraper`, consumed
as an external browser-side service rather than vendored into this repository. The
public repository currently presents a Chrome-extension + Flask local service
architecture and does not expose a repository LICENSE file in its root listing.
Accordingly, this project does not copy its source. It consumes only the documented
HTTP boundary once the scraper is run by an operator-controlled browser host.

Added `lib/bet365-browser-feed.js` and
`scripts/check-bet365-browser-feed.mjs`. The adapter currently admits live fixture
state only (provider event id, English event/league text, score, period and clock)
and returns **zero odds** until a real current scraper payload demonstrates a stable
market schema. Unknown score/clock values remain null, never zero. Canonical match
identity remains unresolved until the existing strict competition/team/kickoff
binding contract verifies a match.

This means the architectural HKJC abandonment is underway, but production cutover
is not yet truthful to claim. The external scraper requires a persistent Chrome
session with the Bet365 in-play page open and its extension posting WebSocket data
to the Flask service. A serverless Supabase function alone cannot replace that
browser host. Before destructive HKJC shutdown, require: (1) a live browser host,
(2) current Bet365 payload capture, (3) verified odds/market mapping, (4) canonical
fixture matching, (5) fresh quote persistence, and (6) Phase 1/3 consumer switch.
After those pass, disable active HKJC jobs/views/fallbacks; historical rows can stay
for provenance and model backtesting but must not be read as current authority.


## Cutover checkpoint — 2026-10-05 late pass

Production cutover advanced beyond the initial browser-adapter scaffold:

- Bet365 browser ingestion schema is applied as migration `20261005111312_bet365_browser_live_ingest`.
- HKJC cron retirement is persisted as migration `20261005114903_retire_hkjc_cron_after_bet365_cutover`.
- `app-phase1-feed` v70, `app-live-feed` v14, `app-match-detail` v23 and `app-match-analysis` v39 no longer use the HKJC direct/current authority paths.
- `hkjc-live-direct` v12 and `hkjc-upcoming-direct` v12 are tombstones that return HTTP 410 with replacement `BET365_BROWSER`; their cron jobs are inactive.
- Public homepage/card/article/detail/health wording was switched from HKJC to Bet365/current-market terminology. Remaining `hkjc_*` names in application code are compatibility fields/source identifiers, not active public authority claims.
- The local collector now emits a `BET365_BROWSER` heartbeat and resolves team-name variants only through unique VERIFIED master aliases plus a unique canonical fixture. Learned Bet365 aliases require that same grounded identity evidence.
- Production feeds distinguish a healthy empty live slate from a missing/stale browser host instead of treating both as zero matches.

Current blocker remains physical rather than architectural: the private Linux Chrome session and upstream extension must be running before genuine Bet365 rows can populate the new tables. Until then, the correct state is unknown/missing, never synthetic odds.


## Cloud-only replacement checkpoint — 2026-10-05

The notebook/Chrome-extension Bet365 browser host is no longer the operational
target. The user explicitly approved replacing it with a fully cloud-run source
that does not require their GemiBook, a visible browser, a Chrome extension, or a
locally stored Supabase secret.

New default source path:

`Flashscore web discovery -> Flashscore/LSApp bookmaker odds -> Railway cloud
collector -> Supabase ingestion -> Phase 1/3 consumers`.

Implementation added under `services/flashscore-odds-collector/`. It is a
Playwright-based headless Python service and uses Bet365 bookmaker id 16 from the
public `realine0/flashscore-football-odds-scraper` implementation as a reviewed
reference. The reviewed upstream revision is
`253b29f72b2836beffb8d6b0ec7eadd99cd396a7`. Upstream source is not vendored.

The cloud collector:
- discovers today through +2 day Flashscore fixtures;
- excludes eSoccer/virtual/simulated fixtures before bookmaker lookup;
- accepts only complete Bet365 full-time HOME/DRAW/AWAY boards;
- keeps missing odds missing rather than synthesizing zeros;
- exposes `/health`, `/snapshot` and asynchronous `/refresh`;
- carries no Supabase service-role key and currently does not write the database.

Railway's free-plan service limit prevented provisioning a new service. The old
failed `fast-tracker-dashboard` service in the active Railway project is being
repurposed instead. Its previous deployment was already FAILED and it had no
service variables. Source is now `sargesticky-code/fast-tracker-app` branch
`phase0/international-authority`, root
`/services/flashscore-odds-collector`, Dockerfile `Dockerfile`, with
`/health` as deployment health check. Railway domain:
`fast-tracker-dashboard-production.up.railway.app`.

Do not restore the notebook browser host as the default. The old
`BET365_BROWSER` tables/functions remain compatibility scaffolding until the
cloud collector has genuine current coverage and the Supabase ingestion bridge
is verified. Do not claim current bookmaker coverage until the Railway snapshot
contains real complete HDA rows and those rows are identity-verified in Supabase.


## Cloud bookmaker acceptance — 2026-10-05

The cloud-only replacement is now operational with genuine current data.

Railway production service `fast-tracker-dashboard` was repurposed from its
previous failed deployment and now runs the headless Flashscore odds collector.
The accepted implementation parses current Flashscore match rows using
`.event__match`, `.event__homeParticipant` and
`.event__awayParticipant`. The first corrected production refresh observed
66 match rows for 2026-10-05 and 131 for 2026-10-06 before reaching its configured
180-fixture cap. It produced **71 complete Bet365 full-time H/D/A boards**.
Temporary row-HTML diagnostics were then removed and the service was moved from
Flask's development server to **Gunicorn 23.0.0**, one worker with threaded
request handling so only one collector loop runs. Railway deployment
`8b9f83ba-71fc-4663-8397-9ae8ad26b442` reached SUCCESS.

Supabase migration `flashscore_bet365_cloud_ingest` created the service-only,
RLS-enabled `flashscore_bet365_current` staging table. Edge Function
`flashscore-bet365-ingest` v1 fetches only the fixed Railway snapshot URL,
rejects stale snapshots, throttles invocations to five minutes, and resolves
canonical identity by normalized exact home/away orientation plus a two-hour
kickoff tolerance. Exactly one candidate is required. Unresolved/ambiguous rows
remain staging-only; no fuzzy identity is promoted.

First real ingest acceptance:
- complete cloud HDA boards: **71**
- staging rows: **71**
- VERIFIED canonical rows: **23**
- UNRESOLVED rows: **48**
- AMBIGUOUS rows: **0**
- promoted `bet365_current` rows with source `FLASHSCORE_BET365`: **23**

A verified example is canonical `FB6298`, France v Belgium at
2026-10-05 18:45 UTC, Flashscore event `EmmmJQ3L`, with Bet365 H/D/A
**1.48 / 4.50 / 6.00** at capture
2026-10-05T12:50:24.705254Z.

pg_cron job **38**, `flashscore-bet365-cloud-ingest`, is active on
`*/15 * * * *` and invokes the fixed Supabase ingestion function. The user's
notebook, Chrome extension and local Supabase secret are no longer part of the
production path.

Do not weaken the identity rule merely to increase coverage. The next coverage
work should resolve the 48 staging rows through reviewed aliases/fixture identity
evidence, then extend markets beyond HDA where the upstream data is stable.
