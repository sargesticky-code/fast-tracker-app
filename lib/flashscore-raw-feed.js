// The independent Supabase Flashscore scout is the fixture source. Never
// fetch the retired collector or infer current bookmaker quotes from fixtures.
export const FLASHSCORE_SNAPSHOT_URL =
  "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/flashscore-verified-fixtures";

// Raw bookmaker prices are informational, never an in-play price guarantee.
// Apply the same strict 20-minute quote freshness limit as the canonical API.
const recentCapture = (iso,now,maxAgeMs) => {
  const time = Date.parse(typeof iso==="string"?iso:"");
  return Number.isFinite(time) && time<=now+60000 && time>=now-maxAgeMs;
};

export function toFlashscoreRawFeed(snapshot) {
  const now=Date.now();
  const snapshotFresh=recentCapture(snapshot?.captured_at,now,30*60*1000);
  const snapshotTime=Date.parse(String(snapshot?.captured_at||""));
  const verifiedFixtures = snapshot?.source === "FLASHSCORE_VERIFIED_FIXTURES";
  if (!verifiedFixtures && snapshot?.source !== "FLASHSCORE_BET365") return null;
  if (!Array.isArray(snapshot.discovered)) return null;
  const quoteById = new Map();
  for (const quote of Array.isArray(snapshot.fixtures) ? snapshot.fixtures : []) {
    const id = String(quote?.provider_event_id || "");
    if (id) quoteById.set(id, quote);
  }
  const matches = snapshot.discovered.flatMap((fixture) => {
    const providerEventId = String(fixture?.provider_event_id || "");
    const home = String(fixture?.home || "").trim();
    const away = String(fixture?.away || "").trim();
    const date = String(fixture?.fixture_date || "");
    const timeText = String(fixture?.time_text || "").trim();

    if (!/^[A-Za-z0-9_-]{5,32}$/.test(providerEventId) || !home || !away) return [];
    const quote = verifiedFixtures ? null : (quoteById.get(providerEventId) || null);
    const hda = quote?.hda || null;
    const quoteTime=Date.parse(String(quote?.captured_at||""));
    const quoteFresh=snapshotFresh
      && recentCapture(quote?.captured_at,now,20*60*1000)
      && quoteTime<=snapshotTime+60000;
    const validHda=Boolean(hda)&&["home","draw","away"].every((side)=>{
      const value=hda[side];
      return value!==null && value!==undefined
        && Number.isFinite(Number(value))
        && Number(value)>=1.01 && Number(value)<=100;
    });
    const showQuote=Boolean(validHda&&quoteFresh);
    const quoteStatus=!quote?"MISSING":!validHda?"INVALID":quoteFresh?"FRESH":"STALE";
    return [{
      id: `FS:${providerEventId}`, providerEventId, source: "FLASHSCORE",
      bookmaker: showQuote ? "Bet365" : null, home, away, homeEn: home, awayEn: away,
      league: String(fixture?.competition || "Football"),
      kickoff: verifiedFixtures && /^\d{4}-\d{2}-\d{2}T/.test(String(fixture?.kickoff_utc || "")) ? fixture.kickoff_utc : null,
      sourceDate: date,
      raw: fixture, rawQuote: quote,
      sourceTime: timeText || null,
      sourceTimeStatus: verifiedFixtures ? "VERIFIED_CANONICAL_KICKOFF" : (timeText ? "SOURCE_DISPLAY_UNVERIFIED" : "NOT_SUPPLIED"),
      sourceTimeZone: verifiedFixtures ? "UTC" : "UNVERIFIED",
      odds: showQuote ? { home: Number(hda.home), draw: Number(hda.draw), away: Number(hda.away) } : { home: null, draw: null, away: null },
      quoteStatus,oddsCapturedAt: quote?.captured_at || null,
      goals: { line: null, over: null, under: null }, corners: { line: null, over: null, under: null },
      liveNow: false, live: null, dc: null, pi: null, form: null, forebet: null, multi: null,
      predictedScore: null, expectedGoals: null, rawOnly: !verifiedFixtures,
    }];
  });
  return {
    generatedAt: snapshot.captured_at || null,
    source: verifiedFixtures ? "FLASHSCORE_VERIFIED_FIXTURES" : "FLASHSCORE_RAW", count: matches.length,
    matches: matches.sort((a, b) => `${a.sourceDate} ${a.sourceTime || ""}`.localeCompare(`${b.sourceDate} ${b.sourceTime || ""}`)),
    systemHealth: { FLASHSCORE: {
      status: snapshotFresh ? "CAPTURED" : snapshot.captured_at ? "STALE" : "UNKNOWN", observedAt: snapshot.captured_at || null,
      notes: verifiedFixtures
        ? "Fresh verified Flashscore fixture identities from Supabase. This feed contains NO bookmaker odds; missing prices stay unknown."
        : "Raw Flashscore source fields. Bet365 prices require independently fresh bookmaker evidence.",
    } },
  };
}

export async function fetchFlashscoreRawFeed(signal) {
  if (!FLASHSCORE_SNAPSHOT_URL) throw new Error("flashscore_snapshot_not_configured");
  const response = await fetch(FLASHSCORE_SNAPSHOT_URL, { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(6500)]) : AbortSignal.timeout(6500) });
  if (!response.ok) throw new Error(`flashscore_snapshot_http_${response.status}`);
  const feed = toFlashscoreRawFeed(await response.json());
  if (!feed) throw new Error("flashscore_snapshot_shape_invalid");
  return feed;
}
