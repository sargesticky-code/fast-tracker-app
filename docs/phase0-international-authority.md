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


## FT-20261007-007 prospective HDA production acceptance + reliability checkpoint

Reconciled state without replay:
- PR #44 head before FT007 changes: `d8e48e5345ef9ecc17d14c87575a10c0fe3f2b69`.
- Supabase migration registry contains exactly one prospective evaluation migration:
  `20261007145543 phase4_prospective_hda_evaluation`, in addition to
  `20261007140128 phase4_gate_value_on_model_validation` and
  `20261007133152 phase4_version_hda_probability_contract`.
- Railway public deployment `53df51af-b507-40c2-a829-093da394c25f` is SUCCESS,
  region `sfo`, built from application commit
  `52102121e2b403eba0e1bd783acadc1b6aa95bf3`.
- Deployed `app-match-detail` is ACTIVE v45, SHA
  `945804c1556f322d614c57191d3cadc4144d0e07266166ba094516013f1f421e`.
  v45 was not replayed. Its exact deployed source was checkpointed back into Git in
  commit `1d9db76250fccd83135100d2f47a4ce20593626d` so recovery is reproducible.

Prospective HDA evaluation evidence:
- `PHASE4_HDA_EVAL_V1` uses the latest complete normalized H/D/A snapshot captured
  at least 30 minutes before kickoff; `source_updated_at` must be null or no later
  than kickoff. Outcomes come from settled `private.match_results`.
- Current accepted coverage:
  - Dixon-Coles: 27 settled matches, one coverage day (2026-09-20), Brier
    0.190918, RPS 0.216119, log loss 0.959177, top-pick accuracy 55.56%.
  - Pi: 27 settled matches, one coverage day, Brier 0.218457, RPS 0.244544,
    log loss 1.127863, top-pick accuracy 51.85%.
  - INTERNAL_BLEND (the correlated DC/Pi family used by Phase 4): 27 settled
    matches, one coverage day, Brier 0.202389, RPS 0.227819, log loss 1.013922,
    top-pick accuracy 59.26%, top calibration gap -0.092630.
  - Forebet: 52 settled matches across five coverage days (2026-09-16..20),
    Brier 0.213552, RPS 0.224649, log loss 1.058081, top-pick accuracy 50.00%.
- These scores are prospective-snapshot/outcome leakage guarded, but model training
  cutoff cannot be independently verified because the external model-build pipeline
  is not present in this repository. Every evaluation row therefore has
  `training_cutoff_verified=false`,
  `training_cutoff_status=UNVERIFIED_EXTERNAL_MODEL_BUILD` and
  `release_validation_status=TRAINING_CUTOFF_UNVERIFIED`.
- Limited capture history is not treated as release-ready calibration evidence.

Representative genuine current value evidence:
- Public fixture URL:
  `https://fast-tracker-public-production.up.railway.app/details?id=FB6355`.
- Canonical fixture `FB6355` remains bound to compatibility-verified POLYMARKET
  event `1075390`, settlement `SOCCER_90M_1X2_USDC_UNHEDGED`.
- Latest verified quote lineage at checkpoint:
  `source_ts=2026-10-07T15:47:01.093Z`,
  `fetched_at=2026-10-07T15:47:13.52925Z`.
- Current V4/V3 derived rows:
  - HOME odds 3.125000; model 0.50741050; de-vig market 0.31372547;
    calculated edge +19.3685pp; calculated expected ROI +53.3014%.
  - DRAW odds 3.703704; model 0.28818250; de-vig market 0.26470585;
    calculated edge +2.3477pp; calculated expected ROI +2.9394%.
  - AWAY odds 2.325581; model 0.20440700; de-vig market 0.42156868;
    calculated edge -21.7162pp; calculated expected ROI -53.7935%.
- All three rows remain `MODEL_VALIDATION_GAP`,
  `PHASE4_HDA_VALUE_V3`, `PHASE4_HDA_CONSENSUS_V4`,
  validation `TRAINING_CUTOFF_UNVERIFIED`. These are analysis outputs, not
  validated opportunities or betting recommendations.

Production acceptance:
- CI #490 / run `37641474308` live production acceptance step passed 11/11:
  exact Flashscore identity, FB6355 API lineage, FB6355 rendered value board on
  desktop 1440x1000 / tablet 1024x1366 / mobile 390x844, confirmed XI/player stats,
  predicted XI and unknown-not-zero controls.
- The overall #490 workflow is FAILURE only because the separate mocked local
  `public-flow.spec.js` suite has 13 legacy UI expectation failures (for example
  stale `Bet365 HDA`, `Goals 2.5` and test-fixture visibility assertions).
  This is recorded as an integration-suite debt; it is not represented as a green
  full-CI result.
- Lineup/player acceptance therefore remains preserved, including distinct
  near-name players and predicted/confirmed semantics.

Recovery:
- Evaluation functions/table: restore V3 consensus from
  `20261007140500_phase4_gate_value_on_model_validation.sql`; drop only the
  additive evaluation layer if needed; run `select phase4.refresh_core();`.
  Raw snapshots/results/quotes are not modified.
- Edge: deployed v45 is now durably represented by Git commit
  `1d9db76250fccd83135100d2f47a4ce20593626d`; prior v44 SHA
  `7095b8e1aee3e52f09c345f4b9d9074b6be8a27a153f14d1ea6d0493602619fa`
  remains the previous rollback point for the details-lineage era.
- Railway: deployment `53df51af-b507-40c2-a829-093da394c25f` is the accepted
  public application deployment for this checkpoint.

Remaining release gaps:
- Training-data cutoff / model-build lineage is still unverifiable.
- Internal prospective sample is only 27 matches from one day; Forebet is 52 matches
  across five days. No release validation threshold has been satisfied.
- Full CI remains red because the independent mocked local rendered-flow suite is
  stale/broken relative to the current UI.
- Full platform release remains incomplete.

Next unfinished outcome:
- Repair the deterministic local rendered-flow fixtures/assertions to match current
  provider-neutral UI semantics without weakening evidence checks.
- Continue notebook-independent ingestion/reliability work using existing authorized
  providers and scheduled infrastructure; no expanded scraping/provider scope.


## FT-20261009-010 — trustworthy CI baseline recovery

Reconciliation before edits:
- Saved interrupted head `2863f6aac0df9d927507642e83eb5c9f06d745cc` was still the exact PR #44 head.
- No CI existed after #510 before this recovery began. CI #510 / run
  `37703848528` failed before executing production tests because
  `tests/production-player-lineup.spec.js` was physically corrupted: the live-score
  regex/template literal was truncated and a duplicate copy of the test file had been
  inserted inside it.
- No migration or deployment was replayed.

Repairs:
- Restored the last known-good production acceptance body from
  `cf56c34bc1ff32116ebbeb6f0d03686b5179261a`, then re-applied the intended
  live-score provenance/render assertion without deleting or weakening checks.
- Commits `ccdf1525ea7a27e5a861d56eaf26bc8a549d76dc` and
  `d2f76852ff85a32f25eb55b464ee4b5611a68de8` repaired the corrupted test.
- CI was adjusted in `38b87e8a5540733d39f7ceee77b8a1ebb11ab23e` so a failing
  real-production acceptance is captured, reported, and still allows the independent
  mocked `public-flow.spec.js` suite to run. The final job still fails if either
  production or mocked rendered acceptance is red; no gate is skipped or weakened.

CI after #510:
- #511 / run `37866915326`: FAILURE on the first syntax-repair commit.
- #512 / run `37866974695`: FAILURE; syntax was fixed and all 13 production tests
  executed, exposing current production-state failures.
- #513 / run `37867425431`: FAILURE on exact application/test head
  `38b87e8a5540733d39f7ceee77b8a1ebb11ab23e`.
  - Build/static routes and all safety/provider/evidence/player-identity contracts: PASS.
  - Mocked rendered flow: **35/35 PASS**.
  - Real production acceptance: **4/13 PASS, 9 FAIL**.
  - Confirmed XI + real player stats: desktop/tablet/mobile PASS.
  - Exact Flashscore identity control: PASS.

Concrete production blockers observed on 2026-10-09:
- `public.phase4_value_api` currently contains **0 HDA rows**. The historical FB6355
  control therefore returns no value rows and the public `.phase4-board` is absent
  on desktop/tablet/mobile. This is a real fail-closed production state, not a selector
  relaxation opportunity.
- `public.source_health` reports
  `FLASHSCORE_BET365 / cloud_ingest = ERROR / STALE`, observed
  `2026-10-09T00:45:01.602Z`, with note “Cloud snapshot missing or older than
  20 minutes.” The Phase 1 production assertion correctly receives `ERROR`, not
  `OK`.
- Current full 11v11 lineup coverage has only confirmed controls in the future window;
  no complete predicted 11v11 + zero confirmed + zero player-match-stats control is
  currently available, so the predicted-control acceptance fails closed rather than
  relabelling a confirmed XI.
- Live API had a fresh live control `FB6350`, but that canonical fixture was not
  visible in the homepage rendered row set during CI #513. This remains a real
  live/public-flow coverage gap; the assertion was not weakened.
- Live source health itself remained fresh (for example `LIVE_SCORE_EDGE=OK` with
  three live matches at `2026-10-09T00:57:01.054Z`), while
  `LIVE_LAYER_GUARD=WARN` honestly reported remaining shadow-detail lag.

Safety invariants retained:
- Missing remains unknown, never zero.
- Exact fixture/player identity remains required.
- Predicted and confirmed XI states remain distinct.
- `MODEL_VALIDATION_GAP` and `TRAINING_CUTOFF_UNVERIFIED` semantics are unchanged.
- No spend, credential change, destructive operation, provider expansion, migration,
  Edge deploy, or Railway deploy occurred.

Assignment boundary:
- The CI/test baseline corruption and mocked rendered-flow debt are resolved.
- A fully green exact-head CI is currently blocked by genuine production data/service
  state, principally stale Bet365 cloud ingestion and the consequent empty HDA value
  surface. The separate ingestion milestone was explicitly not started here.
- Next recovery should begin from this checkpoint and address ingestion/current HDA
  availability first; do not replay migrations or deployments without new evidence.


## FT-20261009-011 — existing odds ingestion to public match page

Starting reconciliation:
- FT-010 head e17561f04f122641ba6d1b952bbec608740f9c47 was still the exact PR #44 head.
- Supabase cron job 38 flashscore-bet365-cloud-ingest remained active at */15 * * * *.
- At assignment start FLASHSCORE_BET365 / cloud_ingest was ERROR / STALE; health observed 2026-10-09T01:00:03.659Z referenced snapshot 2026-10-09T00:13:32.812129Z.
- Railway /snapshot requests were HTTP 200. Runtime logs identified the failing layer: the Flashscore next-day picker intermittently timed out during Playwright click despite resolving visible/enabled/stable.

Normal schedule recovery:
- Producer recovered without manual refresh at 2026-10-09T01:07:59.791Z: 360 fixtures seen, 213 complete HDA.
- Job 38 at 01:15Z ingested snapshot 2026-10-09T01:07:55.023143Z: 213 staged, 210 strictly verified, 3 unresolved, 0 ambiguous.
- A later normal ingest at 2026-10-09T01:30:06.452441Z was also healthy: OK, 207 staged, 203 verified, 4 unresolved, 0 ambiguous, 609 current market legs.

Representative trace — FB6342 Arsenal v Leeds:
- Canonical fixture FB6342; kickoff 2026-10-10T11:30:00Z; provider event xtmHKGT0.
- Source/stored capture 2026-10-09T01:07:55.023143Z; identity VERIFIED.
- Duplicate checks: one flashscore_bet365_current row, one distinct provider event ID, one bet365_current canonical row, exactly three Phase-4 BET365 H/D/A legs.
- Stored prices at trace checkpoint: HOME 1.40, DRAW 5.00, AWAY 7.00.
- Phase-4 job 23 ran at 2026-10-09T01:16:00.272876Z; all three legs became MODEL_VALIDATION_GAP, not actionable VALUE.
- Lineage retains BET365, FB6342, compatibility verification, source timestamp, PHASE4_HDA_VALUE_V3, PHASE4_HDA_CONSENSUS_V4 and PHASE4_HDA_EVAL_V1.
- training_cutoff_verified=false, training_cutoff_status=UNVERIFIED_EXTERNAL_MODEL_BUILD and release_validation_status=TRAINING_CUTOFF_UNVERIFIED remain unchanged.
- The public detail critical RPC contains the same three rows; the public sanitizer intentionally omits provider external-event ID while retaining public-safe canonical ID, provider, source timestamp and compatibility verification.

Repair and release:
- Commit 81c8e29b5c03812c4315ca806bffc3e7fdb96410 adds a narrow collector fallback: normal Playwright click first; only after that exact day-picker click times out does the same target receive DOM el.click(). Provider scope, freshness, identity and price admission rules are unchanged.
- Test follow-ups: db339d1c3d8f42d71723ac2e0184810eb4f68768 and 7239cbe9161dfeeb633b1801d2030aec79348f94.
- Railway collector deployment ec08e279-4f64-44eb-a3fe-c94de4c135e5 SUCCESS on commit 7239cbe9161dfeeb633b1801d2030aec79348f94. Healthcheck succeeded.
- First post-deploy refresh: 01:31:08Z current-day discovery, 01:31:14Z next-day discovery, 01:31:34Z complete with 360 fixtures / 211 complete HDA. No day-picker timeout occurred.
- No Supabase migration, Edge deployment, or public frontend deployment was performed.

CI:
- #515 / run 37869121950: FAILURE; scheduled Bet365 ingest passed, initial dynamic HDA test discovery was wrong; mocked public-flow 35/35 PASS.
- #516 / run 37869690351: FAILURE; FB6342 HDA board rendered desktop/tablet/mobile; API test only over-asserted a sanitized external ID; mocked public-flow 35/35 PASS.
- #517 / run 37870034287 on application/test head 7239cbe9161dfeeb633b1801d2030aec79348f94: FAILURE overall, but FT-011 odds outcome is green: HDA API validation-gap lineage PASS; scheduled Bet365 ingest -> Phase 1 -> rendered homepage PASS; FB6342 HDA rendering desktop/tablet/mobile PASS; build/static/provider/safety/evidence/player-identity PASS; mocked public-flow 35/35 PASS.
- Remaining #517 failures are outside this assignment's odds path: live-score homepage visibility, intermittent confirmed-XI rendering, and no current predicted-XI control.

Safety / boundary:
- Missing remains unknown; no synthetic prices or fixtures were inserted. Strict unique canonical identity remains required.
- Fresh prices remain MODEL_VALIDATION_GAP while model qualification is TRAINING_CUTOFF_UNVERIFIED; no unvalidated price becomes an actionable betting recommendation.
- The broader fixture audit / multi-cycle ingestion milestone was not started.


## FT-20261009-012 — close remaining real-production match rendering checks without manufacturing controls

Starting reconciliation:
- PR #44 started this assignment at exact head cd949276b1120d6d95a8d06b174c730d48c8eabf; no CI run existed after #518.
- CI #518 / run 37870513408 was the last settled run at start, with the four FT-011 residual failures reported as one live-homepage render failure plus three predicted-XI controls.

Current production evidence:
- Fresh live canonical rows existed in public.live_score_feed_current and joined exactly to public.canonical_fixture_current.
- Representative live control during the repair: FB6350 Palmeiras v Bahia, canonical match_id FB6350, source FOOTBALL_LIVE_API_SELF_HOSTED, source_match_id 5103647, confidence 1.0. During acceptance it was LIVE with fresh source timestamps and score 1-0; FB6352 was a second concurrent canonical live control.
- Root live rendering defect: app-phase1-feed is future-only (kickoff >= now), while homepage mergeLiveOverlay previously overlaid live evidence only onto fixture IDs already present in that future authority list. Therefore an exact canonical fixture disappeared from the homepage immediately after kickoff despite remaining fresh in app-live-feed.
- Predicted lineup control search is fail-closed. Repeated current queries of phase2_lineup_coverage_current found zero future fixtures more than two hours out with home_starters=11 and away_starters=11. The broader future coverage set was MISSING/0 starters; phase2_lineup_display_current had no eligible future complete rows. No confirmed fixture was relabelled as predicted and no unknown player data was invented.

Repair:
- bcbce690e294ce0628e5fb95cdbab83be93d66f1: homepage can append live-only rows after kickoff instead of requiring presence in the future authority feed.
- 09a03caf6b110b81c5ae6b28794c0498fe2ed851: mocked browser regression uses a live fixture absent from the authority list.
- Safety gate initially rejected a broad live union on CI #519 / run 37871625976. The implementation was tightened instead of weakening evidence rules.
- 4eb3c4cc3176d389faa4f81d70259791adb4ab1e: app-live-feed now rejects any fresh live score whose match_id does not resolve to canonical_fixture_current before publishing it.
- 784d78d0b1481df227d55ff6bf8aec59c62878c3: safety contract requires the canonical live-only union and exact canonical rejection path.
- The live-score production assertion also contained a pre-existing over-escaped whitespace regex. A first edit corrupted the test file and CI #521 / run 37872876454 was not valid production acceptance evidence. 939d7c84331ffcf9bd9f5faad53bb82426a873fb restored the last known parsable file and implemented the score regex without template-literal escape ambiguity.

Deployments required by the evidenced live defect:
- Supabase app-live-feed deployed from this repair as version 19, verify_jwt unchanged false.
- Railway public frontend deployment b8de3d7a-d10b-49aa-be70-3c111cb9bbef SUCCESS on application commit 784d78d0b1481df227d55ff6bf8aec59c62878c3.
- No migration, provider addition, scraping expansion, credential change, or ingestion-cycle work was performed.

CI progression:
- #519 / run 37871625976: failed early at real-evidence safety; build/production/render skipped. This prevented unsafe deployment.
- #520 / run 37871823365 before deployment: build and real-evidence safety PASS; mocked public-flow 35/35 PASS; production still used old live rendering and remained red. After deploying app-live-feed v19 and Railway frontend b8de3d7a..., the failed jobs were rerun on the same exact head. On rerun the live fixture row was visible and live-tag passed; the only live-test failure was the over-escaped score-text regex. Predicted-XI remained absent.
- #521 / run 37872876454: invalid for production acceptance because the one-line regex edit physically corrupted production-player-lineup.spec.js. Mocked public-flow still passed 35/35. This run is recorded but not used as acceptance evidence.
- #522 / run 37873076667 on code/test head 939d7c84331ffcf9bd9f5faad53bb82426a873fb: build/static/provider/safety/evidence/player-identity checks PASS; mocked public-flow 35/35 PASS including the new live-only canonical union regression. Real production live rendering PASS; scheduled Bet365 ingest PASS; confirmed XI + player stats PASS desktop/tablet/mobile. Predicted XI FAIL desktop/tablet/mobile because no real complete predicted control exists.
- During #522 the previously settled HDA control also became unavailable: current phase4_value_api returned no complete BET365 HAD_1X2 rows, while FLASHSCORE_BET365 cloud_ingest remained OK (02:00Z health: 192 staged, 186 verified, 6 unresolved, 0 ambiguous, 558 market legs). Therefore HDA API and desktop/tablet/mobile HDA board checks failed closed. No MODEL_VALIDATION_GAP or TRAINING_CUTOFF_UNVERIFIED gate was bypassed.

Current unresolved blockers / next action:
- Predicted-XI blocker: provider/data availability. Need a genuinely future fixture with 22 persisted starters, explicitly predicted/unconfirmed, zero confirmed starters, and zero player-match stats. Until such data exists, the three predicted acceptance assertions must remain red.
- Current HDA blocker is data/model qualification surface availability, not homepage live rendering: ingestion is healthy but phase4_value_api currently exposes no complete BET365 HDA rows. Missing HDA remains unknown and no stale/synthetic row is promoted.
- The broader fixture audit and three-cycle ingestion milestone were not started.

## FT-20261009-013 — restore trustworthy future predicted-lineup coverage from existing provider path

### Reconciliation
- PR #44 started at exact head `13947452a2f5f317a7bd0a7d1e828e28f3ee69a5`, open/draft/mergeable. No workflow existed after CI #523 at assignment start.
- FT-012 deployment claims reconciled as current: `app-live-feed` v19 remained active and the public Railway service remained on the successful FT-012 deployment path. No FT-013 application deployment was needed.

### Existing provider path traced
- Production predicted-lineup source is `phase2-fotmob-lineups` (cron job 36, `22,52 * * * *`). Flashscore lineup scout jobs 32/33 are existing official-lineup upgrade paths only: their parser emits `FLASHSCORE_OFFICIAL`, `confirmed=true`, and therefore are not a predicted-XI source.
- FotMob health at `2026-10-09T02:22:05.624Z`: matched 92 canonical fixtures, picked 16, detailOk 16, detailFail 0, lineupFound 0, promotedMatches 0, predictedMatches 0, confirmedMatches 0.
- This establishes successful provider reachability and fixture matching while the selected upcoming provider detail payloads themselves contained no usable lineup.

### Representative provider/data blocker control
- Canonical fixture: `FS:l2OiWEbt` — Daejeon vs Jeonbuk, kickoff `2026-10-09T05:00:00Z`.
- FotMob event `5140042`; source names Daejeon Hana Citizen vs Jeonbuk Hyundai Motors FC; match confidence `0.96`; identity status `TOKEN_PAIR`.
- Fresh FotMob detail fetched `2026-10-09T02:22:03.573Z`; `detail_available=true`, `lineup_available=false`, and `content.lineup` is null.
- Persisted `lineup_evidence_current` rows for this future fixture: 0; starters: 0; confirmed starters: 0.
- `ft_internal_app_match_detail_critical('FS:l2OiWEbt')` returns the canonical fixture and fresh source detail with `lineups: []`. Player match stats are not promoted from missing lineup evidence.
- Flashscore also had source-match detail for the same canonical fixture, but its production lineup promotion semantics are official-only and it does not manufacture predicted starters.

### Public rendering proof
- Added a separate production fail-closed check without changing the original predicted-XI acceptance. The check dynamically selects a genuine future fixture whose public match-detail API returns an empty lineup and empty player-match stats.
- Expected public state is `Waiting for reliable 11v11 lineups` with unknown counts `—/11 home · —/11 away · lineup pending`; neither `PREDICTED 11v11` nor `CONFIRMED 11v11` may appear.
- Commit `f3463baa630413d536d96ec5077f95856b290955` added the proof. CI #524 / run `37875145730` exposed that the initial proof incorrectly expected zero counts rather than unknown counts; product UI was already correct.
- Commit `a7914fe18e480683d935e4d30a0ad3f335032463` aligned the proof with the existing unknown-count semantics. No product logic was changed.

### Exact application/test-head acceptance
- CI #525 / run `37875572397`, rerun on exact head `a7914fe18e480683d935e4d30a0ad3f335032463`:
  - build/static/provider/safety/evidence/player-identity checks PASS;
  - mocked `public-flow.spec.js`: 35/35 PASS;
  - real production: 13/16 PASS, 3 FAIL;
  - live rendering PASS;
  - HDA API + desktop/tablet/mobile HDA board PASS; model release gates remain unchanged;
  - confirmed XI + player stats PASS desktop/tablet/mobile;
  - missing future lineup remains unknown PASS desktop/tablet/mobile;
  - only failures are predicted XI desktop/tablet/mobile because `findPredictedControl` returns null.

### Outcome / blocker
- No ingestion, promotion, API-selection, or rendering defect was found in the existing predicted-lineup path.
- The current blocking layer is provider availability: fresh FotMob match detail is present for correctly mapped future fixtures, but no complete predicted 11v11 is currently published in the provider payload.
- Historical hourly metrics show predicted-full coverage existed earlier, which is consistent with provider timing rather than a permanently broken parser: predicted_full reached 6 in earlier hourly buckets before the current future window moved on.
- Required human action / next action: wait for an existing authorized provider refresh to encounter a future fixture where FotMob actually publishes 11+11 predicted starters, then re-run the unchanged predicted-XI acceptance. Do not relabel Flashscore official rows, confirmed FotMob rows, or empty detail as predicted.
- No credentials, spend, migrations, provider additions, scraping expansion, database writes, Edge deployment, Railway deployment, HDA repair, broad fixture audit, or three-cycle ingestion milestone were performed.

Last completed operation before this checkpoint: exact-head CI #525 rerun completed with 13/16 real-production checks passing and only the three genuine predicted-XI controls red.

## FT-20261009-014 / R1 — first usable release fixture coverage audit

### Exact tested state
- Tested application/test head: `418d09cd7bc6a34ae44ed42d3cc579733528b2c6`.
- CI: #535 / run `37881891681`.
- Build/static/provider/safety/evidence/player-identity steps: PASS.
- Mocked public flow: 35/35 PASS.
- Real production suite: 25/34 PASS, 9 FAIL overall.
- All 18 FT-014 fixture-audit checks PASS: 6 real fixtures x desktop/tablet/mobile.
- The nine non-FT014 failures were: 4 separate HDA checks, 3 standing predicted-XI controls with no genuine future predicted 11v11, plus the pre-existing generic confirmed-XI tablet and generic missing-lineup tablet checks. FT-014 did not change HDA, MODEL_VALIDATION_GAP, or TRAINING_CUTOFF_UNVERIFIED.

### Durable inventory artifacts
- `docs/ft014-upcoming-48h-inventory.csv`: 213 upcoming canonical fixtures.
  - 207 represented by `phase2_lineup_coverage_current`, all `MISSING` at the inventory snapshot.
  - 6 canonical EPL fixtures absent from that coverage view: `FB6342`, `FB6339`, `FB6340`, `FB6343`, `FB6346`, `FB6344`.
  - Absence from the coverage view does not hide the public fixture page; audited `FB6342` renders truthful unknown lineup state.
- `docs/ft014-recent-48h-inventory.csv`: 74 recent canonical fixtures.
  - 44 have some persisted lineup evidence; 30 have none.
  - 43 have at least 22 source-confirmed starter rows.
  - 13 contain predicted starter evidence in addition to or instead of official evidence.
  - 31 have at least one canonical player profile linked from persisted lineup evidence.
  - 0 fixtures have duplicate rows under the exact `(team_side, player_key, source_name)` source-player key in this snapshot.
  - 7 recent canonical targets have active fixture-identity redirect aliases.
- Five same-match-looking FB/FS pairs checked during the audit were already redirected, not unresolved duplicate canonicals: `FS:QRDzcFGi -> FB6351`, `FS:EwfVjHNP -> FB6389`, `FS:E9LhiBpT -> FB6357`, `FS:IZr9qZFa -> FB6365`, `FS:phCOok8j -> FB6354`; each active redirect has confidence 0.995.

### Six exact public-page controls
Routes are `/details?id=<match_id>`.

| Window | Fixture | Exact source/team identity | Public API lineup / stats | Rendered result |
|---|---|---|---|---|
| recent | `FB6350` Palmeiras-Bahia | Flashscore event `Mg7qego4`, teams `hMn9FTbH/UeD7XtzM`, EXACT_PAIR 0.99; FotMob `5103647`, teams `10283/7877`, EXACT_PAIR 0.99 | public API dedupes to 46 `FLASHSCORE_OFFICIAL` rows, 22 starters; 22 source-confirmed, 0 canonically confirmed, 22 `SOURCE_CONFIRMED_IDENTITY_UNRESOLVED`; playerMatchStats=0; starter duplicates=0; latest public lineup source `2026-10-09T02:43:52.394Z` | desktop/tablet/mobile PASS; shows source XI identity unresolved, never labels it predicted or confirmed |
| recent | `FB6352` Fluminense-Coritiba | Flashscore `EmpIvY0N`, teams `EV9L3kU4/KGO4pUqO`, EXACT_PAIR 0.99; FotMob `5103644`, teams `9863/9767`, EXACT_PAIR 0.99 | 46 `FLASHSCORE_OFFICIAL` rows, 22 starters; 22 source-confirmed, 0 canonically confirmed, 22 unresolved; playerMatchStats=0; duplicates=0; latest `2026-10-09T02:43:50.526Z` | desktop/tablet/mobile PASS; truthful unresolved-identity state |
| recent | `FB6351` Santos-Flamengo | canonical target of active `FS:QRDzcFGi -> FB6351` redirect (0.995); persisted source `FOTMOB_OFFICIAL` | 46 rows, 22 starters, 22 canonically confirmed, 0 unresolved, playerMatchStats=0, duplicates=0; latest `2026-10-09T00:22:03.367Z` | desktop/tablet/mobile PASS; confirmed 11v11 |
| upcoming | `FS:0CAcmHeT` Cheongju FC-Seongnam | Flashscore `0CAcmHeT`, teams `2TvjJVf3/WMiRgH8G`, LOOSE_PAIR 0.97; FotMob `5155921`, teams `833651/6614`, TOKEN_PAIR 0.96, detail fetched `2026-10-09T03:52:03.809Z` | lineup=0, starters=0, stats=0, no invented players | desktop/tablet/mobile PASS; `Waiting for reliable 11v11 lineups` and unknown counts |
| upcoming | `FB6342` Arsenal-Leeds | Flashscore `xtmHKGT0`, teams `hA1Zm19f/tUxUbLR2`, EXACT_PAIR 0.99 | lineup=0, starters=0, stats=0; fixture is one of six EPL canonicals absent from the lineup-coverage view | desktop/tablet/mobile PASS; page remains visible and unknown rather than missing/fabricated |
| upcoming | `FS:U5MTgNEi` Al Kholood-Al Qadsiah | Flashscore `U5MTgNEi`, teams `Mqs1WbFK/tvQZtrTd`, EXACT_PAIR 0.99; FotMob `5970150`, teams `1523706/101919`, EXACT_PAIR 0.99, detail fetched `2026-10-09T03:52:04.281Z` | lineup=0, starters=0, stats=0 | desktop/tablet/mobile PASS; truthful unknown state |

Representative player-identity evidence:
- `FB6350`: Flashscore official Andreas Pereira is source player `tShG7cpg` with no canonical profile on that source row, while FotMob predicted Andreas Pereira is canonical player `575779`. This is why the official XI is not promoted as canonically confirmed.
- `FB6352`: Flashscore official Fabio is `GCtnzVHc` with no canonical profile; FotMob predicted Fábio is canonical `30441`. Same strict-identity behavior.
- `FB6351`: official FotMob players resolve directly, e.g. Agustín Rossi `616528`, Alex Sandro `157865`, Danilo `208077`; public canonical confirmation is therefore valid.

### Release interpretation and limitations
- Public-page behavior is truthful for the audited release sample: confirmed is only shown when canonical player identity is resolved; source-confirmed-but-unresolved is explicitly blocked from confirmed/predicted labels; missing future data remains unknown.
- No genuine future predicted 11v11 exists in the audited window. Provider availability remains the predicted-lineup limitation.
- The six EPL canonicals absent from `phase2_lineup_coverage_current` are a coverage-reporting gap, not a demonstrated public-page rendering failure; `FB6342` proves the page still renders fail-closed.
- `FB6350` and `FB6352` expose a player-identity coverage gap on Flashscore official player IDs. Existing FotMob predicted canonical identities are not substituted into official evidence, preserving source semantics.
- The current public API sample has no match-level player stats for these six fixtures; this remains unknown rather than zero/fabricated.
- No provider/scraping expansion, credentials, spend, migration replay, database rewrite, Edge deployment, Railway deployment, HDA repair, or three-cycle ingestion work was performed.

### Completed operations / next action
- Added the full upcoming and recent inventory CSVs.
- Added the six-fixture production audit and corrected its canonical-confirmation classifier; the final 18 FT-014 checks pass on CI #535.
- Next release work should prioritize (1) resolving verified Flashscore official player IDs into canonical players where bijective evidence exists, and (2) deciding whether the lineup coverage reporting view should include all canonical upcoming fixtures, including the six EPL rows. Neither should weaken current fail-closed public rendering.
- Last completed tested operation: CI #535 / `37881891681` completed on `418d09cd7bc6a34ae44ed42d3cc579733528b2c6`; FT-014 18/18 passed.
