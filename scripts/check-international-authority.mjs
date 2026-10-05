import assert from "node:assert/strict";
import { apiFootballFixtures, sportmonksFixtures, sportmonksPremiumQuotes, resolveFixture, oddsApiQuotes, apiFootballOdds, timestamp } from "../lib/international-authority.js";
import { compareBookmakerQuotes, hkjcQuotesFromMatch } from "../lib/market-provider-contract.js";
import { collect } from "./collect-international-authority.mjs";
import { compareAuthorityCoverage } from "../lib/authority-coverage.js";

// Deterministic contract fixtures, NOT real bookmaker observations.
const fetchedAt = "2026-10-04T10:00:00Z", kickoff = "2026-10-04T12:00:00Z";
const raw = { fixture: { id: 123, date: kickoff, status: { short: "NS" } }, league: { id: 39, name: "Premier League", season: 2026 }, teams: { home: { id: 1, name: "Home United" }, away: { id: 2, name: "Away United" } } };
const fixture = apiFootballFixtures({ errors: [], response: [raw] }, fetchedAt).fixtures[0];
assert.equal(timestamp("2026-10-04 10:00"), null);
assert.equal(apiFootballFixtures({ response: [{ ...raw, teams: { home: raw.teams.home, away: raw.teams.home } }] }, fetchedAt).rejected.length, 1);
assert.throws(() => apiFootballFixtures({ errors: { token: "invalid" }, response: [] }, fetchedAt));
const binding = { ...fixture, canonicalMatchId: "existing-fixture", verified: true };
assert.equal(resolveFixture(fixture, [binding]).canonicalMatchId, "existing-fixture");
assert.equal(resolveFixture(fixture, [{ ...binding, awayTeamId: "3" }]).status, "UNRESOLVED");
assert.equal(resolveFixture(fixture, [{ ...binding, kickoff: "2026-10-05T12:00:00Z" }]).status, "UNRESOLVED");
assert.equal(resolveFixture(fixture, [binding, { ...binding, canonicalMatchId: "conflicting-fixture" }]).status, "AMBIGUOUS");
const bookmakerRegistry = [{ key: "pinnacle", label: "Pinnacle", kind: "BOOKMAKER", verified: true }, { key: "bet365", label: "Bet365", kind: "BOOKMAKER", verified: true }, { key: "betfair_ex_uk", kind: "EXCHANGE", verified: true }];
const book = (key) => ({ key, title: key, last_update: fetchedAt, markets: [{ key: "h2h", outcomes: [{ name: "Home United", price: 2.1 }, { name: "Draw", price: 3.2 }, { name: "Away United", price: 3.4 }] }, { key: "totals", outcomes: [{ name: "Over", point: 2.5, price: 1.9 }, { name: "Under", point: 2.5, price: 1.9 }] }] });
const event = { id: "odds-event", sport_key: "soccer_epl", commence_time: kickoff, home_team: fixture.home, away_team: fixture.away, bookmakers: [book("pinnacle"), book("bet365")] };
const options = { fixtures: [binding], competitionMap: [{ sportKey: "soccer_epl", providerKey: "API_FOOTBALL", providerCompetitionId: "39", verified: true }], fetchedAt, bookmakerRegistry };
const result = oddsApiQuotes([event], options);
assert.equal(result.quotes.length, 10);
assert.equal(result.quotes[0].providerKey, "THE_ODDS_API");
assert.equal(result.quotes[0].bookmakerKey, "pinnacle");
assert.equal(oddsApiQuotes([{ ...event, home_team: "Home United U21" }], options).quotes.length, 0);
assert.equal(oddsApiQuotes([{ ...event, home_team: event.away_team, away_team: event.home_team }], options).quotes.length, 0);
assert.equal(oddsApiQuotes([event], { ...options, fixtures: [binding, { ...binding, canonicalMatchId: "other" }] }).quotes.length, 0);
assert.equal(oddsApiQuotes([event], { ...options, bookmakerRegistry: [] }).quotes.length, 0);
assert.equal(oddsApiQuotes([event], { ...options, fixtures: [{ ...binding, providerKey: "SPORTMONKS" }] }).quotes.length, 0);
assert.equal(oddsApiQuotes([{ ...event, bookmakers: [{ ...book("pinnacle"), last_update: null }] }], options).quotes.length, 0);
const incomplete = book("pinnacle"); incomplete.markets = [{ key: "h2h", outcomes: incomplete.markets[0].outcomes.slice(0, 2) }];
assert.equal(oddsApiQuotes([{ ...event, bookmakers: [incomplete] }], options).quotes.length, 0);
const spread = { ...book("pinnacle"), markets: [{ key: "spreads", outcomes: [{ name: fixture.home, point: -0.25, price: 1.9 }] }] };
assert.equal(oddsApiQuotes([{ ...event, bookmakers: [spread] }], options).quotes.length, 0);
assert.equal(oddsApiQuotes([event, event], options).quotes.length, 10);
const conflict = structuredClone(event); conflict.bookmakers[0].markets[0].outcomes[0].price = 2.3;
assert.equal(oddsApiQuotes([event, conflict], options).quotes.length, 9);
const policy = { now: Date.parse(fetchedAt) + 1000, bookmakerRegistry };
const home = result.quotes.filter((q) => q.market === "HDA" && q.selection === "H");
assert.equal(compareBookmakerQuotes(home, policy).bookmakerCount, 2);
assert.equal(compareBookmakerQuotes([home[1], { ...home[1], providerKey: "BET365" }], policy).bookmakerCount, 1);
assert.equal(compareBookmakerQuotes(home, { now: policy.now }).bookmakerCount, 0);
assert.equal(compareBookmakerQuotes(result.quotes, policy).comparisonStatus, "INCOMPARABLE_QUOTES");
assert.equal(hkjcQuotesFromMatch({ id: "FB1", generatedAt: fetchedAt, odds: { home: 2 } })[0].observedAt, null);

const apiOptions = { fixtures: [binding], fetchedAt,
  bookmakerRegistry: [{ key: "bet365", apiFootballId: "8", kind: "BOOKMAKER", verified: true }],
  marketCatalogue: [{ id: "999", name: "Test-only Asian Market", market: "ASIAN_HANDICAP", period: "FULL_TIME", settlement: "ASIAN", verified: true }] };
const apiPayload = { response: [{ fixture: raw.fixture, league: raw.league, update: fetchedAt,
  bookmakers: [{ id: 8, name: "Bet365", bets: [{ id: 999, name: "Test-only Asian Market", values: [{ value: "Home -0.25", odd: "1.95" }, { value: "Away +0.25", odd: "1.9" }] }] }] }] };
const apiQuotes = apiFootballOdds(apiPayload, apiOptions).quotes;
assert.equal(apiQuotes.length, 2); assert.equal(apiQuotes[0].line, -0.25); assert.equal(apiQuotes[1].line, -0.25);
assert.equal(apiFootballOdds(apiPayload, { ...apiOptions, marketCatalogue: [{ ...apiOptions.marketCatalogue[0], settlement: "EUROPEAN" }] }).quotes.length, 0);
assert.equal(apiFootballOdds(apiPayload, { ...apiOptions, fixtures: [{ ...binding, providerCompetitionId: "40" }] }).quotes.length, 0);
assert.equal(apiFootballOdds(apiPayload, { ...apiOptions, bookmakerRegistry: [] }).quotes.length, 0);
assert.equal(apiFootballOdds({ response: [...apiPayload.response, ...apiPayload.response] }, apiOptions).quotes.length, 2);
assert.equal(compareBookmakerQuotes([home[1], { ...apiQuotes[0], market: "HDA", selection: "H", line: null }], policy).bookmakerCount, 1);

await assert.rejects(collect({}, { env: {} }), /CREDENTIALS_REQUIRED/);
const config = { fixtureProvider: "API_FOOTBALL", allowRetiredProvider: true, dates: ["2026-10-04"], sports: ["soccer_epl"], maxRequests: 2, bindings: [binding], competitionMap: options.competitionMap, bookmakerRegistry };
const env = { API_FOOTBALL_KEY: "test-only", THE_ODDS_API_KEY: "test-only" };
let calls = 0;
const evidence = await collect(config, { env, now: () => fetchedAt, fetchImpl: async (url) => {
  calls++; return new Response(JSON.stringify(url.includes("api-sports") ? { response: [raw], errors: [] } : [event]), { status: 200 });
} });
assert.equal(calls, 2); assert.equal(evidence.quotes.length, 10); assert.equal(evidence.mode, "SHADOW");
await assert.rejects(collect(config, { env, fetchImpl: async () => new Response("limit", { status: 429 }) }), /HTTP_429/);
await assert.rejects(collect(config, { env, fetchImpl: async () => { throw new Error("secret-url-test-only"); } }), /^Error: API_FOOTBALL_TRANSPORT_ERROR$/);
await assert.rejects(collect({ ...config, maxRequests: 3 }, { env }), /REQUEST_BUDGET_MISMATCH/);
await assert.rejects(collect({ ...config, allowRetiredProvider: false }, { env }), /RETIRED/);
const smRaw = { id: 444, sport_id: 1, league_id: 55, league: { name: "Test League" }, starting_at_timestamp: Date.parse(kickoff) / 1000,
  participants: [{ id: 1, name: "Home United", meta: { location: "home" } }, { id: 2, name: "Away United", meta: { location: "away" } }] };
const smFixture = sportmonksFixtures({ data: [smRaw] }, fetchedAt).fixtures[0];
const smBinding = { ...smFixture, canonicalMatchId: "existing-fixture", verified: true };
assert.equal(smFixture.kickoff, kickoff.replace("Z", ".000Z"));
assert.equal(sportmonksFixtures({ data: [{ ...smRaw, participants: [...smRaw.participants, smRaw.participants[0]] }] }, fetchedAt).fixtures.length, 0);
const smOptions = { fetchedAt, fixtures: [smBinding], bookmakerRegistry: [{ key: "pinnacle", sportmonksId: "1", kind: "BOOKMAKER", verified: true }],
  marketCatalogue: [{ sportmonksId: "777", name: "Test Goals", market: "GOALS", period: "FULL_TIME", selectionMap: { Over: "OVER", Under: "UNDER" }, verified: true }] };
const smOdd = { id: 11, fixture_id: 444, bookmaker_id: 1, market_id: 777, market_description: "Test Goals", label: "Over", total: "2.5", value: "1.95", stopped: false, latest_bookmaker_update: fetchedAt };
assert.equal(sportmonksPremiumQuotes({ data: [smOdd] }, smOptions).quotes.length, 1);
assert.equal(sportmonksPremiumQuotes({ data: [{ ...smOdd, stopped: true }] }, smOptions).quotes.length, 0);
assert.equal(sportmonksPremiumQuotes({ data: [{ ...smOdd, stopped: undefined }] }, smOptions).quotes.length, 0);
assert.equal(sportmonksPremiumQuotes({ data: [{ ...smOdd, latest_bookmaker_update: "2026-10-04 10:00:00" }] }, smOptions).quotes.length, 0);
assert.equal(sportmonksPremiumQuotes({ data: [{ ...smOdd, latest_bookmaker_update: "2026-10-04 10:00:00" }] }, { ...smOptions, sourceTimezone: "UTC" }).quotes.length, 1);
assert.equal(sportmonksPremiumQuotes({ data: [{ ...smOdd, total: null }] }, smOptions).quotes.length, 0);
const smEvidence = await collect({ dates: ["2026-10-04"], sports: [], maxRequests: 2, bindings: [smBinding], premiumFixtureIds: ["444"], bookmakerRegistry: smOptions.bookmakerRegistry, marketCatalogue: smOptions.marketCatalogue },
  { env: { SPORTMONKS_API_TOKEN: "test-only" }, now: () => fetchedAt, fetchImpl: async (url) => new Response(JSON.stringify({ data: url.includes("premium") ? [smOdd] : [smRaw] }), { status: 200 }) });
assert.equal(smEvidence.quotes.length, 1);
const coverageBundle = { fixtures: [{ ...binding, identityStatus: "VERIFIED" }], quotes: result.quotes };
const baseline = [{ id: binding.canonicalMatchId, kickoff }];
assert.equal(compareAuthorityCoverage(baseline, coverageBundle, { now: policy.now }).readiness, "SHADOW_COVERAGE_PASSED");
assert.equal(compareAuthorityCoverage(baseline, { ...coverageBundle, quotes: [] }, { now: policy.now }).readiness, "BLOCKED");
assert.equal(compareAuthorityCoverage(baseline, coverageBundle, { now: policy.now + 3600000 }).readiness, "BLOCKED");
assert.equal(compareAuthorityCoverage([], coverageBundle, { now: policy.now }).readiness, "NO_COMPARISON_BASELINE");
assert.equal(compareAuthorityCoverage(baseline, coverageBundle, { now: policy.now }).productionCutoverAuthorized, false);
// Pagination tests use synthetic responses; no provider quota or live data.
const pagedConfig = { dates: ['2026-10-04'], sports: [], maxSportmonksPages: 2, maxRequests: 4,
  bindings: [smBinding], premiumFixtureIds: ['444'], bookmakerRegistry: smOptions.bookmakerRegistry,
  marketCatalogue: smOptions.marketCatalogue };
const pagedCalls = [];
const pagedEvidence = await collect(pagedConfig, { env: { SPORTMONKS_API_TOKEN: 'test-only' }, now: () => fetchedAt,
  fetchImpl: async (rawUrl) => {
    const url = new URL(rawUrl), page = Number(url.searchParams.get('page'));
    pagedCalls.push(url);
    assert.equal(url.origin, 'https://api.sportmonks.com');
    const premium = url.pathname.includes('/premium/');
    return new Response(JSON.stringify({ data: page === 1 ? [premium ? smOdd : smRaw] : [],
      pagination: { current_page: page, has_more: page === 1, next_page: 'https://untrusted.example/?api_token=secret' } }), { status: 200 });
  } });
assert.equal(pagedCalls.length, 4);
assert.equal(pagedEvidence.fixtures.length, 1);
assert.equal(pagedEvidence.quotes.length, 1);
assert.equal(pagedEvidence.collectionStatus, 'BOUNDED_COLLECTION_COMPLETE');
assert.equal(pagedEvidence.requestBudget, 4);
for (const pagination of [
  { current_page: 2, has_more: true },
  { current_page: 1, has_more: 'true' },
  null,
]) {
  await assert.rejects(collect(pagedConfig, { env: { SPORTMONKS_API_TOKEN: 'test-only' }, now: () => fetchedAt,
    fetchImpl: async () => new Response(JSON.stringify({ data: [], pagination }), { status: 200 }) }), /SPORTMONKS_INVALID_PAGINATION/);
}
await assert.rejects(collect(pagedConfig, { env: { SPORTMONKS_API_TOKEN: 'test-only' }, now: () => fetchedAt,
  fetchImpl: async (url) => new Response(JSON.stringify({ data: [], pagination: { current_page: Number(new URL(url).searchParams.get('page')), has_more: true } }), { status: 200 }) }), /SPORTMONKS_PAGE_BUDGET_EXHAUSTED/);
await assert.rejects(collect({ ...pagedConfig, maxRequests: 3 }, { env: { SPORTMONKS_API_TOKEN: 'test-only' } }), /REQUEST_BUDGET_MISMATCH/);
await assert.rejects(collect({ ...pagedConfig, maxSportmonksPages: 6 }, { env: { SPORTMONKS_API_TOKEN: 'test-only' } }), /INVALID_PAGE_BUDGET/);
let failedPageCalls = 0;
await assert.rejects(collect(pagedConfig, { env: { SPORTMONKS_API_TOKEN: 'test-only' }, now: () => fetchedAt,
  fetchImpl: async () => {
    failedPageCalls++;
    if (failedPageCalls === 2) return new Response('rate limit', { status: 429 });
    return new Response(JSON.stringify({ data: [smRaw], pagination: { current_page: 1, has_more: true } }), { status: 200 });
  } }), /SPORTMONKS_HTTP_429/);
assert.equal(failedPageCalls, 2);
// Coverage must not hide contradictory current evidence behind set deduplication.
const reportOptions = { now: policy.now };
const hda = coverageBundle.quotes.find(q => q.market === 'HDA');
const contradictory = { ...hda, decimalPrice: hda.decimalPrice + 0.1 };
const conflictReport = compareAuthorityCoverage(baseline, { ...coverageBundle, quotes: [...coverageBundle.quotes, contradictory] }, reportOptions);
assert.equal(conflictReport.readiness, 'BLOCKED');
assert.deepEqual(conflictReport.conflictingHdaFixtureIds, [binding.canonicalMatchId]);
assert.equal(conflictReport.freshHdaFixtures, 0);
assert.equal(compareAuthorityCoverage(baseline, { ...coverageBundle, quotes: [...coverageBundle.quotes, hda] }, reportOptions).readiness, 'SHADOW_COVERAGE_PASSED');
for (const changed of [
  { providerEventId: 'different-event' },
  { homeTeamId: binding.awayTeamId, awayTeamId: binding.homeTeamId },
  { kickoff: new Date(Date.parse(kickoff) + 60000).toISOString() },
]) {
  const report = compareAuthorityCoverage(baseline, { ...coverageBundle, fixtures: [...coverageBundle.fixtures, { ...coverageBundle.fixtures[0], ...changed }] }, reportOptions);
  assert.equal(report.readiness, 'BLOCKED');
  assert.deepEqual(report.conflictingFixtureIds, [binding.canonicalMatchId]);
  assert.equal(report.verifiedUpcoming, 0);
}
const reused = compareAuthorityCoverage(baseline, { ...coverageBundle, fixtures: [...coverageBundle.fixtures, { ...coverageBundle.fixtures[0], canonicalMatchId: 'second-canonical-id' }] }, reportOptions);
assert.equal(reused.readiness, 'BLOCKED');
assert.equal(reused.conflictingFixtureIds.length, 2);
assert.equal(reused.verifiedUpcoming, 0);
console.log("International authority contracts passed (deterministic fixtures; no live coverage claim)");

const { reconcileCollectedQuotes } = await import('./collect-international-authority.mjs');
const quoteAcrossPages = { ...smEvidence.quotes[0], fetchedAt: '2026-10-04T10:01:00Z' };
const repeated = reconcileCollectedQuotes([smEvidence.quotes[0], quoteAcrossPages]);
assert.equal(repeated.quotes.length, 1);
assert.equal(repeated.quotes[0].fetchedAt, quoteAcrossPages.fetchedAt);
const conflictingPages = reconcileCollectedQuotes([smEvidence.quotes[0], { ...quoteAcrossPages, decimalPrice: 2.5 }, quoteAcrossPages]);
assert.equal(conflictingPages.quotes.length, 0);
assert.equal(conflictingPages.rejected.length, 1);
assert.equal(conflictingPages.rejected[0].reason, 'CROSS_PAGE_CONFLICTING_OBSERVATION');
assert.equal(reconcileCollectedQuotes([smEvidence.quotes[0], { ...quoteAcrossPages, observedAt: '2026-10-04T10:01:00Z', decimalPrice: 2.5 }]).quotes.length, 2);
console.log('Cross-page observation reconciliation passed');

const quarantinedCoverage = compareAuthorityCoverage(baseline, { ...coverageBundle,
  rejected: [{ canonicalMatchId: binding.canonicalMatchId, market: 'HDA', reason: 'CROSS_PAGE_CONFLICTING_OBSERVATION' }] }, reportOptions);
assert.equal(quarantinedCoverage.readiness, 'BLOCKED');
assert.equal(quarantinedCoverage.freshHdaFixtures, 0);

const { proposeAuthorityBindings } = await import('../lib/authority-binding-proposals.js');
const bindingEntities = { now: policy.now, competitions: [{ providerKey: fixture.providerKey, providerCompetitionId: fixture.providerCompetitionId, canonicalCompetitionId: 'competition', verified: true }],
  teams: [fixture.homeTeamId, fixture.awayTeamId].map((id, i) => ({ providerKey: fixture.providerKey, providerCompetitionId: fixture.providerCompetitionId, providerTeamId: id, canonicalTeamId: i ? 'away' : 'home', verified: true })) };
const canonicalRows = [{ canonicalMatchId: 'existing-fixture', canonicalCompetitionId: 'competition', homeTeamId: 'home', awayTeamId: 'away', kickoff: fixture.kickoff }];
const proposal = proposeAuthorityBindings([fixture], canonicalRows, bindingEntities);
assert.equal(proposal.proposals.length, 1);
assert.equal(proposal.proposals[0].verified, false);
assert.equal(resolveFixture(fixture, proposal.proposals).status, 'UNRESOLVED');
assert.equal(proposeAuthorityBindings([fixture], [], bindingEntities).unresolved[0].reason, 'NO_CANONICAL_FIXTURE');
assert.equal(proposeAuthorityBindings([fixture], [...canonicalRows, { ...canonicalRows[0], canonicalMatchId: 'another' }], bindingEntities).proposals.length, 0);
assert.equal(proposeAuthorityBindings([{ ...fixture, homeTeamId: fixture.awayTeamId, awayTeamId: fixture.homeTeamId }], canonicalRows, bindingEntities).proposals.length, 0);
assert.equal(proposeAuthorityBindings([fixture], canonicalRows, { ...bindingEntities, teams: [] }).proposals.length, 0);
assert.equal(proposeAuthorityBindings([fixture, { ...fixture, providerEventId: 'second-event' }], canonicalRows, bindingEntities).proposals.length, 0);
assert.equal(proposeAuthorityBindings([fixture, fixture], canonicalRows, bindingEntities).proposals.length, 1);
console.log('Review-only canonical binding proposals passed');

for (const fetched of [null, '2026-10-04 10:00:00', new Date(policy.now + 1000).toISOString(), new Date(policy.now - 301000).toISOString()]) {
  const blockedProposal = proposeAuthorityBindings([{ ...fixture, fetchedAt: fetched }], canonicalRows, bindingEntities);
  assert.equal(blockedProposal.proposals.length, 0);
  assert.equal(blockedProposal.unresolved[0].reason, 'STALE_OR_UNKNOWN_PROVIDER_FETCH');
}
assert.equal(proposal.proposals[0].fetchedAt, timestamp(fixture.fetchedAt));
assert.deepEqual(proposal.proposals[0].evidence.kickoffDifferencesSeconds, [0]);
assert.equal(proposal.generatedAt, new Date(policy.now).toISOString());
assert.throws(() => proposeAuthorityBindings([], [], { now: NaN }), /INVALID_BINDING_INPUT/);
console.log('Binding proposal freshness and review evidence passed');

assert.equal(oddsApiQuotes([event], { ...options, fixtures: [{ ...binding, verified: false }] }).quotes.length, 0);
assert.equal(oddsApiQuotes([event], { ...options, fixtures: [{ ...binding, identityStatus: 'UNRESOLVED' }] }).quotes.length, 0);
assert.equal(oddsApiQuotes([event], { ...options, fixtures: [{ ...binding, verified: false, identityStatus: 'VERIFIED' }] }).quotes.length, 10);
const conflictingAlias = { verified: true, providerKey: 'THE_ODDS_API', teamProviderKey: binding.providerKey,
  providerCompetitionId: binding.providerCompetitionId, teamId: binding.awayTeamId, alias: event.home_team };
assert.equal(oddsApiQuotes([event], { ...options, aliases: [conflictingAlias] }).quotes.length, 0);
const uniqueAlias = { ...conflictingAlias, teamId: binding.homeTeamId, alias: 'Reviewed Home Alias' };
const aliasEvent = { ...event, home_team: uniqueAlias.alias, bookmakers: event.bookmakers.map(b => ({ ...b, markets: b.markets.map(m => ({ ...m, outcomes: m.outcomes.map(o => ({ ...o, name: o.name === event.home_team ? uniqueAlias.alias : o.name })) })) })) };
assert.equal(oddsApiQuotes([aliasEvent], { ...options, aliases: [uniqueAlias] }).quotes.length, 10);
assert.equal(oddsApiQuotes([{ ...event, home_team: uniqueAlias.alias }], { ...options, aliases: [uniqueAlias, { ...uniqueAlias, teamId: binding.awayTeamId }] }).quotes.length, 0);
assert.equal(oddsApiQuotes([{ ...event, home_team: '' }], options).quotes.length, 0);
assert.equal(sportmonksPremiumQuotes({ data: [smOdd] }, { ...smOptions, fixtures: [{ ...smBinding, verified: false }] }).quotes.length, 0);
console.log('Verified fixture and conflicting alias admission checks passed');

// Legitimate per-selection update times are not a mixed-fetch board.
const oneBoard = coverageBundle.quotes.filter(q => q.market === 'HDA' && q.bookmakerKey === 'pinnacle');
assert.equal(oneBoard.length, 3);
const staggered = oneBoard.map((q, i) => ({ ...q, observedAt: new Date(policy.now - i * 10000).toISOString() }));
assert.equal(compareAuthorityCoverage(baseline, { fixtures: coverageBundle.fixtures, quotes: staggered }, reportOptions).readiness, 'SHADOW_COVERAGE_PASSED');
assert.equal(compareAuthorityCoverage(baseline, { fixtures: coverageBundle.fixtures,
  quotes: staggered.map((q, i) => i === 2 ? { ...q, observedAt: new Date(policy.now - 301000).toISOString() } : q) }, reportOptions).readiness, 'BLOCKED');
assert.equal(compareAuthorityCoverage(baseline, { fixtures: coverageBundle.fixtures,
  quotes: staggered.map((q, i) => i === 2 ? { ...q, fetchedAt: new Date(policy.now - 2000).toISOString() } : q) }, reportOptions).readiness, 'BLOCKED');
assert.equal(compareAuthorityCoverage(baseline, { fixtures: coverageBundle.fixtures,
  quotes: staggered.map((q, i) => i === 2 ? { ...q, providerKey: 'OTHER_TRANSPORT' } : q) }, reportOptions).readiness, 'BLOCKED');
const olderPrice = { ...staggered[0], observedAt: new Date(policy.now - 20000).toISOString(), decimalPrice: 2.9 };
assert.equal(compareAuthorityCoverage(baseline, { fixtures: coverageBundle.fixtures, quotes: [olderPrice, ...staggered] }, reportOptions).readiness, 'SHADOW_COVERAGE_PASSED');
console.log('Individually fresh single-fetch HDA boards passed');
