// Bet365 browser-feed adapter for joe-bring/bet365-scraper.
// Consumes the scraper as an EXTERNAL service; no scraper source is vendored here.
// Fail closed: unknown/missing values stay null and no canonical fixture is allocated.

const text = (v) => typeof v === "string" && v.trim() ? v.trim() : null;
const finiteInt = (v) => Number.isInteger(v) ? v : null;

function splitEventName(value) {
  const s = text(value);
  if (!s) return { home: null, away: null };
  for (const sep of [" v ", " vs ", " - "]) {
    const parts = s.split(sep);
    if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
      return { home: parts[0].trim(), away: parts[1].trim() };
    }
  }
  return { home: null, away: null };
}

function parseScore(value) {
  const s = text(value);
  if (!s) return { homeScore: null, awayScore: null };
  const m = /^(\d+)\s*[-:]\s*(\d+)$/.exec(s);
  if (!m) return { homeScore: null, awayScore: null };
  return { homeScore: Number(m[1]), awayScore: Number(m[2]) };
}

function parseClock(value) {
  const s = text(value);
  if (!s) return { minute: null, second: null };
  const m = /^(\d{1,3}):(\d{2})$/.exec(s);
  if (!m) return { minute: null, second: null };
  const minute = Number(m[1]), second = Number(m[2]);
  if (!Number.isInteger(minute) || minute < 0 || minute > 180 || second < 0 || second > 59) {
    return { minute: null, second: null };
  }
  return { minute, second };
}

export function bet365BrowserLive(payload, fetchedAt) {
  if (!Array.isArray(payload)) throw new Error("BET365_BROWSER_INVALID_RESPONSE");
  const fetched = new Date(fetchedAt);
  if (!Number.isFinite(fetched.getTime())) throw new Error("BET365_BROWSER_INVALID_FETCH_TIME");

  const fixtures = [];
  const rejected = [];

  for (const row of payload) {
    const providerEventId = text(row?.id);
    const competition = text(row?.league);
    const period = text(row?.period);
    const { home, away } = splitEventName(row?.event);
    const { homeScore, awayScore } = parseScore(row?.score);
    const { minute, second } = parseClock(row?.time);

    if (!providerEventId || !competition || !home || !away) {
      rejected.push({ providerEventId, reason: "INCOMPLETE_LIVE_IDENTITY" });
      continue;
    }

    fixtures.push({
      providerKey: "BET365_BROWSER",
      bookmakerKey: "bet365",
      providerEventId,
      competition,
      home,
      away,
      period,
      minute,
      second,
      homeScore,
      awayScore,
      fetchedAt: fetched.toISOString(),
      canonicalMatchId: null,
      identityStatus: "UNRESOLVED"
    });
  }

  return { fixtures, rejected, quotes: [] };
}

export function assertNoFabricatedOdds(bundle) {
  if (!bundle || !Array.isArray(bundle.quotes)) throw new Error("BET365_BROWSER_INVALID_BUNDLE");
  if (bundle.quotes.length !== 0) throw new Error("BET365_BROWSER_UNREVIEWED_ODDS_CONTRACT");
  return true;
}
