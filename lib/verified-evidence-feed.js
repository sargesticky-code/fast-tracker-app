// Read-only enrichment of Flashscore provider IDs. No team-name alias inference.
const ROOT = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1";
export const VERIFIED_SUMMARY_URL = `${ROOT}/app-phase1-feed?view=compact&hours=48`;
export const VERIFIED_DETAIL_URL = `${ROOT}/app-match-detail`;

const validId = (id) => typeof id === "string" && /^FS:[A-Za-z0-9_-]{5,32}$/.test(id);
const scoreText = (v) => typeof v === "string" && /^\d{1,2}\s*-\s*\d{1,2}$/.test(v.trim()) ? v.trim() : null;

// Snapshot-only evidence: never call these figures real-time or final totals.
// Values have an exact Flashscore fixture identity from the existing verified API.
export function matchObservation(data) {
  if (data?.source !== "FLASHSCORE" || !data?.stats || typeof data.stats !== "object") return null;
  const captureMs=Date.parse(String(data.capturedAt||""));
  if (!Number.isFinite(captureMs) || captureMs>Date.now()+60000) return null;
  const ranges={xg:20,xgot:20,shots:200,shotsOnTarget:200,corners:100,bigChances:100,possession:100};
  const stats={};
  for (const [field,limit] of Object.entries(ranges)) {
    const pair=data.stats[field];
    if (!pair || typeof pair!=="object") continue;
    const home=pair.home, away=pair.away;
    if ([home,away].some(x=>x===null||x===undefined||!Number.isFinite(Number(x))
      ||Number(x)<0||Number(x)>limit)) continue;
    stats[field]={home:Number(home),away:Number(away)};
  }
  if (!Object.keys(stats).length) return null;
  return {stats,capturedAt:new Date(captureMs).toISOString(),source:"FLASHSCORE",
    semantics:"HISTORICAL_OBSERVED_SNAPSHOT_NOT_FINAL_OR_LIVE"};
}

// Forebet goals/corners probabilities are fractions in the canonical fast feed.
function verifiedMarket(source) {
  const over=source?.over, under=source?.under;
  if (typeof over!=="number" || typeof under!=="number"
    || !Number.isFinite(over) || !Number.isFinite(under)
    || over<0 || over>1 || under<0 || under>1
    || over+under<0.98 || over+under>1.02) return null;
  return {over,under,pick:source?.pick==="Over"||source?.pick==="Under"?source.pick:null,
    predictedScore:scoreText(source?.predictedScore),
    avg:source?.avgCorners==null?null:Number(source.avgCorners)};
}

// Only exact-event odds from the existing canonical feed. Preserve provenance
// and capture time. The frontend independently checks age and kickoff again.
function validatedCompactQuote(item) {
  const source=item?.odds;
  if(!source || typeof source!=="object") return null;
  const values=["home","draw","away"].map(k=>source[k]);
  if(values.some(v=>v===null||v===undefined||typeof v!=="number"||
      !Number.isFinite(v)||v<1.01||v>100)) return null;
  const time=String(item?.oddsCapturedAt||"");
  if(!/(Z|[+-]\\d{2}:\\d{2})$/i.test(time)) return null;
  const ms=Date.parse(time);
  if(!Number.isFinite(ms)) return null;
  return {
    home:values[0],draw:values[1],away:values[2],
    capturedAt:new Date(ms).toISOString(),
    label:item?.oddsLabel==="China 500 reference"?"China 500 reference":"Bookmaker reference",
  };
}

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
    const probs = [item?.forebet?.home,item?.forebet?.draw,item?.forebet?.away];
    const hda = item?.forebet && probs.every(v => v!==null && v!==undefined
      && typeof v==="number" && Number.isFinite(v) && v>=0 && v<=1)
      && probs.reduce((a, b) => a + b, 0) >= 0.98
      && probs.reduce((a, b) => a + b, 0) <= 1.02
      ? {home:probs[0],draw:probs[1],away:probs[2]} : null;
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
    const canonicalRow=kickoff && homeName && awayName
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
      forebet: hda,
      forebetOU25:verifiedMarket(item?.forebetDetail?.ou25),
      forebetCorners95:verifiedMarket(item?.forebetDetail?.corners95),
      confirmedXI, score, canonicalRow,
      quote:validatedCompactQuote(item),
      matchStatus: typeof item?.status==="string" ? item.status : null,
      liveNow: item?.liveNow===true,
      observedStats:matchObservation(src?.observedStats),
      lineupObservedAt: confirmedXI ? (src?.lineupCoverage?.updatedAt || null) : null
    });
  }
  // Existing compact feed carries a bounded ID->kickoff mapping sourced
  // from the canonical fixture view. No alias inference or independent fetch.
  const fixtureKickoffs=new Map();
  for(const item of Array.isArray(payload.fixtureKickoffs)?payload.fixtureKickoffs:[]) {
    if(!validId(item?.id)||fixtureKickoffs.has(item.id))continue;
    const time=String(item?.kickoff??"");
    if(!/(Z|[+-]\d{2}:\d{2})$/i.test(time)) continue;
    const ms=Date.parse(time);
    if(Number.isFinite(ms)) fixtureKickoffs.set(item.id,new Date(ms).toISOString());
  }
  for(const [id,match] of byId){
    if(match.canonicalRow?.kickoff && !fixtureKickoffs.has(id))
      fixtureKickoffs.set(id,match.canonicalRow.kickoff);
  }
  return {
    byId,fixtureKickoffs,
    fallbackMatches:[...byId.values()].map(x=>x.canonicalRow).filter(Boolean)
      .sort((x,y)=>x.kickoff.localeCompare(y.kickoff)),
    generatedAt: payload.generatedAt || null,
    bookmakerHealth: payload?.systemHealth?.FLASHSCORE_BET365?.status || "UNKNOWN"
  };
}

export async function fetchVerifiedSummary(signal) {
  const r = await fetch(VERIFIED_SUMMARY_URL, {cache:"no-store",signal:signal || AbortSignal.timeout(7500)});
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
