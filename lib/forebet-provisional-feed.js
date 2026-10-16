// Limited-confidence Forebet candidate feed. NEVER a verified model or odd.
// A candidate is shown only while source + canonical time are still current.
const URL="https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/forebet-provisional-feed";
const validId=s=>typeof s==="string"&&/^FS:[A-Za-z0-9_-]{5,32}$/.test(s);
export function provisionalMap(body,now=Date.now()){
  if(body?.source!=="FOREBET_PROVISIONAL"||body?.quality!=="PROVISIONAL_NOT_VERIFIED"
     ||!Array.isArray(body.rows)||body.rows.length>180)throw Error("provisional_contract_invalid");
  const at=Date.parse(String(body.generatedAt||""));
  if(!Number.isFinite(at)||at>now+60000||at<now-10*60000)
    throw Error("provisional_snapshot_stale");
  const result=new Map(),seenSources=new Set(),blocked=new Set();
  for(const x of body.rows){
    if(!validId(x.id)||x.status!=="PROVISIONAL_NOT_VERIFIED"
       ||!["HOME","AWAY","SIMILARITY"].includes(x.matchedSide)||blocked.has(x.id))continue;
    if(x.matchedSide==="SIMILARITY" &&
       (!Array.isArray(x.nameSimilarities)||x.nameSimilarities.length!==2
        ||x.nameMethod!=="NFKD_CASEFOLD_SEQUENCE_RATIO_V1"
        ||!x.nameSimilarities.every(v=>typeof v==="number"&&v>=.30&&v<=1)
        ||Math.max(...x.nameSimilarities)<.70))continue;
    const kickoff=Date.parse(String(x.kickoff||""));
    const seen=Date.parse(String(x.lastChecked||""));
    const probs=x.probabilities;
    if(!Number.isFinite(kickoff)||kickoff<=now
       ||!Number.isFinite(seen)||seen>now+60000||seen<now-36*3600000
       ||!Array.isArray(probs)||probs.length!==3
       ||probs.some(x=>typeof x!=="number"||!Number.isFinite(x)||x<0||x>100)
       ||Math.abs(probs.reduce((a,b)=>a+b,0)-100)>2
       ||!/^\d{1,2}\s*-\s*\d{1,2}$/.test(String(x.predictedScore||""))
       ||typeof x.avgGoals!=="number"||!Number.isFinite(x.avgGoals)
       ||x.avgGoals<=0||x.avgGoals>12
       ||!/^https:\/\/www\.forebet\.com\/en\/football\/matches\/[^?#]+-\d{5,12}$/.test(String(x.sourceUrl||""))
       ||!x.sourceHome||!x.sourceAway)continue;
    if(result.has(x.id)||seenSources.has(x.sourceUrl)){
      result.delete(x.id);blocked.add(x.id);
      continue;
    }
    seenSources.add(x.sourceUrl);
    const oneSide=x.matchedSide==="HOME"||x.matchedSide==="AWAY";
    if(typeof x.acceptedForDisplay==="boolean" && x.acceptedForDisplay!==oneSide)continue;
    if(x.matchTier && x.matchTier!==(oneSide?"ACCEPTED_ONE_VERIFIED_TEAM":"TENTATIVE_NAME_SIMILARITY"))continue;
    // Accepted for display from ONE independently verified team plus
    // league/exact UTC time/unique source. Not two-team model evidence.
    result.set(x.id,{...x,probs,kickoff,asOf:seen,
      acceptedForDisplay:oneSide,
      matchTier:oneSide?"ACCEPTED_ONE_VERIFIED_TEAM":"TENTATIVE_NAME_SIMILARITY"});
  }
  return result;
}
export async function fetchForebetProvisional(signal){
  const r=await fetch(URL,{cache:"no-store",signal:signal||AbortSignal.timeout(7000)});
  if(!r.ok)throw Error("provisional_feed_unavailable");
  return provisionalMap(await r.json());
}
