import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Public GET-only review evidence for ONE exact Flashscore fixture.
// This endpoint never accepts review decisions or changes model confidence.
const CORS={
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"GET,OPTIONS",
  "access-control-allow-headers":"content-type",
  "cache-control":"public, max-age=45",
  "x-content-type-options":"nosniff",
};
const ID=/^FS:[A-Za-z0-9_-]{5,32}$/;
const SOURCE=/^https:\/\/www\.forebet\.com\/en\/football\/matches\/[^/?#]+-\d{5,12}$/;
const respond=(body:unknown,status=200)=>Response.json(body,{status,headers:CORS});
const score=(x:unknown)=>typeof x==="string"&&/^\d{1,2}\s*-\s*\d{1,2}$/.test(x)?x:null;
const names=(x:unknown)=>typeof x==="string"&&x.trim()&&x.length<=120?x.trim():null;
const pct=(x:unknown)=>x!=null&&Number.isFinite(Number(x))&&Number(x)>=0&&Number(x)<=100?Number(x):null;
function probabilities(h:unknown,d:unknown,a:unknown){
  const p=[pct(h),pct(d),pct(a)];
  return p.every(x=>x!==null)&&Math.abs(p.reduce((s,x)=>s+Number(x),0)-100)<=2
    ?{home:p[0],draw:p[1],away:p[2]}:null;
}
const validUrl=(x:unknown)=>typeof x==="string"&&SOURCE.test(x)?x:null;
function candidateVerified(r:any){
  const sourceUrl=validUrl(r.forebet_detail_url);
  const sourceHome=names(r.forebet_home_team),sourceAway=names(r.forebet_away_team);
  if(!sourceUrl||!sourceHome||!sourceAway)return null;
  return {provider:"FOREBET",identityStatus:"VERIFIED",sourceUrl,sourceHome,sourceAway,
    predictedScore:score(r.predicted_score),
    probabilities:probabilities(r.prob_home,r.prob_draw,r.prob_away),
    sourceCapturedAt:r.fetched_at??null,
    evidence:"EXACT_CANONICAL_SOURCE_RECORD",matchTier:"SOURCE_LINKED_NOT_HUMAN_VERIFIED"};
}
function candidateProvisional(r:any){
  const sourceUrl=validUrl(r.source_url);
  const sourceHome=names(r.source_home),sourceAway=names(r.source_away);
  if(!sourceUrl||!sourceHome||!sourceAway
    ||r.advisory_status!=="PROVISIONAL_ONE_SIDE_NOT_VERIFIED"
    ||!["HOME","AWAY","SIMILARITY"].includes(r.verified_side)
    ||r.source_model?.is_verified===true)return null;
  const probs=probabilities(r.source_model?.home,r.source_model?.draw,r.source_model?.away);
  // The existing provisional pipeline supplied this tentative exact Flashscore ID.
  // No automatic review of a stale source as a current prediction.
  if(!probs||!Number.isFinite(Date.parse(String(r.last_seen_at||"")))
    ||Date.parse(String(r.last_seen_at))<Date.now()-36*3600000
    ||Date.parse(String(r.kickoff_hkt))<Date.now())return null;
  if(r.verified_side==="SIMILARITY"&&(
      r.source_model?.match_method!=="BOTH_NAME_SIMILARITY_030_STRONG_SIDE_070_LEAGUE_EXACT_TIME_UNIQUE"
      ||r.source_model?.name_similarity_method!=="NFKD_CASEFOLD_SEQUENCE_RATIO_V1"
      ||![r.source_model?.name_similarity_home,r.source_model?.name_similarity_away].every(
        (n:unknown)=>typeof n==="number"&&n>=.30&&n<=1)
      ||Math.max(r.source_model.name_similarity_home,r.source_model.name_similarity_away)<.70
    ))return null;
  return {provider:"FOREBET",identityStatus:"PROVISIONAL",sourceUrl,sourceHome,sourceAway,
    predictedScore:score(r.source_model?.score),probabilities:probs,sourceCapturedAt:r.last_seen_at,
    evidence:"EXACT_CANONICAL_PROVISIONAL_CANDIDATE",matchedSide:r.verified_side,
    matchTier:"HUMAN_REVIEW_REQUIRED_NOT_MODEL_VERIFIED"};
}
function serviceKey(){
 const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(legacy)return legacy;
 try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}
 catch{return "";}
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 if(req.method!=="GET")return respond({error:"READ_ONLY"},405);
 const url=new URL(req.url),id=url.searchParams.get("id")||"";
 if(!ID.test(id)||[...url.searchParams.keys()].some(key=>key!=="id"))
   return respond({error:"INVALID_EXACT_FIXTURE_ID"},400);
 const root=Deno.env.get("SUPABASE_URL")||"",key=serviceKey();
 if(!root||!key)return respond({error:"SOURCE_UNAVAILABLE"},503);
 const headers={apikey:key,authorization:"Bearer "+key,accept:"application/json"};
 const lookup=async(table:string,fields:string)=>{
   const query=new URLSearchParams({select:fields,canonical_event_id:"eq."+id,limit:"2"});
   const res=await fetch(root+"/rest/v1/"+table+"?"+query,{
     headers,signal:AbortSignal.timeout(6000)});
   if(!res.ok)throw new Error("SOURCE_READ_FAILED");
   const rows=await res.json();
   if(!Array.isArray(rows)||rows.length>1)throw new Error("AMBIGUOUS_SOURCE_RECORD");
   return rows[0]??null;
 };
 try{
   const vr=await lookup("forebet_prediction_current",
     "canonical_event_id,forebet_detail_url,forebet_home_team,forebet_away_team,predicted_score,prob_home,prob_draw,prob_away,fetched_at");
   let candidate=vr?candidateVerified(vr):null;
   if(!candidate){
     const pr=await lookup("forebet_provisional_feed_current",
       "canonical_event_id,kickoff_hkt,source_url,source_home,source_away,advisory_status,verified_side,source_model,last_seen_at");
     candidate=pr?candidateProvisional(pr):null;
   }
   return respond({source:"FOREBET_PAIR_REVIEW",quality:"IDENTITY_REVIEW_ONLY",
     fixtureId:id,candidate});
 }catch{
   return respond({error:"REVIEW_SOURCE_UNAVAILABLE"},503);
 }
});
