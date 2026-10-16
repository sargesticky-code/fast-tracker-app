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
  if(!["ADVISER_PROVISIONAL_FLASHscore_0_4","ADVISER_PROVISIONAL_FLASHscore_0_3"].includes(payload?.source)
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
      ||![x.homeSimilarity,x.awaySimilarity].every(v=>typeof v==="number"&&v>=0.3&&v<=1)
      ||!((x.homeSimilarity>=0.4&&x.awaySimilarity>=0.4)
        ||(Math.max(x.homeSimilarity,x.awaySimilarity)>=0.7&&x.leagueEvidence==="CORROBORATED"))
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
    if(!hda&&!score&&over25===null&&bttsYes===null)continue;
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
      hda,score,over25,bttsYes,status:"PROVISIONAL_NOT_VERIFIED"
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
