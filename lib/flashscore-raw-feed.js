export const FLASHSCORE_SNAPSHOT_URL =
  process.env.NEXT_PUBLIC_FLASHSCORE_SNAPSHOT_URL ||
  "https://fast-tracker-dashboard-production.up.railway.app/snapshot";

export function toFlashscoreRawFeed(snapshot) {
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
    const validHda = [hda?.home, hda?.draw, hda?.away].every((value) => Number.isFinite(Number(value)) && Number(value) > 1);
    return [{
      id: `FS:${providerEventId}`, providerEventId, source: "FLASHSCORE",
      bookmaker: validHda ? "Bet365" : null, home, away, homeEn: home, awayEn: away,
      league: String(fixture?.competition || "Football"), kickoff: null, sourceDate: date,
      raw: fixture, rawQuote: quote,
      sourceTime: timeText || null,
      sourceTimeStatus: timeText ? "SOURCE_DISPLAY_UNVERIFIED" : "NOT_SUPPLIED",
      sourceTimeZone: "UNVERIFIED",
      odds: validHda ? { home: Number(hda.home), draw: Number(hda.draw), away: Number(hda.away) } : { home: null, draw: null, away: null },
      oddsCapturedAt: quote?.captured_at || null,
      goals: { line: null, over: null, under: null }, corners: { line: null, over: null, under: null },
      liveNow: false, live: null, dc: null, pi: null, form: null, forebet: null, multi: null,
      predictedScore: null, expectedGoals: null, rawOnly: true,
    }];
  });
  return {
    generatedAt: snapshot.captured_at || null, source: "FLASHSCORE_RAW", count: matches.length,
    matches: matches.sort((a, b) => `${a.sourceDate} ${a.sourceTime || ""}`.localeCompare(`${b.sourceDate} ${b.sourceTime || ""}`)),
    systemHealth: { FLASHSCORE: {
      status: snapshot.captured_at ? "CAPTURED" : "UNKNOWN", observedAt: snapshot.captured_at || null,
      notes: "Raw Flashscore fixture fields. Bet365 HDA prices appear only when present in the same collector snapshot. No external model, goals, corners or live data is joined.",
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
