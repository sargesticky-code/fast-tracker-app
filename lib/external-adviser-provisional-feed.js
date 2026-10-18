import { fetchExtraAdviserProvisional } from "./extra-adviser-provisional-feed.js";
// Bounded display-only external football adviser source associations.
// Provisional is NOT verified, does NOT enter model ranking/odds calculations.
const URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/adviser-provisional-feed";
const ID = /^FS:[A-Za-z0-9_-]{5,32}$/;
const providers = new Set(["BETCLAN","SPORTYTRADER"]);
const odds = v => typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=1;
const urls = {
  BETCLAN:/^https:\/\/www\.betclan\.com\/predictionsdetails\/football\/\d+\/[^?#]+\/$/,
  SPORTYTRADER:/^https:\/\/www\.sportytrader\.com\/en\/betting-tips\/[^/?#]+-\d+\/$/
};
export function parseExternalProvisional(payload,now=Date.now()) {
  if(!["ADVISER_PROVISIONAL_FLASHscore_0_4","ADVISER_PROVISIONAL_FLASHscore_0_3","ADVISER_PROVISIONAL_FLASHscore_0_25"].includes(payload?.source)
     ||payload?.quality!=="PROVISIONAL_NOT_VERIFIED"
     ||!Array.isArray(payload?.rows)||payload.rows.length>180)
    throw Error("external_provisional_contract_invalid");
  const generated=Date.parse(String(payload.generatedAt||""));
  if(!Number.isFinite(generated)||generated>now+60_000||generated<now-10*60_000)
    throw Error("external_provisional_snapshot_stale");
  const map=new Map(),dedup=new Set(),collisions=new Set();
  for(const x of payload.rows){
    if(!ID.test(String(x?.id||""))||!providers.has(x?.provider)
      ||x.status!=="PROVISIONAL_NOT_VERIFIED"
      ||!urls[x.provider].test(String(x.sourceUrl||""))
      ||![x.homeSimilarity,x.awaySimilarity].every(v=>typeof v==="number"&&v>=0.25&&v<=1)
      ||!((x.homeSimilarity>=0.4&&x.awaySimilarity>=0.4)
        ||(x.leagueEvidence==="CORROBORATED"))
      ||!["CORROBORATED","NEEDS_REVIEW"].includes(x.leagueEvidence))continue;
    const kickoff=Date.parse(String(x.kickoff||""));
    const checked=Date.parse(String(x.lastChecked||""));
    const captured=Date.parse(String(x.sourceCapturedAt||""));
    if(!Number.isFinite(kickoff)||kickoff<=now||kickoff>now+48*3600_000
      ||!Number.isFinite(checked)||checked>now+60_000||checked<now-36*3600_000
      ||!Number.isFinite(captured)||captured>now+60_000||captured<now-48*3600_000)continue;
    const raw=x.hda,values=["home","draw","away"].map(k=>raw?.[k]);
    const hda=values.every(odds)&&Math.abs(values.reduce((a,b)=>a+b,0)-1)<=.02
      ?{home:values[0],draw:values[1],away:values[2]}:null;
    const score=typeof x.predictedScore==="string"&&/^\d{1,2}-\d{1,2}$/.test(x.predictedScore)?x.predictedScore:null;
    const over25=odds(x.over25)?x.over25:null;
    const bttsYes=odds(x.bttsYes)?x.bttsYes:null;
    // SportyTrader may provide a genuine TEXT tip without a numeric model
    // triplet. The old client silently discarded all such real source tips.
    const tip=x.provider==="SPORTYTRADER"&&typeof x.tip==="string"
      &&x.tip.length>=1&&x.tip.length<=100&&x.tip.trim()===x.tip
      ?x.tip:null;
    const calibrated=x.clockEvidence==="CALIBRATED_FROM_SPORTYTRADER_LINKED_EVENTS_NOT_SOURCE_VERIFIED";
    if(calibrated&&!(x.provider==="SPORTYTRADER"
        &&x.leagueEvidence==="CORROBORATED"
        &&typeof x.leagueSimilarity==="number"&&x.leagueSimilarity>=.5
        &&x.leagueSimilarity<=1
        &&x.kickoffTimezoneVerified===false
        &&Number.isInteger(x.clockOffsetMinutes)&&Math.abs(x.clockOffsetMinutes)<=720
        &&Number.isInteger(x.clockCalibrationSamples)&&x.clockCalibrationSamples>=4
        &&typeof x.clockCalibrationAgreement==="number"&&x.clockCalibrationAgreement>=.9
        &&x.clockCalibrationAgreement<=1
        &&typeof x.timeDeltaSeconds==="number"&&x.timeDeltaSeconds<=60
        &&x.timeDeltaSeconds>=0))continue;
    if(!hda&&!score&&over25===null&&bttsYes===null&&!tip)continue;
    const key=x.id+"|"+x.provider;
    if(collisions.has(key))continue;
    if(dedup.has(key)){
      collisions.add(key);
      map.set(x.id,(map.get(x.id)||[]).filter(v=>v.provider!==x.provider));
      continue;
    }
    dedup.add(key);
    map.set(x.id,[...(map.get(x.id)||[]),{
      id:x.id,provider:x.provider,kickoff,leagueEvidence:x.leagueEvidence,
      sourceHome:String(x.sourceHome||""),sourceAway:String(x.sourceAway||""),
      homeSimilarity:x.homeSimilarity,awaySimilarity:x.awaySimilarity,
      sourceUrl:x.sourceUrl,sourceCapturedAt:captured,lastChecked:checked,
      hda,score,over25,bttsYes,tip,
      clockEvidence:calibrated?x.clockEvidence:null,
      clockOffsetMinutes:calibrated?x.clockOffsetMinutes:null,
      clockCalibrationSamples:calibrated?x.clockCalibrationSamples:null,
      clockCalibrationAgreement:calibrated?x.clockCalibrationAgreement:null,
      kickoffTimezoneVerified:calibrated?false:null,
      status:"PROVISIONAL_NOT_VERIFIED"
    }]);
  }
  return map;
}
async function fetchLegacyProvisional(signal){
  const response=await fetch(URL,{cache:"no-store",signal:signal||AbortSignal.timeout(7000)});
  if(!response.ok)throw Error("external_provisional_feed_unavailable");
  return parseExternalProvisional(await response.json());
}
export async function fetchExternalProvisional(signal) {
  const [legacy,extra]=await Promise.allSettled([
    fetchLegacyProvisional(signal),fetchExtraAdviserProvisional(signal)
  ]);
  if(legacy.status!=="fulfilled"&&extra.status!=="fulfilled")
    throw Error("all_external_adviser_provisional_feeds_unavailable");
  const combined=new Map();
  combined.feedStatus={legacy:legacy.status==="fulfilled",extra:extra.status==="fulfilled"};
  for(const part of [legacy,extra]){
    if(part.status!=="fulfilled")continue;
    for(const [id,items] of part.value){
      const previous=combined.get(id)||[];
      combined.set(id,[...previous,...items]);
    }
  }
  return combined;
}
