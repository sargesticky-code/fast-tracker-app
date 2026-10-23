import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

// No Railway and no new fixture/alias inference. Strict native event identity.
// Max 5 fixtures per run, two parallel fixtures, UK bet365 1X2 only.
const ROOT="https://www.flashscore.com";
const HEADERS={"accept":"application/json","origin":ROOT,"referer":ROOT+"/","user-agent":"Mozilla/5.0"};
const LEAGUES=["SY30SsKF","QeI1Oeyi","KY7LrA6d","WdNk9YwP","0Mp0HlJb","tUfctlzI"];
const SOURCE="FLASHSCORE_BET365";
const reply=(v:any,status=200)=>Response.json(v,{status,headers:{"cache-control":"no-store"}});
function serviceKey(){
  const k=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(k)return k;
  try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}catch{return "";}
}
async function upstream(url:string){
  const r=await fetch(url,{headers:HEADERS,signal:AbortSignal.timeout(11000)});
  if(!r.ok)throw new Error("upstream_http_"+r.status);
  const body=await r.text();
  if(body.length<15||body.length>950000)throw new Error("upstream_response_size");
  return JSON.parse(body);
}
function price(v:any){
  const s=String(v??"");
  if(!/^\d{1,3}(\.\d{1,4})?$/.test(s))return null;
  const n=Number(s);return Number.isFinite(n)&&n>=1.01&&n<=100?n:null;
}
async function fetchQuote(match:any){
  const id=String(match.canonical_match_id||"");
  const now=Date.now(),kick=Date.parse(match.kickoff_hkt),at=Date.parse(match.fetched_at);
  if(!/^[A-Za-z0-9_-]{5,32}$/.test(id)||match.canonical_event_id!=="FS:"+id||
     match.raw?.source!=="FLASHSCORE"||match.raw?.provider_event_id!==id||
     !LEAGUES.includes(String(match.raw?.provider_league_id||""))||
     !Number.isFinite(kick)||kick-now<1200000||kick-now>172800000||
     !Number.isFinite(at)||now-at>1500000)return null;
  const sideUrl="https://2.ds.lsapp.eu/pq_graphql?_hash=dsos2&eventId="+encodeURIComponent(id)+"&projectId=2";
  const oddsUrl="https://global.ds.lsapp.eu/odds/pq_graphql?_hash=oce&eventId="+encodeURIComponent(id)+"&projectId=2&geoIpCode=GB&geoIpSubdivisionCode=";
  const [participants,comparison]=await Promise.all([upstream(sideUrl),upstream(oddsUrl)]);
  const event=participants?.data?.findEventById,quotes=comparison?.data?.findOddsByEventId;
  if(event?.id!==id||quotes?.eventId!==id)return null;
  const sides=new Map();
  for(const x of event?.eventParticipants||[]){
    const label=x?.type?.side;
    if((label==="HOME"||label==="AWAY")&&typeof x?.id==="string"){
      if([...sides.values()].includes(label))return null;
      sides.set(x.id,label);
    }
  }
  if(sides.size!==2)return null;
  if(!(quotes?.settings?.bookmakers||[]).some((x:any)=>x?.bookmaker?.id===16&&x?.bookmaker?.name==="bet365"))return null;
  const markets=(quotes?.odds||[]).filter((x:any)=>
    x?.bookmakerId===16&&x?.bettingType==="HOME_DRAW_AWAY"&&x?.bettingScope==="FULL_TIME");
  if(markets.length!==1||!Array.isArray(markets[0].odds)||markets[0].odds.length!==3)return null;
  const prices=new Map();
  for(const odd of markets[0].odds){
    if(odd.active!==true)return null;
    const side=odd.eventParticipantId===null?"DRAW":sides.get(odd.eventParticipantId);
    const value=price(odd.value);
    if(!side||value===null||prices.has(side))return null;
    prices.set(side,value);
  }
  if(prices.size!==3||!["HOME","DRAW","AWAY"].every(x=>prices.has(x)))return null;
  if(Date.parse(match.kickoff_hkt)-Date.now()<600000)return null;
  const observed=new Date().toISOString();
  return {
    match_id:match.canonical_event_id,fetched_at:observed,
    match_date:match.kickoff_hkt.slice(0,10),kickoff_hkt:match.kickoff_hkt,
    league:match.tournament,home:match.home_en,away:match.away_en,
    bet365_home:prices.get("HOME"),bet365_draw:prices.get("DRAW"),
    bet365_away:prices.get("AWAY"),bet365_fixture_id:id,
    match_quality:0.995,source:SOURCE,updated_at:observed,
    raw:{source:"FLASHSCORE_NATIVE_ODDS_GRAPHQL",provider_event_id:id,
         bookmaker:"bet365",bookmaker_id:16,region:"GB",
         betting_type:"HOME_DRAW_AWAY",betting_scope:"FULL_TIME",
         observation:"PREMATCH_1X2_REFERENCE_NOT_INPLAY",captured_at:observed,
         identity_proof:"DSOS2_SIDE_IDS_AND_NATIVE_EVENT_ID",
         source_url:"https://www.flashscore.com/match/"+id+"/"}
  };
}
Deno.serve(async(req)=>{
  if(req.method!=="POST")return reply({error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),key=serviceKey();
  if(!url||!key)return reply({error:"server_config_missing"},503);
  const cronKey=req.headers.get("x-ft-cron-key");
  if(!cronKey)return reply({error:"unauthorized"},401);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth=await db.rpc("ft_internal_cron_key_matches",{p_key:cronKey});
  if(auth.error||auth.data!==true)return reply({error:"unauthorized"},401);
  try{
    const now=Date.now(),fresh=new Date(now-1500000).toISOString();
    const lower=new Date(now+1200000).toISOString(),upper=new Date(now+172800000).toISOString();
    const fixtures=await db.from("matches")
      .select("canonical_event_id,canonical_match_id,home_en,away_en,tournament,kickoff_hkt,fetched_at,raw")
      .eq("raw->>source","FLASHSCORE")
      .eq("raw->>identity_origin","DIRECT_PROVIDER_ID_FROM_EXISTING_SHADOW")
      .gte("fetched_at",fresh).gte("kickoff_hkt",lower).lte("kickoff_hkt",upper)
      .order("kickoff_hkt",{ascending:true}).limit(130);
    if(fixtures.error)return reply({error:"fixture_query_failed"},503);
    const valid=(fixtures.data||[]).filter((f:any)=>
      f.canonical_event_id==="FS:"+f.canonical_match_id&&
      LEAGUES.includes(String(f.raw?.provider_league_id||"")));
    if(!valid.length)return reply({ok:true,status:"NO_UPCOMING",attempted:0,published:0});
    const prior=await db.from("bet365_current").select("match_id,source,fetched_at")
      .in("match_id",valid.map((v:any)=>v.canonical_event_id));
    if(prior.error)return reply({error:"prior_quotes_unavailable"},503);
    const old=new Map((prior.data||[]).map((r:any)=>[r.match_id,r]));
    const queue=valid.filter((f:any)=>!old.has(f.canonical_event_id)||
      (old.get(f.canonical_event_id) as any).source===SOURCE)
      .sort((a:any,b:any)=>{
        const x=Date.parse((old.get(a.canonical_event_id) as any)?.fetched_at||"1970-01-01");
        const y=Date.parse((old.get(b.canonical_event_id) as any)?.fetched_at||"1970-01-01");
        return x-y||Date.parse(a.kickoff_hkt)-Date.parse(b.kickoff_hkt);
      }).slice(0,5);
    let published=0,notAvailable=0,failed=0;
    for(let i=0;i<queue.length;i+=2){
      await Promise.all(queue.slice(i,i+2).map(async(f:any)=>{
        try{
          const quote=await fetchQuote(f);
          if(!quote){notAvailable++;return;}
          const write=await db.from("bet365_current").upsert(quote,{onConflict:"match_id"});
          if(write.error){failed++;return;}
          published++;
        }catch{failed++;}
      }));
    }
    const status=published?"OK":failed?"DEGRADED":"NO_QUOTE";
    await db.from("source_health").upsert({
      source:SOURCE,metric:"native_graphql_collect",value_text:String(published),status,
      notes:"UK bet365 full-time 1X2 observed via Flashscore exact native event and participant identities; prematch only.",
      observed_at:new Date().toISOString(),
      raw:{collector:"FLASHSCORE_NATIVE_GB_BET365",attempted:queue.length,published,
           unavailable:notAvailable,failed,query_limit:5}
    },{onConflict:"source,metric"});
    return reply({ok:true,status,attempted:queue.length,published,unavailable:notAvailable,failed});
  }catch{return reply({error:"collector_unavailable"},503);}
});
