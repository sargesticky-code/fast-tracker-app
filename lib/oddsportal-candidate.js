// Read-only candidate normalization for the pinned OddsHarvester JSON format.
// This module cannot publish quotes or allocate canonical IDs. Bind through the
// existing all-in-one verified alias registry and canonical fixture resolver first.
const KEY="ODDSPORTAL";
const ID=/^[A-Za-z0-9_-]{5,32}$/;
const DATE=/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/;

function utc(value) {
  if (typeof value !== "string") return null;
  const found=value.match(DATE);
  if(!found)return null;
  const parsed=Date.parse(`${found[1]}T${found[2]}Z`);
  return Number.isFinite(parsed)?new Date(parsed).toISOString():null;
}
function properText(x){return typeof x==="string" && x.trim() ?x.trim():null;}
function decimal(x){
  if(typeof x!=="string"&&typeof x!=="number")return null;
  const s=String(x).trim();
  if(!/^\d+(?:\.\d+)?$/.test(s))return null;
  const n=Number(s);
  return Number.isFinite(n)&&n>1&&n<1000?n:null;
}
function oddsPortalId(raw){
  try{
    const u=new URL(raw);
    if(u.protocol!=="https:"||!["oddsportal.com","www.oddsportal.com"].includes(u.hostname))return null;
    const id=decodeURIComponent(u.hash.slice(1));
    return ID.test(id)?id:null;
  }catch{return null;}
}
function board(rows){
  if(!Array.isArray(rows))return [];
  const providers=new Set(),verified=[];
  for(const row of rows){
    if(row?.period!=="FullTime"||row?.submarket_name!=="1X2")continue;
    const bookmaker=properText(row.bookmaker_name);
    if(!bookmaker||providers.has(bookmaker.toLowerCase()))continue;
    const h=decimal(row["1"]),d=decimal(row["X"]),a=decimal(row["2"]);
    if(h==null||d==null||a==null)continue;
    providers.add(bookmaker.toLowerCase());
    verified.push({bookmaker,market:"HDA",period:"FullTime",home:h,draw:d,away:a});
  }
  return verified;
}
export function oddsPortalCandidates(input,{now=Date.now(),maxAgeSeconds=300}={}){
  if(!Array.isArray(input)||input.length>50||!Number.isFinite(now)||
    !Number.isFinite(maxAgeSeconds)||maxAgeSeconds<0||maxAgeSeconds>3600)
    throw Error("INVALID_ODDSPORTAL_BATCH");
  const candidates=[],rejected=[],seen=new Set();
  for(const raw of input){
    const id=oddsPortalId(raw?.match_link);
    const fetched=utc(raw?.scraped_date);
    const kickoff=utc(raw?.match_date);
    const home=properText(raw?.home_team),away=properText(raw?.away_team);
    const league=properText(raw?.league_name);
    const age=fetched?now-Date.parse(fetched):Infinity;
    const reject=(reason)=>rejected.push({providerEventId:id,reason});
    if(!id||!kickoff||!fetched||!home||!away||!league||home===away) {
      reject("INCOMPLETE_PROVIDER_IDENTITY");continue;
    }
    if(seen.has(id)){reject("DUPLICATE_PROVIDER_EVENT");continue}
    seen.add(id);
    if(age<0||age>maxAgeSeconds*1000) {reject("STALE_OR_FUTURE_CAPTURE");continue}
    if(Date.parse(kickoff)<=now){reject("HISTORICAL_OR_STARTED_NOT_PREMATCH");continue}
    const prices=board(raw["1x2_market"]);
    if(prices.length===0){reject("NO_COMPLETE_BOOKMAKER_HDA");continue}
    candidates.push({
      providerKey:KEY,providerEventId:id,providerUrl:raw.match_link,
      home,away,competition:league,kickoff,capturedAt:fetched,
      // No source-claimed canonical match without reviewed aliases and exact ID.
      canonicalMatchId:null,identityStatus:"UNVERIFIED",
      priceSemantics:"PREMATCH_REFERENCE_PENDING_IDENTITY",
      quotes:prices,
    });
  }
  return {providerKey:KEY,candidates,rejected,marketAuthorityConfirmed:false};
}
