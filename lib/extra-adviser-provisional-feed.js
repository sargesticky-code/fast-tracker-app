// Display-only PrimaTips / Statarea. Never merge into verified forecasts.
const URL="https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/adviser-extra-provisional-feed";
const providers=new Set(["PRIMATIPS","STATAREA"]);
const ID=/^FS:[A-Za-z0-9_-]{5,32}$/;
const URLS={
  PRIMATIPS:/^https:\/\/primatips\.com\/tip\/[a-z0-9-]+-\d{4,12}\/?$/,
  STATAREA:/^https:\/\/www\.statarea\.com\/olddevices\/prediction\/\d{4}-\d{2}-\d{2}\/$/
};
const probability=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=1;
export function parseExtraAdviserProvisional(payload,now=Date.now()) {
  if(!["EXTRA_ADVISER_PROVISIONAL_04","EXTRA_ADVISER_PROVISIONAL_03"].includes(payload?.source)
    ||payload?.quality!=="PROVISIONAL_NOT_VERIFIED_CALIBRATED_WALL_TIME"
    ||!Array.isArray(payload?.rows)||payload.rows.length>600)
    throw Error("extra_adviser_provisional_contract_invalid");
  const generated=Date.parse(String(payload.generatedAt||""));
  if(!Number.isFinite(generated)||generated>now+60_000||generated<now-10*60_000)
    throw Error("extra_adviser_provisional_snapshot_stale");
  const map=new Map(),duplicate=new Set(),seen=new Set();
  for(const r of payload.rows){
    if(!r||!providers.has(r.provider)||!ID.test(String(r.id||""))
       ||r.status!=="PROVISIONAL_NOT_VERIFIED"
       ||r.kickoffTimezoneVerified!==false
       ||r.clockEvidence!=="CALIBRATED_FROM_DAY_COHORT_NOT_SOURCE_VERIFIED"
       ||!URLS[r.provider].test(String(r.sourceUrl||""))
       ||![r.homeSimilarity,r.awaySimilarity].every(x=>typeof x==="number"&&x>=.3&&x<=1)
       ||typeof r.leagueSimilarity!=="number"||r.leagueSimilarity<0||r.leagueSimilarity>1
       ||!((r.homeSimilarity>=.4&&r.awaySimilarity>=.4)
         ||(Math.max(r.homeSimilarity,r.awaySimilarity)>=.7
           &&r.leagueSimilarity>=.5&&r.timeDeltaSeconds<=60))
       ||typeof r.clockOffsetMinutes!=="number"||Math.abs(r.clockOffsetMinutes)>720
       ||!Number.isInteger(r.clockCalibrationSamples)||r.clockCalibrationSamples<10
       ||!probability(r.clockCalibrationAgreement)||r.clockCalibrationAgreement<.9
       ||typeof r.timeDeltaSeconds!=="number"||r.timeDeltaSeconds<0||r.timeDeltaSeconds>300
       ||!["NAME_SIMILAR","NEEDS_REVIEW"].includes(r.leagueEvidence))continue;
    const kickoff=Date.parse(String(r.kickoff||""));
    const checked=Date.parse(String(r.lastChecked||""));
    const captured=Date.parse(String(r.sourceCapturedAt||""));
    if(!Number.isFinite(kickoff)||kickoff<=now||kickoff>now+48*3600_000
       ||!Number.isFinite(checked)||checked<now-36*3600_000||checked>now+60_000
       ||!Number.isFinite(captured)||captured<now-36*3600_000||captured>now+60_000)continue;
    const raw=r.hda,values=["home","draw","away"].map(k=>raw?.[k]);
    if(!values.every(probability)||Math.abs(values.reduce((a,b)=>a+b,0)-1)>.02)continue;
    const over25=probability(r.over25)?r.over25:null;
    const bttsYes=probability(r.bttsYes)?r.bttsYes:null;
    const key=r.provider+"|"+r.id;
    if(duplicate.has(key))continue;
    if(seen.has(key)){
      duplicate.add(key);
      map.set(r.id,(map.get(r.id)||[]).filter(x=>x.provider!==r.provider));
      continue;
    }
    seen.add(key);
    const candidate={
      id:r.id,provider:r.provider,kickoff,sourceUrl:r.sourceUrl,
      sourceHome:String(r.sourceHome||""),sourceAway:String(r.sourceAway||""),
      homeSimilarity:r.homeSimilarity,awaySimilarity:r.awaySimilarity,
      leagueEvidence:r.leagueEvidence,leagueSimilarity:r.leagueSimilarity,clockEvidence:r.clockEvidence,
      clockOffsetMinutes:r.clockOffsetMinutes,
      clockCalibrationSamples:r.clockCalibrationSamples,
      clockCalibrationAgreement:r.clockCalibrationAgreement,
      sourceCapturedAt:captured,lastChecked:checked,
      hda:{home:values[0],draw:values[1],away:values[2]},
      over25,bttsYes,score:null,status:"PROVISIONAL_NOT_VERIFIED"
    };
    map.set(r.id,[...(map.get(r.id)||[]),candidate]);
  }
  return map;
}

export async function fetchExtraAdviserProvisional(signal){
  const response=await fetch(URL,{cache:"no-store",signal:signal||AbortSignal.timeout(7000)});
  if(!response.ok)throw Error("extra_adviser_provisional_unavailable");
  return parseExtraAdviserProvisional(await response.json());
}
