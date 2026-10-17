// A display-only comparison. Equal text is NOT proof of canonical identity;
// differences may be legitimate abbreviations or aliases.
function nameKey(name){
  return String(name??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g,"");
}

export function reviewAdviserSourceTeams(candidate,flashscoreHome,flashscoreAway){
  // Verification is established upstream by provider ID, league and source
  // kickoff checks; a display-only name comparison must NEVER confer it.
  const verified=candidate?.identityStatus==="VERIFIED";
  const sourceHome=nameKey(candidate?.sourceHome),sourceAway=nameKey(candidate?.sourceAway);
  const home=nameKey(flashscoreHome),away=nameKey(flashscoreAway);
  if(!sourceHome||!sourceAway||!home||!away)
    return {code:"unknown",label:"Team names incomplete — review source"};
  if(sourceHome===home&&sourceAway===away)
    return {code:"same",label:verified?"Names align · independently verified fixture":"Names align · match still provisional"};
  if(sourceHome===away&&sourceAway===home)
    return {code:"reversed",label:"Home / away reversed — review match"};
  return {code:"different",label:verified
    ?"Names differ — verified fixture, review provider aliases":"Names differ — review match (aliases possible)"};
}
