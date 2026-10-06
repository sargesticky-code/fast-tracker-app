
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const BUILD = "SUPABASE-LIVE-SHADOW-20261004-4";
const DB_READ_TIMEOUT_MS = 8_000;
const PROVIDER_TIMEOUT_MS = 8_000;
const DETAIL_TIMEOUT_MS = 6_000;
const IDENTITY_CONCURRENCY = 3;
function boundedDbFetch(input:any,init:any={}){
  return fetch(input,{...init,signal:init?.signal??AbortSignal.timeout(DB_READ_TIMEOUT_MS)});
}
async function mapLimit<T>(items:T[],limit:number,worker:(item:T)=>Promise<void>){
  let next=0;
  const runners=Array.from({length:Math.min(limit,items.length)},async()=>{
    while(true){
      const i=next++;
      if(i>=items.length)return;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}
const TERMINAL = ["FULLTIME","FINISHED","FT","ENDED","MATCHENDED","INPLAYMATCHENDED","CANCELLED","CANCELED","VOID","ABANDONED"];

function serviceKey(){
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(legacy) return legacy;
  const modern=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(modern){try{const j=JSON.parse(modern); if(j?.default) return j.default;}catch{}}
  return "";
}
function txt(v:any){return v===null||v===undefined?"":String(v).trim();}
function nnum(v:any){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v); return Number.isFinite(n)?n:null;
}
function nint(v:any){const n=nnum(v);return n===null?null:Math.trunc(n);}
function norm(v:any){
  let s=txt(v).normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase();
  s=s.replace(/&/g," and ").replace(/['’`]/g,"");
  s=s.replace(/[^a-z0-9]+/g," ");
  s=s.replace(/\b(u ?23|under ?23|u ?22|u ?21|u ?20|u ?19|am)\b/g," ");
  s=s.replace(/\b(fc|cf|sc|afc|club|football|soccer)\b/g," ");
  s=s.replace(/\bkorea republic\b/g,"south korea");
  s=s.replace(/\brepublic of korea\b/g,"south korea");
  s=s.replace(/\bchina pr\b/g,"china");
  s=s.replace(/\bunited states\b/g,"usa");
  return s.replace(/\s+/g," ").trim();
}
function levenshtein(a:string,b:string){
  if(a===b) return 0;
  if(!a.length) return b.length;
  if(!b.length) return a.length;
  const prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    let last=prev[0];
    prev[0]=i;
    for(let j=1;j<=b.length;j++){
      const old=prev[j];
      prev[j]=Math.min(prev[j]+1,prev[j-1]+1,last+(a[i-1]===b[j-1]?0:1));
      last=old;
    }
  }
  return prev[b.length];
}
function sim(a:any,b:any){
  const x=norm(a),y=norm(b);
  if(!x||!y) return 0;
  if(x===y) return 1;
  if(x.includes(y)||y.includes(x)){
    const short=Math.min(x.length,y.length),long=Math.max(x.length,y.length);
    if(short>=4) return Math.max(0.88,short/long);
  }
  const maxLen=Math.max(x.length,y.length);
  const lev=maxLen?1-levenshtein(x,y)/maxLen:0;
  const xa=new Set(x.split(" ").filter(Boolean)), ya=new Set(y.split(" ").filter(Boolean));
  let inter=0; for(const t of xa) if(ya.has(t)) inter++;
  const dice=(xa.size+ya.size)?(2*inter)/(xa.size+ya.size):0;
  return Math.max(lev,dice);
}
function iso(v:any){
  if(!v) return null;
  const d=new Date(v);
  return Number.isFinite(d.getTime())?d.toISOString():null;
}
function hktYmd(offsetDays=0){
  const d=new Date(Date.now()+8*3600000+offsetDays*86400000);
  const y=d.getUTCFullYear(),m=String(d.getUTCMonth()+1).padStart(2,"0"),day=String(d.getUTCDate()).padStart(2,"0");
  return `${y}${m}${day}`;
}
function hktDate(offsetDays=0){
  const d=new Date(Date.now()+8*3600000+offsetDays*86400000);
  const y=d.getUTCFullYear(),m=String(d.getUTCMonth()+1).padStart(2,"0"),day=String(d.getUTCDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function statusKey(v:any){return txt(v).toUpperCase().replaceAll("_","").replaceAll(" ","");}
function isTerminal(v:any){const s=statusKey(v);return TERMINAL.some(x=>s.includes(x));}
function fotmobHeaders(){
  return {
    "Accept":"application/json, text/plain, */*",
    "Accept-Language":"en-US,en;q=0.9",
    "Referer":"https://www.fotmob.com/",
    "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"
  };
}
function scorePair(m:any){
  const home=m?.home||{},away=m?.away||{};
  const hs=txt(home.score),as=txt(away.score);
  if(hs!==""&&as!=="") return [nint(hs),nint(as)];
  const ss=txt(m?.status?.scoreStr||m?.status?.score);
  const z=ss.match(/(\d+)\s*[-:]\s*(\d+)/);
  return z?[Number(z[1]),Number(z[2])]:[null,null];
}
function minuteFromStatus(st:any){
  if(!st||typeof st!=="object") return null;
  for(const k of ["minute","elapsed","time"]){
    const v=st[k]; if(v!==null&&v!==undefined&&v!==""){const z=txt(v).match(/\d+(?:\+\d+)?/); if(z)return Number(z[0].split("+").reduce((a,b)=>Number(a)+Number(b),0));}
  }
  const live=st.liveTime;
  const vals=live&&typeof live==="object"?Object.values(live):[live];
  for(const v of vals){if(v!==null&&v!==undefined&&v!==""){const z=txt(v).match(/\d+(?:\+\d+)?/);if(z)return Number(z[0].split("+").reduce((a,b)=>Number(a)+Number(b),0));}}
  return null;
}
async function fotmobBoard(){
  const dates=[hktYmd()];
  const hktHour=new Date(Date.now()+8*3600000).getUTCHours();
  if(hktHour<3) dates.push(hktYmd(-1));
  const all:any[]=[]; const seen=new Set<string>();
  for(const date of dates){
    const url=`https://www.fotmob.com/api/data/matches?date=${date}&timezone=Asia%2FHong_Kong&ccode3=HKG`;
    const r=await fetch(url,{headers:fotmobHeaders(),signal:AbortSignal.timeout(PROVIDER_TIMEOUT_MS)});
    if(!r.ok) throw new Error("fotmob_http_"+r.status);
    const data=await r.json();
    for(const lg of data?.leagues||[]){
      for(const m of lg?.matches||[]){
        const id=txt(m?.id); if(id&&seen.has(id))continue; if(id)seen.add(id);
        const st=m?.status||{},home=m?.home||{},away=m?.away||{};
        const started=st?.started===true,finished=st?.finished===true,cancelled=st?.cancelled===true;
        const ongoing=st?.ongoing===true||(started&&!finished&&!cancelled);
        const [hs,as]=scorePair(m);
        all.push({
          source:ongoing?"FOTMOB":"FOTMOB_BOARD",
          source_match_id:id,
          home:txt(home?.name),away:txt(away?.name),
          kickoff:iso(st?.utcTime||m?.utcTime),
          home_score:hs,away_score:as,
          minute:minuteFromStatus(st),
          status:txt(st?.reason)||(ongoing?"LIVE":finished?"FINISHED":"BOARD"),
          live:ongoing,finished,cancelled
        });
      }
    }
  }
  return all;
}
async function sofaBoard(){
  const dates=[hktDate()];
  const hktHour=new Date(Date.now()+8*3600000).getUTCHours();
  if(hktHour<3) dates.push(hktDate(-1));
  const all:any[]=[]; const seen=new Set<string>();
  for(const date of dates){
    const url=`https://www.sofascore.com/api/v1/sport/football/scheduled-events/${date}`;
    const r=await fetch(url,{headers:{"Accept":"application/json","Referer":"https://www.sofascore.com/","User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(PROVIDER_TIMEOUT_MS)});
    if(!r.ok) throw new Error("sofa_http_"+r.status);
    const data=await r.json();
    for(const e of data?.events||[]){
      const id=txt(e?.id); if(id&&seen.has(id))continue; if(id)seen.add(id);
      const st=txt(e?.status?.type).toLowerCase();
      const live=st==="inprogress"||st==="live";
      const ts=nnum(e?.startTimestamp);
      all.push({
        source:live?"SOFASCORE":"SOFASCORE_BOARD",
        source_match_id:id,
        home:txt(e?.homeTeam?.name||e?.homeTeam?.shortName),
        away:txt(e?.awayTeam?.name||e?.awayTeam?.shortName),
        kickoff:ts?new Date(ts*1000).toISOString():null,
        home_score:nint(e?.homeScore?.current),
        away_score:nint(e?.awayScore?.current),
        minute:null,status:live?"LIVE":txt(e?.status?.description||e?.status?.type),
        live,finished:["ended","finished"].includes(st),cancelled:["canceled","cancelled"].includes(st)
      });
    }
  }
  return all;
}
function slugStat(v:any){
  return txt(v).normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase()
    .replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,80);
}
function statVal(v:any){
  if(v===null||v===undefined||v==="") return null;
  const m=txt(v).match(/-?\d+(?:\.\d+)?/);
  return m?Number(m[0]):null;
}
function flattenFotmobHeaderEvents(node:any){
  const out:any[]=[];
  const seen=new Set<string>();
  const walk=(value:any)=>{
    if(Array.isArray(value)){ for(const item of value) walk(item); return; }
    if(!value||typeof value!=="object") return;
    const looksLikeEvent = value.eventId!==undefined || value.type!==undefined || value.time!==undefined || value.timeStr!==undefined;
    if(looksLikeEvent){
      const sig=txt(value.eventId)||[txt(value.type),txt(value.time??value.timeStr),txt(value.playerId),txt(value.isHome)].join("|");
      if(sig&&!seen.has(sig)){ seen.add(sig); out.push(value); }
    }
    for(const child of Object.values(value)) walk(child);
  };
  walk(node);
  return out;
}
function extractFotmobSections(detail:any){
  const teamStats:any[]=[];
  const periods=detail?.content?.stats?.Periods||{};
  const walk=(node:any,period:string,group="")=>{
    if(Array.isArray(node)){
      for(const v of node) walk(v,period,group);
      return;
    }
    if(!node||typeof node!=="object") return;
    const group2=txt(node?.title)||group;
    const vals=node?.stats;
    const key=txt(node?.key);
    const title=txt(node?.title);
    const scalarPair=Array.isArray(vals)&&vals.length>=2&&!Array.isArray(vals[0])&&typeof vals[0]!=="object";
    if(scalarPair){
      teamStats.push({period,group,key:slugStat(key||title),title:title||key,home:vals[0],away:vals[1]});
    }
    for(const [k,v] of Object.entries(node)){
      if(k==="stats"&&scalarPair) continue;
      walk(v,period,group2);
    }
  };
  for(const [period,pdata] of Object.entries(periods)) walk(pdata,txt(period),"");
  const seen=new Set<string>(),deduped:any[]=[];
  for(const row of teamStats){
    const sig=[row.period,row.key,txt(row.home),txt(row.away)].join("|");
    if(seen.has(sig)) continue; seen.add(sig); deduped.push(row);
  }
  let corners:any=null;
  for(const row of deduped){
    const p=txt(row.period).toLowerCase();
    if(!txt(row.key).includes("corner")||!(p==="all"||p==="match")) continue;
    const h=statVal(row.home),a=statVal(row.away);
    if(h!==null&&a!==null){corners={home:h,away:a,total:h+a};break;}
  }
  return {
    team_stats:deduped,
    events:flattenFotmobHeaderEvents(detail?.header?.events),
    momentum:Array.isArray(detail?.content?.matchFacts?.momentum?.main?.data)?detail.content.matchFacts.momentum.main.data:[],
    corners
  };
}
function extractSofaSections(detail:any){
  const stats:any[]=[]; const seen=new Set<string>(); let corners:any=null;
  for(const block of detail?.statistics||[]){
    const period=txt(block?.period||block?.periodName||"ALL");
    for(const group of block?.groups||[]){
      const groupName=txt(group?.groupName||group?.name);
      for(const item of group?.statisticsItems||group?.items||[]){
        const title=txt(item?.name||item?.title); if(!title) continue;
        const home=item?.home??item?.homeValue,away=item?.away??item?.awayValue;
        if(home===null||home===undefined||away===null||away===undefined) continue;
        const key=slugStat(title),sig=[period,key,txt(home),txt(away)].join("|");
        if(seen.has(sig)) continue; seen.add(sig);
        stats.push({period,group:groupName,key,title,home,away});
        if(key.includes("corner")&&["all","match"].includes(period.toLowerCase())){
          const h=statVal(home),a=statVal(away);
          if(h!==null&&a!==null) corners={home:h,away:a,total:h+a};
        }
      }
    }
  }
  return {team_stats:stats,events:[],momentum:[],corners};
}
async function fetchShadowDetail(row:any){
  const source=String(row.source||"");
  if(source.startsWith("FOTMOB")){
    const u="https://www.fotmob.com/api/data/matchDetails?matchId="+encodeURIComponent(row.source_match_id);
    const r=await fetch(u,{headers:fotmobHeaders(),signal:AbortSignal.timeout(DETAIL_TIMEOUT_MS)});
    if(!r.ok) throw new Error("fotmob_detail_http_"+r.status);
    return extractFotmobSections(await r.json());
  }
  if(source.startsWith("SOFASCORE")){
    const u="https://www.sofascore.com/api/v1/event/"+encodeURIComponent(row.source_match_id)+"/statistics";
    const r=await fetch(u,{headers:{"Accept":"application/json","Referer":"https://www.sofascore.com/","User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(DETAIL_TIMEOUT_MS)});
    if(!r.ok) throw new Error("sofa_detail_http_"+r.status);
    return extractSofaSections(await r.json());
  }
  return null;
}

function targetSim(target:any,side:"home"|"away",providerName:any){
  const primary=side==="home"?target.home_en:target.away_en;
  const aliases=side==="home"?(target._home_aliases||[]):(target._away_aliases||[]);
  let best=sim(primary,providerName);
  for(const alias of aliases) best=Math.max(best,sim(alias,providerName));
  return best;
}
function rankedCandidates(target:any,candidates:any[],maxDelta=180){
  const ranked:any[]=[];
  const tk=target?.kickoff_hkt?new Date(target.kickoff_hkt).getTime():NaN;
  for(const m of candidates){
    const hs=targetSim(target,"home",m.home),as=targetSim(target,"away",m.away);
    let delta:number|null=null,ts=0.75;
    if(m.kickoff&&Number.isFinite(tk)){
      const mk=new Date(m.kickoff).getTime();
      if(Number.isFinite(mk)){
        delta=Math.abs(mk-tk)/60000;
        if(delta>maxDelta) continue;
        ts=Math.max(0,1-delta/180);
      }
    }
    const standardScore=0.42*hs+0.42*as+0.16*ts;
    const anchoredScore=0.55*Math.max(hs,as)+0.25*Math.min(hs,as)+0.20*ts;
    ranked.push({score:Math.max(standardScore,anchoredScore),m,hs,as,delta});
  }
  ranked.sort((a,b)=>b.score-a.score);
  return ranked;
}
function bestMatch(target:any,candidates:any[]){
  const ranked=rankedCandidates(target,candidates,120).filter((x:any)=>{
    const standard=Math.min(x.hs,x.as)>=0.58;
    const anchored=x.delta!==null&&x.delta<=10&&Math.max(x.hs,x.as)>=0.85&&Math.min(x.hs,x.as)>=0.35;
    return standard||anchored;
  });
  if(!ranked.length) return null;
  const best=ranked[0],second=ranked[1]?.score||0;
  if(best.score<0.74) return null;
  if(best.score<0.90&&second&&best.score-second<0.06) return null;
  return best;
}
function nearestCandidates(target:any,candidates:any[]){
  return rankedCandidates(target,candidates,180)
    .filter((x:any)=>Math.max(x.hs,x.as)>=0.20)
    .slice(0,5)
    .map((x:any)=>({
      source:x.m.source,
      source_match_id:x.m.source_match_id,
      home:x.m.home,
      away:x.m.away,
      kickoff:x.m.kickoff,
      live:Boolean(x.m.live),
      score:Number(x.score.toFixed(3)),
      home_similarity:Number(x.hs.toFixed(3)),
      away_similarity:Number(x.as.toFixed(3)),
      kickoff_delta_min:x.delta===null?null:Number(x.delta.toFixed(1))
    }));
}

Deno.serve(async (_req:Request)=>{
  const now=new Date(), url=Deno.env.get("SUPABASE_URL")||"", key=serviceKey();
  if(!url||!key) return Response.json({ok:false,error:"server_config_missing"},{status:500});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},db:{retry:false},global:{fetch:boundedDbFetch}});
  try{
    const liveCutoff=new Date(now.getTime()-3*60000).toISOString();
    const from=new Date(now.getTime()-15*60000).toISOString();
    const to=new Date(now.getTime()+90*60000).toISOString();

    const canonicalFrom=new Date(now.getTime()-4*60*60000).toISOString();
    const [{data:liveRows,error:liveErr},{data:canonicalRows,error:canonicalErr}]=await Promise.all([
      db.from("live_score_feed_current")
        .select("match_id,match_status,updated_at_source,source_updated_at,source,source_match_id,match_confidence")
        .gte("updated_at_source",liveCutoff),
      db.from("canonical_fixture_current")
        .select("match_id,kickoff_hkt,league,home_en,away_en,status")
        .gte("kickoff_hkt",canonicalFrom)
        .lte("kickoff_hkt",to)
    ]);
    if(liveErr) throw liveErr;
    if(canonicalErr) throw canonicalErr;

    const liveById=new Map<string,any>();
    for(const r of liveRows||[]){
      const id=String(r?.match_id||"");
      if(!id||isTerminal(r?.match_status)) continue;
      liveById.set(id,r);
    }

    const targets=new Map<string,any>();
    for(const r of canonicalRows||[]){
      const id=String(r?.match_id||"");
      if(!id||isTerminal(r?.status)) continue;
      const liveRow=liveById.get(id);
      if(liveRow){
        targets.set(id,{...r,status:liveRow.match_status??r.status,target_state:"LIVE",
          live_score_source:liveRow.source??null,live_score_updated_at:liveRow.updated_at_source??liveRow.source_updated_at??null});
        continue;
      }
      const ko=Date.parse(String(r?.kickoff_hkt||""));
      if(Number.isFinite(ko)&&ko>=Date.parse(from)){
        targets.set(id,{...r,target_state:"PREWARM"});
      }
    }

    const canonicalNames=[...new Set([...targets.values()].flatMap((t:any)=>[txt(t.home_en),txt(t.away_en)]).filter(Boolean))];
    const aliasMap=new Map<string,string[]>();
    if(canonicalNames.length){
      const {data:identityRows,error:identityErr}=await db.from("team_identity_current")
        .select("source,source_name,canonical_name_en,confidence,status")
        .in("canonical_name_en",canonicalNames)
        .in("source",["FOTMOB","SOFASCORE"])
        .eq("status","VERIFIED")
        .gte("confidence",0.94);
      if(identityErr) throw identityErr;
      const addAlias=(canonical:any,alias:any)=>{
        const k=txt(canonical),v=txt(alias); if(!k||!v) return;
        if(!aliasMap.has(k)) aliasMap.set(k,[]);
        const list=aliasMap.get(k)!;
        if(!list.includes(v)) list.push(v);
      };
      for(const a of identityRows||[]) addAlias(a.canonical_name_en,a.source_name);
    }
    for(const t of targets.values()){
      t._home_aliases=aliasMap.get(txt(t.home_en))||[];
      t._away_aliases=aliasMap.get(txt(t.away_en))||[];
    }

    const targetIds=[...targets.keys()];
    const verifiedByEvent=new Map<string,any[]>();
    if(targetIds.length){
      const {data:verifiedRows}=await db.from("live_identity_map_current")
        .select("match_id,source,source_match_id,confidence,mapping_state")
        .in("match_id",targetIds)
        .eq("mapping_state","VERIFIED");
      for(const v of verifiedRows||[]){
        const id=txt(v.match_id); if(!verifiedByEvent.has(id)) verifiedByEvent.set(id,[]);
        verifiedByEvent.get(id)!.push(v);
      }
    }

    let fotmob:any[]=[]; let fotmobError:string|null=null;
    try{fotmob=await fotmobBoard();}catch(e){fotmobError=e instanceof Error?e.message:String(e);}
    let sofa:any[]|null=null; let sofaError:string|null=null;

    const out:any[]=[];
    for(const target of targets.values()){
      const verified=verifiedByEvent.get(String(target.match_id))||[];
      const mappedFotmob=verified.find((v:any)=>v.source==="FOOTBALL_LIVE_API_SELF_HOSTED"&&txt(v.source_match_id));
      const preferred=target.target_state==="LIVE"?fotmob.filter(x=>x.live):fotmob;

      let match:any=null;
      if(mappedFotmob){
        const byId=fotmob.find((x:any)=>txt(x.source_match_id)===txt(mappedFotmob.source_match_id));
        if(byId){
          match={score:Number(mappedFotmob.confidence||1),m:byId,hs:1,as:1,delta:byId.kickoff&&target.kickoff_hkt?Math.abs(new Date(byId.kickoff).getTime()-new Date(target.kickoff_hkt).getTime())/60000:null};
        }
      }
      if(!match) match=bestMatch(target,preferred);
      if(!match && target.target_state==="LIVE"){
        match=bestMatch(target,fotmob.filter(x=>!x.cancelled&&!x.finished));
      }

      if(!match){
        if(sofa===null){
          try{sofa=await sofaBoard();}catch(e){sofa=[];sofaError=e instanceof Error?e.message:String(e);}
        }
        const mappedSofa=verified.find((v:any)=>v.source==="SOFASCORE"&&txt(v.source_match_id));
        if(mappedSofa){
          const byId=sofa.find((x:any)=>txt(x.source_match_id)===txt(mappedSofa.source_match_id));
          if(byId){
            match={score:Number(mappedSofa.confidence||1),m:byId,hs:1,as:1,delta:byId.kickoff&&target.kickoff_hkt?Math.abs(new Date(byId.kickoff).getTime()-new Date(target.kickoff_hkt).getTime())/60000:null};
          }
        }
        if(!match){
          const sofaPreferred=target.target_state==="LIVE"?sofa.filter(x=>x.live):sofa;
          match=bestMatch(target,sofaPreferred);
          if(!match&&target.target_state==="LIVE") match=bestMatch(target,sofa.filter(x=>!x.cancelled&&!x.finished));
        }
      }

      const m=match?.m||null;
      out.push({
        match_id:String(target.match_id),
        captured_at:now.toISOString(),
        target_state:target.target_state,
        kickoff_hkt:target.kickoff_hkt,
        league:target.league,
        home_en:target.home_en,
        away_en:target.away_en,
        source:m?.source||"SOURCE_GAP",
        source_match_id:m?.source_match_id||null,
        match_confidence:match?Number(match.score.toFixed(3)):null,
        provider_home:m?.home||null,
        provider_away:m?.away||null,
        provider_kickoff:m?.kickoff||null,
        provider_live:Boolean(m?.live),
        home_score:m?.home_score??null,
        away_score:m?.away_score??null,
        minute:m?.minute??null,
        match_status:m?.status||"SOURCE_GAP",
        detail_status:"SHADOW_IDENTITY_ONLY",
        raw:{
          build:BUILD,
          name_home_score:match?Number(match.hs.toFixed(3)):null,
          name_away_score:match?Number(match.as.toFixed(3)):null,
          kickoff_delta_min:match?.delta??null,
          target_status:target.status||null,
          home_aliases:target._home_aliases||[],
          away_aliases:target._away_aliases||[],
          verified_identities:verified,
          nearest_fotmob:match?[]:nearestCandidates(target,fotmob),
          nearest_sofascore:match||!Array.isArray(sofa)?[]:nearestCandidates(target,sofa)
        },
        updated_at:now.toISOString()
      });
    }

    let detailAttempts=0,detailSuccess=0,detailNoMetrics=0,detailErrors=0;
    const detailRows:any[]=[];
    const liveDetailCandidates=out.filter((row:any)=>
      row.target_state==="LIVE" &&
      row.source_match_id &&
      (String(row.source).startsWith("FOTMOB")||String(row.source).startsWith("SOFASCORE"))
    );
    for(const row of liveDetailCandidates) row.detail_status="SHADOW_DETAIL_DEFERRED";

    await mapLimit(liveDetailCandidates.slice(0,2),2,async(row)=>{
      detailAttempts++;
      try{
        const detail=await fetchShadowDetail(row);
        const hasData=Boolean(detail&&(detail.team_stats?.length||detail.events?.length||detail.momentum?.length));
        row.detail_status=hasData?"CAPTURED":"CAPTURED_NO_METRICS";
        if(hasData) detailSuccess++; else detailNoMetrics++;
        detailRows.push({
          match_id:row.match_id,
          captured_at:now.toISOString(),
          source:row.source,
          source_match_id:row.source_match_id,
          detail_status:row.detail_status,
          team_stats:detail?.team_stats||[],
          events:detail?.events||[],
          momentum:detail?.momentum||[],
          home_corners:detail?.corners?.home??null,
          away_corners:detail?.corners?.away??null,
          total_corners:detail?.corners?.total??null,
          raw:{build:BUILD,shadow:true,request_cap:2},
          updated_at:now.toISOString()
        });
      }catch(e){
        detailErrors++;
        row.detail_status="ERROR_"+(e instanceof Error?e.message:String(e));
        detailRows.push({
          match_id:row.match_id,
          captured_at:now.toISOString(),
          source:row.source,
          source_match_id:row.source_match_id,
          detail_status:row.detail_status,
          team_stats:[],events:[],momentum:[],
          home_corners:null,away_corners:null,total_corners:null,
          raw:{build:BUILD,shadow:true,error:e instanceof Error?e.message:String(e)},
          updated_at:now.toISOString()
        });
      }
    });
    if(detailRows.length){
      const {error:detailUpsertError}=await db.rpc("ft_upsert_live_detail_shadow_generic",{rows_data:detailRows});
      if(detailUpsertError) throw detailUpsertError;
    }

    let identityRpcErrors=0;
    if(out.length){
      const {error}=await db.rpc("ft_upsert_live_source_shadow_generic",{rows_data:out});
      if(error) throw error;

      const identityRows=out.filter((row:any)=>
        row.source_match_id && row.source!=="SOURCE_GAP" && Number.isFinite(Number(row.match_confidence))
      );
      await mapLimit(identityRows,IDENTITY_CONCURRENCY,async(row)=>{
        const identitySource=String(row.source).startsWith("FOTMOB")
          ? "FOOTBALL_LIVE_API_SELF_HOSTED"
          : String(row.source).startsWith("SOFASCORE")
            ? "SOFASCORE"
            : null;
        if(!identitySource) return;
        try{
          const result=await db.rpc("ft_record_live_shadow_identity_generic",{
            p_match_id:row.match_id,
            p_source:identitySource,
            p_source_match_id:row.source_match_id,
            p_confidence:Number(row.match_confidence),
            p_evidence:{
              build:BUILD,
              target_state:row.target_state,
              provider_home:row.provider_home,
              provider_away:row.provider_away,
              provider_kickoff:row.provider_kickoff,
              kickoff_delta_min:row.raw?.kickoff_delta_min??null
            }
          });
          if(result.error) identityRpcErrors++;
        }catch{identityRpcErrors++;}
      });
      const promoteResult=await db.rpc("ft_promote_phase3_shadow_candidates");
      if(promoteResult.error) console.warn("shadow_promote_failed",promoteResult.error.message);
    }
    await db.from("live_source_shadow_current").delete().lt("captured_at",new Date(now.getTime()-6*3600000).toISOString());

    const matched=out.filter(x=>x.source!=="SOURCE_GAP").length;
    const liveTargets=out.filter(x=>x.target_state==="LIVE").length;
    const liveMatched=out.filter(x=>x.target_state==="LIVE"&&x.source!=="SOURCE_GAP").length;
    const prewarmTargets=out.length-liveTargets;
    const prewarmMatched=matched-liveMatched;
    const liveGaps=Math.max(0,liveTargets-liveMatched);
    const providersUnavailable=Boolean(fotmobError&&sofaError);
    const status=liveGaps>0
      ? (providersUnavailable?"FAIL":"WARN")
      : (!liveTargets&&providersUnavailable&&out.length?"WARN":"OK");
    const notes=!out.length
      ? "Supabase-native shadow idle; no live/prewarm targets."
      : liveGaps>0
        ? `Live shadow coverage ${liveMatched}/${liveTargets}; total identity coverage ${matched}/${out.length}.`
        : prewarmMatched<prewarmTargets
          ? `Live shadow healthy ${liveMatched}/${liveTargets}; prewarm provider coverage ${prewarmMatched}/${prewarmTargets} is non-blocking before kickoff.`
          : `Supabase-native shadow identity matched ${matched}/${out.length}; live ${liveMatched}/${liveTargets}.`;
    await db.from("source_health").upsert({
      source:"LIVE_SOURCE_SHADOW",metric:"heartbeat",status,
      value_text:`${matched}/${out.length}`,
      notes,
      observed_at:now.toISOString(),
      raw:{build:BUILD,targets:out.length,matched,live_targets:liveTargets,live_matched:liveMatched,
        live_gaps:liveGaps,prewarm_targets:prewarmTargets,prewarm_matched:prewarmMatched,
        prewarm_gaps:Math.max(0,prewarmTargets-prewarmMatched),
        detail_attempts:detailAttempts,detail_success:detailSuccess,detail_no_metrics:detailNoMetrics,detail_errors:detailErrors,
        identity_rpc_errors:typeof identityRpcErrors==="number"?identityRpcErrors:0,
        fotmob_error:fotmobError,sofascore_error:sofaError}
    },{onConflict:"source,metric"});

    return Response.json({ok:status!=="FAIL",build:BUILD,status,count:out.length,matched,
      detail:{attempts:detailAttempts,success:detailSuccess,noMetrics:detailNoMetrics,errors:detailErrors},
      matches:out},{
      status:status==="FAIL"?503:200,
      headers:{"Cache-Control":"no-store"}
    });
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    try{
      await db.from("source_health").upsert({
        source:"LIVE_SOURCE_SHADOW",metric:"heartbeat",status:"FAIL",value_text:"0",
        notes:"Supabase-native shadow collector failed.",observed_at:now.toISOString(),raw:{build:BUILD,error:message}
      },{onConflict:"source,metric"});
    }catch(healthError){
      console.warn("live_shadow_health_write_failed",String(healthError));
    }
    return Response.json({ok:false,build:BUILD,error:message},{status:503,headers:{"Cache-Control":"no-store"}});
  }
});
