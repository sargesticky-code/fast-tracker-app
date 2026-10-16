// Public UI-only 0.4 evidence; neither provider has a verified source timezone.
// Strictly separate this from verified odds/forecast and betting advice.
const URL="https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/adviser-extra-provisional-feed";
const idOK=x=>typeof x==="string"&&/^FS:[A-Za-z0-9_-]{5,32}$/.test(x);
const percent=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=1;
const hosts={
  PRIMATIPS:/^https:\/\/primatips\.com\/tip\/[^?#]+-\d{4,12}\/?$/,
  STATAREA:/^https:\/\/www\.statarea\.com\/olddevices\/prediction\/\d{4}-\d{2}-\d{2}\/$/
};
export function parseExtraAdviserProvisional(body,now=Date.now()){
  if(body?.source!=="EXTRA_ADVISER_PROVISIONAL_04"
    ||body?.quality!=="DATE_TEAM_UNIQUE_SOURCE_CLOCK_UNVERIFIED"
    ||!Array.isArray(body?.rows)||body.rows.length>1200)throw Error("extra_source_contract_invalid");
  const generated=Date.parse(String(body.generatedAt||""));
  if(!Number.isFinite(generated)||generated>now+60000||generated<now-10*60000)
    throw Error("extra_source_snapshot_stale");
  const map=new Map(),seen=new Set(),collisions=new Set();
  for(const x of body.rows){
    if(!idOK(x?.id)||!hosts[x?.provider]?.test(String(x.sourceUrl||""))
      ||x.status!=="PROVISIONAL_NOT_VERIFIED"||x.kickoffTimezoneVerified!==false
      ||![x.homeSimilarity,x.awaySimilarity].every(v=>typeof v==="number"&&v>=.4&&v<=1)
      ||typeof x.leagueSimilarity!=="number"||x.leagueSimilarity<0||x.leagueSimilarity>1
      ||(x.leagueSimilarity<.2&&(x.homeSimilarity<.85||x.awaySimilarity<.85))
      ||!/^\d{4}-\d{2}-\d{2}$/.test(String(x.sourceDate||""))
      ||!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(x.sourceWallTime||"")))continue;
    const kickoff=Date.parse(String(x.kickoff||""));
    const checked=Date.parse(String(x.lastChecked||""));
    const captured=Date.parse(String(x.sourceCapturedAt||""));
    if(!Number.isFinite(kickoff)||kickoff<=now||kickoff>now+64*3600_000
      ||!Number.isFinite(checked)||checked>now+60000||checked<now-36*3600_000
      ||!Number.isFinite(captured)||captured>now+60000||captured<now-72*3600_000)continue;
    const vals=["home","draw","away"].map(k=>x.hda?.[k]);
    if(!vals.every(percent)||Math.abs(vals.reduce((a,b)=>a+b,0)-1)>.02)continue;
    const over25=percent(x.over25)?x.over25:null;
    const bttsYes=percent(x.bttsYes)?x.bttsYes:null;
    const key=x.id+"|"+x.provider;
    if(collisions.has(key))continue;
    if(seen.has(key)){
      collisions.add(key);
      map.set(x.id,(map.get(x.id)||[]).filter(a=>a.provider!==x.provider));
      continue;
    }
    seen.add(key);
    map.set(x.id,[...(map.get(x.id)||[]),{
      id:x.id,provider:x.provider,status:x.status,
      sourceHome:String(x.sourceHome||"").slice(0,120),
      sourceAway:String(x.sourceAway||"").slice(0,120),
      sourceCompetition:String(x.sourceCompetition||"").slice(0,150),
      sourceUrl:x.sourceUrl,sourceDate:x.sourceDate,
      sourceWallTime:x.sourceWallTime,
      homeSimilarity:x.homeSimilarity,awaySimilarity:x.awaySimilarity,
      leagueSimilarity:x.leagueSimilarity,kickoff,
      checked,captured,
      hda:{home:vals[0],draw:vals[1],away:vals[2]},over25,bttsYes,
      tip:["1","X","2","1X","X2","12"].includes(x.tip)?x.tip:null,
      sourceTimezoneVerified:false
    }]);
  }
  return map;
}
export async function fetchExtraAdviserProvisional(signal){
  const r=await fetch(URL,{cache:"no-store",signal:signal||AbortSignal.timeout(9000)});
  if(!r.ok)throw Error("extra_source_provisional_unavailable");
  return parseExtraAdviserProvisional(await r.json());
}
