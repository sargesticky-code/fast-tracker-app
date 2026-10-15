// Read-only enrichment of Flashscore provider IDs. No team-name alias inference.
const ROOT = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1";
export const VERIFIED_SUMMARY_URL = `${ROOT}/app-phase1-feed?view=compact&hours=48`;
export const VERIFIED_DETAIL_URL = `${ROOT}/app-match-detail`;

const validId = (id) => typeof id === "string" && /^FS:[A-Za-z0-9_-]{5,32}$/.test(id);
const scoreText = (v) => typeof v === "string" && /^\d{1,2}\s*-\s*\d{1,2}$/.test(v.trim()) ? v.trim() : null;

export function currentExternalAdvisers(item,now=Date.now()) {
  if(!validId(item?.id)||!Array.isArray(item?.externalAdvisers))return [];
  const seen=new Set(),blocked=new Set(),valid=[];
  for(const a of item.externalAdvisers){
    if(!["BETCLAN","SPORTYTRADER"].includes(a?.provider)||a.id!==item.id||a.identityStatus!=="VERIFIED")continue;
    if(seen.has(a.provider)){blocked.add(a.provider);continue;}seen.add(a.provider);
    const at=Date.parse(a.capturedAt),kick=Date.parse(a.kickoff),canonical=Date.parse(item.kickoff);
    const allowed=a.provider==="BETCLAN"
      ?/^https:\/\/www\.betclan\.com\/predictionsdetails\/football\/\d+\/[^?#]+\/$/
      :/^https:\/\/www\.sportytrader\.com\/en\/betting-tips\/[^/?#]+-\d+\/$/;
    if(!Number.isFinite(at)||at>now+60000||at<now-36*3600000||!Number.isFinite(kick)||kick<=now
      ||!Number.isFinite(canonical)||Math.abs(kick-canonical)>60000||!allowed.test(a.sourceUrl||""))continue;
    const probability=v=>typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=1?v:null;
    const hda=trustedTriplet(a.hda),predictedScore=scoreText(a.predictedScore);
    const over25=probability(a.over25),bttsYes=probability(a.bttsYes);
    const tip=typeof a.tip==="string"&&a.tip.trim()?a.tip.trim().slice(0,160):null;
    if(!hda&&!predictedScore&&over25===null&&bttsYes===null&&!tip)continue;
    valid.push({...a,hda,predictedScore,over25,bttsYes,tip});
  }
  return valid.filter(a=>!blocked.has(a.provider));
}

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

const finiteCount=(value,max)=>Number.isInteger(value)&&value>=0&&value<=max;
function verifiedHistoricalForm(source,kickoff) {
  if(source?.source!=="football-data.co.uk"
      || source?.scope!=="domestic-league-results-only") return null;
  const matches=source.matches, results=source.resultsNewestFirst;
  const resultCounts=typeof results==="string"?{
    wins:[...results].filter(result=>result==="W").length,
    draws:[...results].filter(result=>result==="D").length,
    losses:[...results].filter(result=>result==="L").length
  }:null;
  const kickoffMs=Date.parse(String(kickoff||""));
  const cutoffDate=typeof source.throughDate==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(source.throughDate)
    ?Date.parse(source.throughDate+"T00:00:00Z"):NaN;
  if(!Number.isInteger(matches)||matches<3||matches>5
      ||typeof results!=="string"||!new RegExp(`^[WDL]{${matches}}$`).test(results)
      ||![source.wins,source.draws,source.losses].every(Number.isInteger)
      ||source.wins+source.draws+source.losses!==matches
      ||source.wins!==resultCounts?.wins||source.draws!==resultCounts?.draws||source.losses!==resultCounts?.losses
      ||![source.goalsFor,source.goalsAgainst].every(v=>Number.isInteger(v)&&v>=0)
      ||!Number.isFinite(kickoffMs)||!Number.isFinite(cutoffDate)
      ||new Date(cutoffDate).toISOString().slice(0,10)!==source.throughDate) return null;
  const targetParts=new Intl.DateTimeFormat("en-GB",{
    timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(new Date(kickoffMs));
  const targetDate=[targetParts.find(x=>x.type==="year")?.value,
    targetParts.find(x=>x.type==="month")?.value,targetParts.find(x=>x.type==="day")?.value].join("-");
  if(source.throughDate>=targetDate) return null;

  const form={matches,results,wins:source.wins,draws:source.draws,losses:source.losses,
    goalsFor:source.goalsFor,goalsAgainst:source.goalsAgainst,throughDate:source.throughDate,
    source:source.source,scope:source.scope};
  if(finiteCount(source.over25Count,matches)
      &&Number.isFinite(source.over25Rate)&&source.over25Rate>=0&&source.over25Rate<=100
      &&Math.abs(source.over25Rate-source.over25Count*100/matches)<=0.11
      &&Number.isFinite(source.averageGoals)&&source.averageGoals>=0&&source.averageGoals<=20) {
    form.over25Count=source.over25Count;
    form.over25Rate=source.over25Rate;
    form.averageGoals=source.averageGoals;
  }
  if(finiteCount(source.bttsCount,matches)
      &&Number.isFinite(source.bttsRate)&&source.bttsRate>=0&&source.bttsRate<=100
      &&Math.abs(source.bttsRate-source.bttsCount*100/matches)<=0.11) {
    form.bttsCount=source.bttsCount;
    form.bttsRate=source.bttsRate;
  }
  const cornerSample=source.matchesWithCorners;
  if(finiteCount(cornerSample,matches)&&cornerSample>0
      &&finiteCount(source.over95CornersCount,cornerSample)
      &&finiteCount(source.under95CornersCount,cornerSample)
      &&source.over95CornersCount+source.under95CornersCount===cornerSample
      &&[source.over95CornersRate,source.under95CornersRate].every(v=>Number.isFinite(v)&&v>=0&&v<=100)
      &&Math.abs(source.over95CornersRate-source.over95CornersCount*100/cornerSample)<=0.11
      &&Math.abs(source.under95CornersRate-source.under95CornersCount*100/cornerSample)<=0.11
      &&[source.averageCornersFor,source.averageCornersAgainst,source.averageTotalCorners]
        .every(v=>Number.isFinite(v)&&v>=0&&v<=60)) {
    form.matchesWithCorners=cornerSample;
    form.over95CornersCount=source.over95CornersCount;
    form.under95CornersCount=source.under95CornersCount;
    form.over95CornersRate=source.over95CornersRate;
    form.under95CornersRate=source.under95CornersRate;
    form.averageCornersFor=source.averageCornersFor;
    form.averageCornersAgainst=source.averageCornersAgainst;
    form.averageTotalCorners=source.averageTotalCorners;
  }
  return form;
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

const approvedModelSource=(v)=>v==="VERIFIED_RESULTS_HISTORY"
  || (typeof v==="string" &&
    (v.startsWith("football-data.co.uk main / penaltyblog ")
     ||v.startsWith("football-data.co.uk extra / penaltyblog ")));
function trustedTriplet(v){
  if(!v || typeof v!=="object")return null;
  const values=["home","draw","away"].map(k=>v[k]);
  return values.every(x=>typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=1)
    &&Math.abs(values.reduce((sum,x)=>sum+x,0)-1)<=0.02
    ?{home:values[0],draw:values[1],away:values[2]}:null;
}
function currentSourceModel(values,meta,kickoff,expectedQuality="MODELED"){
  const now=Date.now(),at=Date.parse(String(meta?.fetchedAt||"")),
    start=Date.parse(String(kickoff||""));
  if(!Number.isFinite(at)||!Number.isFinite(start)||start<=now||at>=start
     ||at>now+60000||at<now-72*3600_000 ||meta?.quality!==expectedQuality
     ||!approvedModelSource(meta?.source))return null;
  return trustedTriplet(values);
}
export function verifiedSummaryMap(payload) {
  const primary=payload?.source==="flashscore-single-rpc-canonical";
  const recovery=payload?.source==="supabase-lightweight-enrichment-recovery"
    &&["AUTHORITY_ONLY","LIGHTWEIGHT_CANONICAL_EVIDENCE"].includes(payload?.recoveryMode);
  if ((!primary&&!recovery)||!Array.isArray(payload?.matches)) {
    throw new Error("verified_summary_contract_invalid");
  }
  if(recovery){
    // A fallback response time is not proof of identity. Require both a recent
    // read and independent exact-provider identity on each accepted fixture.
    const at=Date.parse(String(payload.generatedAt||""));
    if(!Number.isFinite(at)||at>Date.now()+60000||at<Date.now()-20*60000)
      throw new Error("verified_recovery_stale");
  }
  const byId = new Map();
  const duplicates = new Set();
  for (const item of payload.matches) {
    const id = item?.id;
    if (!validId(id) || duplicates.has(id)) continue;
    if(recovery && item?.sourceContext?.identityStatus!=="EXACT_CANONICAL_PROVIDER_FIXTURE")continue;
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
    const dc=currentSourceModel(item?.advisors?.dc,item?.advisors?.dcMeta,item?.kickoff);
    // PI shares the Dixon–Coles training source, not an independent provider.
    const pi=dc?trustedTriplet(item?.advisors?.pi):null;
    const form= item?.advisors?.formMeta?.source==="VERIFIED_RESULTS_HISTORY"
      ?currentSourceModel(item?.advisors?.form,item?.advisors?.formMeta,item?.kickoff,"FORM_MODELED"):null;
    const forebetAt=Date.parse(String(item?.forebetDetail?.fetchedAt||""));
    const kickoffAt=Date.parse(String(item?.kickoff||""));
    const currentForebet=Boolean(hda) && Number.isFinite(forebetAt)&&Number.isFinite(kickoffAt)
      &&kickoffAt>Date.now()&&forebetAt<kickoffAt
      &&forebetAt<=Date.now()+60000&&forebetAt>=Date.now()-72*3600_000;
    // Forebet average goals is a source field, not the model probability,
    // a historical-form average or a derived Over/Under probability.
    // Preserve it only with a verified 1X2 record and a plausible source value.
    const sourceAvgGoals=item?.forebetDetail?.ou25?.avgGoals;
    const forebetAvgGoals=hda && typeof sourceAvgGoals==="number"
      &&Number.isFinite(sourceAvgGoals)&&sourceAvgGoals>0&&sourceAvgGoals<=15
      ? sourceAvgGoals:null;
    const confirmedXI = src.source === "FLASHSCORE" && src.lineupAvailable === true
      && Number(src.lineupCoverage?.homeStarters) === 11
      && Number(src.lineupCoverage?.awayStarters) === 11;
    const scoreHome = item?.scoreHome;
    const scoreAway = item?.scoreAway;
    const score = Number.isInteger(scoreHome) && Number.isInteger(scoreAway)
      && scoreHome >= 0 && scoreAway >= 0 && item?.scoreSource === "FLASHSCORE"
      ? {home:scoreHome, away:scoreAway} : null;
    const scoreCapturedMs=Date.parse(String(item?.scoreCapturedAt||""));
    const scoreCapturedAt=Number.isFinite(scoreCapturedMs)&&scoreCapturedMs<=Date.now()+60000
      ?new Date(scoreCapturedMs).toISOString():null;
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
      forebet: hda,forebetCurrent:currentForebet,forebetAvgGoals,
      forebetCapturedAt:Number.isFinite(forebetAt)?new Date(forebetAt).toISOString():null,
      dc,pi,form,externalAdvisers:currentExternalAdvisers(item),
      historicalForm:{
        home:verifiedHistoricalForm(item?.historicalForm?.home,item?.kickoff),
        away:verifiedHistoricalForm(item?.historicalForm?.away,item?.kickoff)
      },
      forebetOU25:verifiedMarket(item?.forebetDetail?.ou25),
      forebetCorners95:verifiedMarket(item?.forebetDetail?.corners95),
      confirmedXI, score, scoreCapturedAt, canonicalRow,
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
