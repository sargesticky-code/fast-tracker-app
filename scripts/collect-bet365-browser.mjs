import { bet365BrowserLive, resolveBet365Fixture, completeHdaBoard } from "../lib/bet365-browser-feed.js";

const scraperBase=String(process.env.BET365_BROWSER_URL||"http://127.0.0.1:8485/live?sport=1").trim();
const sb=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
let key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||"").trim();
if(!key&&process.env.SUPABASE_SECRET_KEYS){try{key=JSON.parse(process.env.SUPABASE_SECRET_KEYS)?.default||"";}catch{}}
if(!sb||!key)throw new Error("SUPABASE_URL_AND_SERVICE_KEY_REQUIRED");

const headers={apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"};
async function jsonFetch(url,init={}){
  const res=await fetch(url,{...init,headers:{...headers,...(init.headers||{})},signal:AbortSignal.timeout(12000)});
  if(!res.ok)throw new Error(`${init.method||"GET"} ${url} -> ${res.status}: ${(await res.text()).slice(0,500)}`);
  const t=await res.text();return t?JSON.parse(t):null;
}
async function upsert(table,rows,onConflict){
  if(!rows.length)return;
  await jsonFetch(`${sb}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,{
    method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(rows)
  });
}
async function insert(table,rows){
  if(!rows.length)return;
  await jsonFetch(`${sb}/rest/v1/${table}`,{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(rows)});
}

const fetchedAt=new Date().toISOString();
const liveRes=await fetch(scraperBase,{signal:AbortSignal.timeout(8000)});
if(!liveRes.ok)throw new Error(`BET365_BROWSER_HTTP_${liveRes.status}`);
const payload=await liveRes.json();
const bundle=bet365BrowserLive(payload,fetchedAt);

const start=new Date(Date.now()-6*3600e3).toISOString(),end=new Date(Date.now()+2*3600e3).toISOString();
const canonical=await jsonFetch(`${sb}/rest/v1/matches?select=hkjc_event_id,kickoff_hkt,tournament,home_en,away_en&kickoff_hkt=gte.${encodeURIComponent(start)}&kickoff_hkt=lte.${encodeURIComponent(end)}&order=kickoff_hkt.asc&limit=500`);

const fixtureByEvent=new Map();
for(const f of bundle.fixtures){
  const id=resolveBet365Fixture(f,canonical,fetchedAt);
  f.canonicalMatchId=id.canonicalMatchId;f.identityStatus=id.status;fixtureByEvent.set(f.providerEventId,f);
}
for(const q of bundle.quotes){
  const f=fixtureByEvent.get(q.providerEventId);
  q.canonicalMatchId=f?.canonicalMatchId||null;q.identityStatus=f?.identityStatus||"UNRESOLVED";
}

const eventIds=bundle.fixtures.map(f=>f.providerEventId);
let prior=[];
if(eventIds.length){
  const list="("+eventIds.map(v=>`"${String(v).replaceAll('"','')}"`).join(",")+")";
  prior=await jsonFetch(`${sb}/rest/v1/bet365_browser_quote_current?select=quote_key,provider_event_id,raw_od,decimal_price,suspended&provider_event_id=in.${encodeURIComponent(list)}`);
}
const priorByKey=new Map((prior||[]).map(r=>[r.quote_key,r]));
const changed=bundle.quotes.filter(q=>{
  const p=priorByKey.get(q.quoteKey);
  return !p||String(p.raw_od??"")!==String(q.rawOd??"")||Number(p.decimal_price)!==Number(q.decimalPrice)||Boolean(p.suspended)!==Boolean(q.suspended);
});

for(const id of eventIds){
  await jsonFetch(`${sb}/rest/v1/bet365_browser_quote_current?provider_event_id=eq.${encodeURIComponent(id)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});
}
await upsert("bet365_browser_live_current",bundle.fixtures.map(f=>({
  provider_event_id:f.providerEventId,fixture_id:f.fixtureId,canonical_match_id:f.canonicalMatchId,captured_at:f.fetchedAt,
  event_name:`${f.home} v ${f.away}`,league:f.competition,home:f.home,away:f.away,home_score:f.homeScore,away_score:f.awayScore,
  minute:f.minute,second:f.second,period:f.period,stats:f.stats,markets:f.markets,identity_status:f.identityStatus,raw:f.raw,updated_at:f.fetchedAt
})),"provider_event_id");

const quoteRows=bundle.quotes.map(q=>({
  quote_key:q.quoteKey,provider_event_id:q.providerEventId,canonical_match_id:q.canonicalMatchId,market_key:q.marketKey,market_id:q.marketId,
  market_name:q.marketName,selection_key:q.selectionKey,selection_name:q.selectionName,line:q.line,raw_od:q.rawOd,decimal_price:q.decimalPrice,
  suspended:q.suspended,captured_at:q.fetchedAt,identity_status:q.identityStatus,raw:q.raw,updated_at:q.fetchedAt
}));
await upsert("bet365_browser_quote_current",quoteRows,"quote_key");
await insert("bet365_browser_quote_history",changed.map(q=>({
  quote_key:q.quoteKey,provider_event_id:q.providerEventId,canonical_match_id:q.canonicalMatchId,market_key:q.marketKey,market_id:q.marketId,
  market_name:q.marketName,selection_key:q.selectionKey,selection_name:q.selectionName,line:q.line,raw_od:q.rawOd,decimal_price:q.decimalPrice,
  suspended:q.suspended,captured_at:q.fetchedAt,identity_status:q.identityStatus,raw:q.raw
})));

const canonById=new Map(canonical.map(r=>[String(r.hkjc_event_id),r]));
const currentRows=[],snapshots=[];
for(const f of bundle.fixtures){
  if(f.identityStatus!=="VERIFIED"||!f.canonicalMatchId)continue;
  const board=completeHdaBoard(bundle.quotes.filter(q=>q.providerEventId===f.providerEventId));
  if(!board)continue;
  const m=canonById.get(f.canonicalMatchId)||{};
  currentRows.push({
    hkjc_event_id:f.canonicalMatchId,fetched_at:f.fetchedAt,match_date:String(m.kickoff_hkt||"").slice(0,10),kickoff_hkt:m.kickoff_hkt||null,
    league:m.tournament||f.competition,home:m.home_en||f.home,away:m.away_en||f.away,bet365_home:board.H.decimalPrice,
    bet365_draw:board.D.decimalPrice,bet365_away:board.A.decimalPrice,bet365_fixture_id:f.fixtureId||f.providerEventId,
    match_quality:1,source:"BET365_BROWSER",raw:{providerEventId:f.providerEventId,market:"HDA",capturedAt:f.fetchedAt},updated_at:f.fetchedAt
  });
  if(changed.some(q=>q.providerEventId===f.providerEventId&&q.marketKey==="HDA")){
    snapshots.push({hkjc_event_id:f.canonicalMatchId,captured_at:f.fetchedAt,source:"BET365_BROWSER",market:"ML",
      line:null,home_price:board.H.decimalPrice,draw_price:board.D.decimalPrice,away_price:board.A.decimalPrice,over_price:null,under_price:null,
      raw:{providerEventId:f.providerEventId,fixtureId:f.fixtureId}});
  }
}
await upsert("bet365_current",currentRows,"hkjc_event_id");
await insert("odds_snapshots",snapshots);

console.log(JSON.stringify({
  fetchedAt,upstreamRows:Array.isArray(payload)?payload.length:null,fixtures:bundle.fixtures.length,verifiedFixtures:bundle.fixtures.filter(f=>f.identityStatus==="VERIFIED").length,
  ambiguousFixtures:bundle.fixtures.filter(f=>f.identityStatus==="AMBIGUOUS").length,quotes:bundle.quotes.length,changedQuotes:changed.length,
  normalizedQuotes:bundle.quotes.filter(q=>q.decimalPrice>1&&!q.suspended).length,hdaBoards:currentRows.length,rejections:bundle.rejected.length
}));
