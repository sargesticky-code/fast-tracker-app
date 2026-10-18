// Existing public source evidence, not a human review endpoint.
// A user click only changes browser-local review state; never provider confidence.
import {adviserPairId} from "./adviser-pair-review.js";
const URL="https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/forebet-pair-review";
const idPattern=/^FS:[A-Za-z0-9_-]{5,32}$/;
export function normalizeForebetReview(payload,fixtureId,now=Date.now()){
 if(!idPattern.test(String(fixtureId))||payload?.source!=="FOREBET_PAIR_REVIEW"
   ||payload?.quality!=="IDENTITY_REVIEW_ONLY"||payload.fixtureId!==fixtureId)
   throw Error("forebet_pair_review_contract");
 const row=payload.candidate;
 if(row===null)return null;
 if(row?.provider!=="FOREBET"||!["VERIFIED","PROVISIONAL"].includes(row.identityStatus)
   ||!["EXACT_CANONICAL_SOURCE_RECORD","EXACT_CANONICAL_PROVISIONAL_CANDIDATE"].includes(row.evidence)
   ||typeof row.sourceHome!=="string"||!row.sourceHome.trim()
   ||typeof row.sourceAway!=="string"||!row.sourceAway.trim()
   ||row.sourceHome.length>120||row.sourceAway.length>120
   ||!adviserPairId(fixtureId,row))throw Error("forebet_pair_review_untrusted_source");
 const captured=Date.parse(String(row.sourceCapturedAt||""));
 if(!Number.isFinite(captured)||captured>now+60_000||captured<now-7*86400_000)
   throw Error("forebet_pair_review_stale");
 const score=typeof row.predictedScore==="string"
  &&/^\d{1,2}\s*-\s*\d{1,2}$/.test(row.predictedScore.trim())
  ?row.predictedScore.trim():null;
 const p=row.probabilities;
 const values=[p?.home,p?.draw,p?.away];
 const hda=values.every(x=>typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=100)
  &&Math.abs(values.reduce((a,b)=>a+b,0)-100)<=2
    ?{home:values[0]/100,draw:values[1]/100,away:values[2]/100}:null;
 if(!score&&!hda)throw Error("forebet_pair_review_no_prediction");
 // Retain source identity status; human confirmation never upgrades provisional predictions.
 return {...row,predictedScore:score,hda};
}
export async function fetchForebetPairReview(fixtureId,signal){
 if(!idPattern.test(String(fixtureId)))return null;
 const res=await fetch(URL+"?"+new URLSearchParams({id:fixtureId}),{
   signal:signal||AbortSignal.timeout(6500),cache:"no-store"});
 if(!res.ok)throw Error("forebet_pair_source_unavailable");
 return normalizeForebetReview(await res.json(),fixtureId);
}
