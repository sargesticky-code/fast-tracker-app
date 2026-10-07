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

## FT-20261007-001 reconciliation — player/lineup milestone

The active production foundation is now provider-neutral at the named-object/job layer:
there are no public base-table/view names containing `hkjc` and no active cron jobs
containing `hkjc`. Historical provenance and compatibility fields may remain inside
records, but they are not current source authority.

Real current coverage measured during this checkpoint:
- 5,642 canonical player rows;
- 2,300 FotMob-linked profiles;
- 169 matches with lineup evidence in the last 72h;
- 149 matches with confirmed starter evidence;
- 84 matches with availability evidence;
- 37 FotMob match-detail payloads carrying playerStats;
- current bookmaker/live freshness remained populated at measurement time.

The match-detail API had already advanced beyond the earlier handover: it canonicalizes
provider lineup evidence, deduplicates shared observations, preserves provider provenance,
and joins player performance only by exact FotMob player id. Real acceptance:
`FB6401` Argentina v Benin = 22 confirmed starters + 26 bench + 22 exact player-stat
joins; `FB6402` Mexico v Chile = 22 predicted starters + 30 bench + 0 invented stats.

The remaining presentation defect was frontend re-selection by provider after the API
had already canonicalized the rows. Commit `f021ccbe925ca6a36887051b499254b6cc1ec554`
removes that lossy second selection. Commit
`36876db71fc4f4aff231c9d7dedd3ef5a1090139` adds mixed-provider lineup regression
coverage and a tablet rendered-flow viewport alongside desktop/mobile.

Do not replace fixture identity with Bet365 identity. Bet365 remains a bookmaker/price
source; canonical fixture/player identity stays provider-neutral and fail-closed.

## FT-20261007-001 milestone release — confirmed lineups and player performance

The first release milestone is accepted on exact real evidence. Public fixture/player
identity remains provider-neutral; Bet365 is a bookmaker/price source only.

Production examples:
- `FB6401` Argentina v Benin: 22 confirmed starters + 26 confirmed bench,
  0 source-confirmed unresolved lineup rows, 22 player performance records,
  all performance joins by exact FotMob player id.
- `FB6402` Mexico v Chile: 22 predicted starters, 0 confirmed, 30 bench rows,
  0 player performance rows. No missing statistic is zero-filled.

Identity hardening:
- `app-match-detail` v39 dedupes by canonical player identity first.
  Unresolved observations stay provider-local and are not merged from shirt/name
  similarity.
- `phase2-fotmob-lineups` v22 can run an exact-match profile backfill with
  `profilesOnly=1&matchId=<canonical id>`; it only resolves exact numeric FotMob
  ids already stored in lineup evidence.
- The FB6401 targeted run wrote 24 remaining bench profiles with 0 failures,
  changing official bench canonicalization from 2/26 to 26/26 after the earlier
  global pass.

Presentation:
- Lineup UI consumes the API's canonical merged rows directly and preserves all
  provider provenance instead of choosing one provider and dropping valid players.
- Rendered regression coverage now includes desktop 1440×900, tablet 820×1180 and
  mobile 390×844, plus a mixed-provider canonical lineup test.

Acceptance/release:
- PR verification #453 (run `37550407808`) passed on exact commit
  `036c4cf25f3a15798f0c8ed35e51add2c2aa51e2`.
- Railway public deployment `5c9469a9-ae96-4a1f-b533-685385b84179` reached
  SUCCESS on that exact commit, Online 1/1. Public health and FB6401 detail routes
  returned HTTP 200 after cutover.
- Supabase security advisor reports no ERROR/WARN findings.
- No public base table/view name or active cron contains HKJC; tested public
  Phase 1/detail/live responses contain zero literal HKJC.

Next work should improve exact player/availability coverage and validated fair-price/
edge surfaces. Do not perform broad cosmetic legacy renames ahead of evidenced
delivery gaps, and never replace canonical identity with bookmaker identity.

## FT-20261007-003 official lineup dedup production acceptance

- Reconciled the interrupted Assignment 003 state before changing code. PR #44 had advanced to `8f3f5ace47130a6fc88c3eb95f223ad7c03f0ff3` with CI #470 / run `37557279743` green. The dedup implementation itself was already deployed; do not reapply the earlier writes/migrations.
- Production Edge state at reconciliation: `app-match-detail` v42 SHA `7dd8e6f35e76524e8d658f3c28f0eafe120959e4bbc77eaf019df0ac8e632f61`; `phase2-fotmob-lineups` v22 SHA `f4ae0072d3149692b233e288fd2d246c4147690ee36747c1209ae362d3db2067`; `phase2-sofascore-lineups` v6; `app-phase1-feed` v83; `app-live-feed` v18.
- Railway public service `fast-tracker-public` is live at `https://fast-tracker-public-production.up.railway.app`, source branch `phase0/international-authority`, application commit `a449438edb8dba12a2f0df60adeb73129b9c7c46`, deployment `a8b79c41-d0dc-4fdc-bc80-b84d47a6a73b` SUCCESS. Later branch commits through 8f3f5ace were test-only acceptance hardening, so no application-code drift required a new frontend deploy.
- Real recent acceptance fixture: `FB6373`, Colo Colo v Puerto Montt, public URL `https://fast-tracker-public-production.up.railway.app/details?id=FB6373`. Stored evidence currently contains 80 official provider observations (44 starter observations + 36 bench observations) because FotMob and Flashscore each report the official squad. Deployed `app-match-detail` v42 returns 40 public squad rows: exactly 22 starters, all 22 confirmed, 18 bench, 22 lineup rows with match stats, and 22 playerMatchStats records joined by `EXACT_FOTMOB_PLAYER_ID`. FotMob detail `6356356` has a 40-player raw playerStats object captured at `2026-10-07T00:27:07.995Z`; only exact lineup/player ids are attached to public rows.
- Cross-provider collapse remains roster-safe: stage one collapses exact canonical player identities; stage two only collapses confirmed official FotMob/Flashscore observations sharing team side + starter/bench state + positive shirt number. Distinct similar-name players therefore remain separate. FB6373 real evidence contains, for example, Cristian Díaz (#42 home starter), Gedeón Díaz (#54 home starter) and Danilo Díaz (#6 away starter), all preserved as separate public players.
- Current/upcoming control fixture: `FB6402`, Mexico v Chile, public URL `https://fast-tracker-public-production.up.railway.app/details?id=FB6402`. Stored/API evidence remains 52 canonical squad rows with exactly 22 predicted starters, 0 confirmed starters, 30 bench rows and 0 playerMatchStats. Missing match statistics remain unknown; they are not zero-filled or promoted to confirmed.
- CI #470 directly exercised the deployed Railway site, not mocks: `tests/production-player-lineup.spec.js` ran six production Playwright checks against FB6373/FB6402 at desktop 1440×1000, tablet 1024×1366 and mobile 390×844; all 6 passed. The same CI also passed all 35 deterministic public-flow tests, build, static routes, provider/market contracts, real-evidence safety, evidence independence and player-identity checks. Screenshot artifact ID: `11455592141`.
- Follow-up regression commit `db06d3c4ab32fa75b2f648ed2d95e00f5e0e7090` extends the production test to require Cristian Díaz, Gedeón Díaz and Danilo Díaz simultaneously, explicitly guarding against same-surname over-collapse. This is test-only and does not change production behavior.
- Recovery: if the public frontend later regresses, Railway deployment `a8b79c41-d0dc-4fdc-bc80-b84d47a6a73b` is the known-good live application release. Edge rollback should use the immediately prior `app-match-detail` deployed source/version only if a future Edge deployment changes the dedup contract; no rollback is warranted at this checkpoint.
- Remaining gap: raw storage intentionally retains independent provider observations (80 rows for FB6373); dedup occurs in the public canonical API so provenance is preserved. Availability rows can still be source-confirmed while player identity is unresolved and must remain explicitly unresolved. The next unfinished outcome is broader exact player/availability canonicalization and then versioned fair-probability/value coverage; do not replace canonical identity with bookmaker identity.



## FT-20261007-004 exact player identity + HDA v2 checkpoint

Player identity milestone:
- Reconciled PR #44 from the FT003 durable state without replaying the earlier
  lineup dedup or fixture-redirect work.
- Exact cross-provider identity backfill uses only confirmed official FotMob and
  Flashscore observations that agree on canonical match, team side,
  starter/bench role and positive shirt number, and only promotes a provider id
  when the relationship is bijective across the measured 30-day evidence window.
- 940 Flashscore player ids are now mapped exactly through
  `phase2_players.source_ids.flashscore`; verification reports 940/940 exact
  mappings and zero conflicts. A non-bijective case for canonical player
  `648366` (Zhunyi Gao) had two Flashscore ids, so its Flashscore mapping was
  removed and remains unresolved rather than guessed.
- Raw provider observations in `phase2_match_lineup_evidence` were not deleted
  or rewritten. Recovery for this additive alias batch is to remove only the
  `flashscore` key from the mappings added in this checkpoint; the raw evidence
  remains the reconstruction source.
- `app-match-detail` v43, Edge SHA
  `9fe84610e32ce9100fcff00dc6e4d1a4d84212321379f412590a48a6b6279df9`,
  resolves exact Flashscore aliases to canonical player key/name and publishes
  identity method `EXACT_FLASHSCORE_PLAYER_ID`; unmatched provider identities
  remain `UNRESOLVED`.
- Real API regression fixture `FB6287` has Flashscore-only official lineup
  evidence. Provider player `j7xVIm1h` now resolves exactly to canonical
  `1646522 / Puso Dithejane`; other unmatched rows on the same fixture remain
  unresolved. This exact production assertion is part of
  `tests/production-player-lineup.spec.js`.
- Current acceptance fixtures were refreshed instead of weakening assertions:
  `FB6317` is the confirmed XI + real player-stat control and
  `FS:EorMYH1s` is the predicted XI + unknown-stat control. One bounded reload
  is allowed only for a transient public fetch; after reload the same exact
  predicted/11v11/unknown-stat assertions are still required.
- CI #476 / run `37628360273` completed SUCCESS on commit
  `7fceb734a440def2c9791c94cbc8bbba1fb8ef3a`, including the deployed exact
  Flashscore identity API regression, production lineup checks at
  desktop/tablet/mobile and the full rendered-flow suite.
- Railway `fast-tracker-public` intentionally remains on deployment
  `a8b79c41-d0dc-4fdc-bc80-b84d47a6a73b` SUCCESS because FT004 player identity
  is an Edge/API change; no frontend application redeploy was required.

HDA probability/value progression:
- Migration `phase4_version_hda_probability_contract` is registered in
  production as version `20261007133152`; repository source is
  `supabase/migrations/20261007133000_phase4_version_hda_probability_contract.sql`.
- `PHASE4_HDA_CONSENSUS_V2` admits a model family only when all H/D/A
  probabilities are present, non-negative and have a positive total; each
  accepted family is normalized before consensus. Dixon-Coles and Pi continue
  to count as one correlated internal evidence family.
- Post-release validation currently has 12 HDA matches / 36 consensus rows:
  all 12 are complete three-selection triplets, all 12 sum to 1 within
  0.000001, and all 12 have a consistent independent-family count across H/D/A.
- Value calculations are explicitly versioned as `PHASE4_HDA_VALUE_V2`.
  Published metadata now names proportional de-vig market probability,
  reciprocal-model-probability fair odds, probability edge and expected-ROI
  methods.
- Predictive calibration is deliberately published as `NOT_ESTABLISHED`.
  Structural probability validity is not presented as proof that the model is
  profitable or calibrated.
- Current genuine sourced HDA value feed remains deliberately fail-closed:
  `FB6355` has a complete POLYMARKET H/D/A board but only one independent
  model family, so all three selections remain `LOW_COVERAGE`, not `VALUE`.
  Current model probabilities/fair prices are HOME 0.5074105 / 1.971,
  DRAW 0.2881825 / 3.470, AWAY 0.2044070 / 4.892. The HOME calculated edge is
  +19.3685 percentage points and expected ROI +53.3014%, but it is still
  suppressed by the two-family minimum because predictive calibration is not
  established.
- The HDA migration was first transaction-dry-run successfully, then applied
  through Supabase migration tracking. Its refresh produced 36 consensus rows
  and 3 current value rows without modifying provider source evidence.
- CI #477 validates repository head
  `f2af39037001ceafbd2b3f0e4c9d8497d1b3c3b2`; record the final conclusion
  below after the documentation checkpoint commit.

Recovery:
- Player API rollback: redeploy prior `app-match-detail` v42 source/SHA
  `7dd8e6f35e76524e8d658f3c28f0eafe120959e4bbc77eaf019df0ac8e632f61`
  only if v43 regresses.
- HDA rollback: restore `phase4.refresh_model_consensus()` from
  `20261007011800_phase4_collapse_correlated_model_methods.sql`, restore the
  prior `phase4.refresh_value_opportunities()` definition, then run
  `select phase4.refresh_core();`. Source odds/predictions are not deleted.

Next unfinished outcome:
- Establish genuine out-of-sample HDA calibration/backtest evidence and increase
  independent model-family coverage before allowing LOW_COVERAGE rows to become
  public value selections. Continue expanding exact provider-neutral
  player/availability mappings only from strict evidence; do not fuzzy-merge
  same-name players or convert unknowns to zeros.


## FT-20261007-005 validated HDA release-gate checkpoint

FT004 reconciliation before advancing:
- PR #44 was reconciled at exact head `089b88fdb20b545aed3818a9fc7e27a2ec359812`.
  CI #478 / run `37629340914` completed SUCCESS on that exact head.
- Production `app-match-detail` was ACTIVE v43, SHA
  `9fe84610e32ce9100fcff00dc6e4d1a4d84212321379f412590a48a6b6279df9`.
- Supabase migration registry already contained
  `20261007133152 phase4_version_hda_probability_contract`; it was not replayed.
- The prior exact Flashscore identity batch remains 940/940 safe bijective mappings
  with zero conflicts. Canonical player `648366` (Zhunyi Gao) remains deliberately
  unmapped for Flashscore because two provider ids were non-bijective. Raw lineup
  observations remain unchanged.

HDA validation gate delivered:
- New repository migration:
  `supabase/migrations/20261007140500_phase4_gate_value_on_model_validation.sql`.
  It was transaction-dry-run first, then applied once through migration tracking as
  `20261007140128 phase4_gate_value_on_model_validation`.
- Consensus is now `PHASE4_HDA_CONSENSUS_V3`; value calculation is
  `PHASE4_HDA_VALUE_V3`. Complete, non-negative H/D/A family probabilities are
  normalized before consensus. Dixon-Coles + Pi remain one correlated internal
  evidence family.
- Consensus lineage now carries model capture timestamps plus stored evaluation
  evidence. Value lineage carries canonical match id, provider/external event id,
  compatibility verification, source/fetch timestamps, settlement key, commission,
  calculation method/version and model-consensus timestamp/version.
- Release status now fails closed in this order: stale quote -> model-validation gap
  -> source coverage -> value/watch/no-edge. A calculated fair price or edge cannot
  become a public `VALUE` while predictive release validation is not established.
- Current stored evaluation evidence does not justify a validated prediction claim:
  Dixon-Coles has 0 settled evaluation matches; Pi has 0. Forebet has 10 settled
  matches with stored RPS/Brier/log-loss metrics, but Forebet is not a contributing
  family for the representative FB6355 consensus. Therefore
  `release_validation_status=NOT_ESTABLISHED` is intentional.

Representative genuine current evidence:
- `FB6355` Botafogo v Vasco da Gama is bound to a compatibility-verified Polymarket
  H/D/A market, external event `1075390`, settlement
  `SOCCER_90M_1X2_USDC_UNHEDGED`. At the final checkpoint query, quote source time
  was `2026-10-07T14:12:00.806Z` and quote age was about 239 seconds.
- HOME: odds 3.030303, model probability 0.50741050, de-vig market probability
  0.32352940, calculated probability edge +18.3881 percentage points, expected ROI
  +48.7285%.
- DRAW: odds 3.571429, model probability 0.28818250, de-vig market probability
  0.27450976, calculated edge +1.3673 points, expected ROI -0.6887%.
- AWAY: odds 2.439024, model probability 0.20440700, de-vig market probability
  0.40196083, calculated edge -19.7554 points, expected ROI -51.5871%.
- All three remain `MODEL_VALIDATION_GAP`, not betting recommendations. These values
  are derived analysis outputs from sourced prices and the current model; they are
  not evidence that the model is profitable or independently calibrated.

API and public rendering:
- `app-match-detail` v44 is ACTIVE with SHA
  `7095b8e1aee3e52f09c345f4b9d9074b6be8a27a153f14d1ea6d0493602619fa`.
  Commit `9e1072e69c41b4fbff5bf9eaadf72c607cb9de74` added the derived-value
  `details` projection so calculation/validation/capture lineage reaches the public
  client instead of existing only in Postgres.
- Frontend commit `d474abc9f2f951e67df58f55a929186e2033988b` displays
  `WATCH · MODEL VALIDATION GAP` and `NOT ESTABLISHED` only when validation
  metadata is actually supplied, while preserving the previous coverage hierarchy for
  legacy/mock rows without validation metadata.
- Railway `fast-tracker-public` deployment
  `a42da384-261d-4f33-aa57-fb415a3a3593` is SUCCESS in `sfo`, pinned to exact
  application commit `d474abc9f2f951e67df58f55a929186e2033988b`.
- Production HDA view acceptance runs against real
  `/details?id=FB6355` at desktop 1440x1000, tablet 1024x1366 and mobile 390x844.
  The tests require the Phase 4 board, exact `NOT ESTABLISHED`, exact
  `WATCH · MODEL VALIDATION GAP`, calculation version `PHASE4_HDA_VALUE_V3`,
  and the explicit predictive-release-validation warning.
- Final pre-documentation test head
  `e28db56cbfbaa179ba10de809175c2d778798080` passed CI #485 / run
  `37635155912`. The production acceptance also retains:
  - exact Flashscore player identity regression on `FB6287`;
  - confirmed lineup/player-stat control `FB6317` with near-name players kept distinct;
  - predicted 11v11 control `FB6365` with 0 confirmed starters and missing match
    player statistics remaining unknown, never zero-filled;
  - the full deterministic rendered-flow suite.

Recovery:
- HDA database functions: restore the V2 definitions from
  `20261007133000_phase4_version_hda_probability_contract.sql`, then run
  `select phase4.refresh_core();`. Provider quotes, fixtures, predictions and
  evaluation evidence are not deleted by either direction.
- Edge rollback: redeploy v43 / SHA
  `9fe84610e32ce9100fcff00dc6e4d1a4d84212321379f412590a48a6b6279df9`
  if the v44 details projection regresses.
- Railway rollback: deployment `a8b79c41-d0dc-4fdc-bc80-b84d47a6a73b` remains
  the prior known-good public application release if the d474 UI needs rollback.

Post-DDL advisor state:
- Supabase security advisor still reports legacy INFO findings for RLS-enabled
  tables without policies and one existing WARN for `pg_net` installed in
  `public`. These were not introduced by this HDA function migration and are not
  represented as a clean advisor state.

Next unfinished outcome:
- Build genuine versioned out-of-sample HDA evaluation/calibration with sufficient
  settled matches and explicit release thresholds. Only an evidence-backed validation
  state may lift `MODEL_VALIDATION_GAP` into `VALUE`.
- Increase independent model-family coverage only from genuinely independent sourced
  evidence. Continue strict provider-neutral player/availability identity improvement
  without fuzzy same-name merging or destructive provenance cleanup.
- The whole-platform release remains incomplete until the broader handoff acceptance
  programme is verified.
