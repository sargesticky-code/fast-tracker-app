// Bounded official API shadow collector. Writes one local evidence bundle;
// never writes Supabase, replaces feeds, changes cron, or prints credentials.
import fs from "node:fs/promises";
import { apiFootballFixtures, sportmonksFixtures, sportmonksPremiumQuotes, resolveFixture, oddsApiQuotes, apiFootballOdds } from "../lib/international-authority.js";

export async function collect(config, { fetchImpl = fetch, env = process.env, now = () => new Date().toISOString() } = {}) {
  const fixtureProvider = config.fixtureProvider ?? "SPORTMONKS";
  if (!["SPORTMONKS", "API_FOOTBALL"].includes(fixtureProvider)) throw new Error("INVALID_FIXTURE_PROVIDER");
  if (!(fixtureProvider === "SPORTMONKS" ? env.SPORTMONKS_API_TOKEN : env.API_FOOTBALL_KEY) ||
      (config.sports?.length && !env.THE_ODDS_API_KEY)) throw new Error("PROVIDER_CREDENTIALS_REQUIRED");
  if (fixtureProvider === "API_FOOTBALL" && config.allowRetiredProvider !== true) throw new Error("API_FOOTBALL_RETIRED_REQUIRES_EXPLICIT_OPT_IN");
  if (!Array.isArray(config.dates) || !config.dates.length || config.dates.length > 3 ||
      !config.dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) ||
      !Array.isArray(config.sports) || config.sports.length > 10 ||
      !config.sports.every((s) => /^soccer_[a-z0-9_]+$/.test(s))) throw new Error("INVALID_BOUNDED_SCOPE");
  const apiOddsFixtureIds = config.apiOddsFixtureIds ?? [];
  const premiumFixtureIds = config.premiumFixtureIds ?? [];
  if (!Array.isArray(premiumFixtureIds) || premiumFixtureIds.length > 10 || !premiumFixtureIds.every((id) => /^\d+$/.test(id))) throw new Error("INVALID_PREMIUM_SCOPE");
  if (premiumFixtureIds.length && !env.SPORTMONKS_API_TOKEN) throw new Error("PROVIDER_CREDENTIALS_REQUIRED");
  if (apiOddsFixtureIds.length && (fixtureProvider !== "API_FOOTBALL" || !env.API_FOOTBALL_KEY)) throw new Error("API_FOOTBALL_RETIRED_REQUIRES_EXPLICIT_OPT_IN");
  if (!Array.isArray(apiOddsFixtureIds) || apiOddsFixtureIds.length > 10 || !apiOddsFixtureIds.every((id) => /^\d+$/.test(id))) throw new Error("INVALID_ODDS_SCOPE");
  const maxSportmonksPages = config.maxSportmonksPages ?? 1;
  if (!Number.isInteger(maxSportmonksPages) || maxSportmonksPages < 1 || maxSportmonksPages > 5) throw new Error("INVALID_PAGE_BUDGET");
  const requestBudget = config.dates.length * (fixtureProvider === "SPORTMONKS" ? maxSportmonksPages : 1) +
    config.sports.length + apiOddsFixtureIds.length + premiumFixtureIds.length * maxSportmonksPages;
  if (config.maxRequests !== requestBudget) throw new Error("REQUEST_BUDGET_MISMATCH");
  const evidence = { mode: "SHADOW", generatedAt: now(), fixtures: [], quotes: [], rejected: [], requests: [] };
  async function request(provider, url, headers = {}) {
    if (evidence.requests.length >= requestBudget) throw new Error("REQUEST_BUDGET_EXHAUSTED");
    let response;
    try { response = await fetchImpl(url, { headers, redirect: "error", signal: AbortSignal.timeout(15000) }); }
    catch { throw new Error(`${provider}_TRANSPORT_ERROR`); }
    if (!response.ok) throw new Error(`${provider}_HTTP_${response.status}`);
    const fetchedAt = now();
    let payload;
    try { payload = await response.json(); } catch { throw new Error(`${provider}_INVALID_JSON`); }
    evidence.requests.push({ provider, fetchedAt, remaining: response.headers.get("x-requests-remaining") ?? response.headers.get("x-ratelimit-requests-remaining"), cost: response.headers.get("x-requests-last") });
    return { payload, fetchedAt };
  }
  async function sportmonksPages(url, headers) {
    const pages = [];
    for (let page = 1; page <= maxSportmonksPages; page++) {
      // Construct the next request locally; never follow credential-bearing or
      // untrusted next_page URLs supplied in provider payloads.
      const target = new URL(url);
      target.searchParams.set("page", String(page));
      const batch = await request("SPORTMONKS", target.toString(), headers);
      const pagination = batch.payload.pagination;
      if (pagination !== undefined && (!pagination ||
          pagination.current_page !== page || typeof pagination.has_more !== "boolean")) throw new Error("SPORTMONKS_INVALID_PAGINATION");
      if (page > 1 && !pagination) throw new Error("SPORTMONKS_INVALID_PAGINATION");
      pages.push(batch);
      if (!pagination?.has_more) return pages;
    }
    throw new Error("SPORTMONKS_PAGE_BUDGET_EXHAUSTED");
  }
  for (const date of config.dates) {
    const url = fixtureProvider === "SPORTMONKS"
      ? `https://api.sportmonks.com/v3/football/fixtures/date/${date}?include=participants;league;state&timezone=UTC`
      : `https://v3.football.api-sports.io/fixtures?date=${date}&timezone=UTC`;
    const headers = fixtureProvider === "SPORTMONKS" ? { Authorization: env.SPORTMONKS_API_TOKEN } : { "x-apisports-key": env.API_FOOTBALL_KEY };
    const pages = fixtureProvider === "SPORTMONKS" ? await sportmonksPages(url, headers) : [await request(fixtureProvider, url, headers)];
    for (const { payload, fetchedAt } of pages) {
      if (payload.paging?.total > 1) throw new Error("FIXTURE_PAGINATION_REQUIRES_REVIEW");
      const batch = fixtureProvider === "SPORTMONKS" ? sportmonksFixtures(payload, fetchedAt) : apiFootballFixtures(payload, fetchedAt);
      evidence.rejected.push(...batch.rejected);
      for (const fixture of batch.fixtures) {
        const identity = resolveFixture(fixture, config.bindings);
        evidence.fixtures.push({ ...fixture, ...identity, identityStatus: identity.status });
      }
  }
  }
  for (const sport of config.sports) {
    const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/odds`);
    url.search = new URLSearchParams({ apiKey: env.THE_ODDS_API_KEY, regions: "uk,eu", markets: "h2h,totals", oddsFormat: "decimal", dateFormat: "iso" }).toString();
    const { payload, fetchedAt } = await request("THE_ODDS_API", url.toString());
    const batch = oddsApiQuotes(payload, { fixtures: evidence.fixtures, competitionMap: config.competitionMap ?? [], aliases: config.aliases ?? [], bookmakerRegistry: config.bookmakerRegistry ?? [], fetchedAt });
    evidence.quotes.push(...batch.quotes); evidence.rejected.push(...batch.rejected);
  }
  for (const id of apiOddsFixtureIds) {
    if (!evidence.fixtures.some((f) => f.providerEventId === id && f.canonicalMatchId)) throw new Error("ODDS_FIXTURE_NOT_VERIFIED");
    const { payload, fetchedAt } = await request("API_FOOTBALL", `https://v3.football.api-sports.io/odds?fixture=${id}`, { "x-apisports-key": env.API_FOOTBALL_KEY });
    if (payload.paging?.total > 1) throw new Error("API_FOOTBALL_PAGINATION_REQUIRES_REVIEW");
    const batch = apiFootballOdds(payload, { fixtures: evidence.fixtures, fetchedAt, bookmakerRegistry: config.bookmakerRegistry, marketCatalogue: config.marketCatalogue });
    evidence.quotes.push(...batch.quotes); evidence.rejected.push(...batch.rejected);
  }
  for (const id of premiumFixtureIds) {
    if (!evidence.fixtures.some((f) => f.providerKey === "SPORTMONKS" && f.providerEventId === id && f.canonicalMatchId)) throw new Error("ODDS_FIXTURE_NOT_VERIFIED");
    const pages = await sportmonksPages(`https://api.sportmonks.com/v3/football/odds/premium/fixtures/${id}?timezone=UTC`, { Authorization: env.SPORTMONKS_API_TOKEN });
    for (const { payload, fetchedAt } of pages) {
      const batch = sportmonksPremiumQuotes(payload, { fixtures: evidence.fixtures, fetchedAt, bookmakerRegistry: config.bookmakerRegistry,
        marketCatalogue: config.marketCatalogue, sourceTimezone: config.sourceTimezone });
      evidence.quotes.push(...batch.quotes); evidence.rejected.push(...batch.rejected);
  }
  }
  evidence.requestBudget = requestBudget;
  evidence.collectionStatus = "BOUNDED_COLLECTION_COMPLETE";
  return evidence;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const [, , configPath, outputPath] = process.argv;
    if (!configPath || !outputPath) throw new Error("USAGE_CONFIG_JSON_OUTPUT_JSON");
    const evidence = await collect(JSON.parse(await fs.readFile(configPath, "utf8")));
    await fs.writeFile(outputPath, JSON.stringify(evidence, null, 2), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ fixtures: evidence.fixtures.length, quotes: evidence.quotes.length, rejected: evidence.rejected.length }));
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
