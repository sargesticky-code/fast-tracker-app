// Read-only enrichment of Flashscore provider IDs. No team-name alias inference.
const ROOT = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1";
export const VERIFIED_SUMMARY_URL = `${ROOT}/app-phase1-feed?view=summary&hours=48`;
export const VERIFIED_DETAIL_URL = `${ROOT}/app-match-detail`;

const validId = (id) => typeof id === "string" && /^FS:[A-Za-z0-9_-]{5,32}$/.test(id);
const scoreText = (v) => typeof v === "string" && /^\d{1,2}\s*-\s*\d{1,2}$/.test(v.trim()) ? v.trim() : null;

export function verifiedSummaryMap(payload) {
  if (payload?.source !== "flashscore-single-rpc-canonical" || !Array.isArray(payload?.matches)) {
    throw new Error("verified_summary_contract_invalid");
  }
  const byId = new Map();
  const duplicates = new Set();
  for (const item of payload.matches) {
    const id = item?.id;
    if (!validId(id) || duplicates.has(id)) continue;
    if (byId.has(id)) {
      byId.delete(id);
      duplicates.add(id); // Fail closed on conflicting fixture IDs.
      continue;
    }
    const home = Number(item?.forebet?.home);
    const draw = Number(item?.forebet?.draw);
    const away = Number(item?.forebet?.away);
    const probs = [home, draw, away];
    const hda = item?.forebet && probs.every(v => Number.isFinite(v) && v >= 0 && v <= 1)
      && probs.reduce((a, b) => a + b, 0) >= 0.98
      && probs.reduce((a, b) => a + b, 0) <= 1.02
      ? {home, draw, away} : null;
    const src = item?.sourceContext || {};
    const confirmedXI = src.source === "FLASHSCORE" && src.lineupAvailable === true
      && Number(src.lineupCoverage?.homeStarters) === 11
      && Number(src.lineupCoverage?.awayStarters) === 11;
    const scoreHome = item?.scoreHome;
    const scoreAway = item?.scoreAway;
    const score = Number.isInteger(scoreHome) && Number.isInteger(scoreAway)
      && scoreHome >= 0 && scoreAway >= 0 && item?.scoreSource === "FLASHSCORE"
      ? {home:scoreHome, away:scoreAway} : null;
    // Canonical fixture fallback during raw collector restart. Match by exact FS
    // provider ID only, with no inferred bookmaker price, aliases or kickoff zone.
    const kickoffMs=Date.parse(String(item?.kickoff||""));
    const kickoff=Number.isFinite(kickoffMs)?new Date(kickoffMs).toISOString():null;
    const homeName=String(item?.home||"").trim();
    const awayName=String(item?.away||"").trim();
    const canonicalRow=src.source==="FLASHSCORE" && kickoff && homeName && awayName
      ? {
          id,providerEventId:id.slice(3),source:"FLASHSCORE_CANONICAL",
          home:homeName,away:awayName,homeEn:homeName,awayEn:awayName,
          league:String(item?.league||"Football"),kickoff,
          sourceDate:kickoff.slice(0,10),sourceTime:kickoff.slice(11,16),
          sourceTimeZone:"UTC",sourceTimeStatus:"VERIFIED_CANONICAL_KICKOFF",
          odds:{home:null,draw:null,away:null},oddsCapturedAt:null,
          raw:null,rawQuote:null,rawOnly:false
        }:null;
    byId.set(id, {
      id, prediction: scoreText(item?.forebetDetail?.predictedScore),
      forebet: hda, confirmedXI, score, canonicalRow,
      lineupObservedAt: confirmedXI ? (src?.lineupCoverage?.updatedAt || null) : null
    });
  }
  return {
    byId,
    fallbackMatches:[...byId.values()].map(x=>x.canonicalRow).filter(Boolean)
      .sort((x,y)=>x.kickoff.localeCompare(y.kickoff)),
    generatedAt: payload.generatedAt || null,
    bookmakerHealth: payload?.systemHealth?.FLASHSCORE_BET365?.status || "UNKNOWN"
  };
}

export async function fetchVerifiedSummary(signal) {
  const r = await fetch(VERIFIED_SUMMARY_URL, {signal:signal || AbortSignal.timeout(7500)});
  if (!r.ok) throw new Error("verified_summary_unavailable");
  return verifiedSummaryMap(await r.json());
}

export async function fetchVerifiedMatch(id, signal) {
  if (!validId(id)) throw new Error("invalid_canonical_id");
  const r = await fetch(`${VERIFIED_DETAIL_URL}?id=${encodeURIComponent(id)}`,
    {cache:"no-store",signal:signal || AbortSignal.timeout(7500)});
  if (!r.ok) throw new Error("verified_match_unavailable");
  const data = await r.json();
  if (data?.id !== id || data?.fixture?.match_id !== id
      || data?.fixtureSource !== "CANONICAL_FLASHSCORE") {
    throw new Error("verified_match_identity_mismatch");
  }
  return data;
}
