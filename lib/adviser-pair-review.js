// Browser-local moderation only. Do not send reports or state mutations to
// public endpoints: Fast Tracker is a public read-only dashboard without auth.
export const REVIEW_KEY="ft-adviser-pair-review-v1";
const FS_ID=/^FS:[A-Za-z0-9_-]{5,32}$/;
const PROVIDERS=new Set(["BETCLAN","SPORTYTRADER","PRIMATIPS","STATAREA","FOREBET"]);
const SOURCE_URL={
  BETCLAN:/^https:\/\/www\.betclan\.com\/predictionsdetails\/football\/\d+\/[^?#]+\/$/,
  SPORTYTRADER:/^https:\/\/www\.sportytrader\.com\/en\/betting-tips\/[^/?#]+-\d+\/$/,
  PRIMATIPS:/^https:\/\/primatips\.com\/tip\/[a-z0-9-]+-\d{4,12}\/?$/,
  STATAREA:/^https:\/\/www\.statarea\.com\/olddevices\/prediction\/\d{4}-\d{2}-\d{2}\/$/,
  FOREBET:/^https:\/\/www\.forebet\.com\/en\/football\/matches\/[a-z0-9-]+-\d{5,12}$/
};
export function adviserPairId(fixtureId,pair){
  const provider=String(pair?.provider||"");
  const url=String(pair?.sourceUrl||"");
  if(!FS_ID.test(String(fixtureId))||!PROVIDERS.has(provider)||!SOURCE_URL[provider].test(url))return null;
  return [provider,fixtureId,url].join("|");
}
export function readRejectedPairs(storage){
  try{
    const parsed=JSON.parse(storage?.getItem(REVIEW_KEY)||"[]");
    return new Set(Array.isArray(parsed)?parsed.filter(x=>typeof x==="string"&&x.length<750).slice(-300):[]);
  }catch{return new Set();}
}
export function setRejectedPair(storage,fixtureId,pair,reject){
  const key=adviserPairId(fixtureId,pair);
  if(!key)return null;
  const values=readRejectedPairs(storage);
  if(reject)values.add(key);else values.delete(key);
  try{storage?.setItem(REVIEW_KEY,JSON.stringify([...values].slice(-300)));
    if(reject){const confirmed=readConfirmedPairs(storage);confirmed.delete(key);storage?.setItem(CONFIRMED_REVIEW_KEY,JSON.stringify([...confirmed].slice(-300)));}
    return reject;}
  catch{return null;}
}

 // Positive review is PRIVATE AND BROWSER-LOCAL. It never changes a provider's
 // verified identity status, calibration, model accuracy, or public database.
 export const CONFIRMED_REVIEW_KEY="ft-adviser-pair-confirmations-v1";
 export function readConfirmedPairs(storage){
   try{
     const parsed=JSON.parse(storage?.getItem(CONFIRMED_REVIEW_KEY)||"[]");
     return new Set(Array.isArray(parsed)?parsed.filter(x=>typeof x==="string"&&x.length<750).slice(-300):[]);
   }catch{return new Set();}
 }
 export function setConfirmedPair(storage,fixtureId,pair,confirm){
   const key=adviserPairId(fixtureId,pair);
   if(!key)return null;
   const values=readConfirmedPairs(storage);
   if(confirm)values.add(key);else values.delete(key);
   try{
     storage?.setItem(CONFIRMED_REVIEW_KEY,JSON.stringify([...values].slice(-300)));
     if(confirm){
       const rejected=readRejectedPairs(storage);
       rejected.delete(key);
       storage?.setItem(REVIEW_KEY,JSON.stringify([...rejected].slice(-300)));
     }
     return confirm;
   }catch{return null;}
 }
 export function adviserMismatchReport(fixtureId,pair,home,away,kickoff){
  const key=adviserPairId(fixtureId,pair);
  if(!key)return null;
  return [
    "FAST TRACKER — INCORRECT ADVISER FIXTURE PAIR (review request)",
    "Provider: "+pair.provider,
    "Flashscore fixture ID: "+fixtureId,
    "Flashscore home: "+String(home||"Unknown"),
    "Flashscore away: "+String(away||"Unknown"),
    "Flashscore kickoff: "+String(kickoff||"Unknown"),
    "Adviser home: "+String(pair.sourceHome||"Unknown"),
    "Adviser away: "+String(pair.sourceAway||"Unknown"),
    "Provider source URL: "+pair.sourceUrl,
    "Source status: "+(pair.identityStatus==="VERIFIED"?"VERIFIED — NEEDS HUMAN RECHECK":"PROVISIONAL — NOT VERIFIED"),
    "Requested action: Reject this particular provider source URL + Flashscore fixture ID; preserve raw source observation and block future automatic re-link.",
    "Note: Browser rejection is local until the private project-wide review list is updated."
  ].join("\n");
}

 // Copy-only receipt for the owner to paste into the private project review chat.
 // It does not attest independent source accuracy or write an unauthenticated review.
 export function adviserVerificationReport(fixtureId,pair,home,away,kickoff){
   const key=adviserPairId(fixtureId,pair);
   if(!key)return null;
   return [
     "FAST TRACKER — OWNER PAIRING CONFIRMATION (manual review receipt)",
     "Provider: "+pair.provider,
     "Flashscore fixture ID: "+fixtureId,
     "Flashscore home: "+String(home||"Unknown"),
     "Flashscore away: "+String(away||"Unknown"),
     "Flashscore kickoff: "+String(kickoff||"Unknown"),
     "Adviser home: "+String(pair.sourceHome||"Unknown"),
     "Adviser away: "+String(pair.sourceAway||"Unknown"),
     "Provider source URL: "+pair.sourceUrl,
     "Current source identity status: "+(pair.identityStatus==="VERIFIED"?"SOURCE_MATCHED":"PROVISIONAL"),
     "Owner review decision: PAIRING_CORRECT",
     "Requested follow-up: Independently cross-check this source URL, oriented teams, league and date before adding to the private review ledger.",
     "Note: A copied receipt is not evidence of prediction accuracy, and a browser-local review never changes public model labels."
   ].join("\n");
 }
