export const FLASHSCORE_SNAPSHOT_URL =
  process.env.NEXT_PUBLIC_FLASHSCORE_SNAPSHOT_URL ||
  "https://fast-tracker-dashboard-production.up.railway.app/snapshot";

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
  if (snapshot?.source !== "FLASHSCORE_BET365" || !Array.isArray(snapshot.discovered)) return null;
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
    const quote = quoteById.get(providerEventId) || null;
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
      league: String(fixture?.competition || "Football"), kickoff: null, sourceDate: date,
      raw: fixture, rawQuote: quote,
      sourceTime: timeText || null,
      sourceTimeStatus: timeText ? "SOURCE_DISPLAY_UNVERIFIED" : "NOT_SUPPLIED",
      sourceTimeZone: "UNVERIFIED",
      odds: showQuote ? { home: Number(hda.home), draw: Number(hda.draw), away: Number(hda.away) } : { home: null, draw: null, away: null },
      quoteStatus,oddsCapturedAt: quote?.captured_at || null,
      goals: { line: null, over: null, under: null }, corners: { line: null, over: null, under: null },
      liveNow: false, live: null, dc: null, pi: null, form: null, forebet: null, multi: null,
      predictedScore: null, expectedGoals: null, rawOnly: true,
    }];
  });
  return {
    generatedAt: snapshot.captured_at || null, source: "FLASHSCORE_RAW", count: matches.length,
    matches: matches.sort((a, b) => `${a.sourceDate} ${a.sourceTime || ""}`.localeCompare(`${b.sourceDate} ${b.sourceTime || ""}`)),
    systemHealth: { FLASHSCORE: {
      status: snapshotFresh ? "CAPTURED" : snapshot.captured_at ? "STALE" : "UNKNOWN", observedAt: snapshot.captured_at || null,
      notes: "Raw Flashscore fixture fields. Bet365 HDA reference prices require a complete and independently fresh 20-minute quote. No in-play prices are claimed. No external model, goals, corners or live data is joined.",
    } },
  };
}

export async function fetchFlashscoreRawFeed(signal) {
  const response = await fetch(FLASHSCORE_SNAPSHOT_URL, { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(6500)]) : AbortSignal.timeout(6500) });
  if (!response.ok) throw new Error(`flashscore_snapshot_http_${response.status}`);
  const feed = toFlashscoreRawFeed(await response.json());
  if (!feed) throw new Error("flashscore_snapshot_shape_invalid");
  return feed;
}
