import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const SOURCE="FOTMOB";
const MAX_DETAIL=6;
const MAX_COMMENTARY_PER_MATCH=3;
const LIST_TIMEOUT=20000;
const DETAIL_TIMEOUT=20000;
const COMMENTARY_TIMEOUT=12000;

function serviceKey(){
  const a=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if(a) return a;
  const m=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(m){try{const j=JSON.parse(m); if(j&&j.default) return j.default;}catch{}}
  return "";
}
function keyName(v){
  return String(v??"").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"");
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function hktDate(offsetDays=0){
  const d=new Date(Date.now()+8*3600000+offsetDays*86400000);
  return d.toISOString().slice(0,10).replaceAll("-","");
}
function toIso(v){
  if(!v) return null;
  const d=new Date(v);
  return Number.isFinite(d.getTime())?d.toISOString():null;
}
async function sha256(s){
  const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function getJson(url){
  const r=await fetch(url,{
    headers:{
      "Accept":"application/json,text/plain;q=0.9,*/*;q=0.1",
      "User-Agent":"FastTrackerPhase15Shadow/1.0 (+private analytical use)"
    },
    signal:AbortSignal.timeout(url.includes("matchDetails")?DETAIL_TIMEOUT:LIST_TIMEOUT)
  });
  if(!r.ok) throw new Error("http_"+r.status);
  const ct=(r.headers.get("content-type")||"").toLowerCase();
  const text=await r.text();
  if(!ct.includes("json") && /^\s*<(!doctype|html)/i.test(text)) throw new Error("html_instead_of_json");
  try{return JSON.parse(text);}catch{throw new Error("invalid_json");}
}
async function fetchDaily(date){
  const urls=[
    `https://www.fotmob.com/api/data/matches?date=${date}&timezone=Asia%2FHong_Kong&ccode3=HKG`,
    `https://www.fotmob.com/api/matches?date=${date}`
  ];
  let lastErr="";
  for(const u of urls){
    try{return {data:await getJson(u),url:u};}
    catch(e){lastErr=e instanceof Error?e.message:String(e);}
  }
  throw new Error("daily_failed_"+lastErr);
}
async function fetchDetail(id){
  const urls=[
    `https://www.fotmob.com/api/data/matchDetails?matchId=${encodeURIComponent(id)}`,
    `https://www.fotmob.com/api/matchDetails?matchId=${encodeURIComponent(id)}`
  ];
  let lastErr="";
  for(const u of urls){
    try{return {data:await getJson(u),url:u};}
    catch(e){lastErr=e instanceof Error?e.message:String(e);}
  }
  throw new Error("detail_failed_"+lastErr);
}
function flattenMatches(payload){
  const leagues=Array.isArray(payload?.leagues)?payload.leagues:
    Array.isArray(payload?.data?.leagues)?payload.data.leagues:[];
  const out=[];
  for(const league of leagues){
    const matches=Array.isArray(league?.matches)?league.matches:[];
    for(const m of matches){
      const id=m?.id??m?.matchId;
      if(id==null) continue;
      out.push({
        id:String(id),
        leagueName:String(league?.name??m?.league?.name??"").trim()||null,
        leagueId:String(league?.primaryId??league?.id??m?.leagueId??m?.league?.id??"").trim()||null,
        homeName:String(m?.home?.name??m?.homeTeam?.name??"").trim()||null,
        awayName:String(m?.away?.name??m?.awayTeam?.name??"").trim()||null,
        homeId:String(m?.home?.id??m?.homeTeam?.id??"").trim()||null,
        awayId:String(m?.away?.id??m?.awayTeam?.id??"").trim()||null,
        kickoff:toIso(m?.status?.utcTime??m?.utcTime??(m?.timeTS?Number(m.timeTS):null)),
        status:String(m?.status?.reason??(m?.status?.finished?"FINISHED":m?.status?.started?"LIVE":"SCHEDULED")??"").trim()||null,
        raw:m
      });
    }
  }
  return out;
}
function containsUsefulKey(obj,re,depth=0){
  if(obj==null||depth>6) return false;
  if(Array.isArray(obj)) return obj.slice(0,50).some(x=>containsUsefulKey(x,re,depth+1));
  if(typeof obj!=="object") return false;
  for(const [k,v] of Object.entries(obj)){
    if(re.test(k) && v!=null) return true;
    if(v&&typeof v==="object"&&containsUsefulKey(v,re,depth+1)) return true;
  }
  return false;
}

function decodeXml(s){
  return String(s??"")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
    .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/gi," ");
}
function stripHtml(s){
  const decoded=decodeXml(String(s??""));
  return decoded.replace(/<br\s*\/?\s*>/gi," ").replace(/<[^>]+>/g," ")
    .replace(/\s+/g," ").trim();
}
function tagValue(block,tag){
  const m=String(block).match(new RegExp("<"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+tag+">","i"));
  return m?stripHtml(m[1]):null;
}
function sourceValue(block){
  const m=String(block).match(/<source(?:\s[^>]*)?>([\s\S]*?)<\/source>/i);
  return m?stripHtml(m[1]):null;
}
function entityVariants(name){
  const words=String(name??"").toLowerCase().match(/[a-z0-9]+/g)||[];
  const useful=words.filter(x=>x.length>=4 && !["united","football","club","team"].includes(x));
  const acronym=words.filter(x=>x.length>1).map(x=>x[0]).join("");
  return [String(name??"").toLowerCase(),...useful,acronym.length>=2?acronym:null].filter(Boolean);
}
function entityHit(text,name){
  const hay=String(text??"").toLowerCase();
  return entityVariants(name).some(v=>v.length>=2 && hay.includes(v));
}

function escapeRegex(v){
  return String(v??"").replace(/[.*+?^$()|[\]{}\\]/g,"\\function entityHit(text,name){
  const hay=String(text??"").toLowerCase();
  return entityVariants(name).some(v=>v.length>=2 && hay.includes(v));
}
");
}
function editorialSignals(text,home,away){
  const raw=String(text??"").replace(/\s+/g," ").trim();
  const t=raw.toLowerCase();
  const topics=[];
  const add=(x)=>{if(!topics.includes(x))topics.push(x);};
  if(/team news|lineups?|starting xi|squad/i.test(raw)) add("LINEUP");
  if(/injur|suspend|doubt|fitness/i.test(raw)) add("AVAILABILITY");
  if(/form|streak|unbeaten|winless/i.test(raw)) add("FORM");
  if(/head[- ]?to[- ]?head|\bh2h\b/i.test(raw)) add("H2H");
  if(/odds|betting|best bet|tips?/i.test(raw)) add("BETTING");
  if(/defen[cs]e|clean sheet|concede/i.test(raw)) add("DEFENCE");
  if(/attack|scor|goals?/i.test(raw)) add("ATTACK");

  const make=(selection,line,confidence,basis)=>({selection,line:line??null,confidence,basis});
  let outcome=null,goals=null,corners=null,btts=null;

  const overGoals=t.match(/\bover\s*(\d+(?:\.\d+)?)?\s*(?:total\s*)?goals?\b/i);
  const underGoals=t.match(/\bunder\s*(\d+(?:\.\d+)?)?\s*(?:total\s*)?goals?\b/i);
  if(overGoals) goals=make("OVER",overGoals[1]?Number(overGoals[1]):null,.9,"explicit over goals wording");
  else if(underGoals) goals=make("UNDER",underGoals[1]?Number(underGoals[1]):null,.9,"explicit under goals wording");
  else if(/goals? to come at a premium|low[- ]scoring|few goals|cagey|tight affair/i.test(raw)) goals=make("UNDER",null,.66,"qualitative low-scoring wording");
  else if(/high[- ]scoring|goal[- ]?fest|goals galore|plenty of goals/i.test(raw)) goals=make("OVER",null,.66,"qualitative high-scoring wording");

  const overCorners=t.match(/\bover\s*(\d+(?:\.\d+)?)\s*corners?\b/i);
  const underCorners=t.match(/\bunder\s*(\d+(?:\.\d+)?)\s*corners?\b/i);
  if(overCorners) corners=make("OVER",Number(overCorners[1]),.92,"explicit over corners wording");
  else if(underCorners) corners=make("UNDER",Number(underCorners[1]),.92,"explicit under corners wording");

  if(/both teams to score|\bbtts\b/i.test(raw)){
    if(/btts\s*no|both teams not to score/i.test(raw)) btts=make("NO",null,.86,"explicit BTTS no wording");
    else btts=make("YES",null,.82,"explicit BTTS wording");
  }

  const homeLower=String(home??"").toLowerCase();
  const awayLower=String(away??"").toLowerCase();
  const hasHome=homeLower&&t.includes(homeLower);
  const hasAway=awayLower&&t.includes(awayLower);
  if(hasHome && new RegExp(escapeRegex(homeLower)+"[^.]{0,32}(?:to win|win prediction|victory|to beat)","i").test(t)){
    outcome=make("H",null,.82,"explicit home-win wording");
  } else if(hasAway && new RegExp(escapeRegex(awayLower)+"[^.]{0,32}(?:to win|win prediction|victory|to beat)","i").test(t)){
    outcome=make("A",null,.82,"explicit away-win wording");
  } else if(/(?:prediction|tip)[^.:]{0,30}:?\s*(?:a\s+)?draw\b|draw\s+(?:prediction|tip|tipped)/i.test(raw)){
    outcome=make("D",null,.78,"explicit draw wording");
  }

  const candidates=[
    outcome?{market:"1X2",signal:outcome}:null,
    goals?{market:"GOALS_OU",signal:goals}:null,
    corners?{market:"CORNERS_OU",signal:corners}:null,
  ].filter(Boolean).sort((a,b)=>b.signal.confidence-a.signal.confidence);
  const primary=candidates[0]||null;
  let relevance=.70;
  if(primary) relevance+=.12;
  if(topics.includes("LINEUP")||topics.includes("AVAILABILITY")) relevance+=.05;
  if(topics.includes("BETTING")) relevance+=.04;
  relevance=Math.min(.95,relevance);

  return {
    outcome,goals,corners,btts,topics,
    primary:primary?{market:primary.market,selection:primary.signal.selection,confidence:primary.signal.confidence}:null,
    relevance,
    parserVersion:"EDITORIAL_RULES_V1"
  };
}
async function fetchCommentary(home,away,kickoff){
  const query=`"${home}" "${away}" football preview prediction tips lineup odds`;
  const url=`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-GB&gl=GB&ceid=GB:en`;
  const r=await fetch(url,{
    headers:{"Accept":"application/rss+xml,application/xml,text/xml,*/*","User-Agent":"FastTrackerEditorialScout/1.0"},
    signal:AbortSignal.timeout(COMMENTARY_TIMEOUT)
  });
  if(!r.ok) throw new Error("commentary_http_"+r.status);
  const xml=await r.text();
  const items=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m=>m[1]);
  const out=[];
  for(const item of items){
    const title=tagValue(item,"title");
    const link=tagValue(item,"link");
    const published=tagValue(item,"pubDate");
    const publisher=sourceValue(item)||"Google News";
    const description=tagValue(item,"description");
    const relevanceText=[title,description].filter(Boolean).join(" ");
    const publishedAt=toIso(published);
    const publishedMs=publishedAt?new Date(publishedAt).getTime():NaN;
    const kickoffMs=kickoff?new Date(kickoff).getTime():NaN;
    const timely=!Number.isFinite(kickoffMs)||!Number.isFinite(publishedMs)
      ? true
      : publishedMs>=kickoffMs-21*86400000 && publishedMs<=kickoffMs+6*3600000;
    const editorial=/preview|prediction|tips?|best bets?|odds|betting|analysis|head[- ]?to[- ]?head/i.test(title||"");
    if(!title||!link||!timely||!editorial||!entityHit(relevanceText,home)||!entityHit(relevanceText,away)) continue;
    out.push({
      title:title.slice(0,500),
      link,
      publisher:publisher.slice(0,200),
      publishedAt,
      excerpt:description?description.slice(0,600):null,
      query,
      aggregator:"Google News RSS"
    });
    if(out.length>=MAX_COMMENTARY_PER_MATCH) break;
  }
  return out;
}

Deno.serve(async (req)=>{
  const u=new URL(req.url), force=u.searchParams.get("force")==="1";
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"", sk=serviceKey();
  if(!supabaseUrl||!sk) return Response.json({ok:false,error:"server_config_missing"},{status:500});
  const db=createClient(supabaseUrl,sk,{auth:{persistSession:false,autoRefreshToken:false}});
  const now=new Date(), nowIso=now.toISOString();
  try{
    const reg=await db.from("phase15_source_registry")
      .select("last_probe_at,consecutive_success,consecutive_failure")
      .eq("source_key",SOURCE).maybeSingle();
    if(!force&&reg.data?.last_probe_at){
      const age=(Date.now()-new Date(reg.data.last_probe_at).getTime())/3600000;
      if(Number.isFinite(age)&&age<4) return Response.json({ok:true,skipped:"debounced",ageHours:Number(age.toFixed(2))});
    }

    const fromIso=new Date(Date.now()-3*3600000).toISOString();
    const toIso48=new Date(Date.now()+48*3600000).toISOString();
    const hk=await db.from("hkjc_upcoming_current")
      .select("hkjc_event_id,kickoff_hkt,tournament,home_en,away_en")
      .gte("kickoff_hkt",fromIso).lte("kickoff_hkt",toIso48);
    if(hk.error) throw hk.error;
    const hkjc=hk.data||[];

    const [fmMapRes,hkMapRes]=await Promise.all([
      db.from("team_name_master").select("source_key,team_key").eq("source","FOTMOB").eq("status","VERIFIED"),
      db.from("team_name_master").select("source_key,team_key").eq("source","HKJC_EN").eq("status","VERIFIED")
    ]);
    const fmMap=new Map((fmMapRes.data||[]).map(x=>[x.source_key,x.team_key]));
    const hkMap=new Map((hkMapRes.data||[]).map(x=>[x.source_key,x.team_key]));

    const days=[hktDate(0),hktDate(1)];
    const daily=[];
    const upstream=[];
    for(let i=0;i<days.length;i++){
      const got=await fetchDaily(days[i]);
      upstream.push(got.url);
      daily.push(...flattenMatches(got.data));
      if(i+1<days.length) await sleep(400);
    }

    const uniq=new Map();
    for(const m of daily) uniq.set(m.id,m);
    const rows=[];
    const matchedForDetail=[];
    for(const m of uniq.values()){
      if(!m.homeName||!m.awayName) continue;
      const ko=m.kickoff?new Date(m.kickoff).getTime():NaN;
      let best=null;
      for(const h of hkjc){
        const hkms=new Date(h.kickoff_hkt).getTime();
        if(Number.isFinite(ko)&&Math.abs(ko-hkms)>20*60000) continue;
        const hm=keyName(m.homeName), am=keyName(m.awayName);
        const hh=keyName(h.home_en), ah=keyName(h.away_en);
        let conf=0, identity="UNMATCHED";
        if(hm===hh&&am===ah){conf=.99;identity="EXACT_PAIR";}
        else{
          const fmh=fmMap.get(hm), fma=fmMap.get(am);
          const hkh=hkMap.get(hh), hka=hkMap.get(ah);
          if(fmh&&fma&&hkh&&hka&&fmh===hkh&&fma===hka){conf=.98;identity="VERIFIED_ALIAS";}
          else if((hm===hh&&fma&&hka&&fma===hka)||(am===ah&&fmh&&hkh&&fmh===hkh)){conf=.94;identity="MIXED_CONTEXT";}
        }
        if(conf>0&&(best==null||conf>best.conf)) best={eventId:h.hkjc_event_id,conf,identity,kickoff:h.kickoff_hkt};
      }
      const schemaFingerprint=await sha256(JSON.stringify(Object.keys(m.raw||{}).sort()));
      const row={
        source_key:SOURCE,external_event_id:m.id,fetched_at:nowIso,kickoff_utc:m.kickoff,
        league_name:m.leagueName,league_external_id:m.leagueId,
        home_name:m.homeName,away_name:m.awayName,home_external_id:m.homeId,away_external_id:m.awayId,
        match_status:m.status,matched_hkjc_event_id:best?.eventId||null,
        match_confidence:best?.conf||null,identity_status:best?.identity||"UNMATCHED",
        schema_fingerprint:schemaFingerprint,updated_at:nowIso,raw:m.raw
      };
      rows.push(row);
      if(best&&best.conf>=.94&&m.kickoff&&new Date(m.kickoff).getTime()<=Date.now()+24*3600000){
        matchedForDetail.push({id:m.id,eventId:best.eventId,homeName:m.homeName,awayName:m.awayName,kickoff:best.kickoff});
      }
    }

    for(let i=0;i<rows.length;i+=300){
      const up=await db.from("phase15_source_shadow_current").upsert(rows.slice(i,i+300),{onConflict:"source_key,external_event_id"});
      if(up.error) throw up.error;
    }

    let detailOk=0,detailFail=0,xgRows=0,lineupRows=0,statsRows=0;
    const picked=matchedForDetail.slice(0,MAX_DETAIL);
    for(let i=0;i<picked.length;i++){
      const p=picked[i];
      try{
        const got=await fetchDetail(p.id), d=got.data;
        const lineup=containsUsefulKey(d,/lineup|startingxi|bench/i);
        const xg=containsUsefulKey(d,/^(xg|expected.?goals?)$/i);
        const stats=Boolean(d?.content?.stats||d?.stats);
        const upd=await db.from("phase15_source_shadow_current").update({
          detail_available:true,lineup_available:lineup,xg_available:xg,stats_available:stats,
          detail_fetched_at:new Date().toISOString(),detail_raw:d,updated_at:new Date().toISOString()
        }).eq("source_key",SOURCE).eq("external_event_id",p.id);
        if(upd.error) throw upd.error;
        detailOk++; if(lineup)lineupRows++; if(xg)xgRows++; if(stats)statsRows++;
      }catch{detailFail++;}
      if(i+1<picked.length) await sleep(750);
    }

    let commentaryRows=0,commentaryMatches=0,commentaryFail=0;
    const commentaryErrors=[];
    for(let i=0;i<picked.length;i++){
      const p=picked[i];
      try{
        const items=await fetchCommentary(p.homeName,p.awayName,p.kickoff);
        if(items.length) commentaryMatches++;
        for(const item of items){
          const fingerprint=await sha256([p.eventId,item.publisher,item.title,item.link].join("|"));
          const signalPack=editorialSignals([item.title,item.excerpt].filter(Boolean).join(" "),p.homeName,p.awayName);
          const row={
            hkjc_event_id:p.eventId,
            source:item.publisher,
            source_type:"NEWS_PREVIEW",
            source_url:item.link,
            author:null,
            published_at:item.publishedAt,
            captured_at:new Date().toISOString(),
            language:"en",
            headline:item.title,
            excerpt:item.excerpt,
            summary:item.excerpt,
            lean_market:signalPack.primary?.market||null,
            lean_selection:signalPack.primary?.selection||null,
            confidence:signalPack.primary?.confidence||null,
            topics:["PREMATCH","EDITORIAL",...signalPack.topics],
            opinion_signals:{
              outcome:signalPack.outcome,
              goals:signalPack.goals,
              corners:signalPack.corners,
              btts:signalPack.btts
            },
            relevance_score:signalPack.relevance,
            parser_version:signalPack.parserVersion,
            provenance:{aggregator:item.aggregator,query:item.query,collector:"phase15-source-scout"},
            content_fingerprint:fingerprint,
            updated_at:new Date().toISOString()
          };
          const up=await db.from("match_commentary_evidence").upsert(row,{onConflict:"hkjc_event_id,source,content_fingerprint"});
          if(up.error) throw up.error;
          commentaryRows++;
        }
      }catch(e){
        commentaryFail++;
        commentaryErrors.push(String(e instanceof Error?e.message:e).slice(0,160));
      }
      if(i+1<picked.length) await sleep(1200);
    }

    const matched=rows.filter(r=>r.matched_hkjc_event_id).length;
    const exact=rows.filter(r=>r.identity_status==="EXACT_PAIR").length;
    const schema=await sha256(JSON.stringify({listKeys:["leagues","matches"],sample:rows.slice(0,20).map(r=>r.schema_fingerprint)}));
    const prevS=reg.data?.consecutive_success||0;
    await db.from("phase15_source_registry").update({
      last_probe_at:nowIso,last_success_at:nowIso,last_failure_at:null,
      consecutive_success:prevS+1,consecutive_failure:0,total_records:rows.length,
      schema_fingerprint:schema,last_seen_at:nowIso,updated_at:nowIso,
      raw:{upstream,rows:rows.length,matched,exact,detailOk,detailFail,xgRows,lineupRows,statsRows,commentaryRows,commentaryMatches,commentaryFail,commentaryErrors}
    }).eq("source_key",SOURCE);

    await db.from("source_health").upsert({
      source:"PHASE15_FOTMOB_SCOUT",metric:"6h",
      value_text:JSON.stringify({rows:rows.length,matched,exact,detailOk,detailFail,xgRows,lineupRows,statsRows,commentaryRows,commentaryMatches,commentaryFail,commentaryErrors}),
      status:rows.length>0?"OK":"WARN",
      notes:"Experimental shadow-only scout. No betting-model influence until trust promotion.",
      observed_at:new Date().toISOString(),
      raw:{upstream,rows:rows.length,matched,exact,detailOk,detailFail,xgRows,lineupRows,statsRows,commentaryRows,commentaryMatches,commentaryFail,commentaryErrors}
    },{onConflict:"source,metric"});

    return Response.json({ok:true,source:SOURCE,rows:rows.length,matched,exact,detailOk,detailFail,xgRows,lineupRows,statsRows,commentaryRows,commentaryMatches,commentaryFail,commentaryErrors});
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    const reg=await db.from("phase15_source_registry").select("consecutive_failure").eq("source_key",SOURCE).maybeSingle();
    const fails=(reg.data?.consecutive_failure||0)+1;
    await db.from("phase15_source_registry").update({
      last_probe_at:nowIso,last_failure_at:nowIso,consecutive_failure:fails,consecutive_success:0,updated_at:nowIso,
      raw:{error:message}
    }).eq("source_key",SOURCE);
    await db.from("source_health").upsert({
      source:"PHASE15_FOTMOB_SCOUT",metric:"6h",value_text:message,status:"FAIL",
      notes:"Experimental scout failed; production remains unaffected.",observed_at:new Date().toISOString(),raw:{error:message}
    },{onConflict:"source,metric"});
    return Response.json({ok:false,error:message},{status:500});
  }
});