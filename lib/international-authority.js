// Phase 0 shadow adapters. No provider observation can allocate a canonical ID.
// Existing IDs remain opaque; provider IDs are separate namespaces.
export function timestamp(value) {
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
const positiveId = (v) => Number.isSafeInteger(v) && v > 0 ? String(v) : null;
const english = (v) => typeof v === "string" && v.trim() && !/[\u3400-\u9fff]/.test(v) ? v.trim() : null;
const name = (v) => String(v ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const verifiedFixture = f => f.identityStatus === "VERIFIED" || (f.identityStatus === undefined && f.verified === true);
const number = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;

export function apiFootballFixtures(payload, fetchedAt) {
  const fetched = timestamp(fetchedAt);
  if (!fetched || !Array.isArray(payload?.response) || Object.keys(payload.errors ?? {}).length) {
    throw new Error("API_FOOTBALL_INVALID_RESPONSE");
  }
  const fixtures = [], rejected = [];
  for (const row of payload.response) {
    const fixture = {
      providerKey: "API_FOOTBALL", providerEventId: positiveId(row.fixture?.id),
      providerCompetitionId: positiveId(row.league?.id), competition: english(row.league?.name),
      season: Number.isSafeInteger(row.league?.season) ? row.league.season : null,
      homeTeamId: positiveId(row.teams?.home?.id), awayTeamId: positiveId(row.teams?.away?.id),
      home: english(row.teams?.home?.name), away: english(row.teams?.away?.name),
      kickoff: timestamp(row.fixture?.date), status: row.fixture?.status?.short ?? null,
      fetchedAt: fetched, observedAt: null,
    };
    if (!fixture.providerEventId || !fixture.providerCompetitionId || !fixture.homeTeamId ||
        !fixture.awayTeamId || fixture.homeTeamId === fixture.awayTeamId || !fixture.home ||
        !fixture.away || !fixture.competition || !fixture.kickoff) {
      rejected.push({ providerEventId: fixture.providerEventId, reason: "INCOMPLETE_FIXTURE_IDENTITY" });
    } else fixtures.push(fixture);
  }
  return { fixtures, rejected };
}

export function sportmonksFixtures(payload, fetchedAt) {
  const fetched = timestamp(fetchedAt);
  if (!fetched || !Array.isArray(payload?.data)) throw new Error("SPORTMONKS_INVALID_RESPONSE");
  const fixtures = [], rejected = [];
  for (const row of payload.data) {
    const homes = (row.participants ?? []).filter((p) => p.meta?.location === "home");
    const aways = (row.participants ?? []).filter((p) => p.meta?.location === "away");
    const home = homes.length === 1 ? homes[0] : null, away = aways.length === 1 ? aways[0] : null;
    const epoch = row.starting_at_timestamp;
    const kickoff = Number.isSafeInteger(epoch) && epoch > 0 && epoch < 100000000000 ? timestamp(new Date(epoch * 1000).toISOString()) : null;
    const fixture = { providerKey: "SPORTMONKS", providerEventId: positiveId(row.id), providerCompetitionId: positiveId(row.league_id),
      competition: english(row.league?.name), seasonId: positiveId(row.season_id),
      homeTeamId: positiveId(home?.id), awayTeamId: positiveId(away?.id), home: english(home?.name), away: english(away?.name),
      kickoff, status: row.state?.developer_name ?? null, fetchedAt: fetched, observedAt: null };
    if (row.sport_id !== 1 || row.placeholder === true || !fixture.providerEventId || !fixture.providerCompetitionId ||
        !fixture.competition || !fixture.homeTeamId || !fixture.awayTeamId || fixture.homeTeamId === fixture.awayTeamId ||
        !fixture.home || !fixture.away || !kickoff) rejected.push({ providerEventId: fixture.providerEventId, reason: "INCOMPLETE_FIXTURE_IDENTITY" });
    else fixtures.push(fixture);
  }
  return { fixtures, rejected };
}

export function sportmonksPremiumQuotes(payload, { fixtures, fetchedAt, bookmakerRegistry = [], marketCatalogue = [], sourceTimezone = null }) {
  const fetched = timestamp(fetchedAt);
  if (!fetched || !Array.isArray(payload?.data)) throw new Error("SPORTMONKS_INVALID_RESPONSE");
  const quotes = [], rejected = [], seen = new Map();
  for (const row of payload.data) {
    const eventId = positiveId(row.fixture_id);
    const candidates = fixtures.filter((f) => f.providerKey === "SPORTMONKS" && f.providerEventId === eventId && f.canonicalMatchId && verifiedFixture(f));
    const ids = [...new Set(candidates.map((f) => f.canonicalMatchId))];
    if (ids.length !== 1) { rejected.push({ providerEventId: eventId, reason: ids.length ? "AMBIGUOUS" : "UNRESOLVED" }); continue; }
    const books = bookmakerRegistry.filter((b) => b.sportmonksId === positiveId(row.bookmaker_id) && b.verified === true && b.kind === "BOOKMAKER");
    const markets = marketCatalogue.filter((m) => m.sportmonksId === positiveId(row.market_id) && m.verified === true && m.period === "FULL_TIME" && m.name === row.market_description);
    if (books.length !== 1 || markets.length !== 1) { rejected.push({ providerEventId: eventId, reason: "UNREVIEWED_BOOKMAKER_OR_MARKET" }); continue; }
    const market = markets[0], selection = market.selectionMap?.[row.label] ?? null;
    if (row.stopped !== false) { rejected.push({ providerEventId: eventId, reason: "MARKET_STOPPED_OR_UNKNOWN" }); continue; }
    let observedAt = timestamp(row.latest_bookmaker_update);
    // Only attach UTC when it is explicitly established by the provider request
    // contract; never silently interpret an unzoned provider time as local time.
    if (!observedAt && sourceTimezone === "UTC" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row.latest_bookmaker_update ?? "")) observedAt = timestamp(row.latest_bookmaker_update.replace(" ", "T") + "Z");
    if (!observedAt || Date.parse(observedAt) > Date.parse(fetched) + 60000) { rejected.push({ providerEventId: eventId, reason: "INVALID_OBSERVATION_TIME" }); continue; }
    const decimal = (v) => typeof v === "string" && /^[+-]?\d+(?:\.\d+)?$/.test(v) ? number(Number(v)) : number(v);
    const price = decimal(row.value);
    let line = null;
    const selections = { HDA: ["H", "D", "A"], GOALS: ["OVER", "UNDER"], CORNERS: ["OVER", "UNDER"], BTTS: ["YES", "NO"], ASIAN_HANDICAP: ["HOME", "AWAY"] };
    if (!selections[market.market]?.includes(selection) || price === null || price <= 1) continue;
    if (["GOALS", "CORNERS"].includes(market.market)) { line = decimal(row.total); if (line === null || line < 0) continue; }
    if (market.market === "ASIAN_HANDICAP") {
      if (market.settlement !== "ASIAN" || !["HOME", "SELECTION"].includes(market.handicapPerspective)) continue;
      line = decimal(row.handicap); if (line === null) continue;
      if (market.handicapPerspective === "SELECTION" && selection === "AWAY") line = -line;
    }
    const quote = { canonicalMatchId: ids[0], providerKey: "SPORTMONKS", providerEventId: eventId,
      sourceRecordId: positiveId(row.id), bookmakerKey: books[0].key, bookmakerLabel: books[0].label, bookmakerKind: "BOOKMAKER",
      market: market.market, sourceMarket: String(row.market_id), selection, line, decimalPrice: price, observedAt, fetchedAt: fetched,
      identityStatus: "VERIFIED", status: "OBSERVED" };
    const key = JSON.stringify([ids[0], books[0].key, market.market, selection, line, observedAt]);
    if (!seen.has(key)) seen.set(key, quote);
    else if (seen.get(key)?.decimalPrice !== price) { seen.set(key, null); rejected.push({ providerEventId: eventId, reason: "CONFLICTING_DUPLICATE" }); }
  }
  for (const quote of seen.values()) if (quote) quotes.push(quote);
  return { quotes, rejected };
}

// Bindings must be reviewed provider mappings, with competition + both oriented
// team IDs + kickoff. Historical stale mappings never imply current identity.
export function resolveFixture(fixture, bindings = [], toleranceSeconds = 60) {
  if (!Number.isFinite(toleranceSeconds) || toleranceSeconds < 0 || toleranceSeconds > 300) {
    throw new Error("INVALID_IDENTITY_TOLERANCE");
  }
  const candidates = bindings.filter((b) => b.verified === true && b.canonicalMatchId &&
    b.providerKey === fixture.providerKey && b.providerEventId === fixture.providerEventId &&
    b.providerCompetitionId === fixture.providerCompetitionId && b.homeTeamId === fixture.homeTeamId &&
    b.awayTeamId === fixture.awayTeamId && timestamp(b.kickoff) && fixture.kickoff &&
    Math.abs(Date.parse(b.kickoff) - Date.parse(fixture.kickoff)) <= toleranceSeconds * 1000);
  const ids = [...new Set(candidates.map((b) => b.canonicalMatchId))];
  return ids.length === 1 ? { canonicalMatchId: ids[0], status: "VERIFIED" }
    : { canonicalMatchId: null, status: ids.length ? "AMBIGUOUS" : "UNRESOLVED" };
}

// Odds API has no team IDs. Require exact reviewed aliases in one competition,
// oriented teams, kickoff, and a UNIQUE canonical fixture. No fuzzy youth/women
// suffix removal, and no best-effort attachment to an unrelated match.
export function resolveOddsEvent(event, fixtures, competitionMap, aliases = []) {
  const competitions = competitionMap.filter((m) => m.verified === true && m.sportKey === event.sport_key);
  const competitionIds = [...new Set(competitions.map((m) => JSON.stringify([m.providerKey, m.providerCompetitionId])))];
  if (competitionIds.length !== 1 || !timestamp(event.commence_time)) return { canonicalMatchId: null, status: "UNRESOLVED" };
  const [fixtureProvider, competitionId] = JSON.parse(competitionIds[0]);
  if (!fixtureProvider || !competitionId) return { canonicalMatchId: null, status: "UNRESOLVED" };
  const matchesName = (raw, teamId, canonicalName) => {
    if (!name(raw) || !teamId || !name(canonicalName)) return false;
    const targets = new Set(aliases.filter(a => a.verified === true && a.providerKey === "THE_ODDS_API" &&
      a.teamProviderKey === fixtureProvider && a.providerCompetitionId === competitionId &&
      a.teamId && name(a.alias) === name(raw)).map(a => a.teamId));
    if (name(raw) === name(canonicalName)) targets.add(teamId);
    return targets.size === 1 && targets.has(teamId);
  };
  const candidates = fixtures.filter((f) => f.canonicalMatchId && verifiedFixture(f) && f.providerKey === fixtureProvider && f.providerCompetitionId === competitionId &&
    timestamp(f.kickoff) && Math.abs(Date.parse(f.kickoff) - Date.parse(event.commence_time)) <= 60000 &&
    matchesName(event.home_team, f.homeTeamId, f.home) && matchesName(event.away_team, f.awayTeamId, f.away));
  const ids = [...new Set(candidates.map((f) => f.canonicalMatchId))];
  return ids.length === 1 ? { canonicalMatchId: ids[0], status: "VERIFIED" }
    : { canonicalMatchId: null, status: ids.length ? "AMBIGUOUS" : "UNRESOLVED" };
}

export function oddsApiQuotes(events, { fixtures, competitionMap, aliases = [], fetchedAt, bookmakerRegistry = [] }) {
  const fetched = timestamp(fetchedAt);
  if (!Array.isArray(events) || !fetched) throw new Error("ODDS_API_INVALID_RESPONSE");
  const quotes = [], rejected = [], seen = new Map();
  for (const event of events) {
    if (!event.id || !String(event.sport_key ?? "").startsWith("soccer_")) {
      rejected.push({ providerEventId: event.id ?? null, reason: "INVALID_SOCCER_EVENT" }); continue;
    }
    const identity = resolveOddsEvent(event, fixtures, competitionMap, aliases);
    if (!identity.canonicalMatchId) {
      rejected.push({ providerEventId: event.id, reason: identity.status }); continue;
    }
    for (const book of event.bookmakers ?? []) {
      const registered = bookmakerRegistry.filter((b) => b.key === book.key && b.verified === true);
      if (registered.length !== 1 || !["BOOKMAKER", "EXCHANGE"].includes(registered[0].kind)) {
        rejected.push({ providerEventId: event.id, bookmakerKey: book.key, reason: "UNREVIEWED_BOOKMAKER" }); continue;
      }
      for (const market of book.markets ?? []) {
        // Generic spreads cannot be assumed to have Asian settlement rules.
        const normalized = { h2h: "HDA", totals: "GOALS", btts: "BTTS" }[market.key];
        if (!normalized) continue;
        const observedAt = timestamp(market.last_update ?? book.last_update);
        if (!observedAt || Date.parse(observedAt) > Date.parse(fetched) + 60000) {
          rejected.push({ providerEventId: event.id, reason: "INVALID_OBSERVATION_TIME" }); continue;
        }
        const outcomes = market.outcomes ?? [];
        if (market.key === "h2h" && (outcomes.length !== 3 ||
            ![event.home_team, event.away_team, "Draw"].every((n) => outcomes.filter((o) => o.name === n).length === 1))) {
          rejected.push({ providerEventId: event.id, reason: "NOT_THREE_WAY_HDA" }); continue;
        }
        for (const outcome of outcomes) {
          const selection = market.key === "h2h" ? (outcome.name === event.home_team ? "H" : outcome.name === event.away_team ? "A" : outcome.name === "Draw" ? "D" : null)
            : market.key === "totals" ? ({ Over: "OVER", Under: "UNDER" }[outcome.name] ?? null)
            : ({ Yes: "YES", No: "NO" }[outcome.name] ?? null);
          const line = market.key === "totals" ? number(outcome.point) : null;
          const price = number(outcome.price);
          if (!selection || price === null || price <= 1 || (market.key === "totals" && (line === null || line < 0))) continue;
          const quote = {
            canonicalMatchId: identity.canonicalMatchId, providerKey: "THE_ODDS_API",
            bookmakerKey: book.key, bookmakerLabel: book.title ?? registered[0].label,
            bookmakerKind: registered[0].kind, providerEventId: event.id,
            market: normalized, sourceMarket: market.key, selection, line, decimalPrice: price,
            observedAt, fetchedAt: fetched, identityStatus: "VERIFIED", status: "OBSERVED",
          };
          const key = JSON.stringify([quote.canonicalMatchId, book.key, normalized, selection, line, observedAt]);
          if (seen.has(key) && seen.get(key)?.decimalPrice !== price) {
            seen.set(key, null); rejected.push({ providerEventId: event.id, reason: "CONFLICTING_DUPLICATE" });
          } else if (!seen.has(key)) seen.set(key, quote);
        }
      }
    }
  }
  for (const q of seen.values()) if (q) quotes.push(q);
  return { quotes, rejected };
}

// Pre-match odds route. Market IDs and settlement must be reviewed against
// /odds/bets, not inferred from marketing labels or a bookmaker's name.
export function apiFootballOdds(payload, { fixtures, fetchedAt, bookmakerRegistry = [], marketCatalogue = [] }) {
  const fetched = timestamp(fetchedAt);
  if (!fetched || !Array.isArray(payload?.response) || Object.keys(payload.errors ?? {}).length) throw new Error("API_FOOTBALL_INVALID_RESPONSE");
  const quotes = [], rejected = [];
  for (const row of payload.response) {
    const providerEventId = positiveId(row.fixture?.id), providerCompetitionId = positiveId(row.league?.id);
    const candidates = fixtures.filter((f) => f.providerKey === "API_FOOTBALL" && f.canonicalMatchId &&
      f.providerEventId === providerEventId && f.providerCompetitionId === providerCompetitionId &&
      timestamp(row.fixture?.date) && timestamp(f.kickoff) && Math.abs(Date.parse(row.fixture.date) - Date.parse(f.kickoff)) <= 60000);
    const ids = [...new Set(candidates.map((f) => f.canonicalMatchId))];
    if (ids.length !== 1) { rejected.push({ providerEventId, reason: ids.length ? "AMBIGUOUS" : "UNRESOLVED" }); continue; }
    const observedAt = timestamp(row.update);
    if (!observedAt || Date.parse(observedAt) > Date.parse(fetched) + 60000) { rejected.push({ providerEventId, reason: "INVALID_OBSERVATION_TIME" }); continue; }
    for (const book of row.bookmakers ?? []) {
      const registrations = bookmakerRegistry.filter((b) => b.apiFootballId === positiveId(book.id) && b.verified === true && b.kind === "BOOKMAKER");
      if (registrations.length !== 1) { rejected.push({ providerEventId, reason: "UNREVIEWED_BOOKMAKER" }); continue; }
      const registration = registrations[0];
      for (const bet of book.bets ?? []) {
        const entries = marketCatalogue.filter((m) => m.id === positiveId(bet.id) && m.verified === true && m.period === "FULL_TIME" && m.name === bet.name);
        if (entries.length !== 1) continue;
        const entry = entries[0];
        if (!["HDA", "GOALS", "CORNERS", "BTTS", "ASIAN_HANDICAP"].includes(entry.market)) continue;
        if (entry.market === "ASIAN_HANDICAP" && entry.settlement !== "ASIAN") continue;
        if (entry.market === "HDA" && (bet.values?.length !== 3 || !["Home", "Draw", "Away"].every((s) => bet.values.filter((v) => v.value === s).length === 1))) continue;
        for (const value of bet.values ?? []) {
          let selection = null, line = null;
          if (entry.market === "HDA") selection = { Home: "H", Draw: "D", Away: "A" }[value.value] ?? null;
          else if (entry.market === "BTTS") selection = { Yes: "YES", No: "NO" }[value.value] ?? null;
          else {
            const parsed = /^(Over|Under|Home|Away) ([+-]?\d+(?:\.\d+)?)$/.exec(String(value.value ?? ""));
            if (!parsed) continue;
            const asian = entry.market === "ASIAN_HANDICAP";
            if (asian ? !["Home", "Away"].includes(parsed[1]) : !["Over", "Under"].includes(parsed[1])) continue;
            selection = parsed[1].toUpperCase();
            // AH lines are always from the home perspective for comparability.
            line = Number(parsed[2]) * (asian && selection === "AWAY" ? -1 : 1);
            if (!asian && line < 0) continue;
          }
          const price = typeof value.odd === "string" && /^\d+(?:\.\d+)?$/.test(value.odd) ? Number(value.odd) : number(value.odd);
          if (!selection || price === null || price <= 1 || !Number.isFinite(price)) continue;
          quotes.push({ canonicalMatchId: ids[0], providerKey: "API_FOOTBALL", providerEventId,
            bookmakerKey: registration.key, bookmakerLabel: book.name ?? registration.label, bookmakerKind: "BOOKMAKER",
            market: entry.market, sourceMarket: String(bet.id), selection, line, decimalPrice: price,
            observedAt, fetchedAt: fetched, identityStatus: "VERIFIED", status: "OBSERVED" });
        }
      }
    }
  }
  const dedup = new Map();
  for (const q of quotes) {
    const key = JSON.stringify([q.canonicalMatchId, q.bookmakerKey, q.market, q.selection, q.line, q.observedAt]);
    if (!dedup.has(key)) dedup.set(key, q);
    else if (dedup.get(key)?.decimalPrice !== q.decimalPrice) { dedup.set(key, null); rejected.push({ providerEventId: q.providerEventId, reason: "CONFLICTING_DUPLICATE" }); }
  }
  return { quotes: [...dedup.values()].filter(Boolean), rejected };
}
