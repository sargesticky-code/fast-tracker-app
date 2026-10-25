import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const SOURCE="FLASHSCORE";
const SITE="https://www.flashscore.com";
const FEED="https://global.flashscore.ninja/2/x/feed/";
let SIGN="SW9D1eZo";

function serviceKey(){
  const a=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if(a) return a;
  const m=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(m){try{const j=JSON.parse(m);if(j&&j.default)return j.default;}catch{}}
  return "";
}
function keyName(v){return String(v??"").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"");}
function teamTokens(v){
  const filler=new Set(["fc","afc","cf","sc","ac","club","football","futbol","women","woman","ladies","w","deportes","deportivo","cd","of"]);
  const normalized=String(v??"").normalize("NFD").replace(/\p{M}+/gu,"").toLowerCase()
    .replace(/\bkorea\s+dpr\b|\bdpr\s+korea\b/g,"north korea")
    .replace(/\bkorea\s+republic\b|\brepublic\s+of\s+korea\b/g,"south korea")
    .replace(/[^a-z0-9]+/g," ");
  return normalized.trim().split(/\s+/).filter(t=>t&&t.length>1&&!filler.has(t));
}
function teamTokenScore(a,b){
  const A=teamTokens(a),B=teamTokens(b);
  if(!A.length||!B.length)return 0;
  const small=A.length<=B.length?A:B,big=A.length<=B.length?B:A;
  const used=new Set(); let hit=0;
  for(const s of small){
    let idx=-1;
    for(let i=0;i<big.length;i++){
      if(used.has(i))continue;
      const x=big[i];
      if(s===x || (Math.min(s.length,x.length)>=3 && (s.startsWith(x)||x.startsWith(s)))){idx=i;break;}
    }
    if(idx>=0){used.add(idx);hit++;}
  }
  return hit/small.length;
}
function looseName(v){
  return String(v??"").normalize("NFD").replace(/\p{M}+/gu,"").toLowerCase()
    .replace(/\b(fc|afc|cf|sc|ac|club|football|futbol|women|woman|ladies)\b/g,"")
    .replace(/[^a-z0-9]+/g,"").trim();
}
function parseRecords(text){
  const out=[];
  for(const chunk of String(text||"").split("~")){
    const r={};
    for(const pair of chunk.split("¬")){
      const i=pair.indexOf("÷");
      if(i>0){
        const k=pair.slice(0,i),v=pair.slice(i+1);
        if(!(k in r)) r[k]=v;
      }
    }
    if(Object.keys(r).length) out.push(r);
  }
  return out;
}
function iso(ts){
  const n=Number(ts); if(!Number.isFinite(n)||!n)return null;
  return new Date(n*1000).toISOString();
}
function compName(v){
  const s=String(v||"").trim();
  const i=s.indexOf(":");
  return i>=0?s.slice(i+1).trim():s||null;
}
function detectStats(text){
  let hasStats=false,hasXg=false;
  for(const r of parseRecords(text)){
    if(r.SG){hasStats=true;if(/expected goals|\bxg\b/i.test(r.SG))hasXg=true;}
  }
  return {hasStats,hasXg};
}
function detectLineup(text){return parseRecords(text).some(r=>r.LP||r.LI||r.LD);}
function normalizeFormation(v){
  const parts=String(v||"").split("-").map(Number).filter(Number.isFinite);
  if(parts.length>=2&&parts[0]===1&&parts.reduce((a,b)=>a+b,0)===11)parts.shift();
  return parts.length?parts.join("-"):null;
}
function gridCols(count){
  if(count<=1)return [3];
  if(count===2)return [2,4];
  if(count===3)return [1,3,5];
  if(count===4)return [1,2,4,5];
  return [1,2,3,4,5].slice(0,count);
}
function formationSlot(formation,ll){
  const lines=String(formation||"").split("-").map(Number).filter((n)=>Number.isFinite(n)&&n>0);
  if(!Number.isInteger(ll)||ll<1||!lines.length)return null;
  if(ll===1)return "1:3";
  let pos=ll-2;
  const rows=lines.length===1?[5]:lines.length===2?[2,5]:lines.length===3?[2,3,5]:[2,3,4,5];
  for(let i=0;i<lines.length;i++){
    const count=lines[i];
    if(pos<count){
      const cols=gridCols(count);
      return `${rows[Math.min(i,rows.length-1)]}:${cols[Math.min(pos,cols.length-1)]}`;
    }
    pos-=count;
  }
  return null;
}
function parseFlashLineupRows(text,eventId,externalId,sourceUpdatedAt){
  let section="",side=null;
  const out=[];
  const formations={H:null,A:null};
  const fetchedAt=new Date().toISOString();
  for(const r of parseRecords(text)){
    if(r.LB)section=String(r.LB);
    if(String(r.LC||"")==="1")side="H";
    else if(String(r.LC||"")==="2")side="A";
    if(side&&r.LD)formations[side]=normalizeFormation(r.LD)||formations[side];

    const isStarting=/starting lineups/i.test(section);
    const isSub=/substitutes/i.test(section);
    if((!isStarting&&!isSub)||!side)continue;

    const idx=Number(r.LH);
    if(!Number.isInteger(idx))continue;
    if(isStarting&&(idx<0||idx>10))continue;
    if(isSub&&idx<11)continue;

    const name=String(r.LN||r.LI||"").trim();
    if(!name)continue;
    const pk=String(r.LP||keyName(name)).trim();
    const shirt=Number(r.LJ);
    const ll=Number(r.LL);
    const formation=formations[side];
    out.push({
      match_id:eventId,team_side:side,team_key:null,player_key:pk||keyName(name),
      player_name:name,role:String(r.LS||"").trim()||(ll===1?"Goalkeeper":null),
      starter:isStarting,formation_slot:isStarting?formationSlot(formation,ll):null,
      shirt_number:Number.isFinite(shirt)?shirt:null,
      confirmed:true,confidence:.97,source_name:"FLASHSCORE_OFFICIAL",
      source_url:SITE+"/match/"+externalId+"/#/match-summary/lineups",
      source_updated_at:sourceUpdatedAt||fetchedAt,fetched_at:fetchedAt,
      // Player, side, shirt, formation and source identifiers live in typed columns.
      // Preserve only small display evidence here; the full provider record is
      // duplicated for every player and is not read by live lineup consumers.
      raw:{classification:"CONFIRMED",squad_role:isStarting?"STARTING_XI":"SUBSTITUTE",formation,flash_position:ll,external_event_id:externalId,flash_index:idx},
      created_at:fetchedAt
    });
  }
  const hStarters=out.filter(x=>x.team_side==="H"&&x.starter);
  const aStarters=out.filter(x=>x.team_side==="A"&&x.starter);
  return hStarters.length===11&&aStarters.length===11?out:[];
}
function parseFlashCoaches(text,eventId,externalId,sourceUpdatedAt){
  let section="",side=null;
  const out=[];
  const fetchedAt=new Date().toISOString();
  for(const r of parseRecords(text)){
    if(r.LB)section=String(r.LB);
    if(String(r.LC||"")==="1")side="H";
    else if(String(r.LC||"")==="2")side="A";
    if(!/coaches/i.test(section)||!side)continue;
    const name=String(r.LN||r.LI||"").trim();
    if(!name)continue;
    const key=String(r.LP||keyName(name)).trim();
    out.push({
      match_id:eventId,team_side:side,team_key:null,manager_key:key||keyName(name),
      evidence_type:"MATCH_COACH",evidence_value:name,confirmed:true,confidence:.97,
      source_name:"FLASHSCORE_OFFICIAL",
      source_url:SITE+"/match/"+externalId+"/#/match-summary/lineups",
      source_published_at:sourceUpdatedAt||fetchedAt,fetched_at:fetchedAt,
      raw:{manager_name:name,country:r.LQ||null,external_event_id:externalId,flash_record:r},
      created_at:fetchedAt
    });
  }
  return out;
}
async function refreshSign(){
  try{
    const r=await fetch(SITE+"/",{headers:{"accept":"text/html","user-agent":"Mozilla/5.0"},signal:AbortSignal.timeout(15000)});
    const t=await r.text();
    const m=t.match(/feed_sign\s*[:=]\s*["']([A-Za-z0-9_-]{4,32})["']/);
    if(m) SIGN=m[1];
  }catch{}
}
async function feed(name,optional=false){
  for(let attempt=0;attempt<2;attempt++){
    const r=await fetch(FEED+name,{headers:{
      "accept":"*/*","accept-language":"en-US,en;q=0.9",
      "referer":SITE+"/","origin":SITE,"x-fsign":SIGN,
      "user-agent":"Mozilla/5.0"
    },signal:AbortSignal.timeout(20000)});
    if((r.status===401||r.status===403)&&attempt===0){await refreshSign();continue;}
    if(r.status===404&&optional)return "";
    if(!r.ok)throw new Error("http_"+r.status);
    const t=await r.text();
    return ["","0","A1÷¬~"].includes(t.trim())?"":t;
  }
  throw new Error("blocked");
}
Deno.serve(async(req)=>{
  const u=new URL(req.url),force=u.searchParams.get("force")==="1";
  const sk=serviceKey(),url=Deno.env.get("SUPABASE_URL")||"";
  if(!sk||!url)return Response.json({ok:false,error:"server_config_missing"},{status:500});
  const db=createClient(url,sk,{auth:{persistSession:false,autoRefreshToken:false}});
  // Internal cron authentication. Token is read from Vault by pg_net,
  // never embedded in the repository, response or application logs.
  if(req.method!=="GET") return Response.json({ok:false,error:"method_not_allowed"},{status:405});
  const cronKey=req.headers.get("x-ft-cron-key")||"";
  if(!cronKey) return Response.json({ok:false,error:"unauthorized"},{status:401});
  // Supabase can transiently reject a server-side sb_secret_ request with
  // PGRST303 while validating its internally minted JWT. Retry ONLY that
  // upstream error; a valid false response or any other failure fails closed.
  let cronAuth=await db.rpc("ft_internal_cron_key_matches",{p_key:cronKey});
  for(const backoffMs of [250,800,1500]){
    if(cronAuth.error?.code!=="PGRST303")break;
    await new Promise<void>(resolve=>setTimeout(resolve,backoffMs));
    cronAuth=await db.rpc("ft_internal_cron_key_matches",{p_key:cronKey});
  }
  if(cronAuth.error||cronAuth.data!==true)
    return Response.json({ok:false,error:"unauthorized"},{status:401});
  const nowIso=new Date().toISOString();
  try{
    // Bounded score-only mode reuses the existing Flashscore scout's feed client.
    // One or two feed reads, only verified FS event IDs, max 120 row writes.
    // No detail/lineup/alias capture and no new fixture creation.
    if(u.searchParams.get("mode")==="score"){
      const from=new Date(Date.now()-6*3600000).toISOString();
      const to=new Date(Date.now()+3*3600000).toISOString();
      const targets=await db.from("flashscore_primary_fixture_current")
        .select("provider_event_id,kickoff_hkt,home_en,away_en")
        .gte("kickoff_hkt",from).lte("kickoff_hkt",to).limit(120);
      if(targets.error)throw targets.error;
      const allowed=new Map((targets.data||[]).filter((v:any)=>v.provider_event_id)
        .map((v:any)=>[String(v.provider_event_id),v]));
      if(!allowed.size)return Response.json({ok:true,mode:"verified_score_only",targetEvents:0,sourceWrites:0});
      const accepted=new Map();
      const collect=(rawText:string)=>{
        for(const item of parseRecords(rawText)){
          if(!item.AA||!allowed.has(item.AA))continue;
          const providerTimestamp=iso(item.AD);
          if(!providerTimestamp||!item.AE||!item.AF)continue;
          accepted.set(item.AA,{
            id:item.AA,home:item.AE,away:item.AF,kickoff_utc:providerTimestamp,
            stage:item.AB||null,stage_detail:item.AC||null,
            home_score:item.AG??null,away_score:item.AH??null,
            provider_changed_at:item.AO??null
          });
        }
      };
      collect(await feed("f_1_0_8_en_1",true));
      if(accepted.size<Math.ceil(allowed.size*0.6))collect(await feed("f_1_1_8_en_1",true));
      if(!accepted.size) return Response.json({
        ok:false,mode:"verified_score_only",error:"NO_TARGET_EVENTS_IN_PROVIDER_FEED",
        targetEvents:allowed.size,sourceWrites:0
      },{status:503});
      const rows=[...accepted.values()].slice(0,120);
      const updated=await db.rpc("ft_refresh_flashscore_stage_scores",{rows_data:rows});
      if(updated.error)throw updated.error;
      return Response.json({
        ok:true,mode:"verified_score_only",targetEvents:allowed.size,
        sourceEventsMatched:rows.length,...(updated.data||{}),
        canonicalRewrites:0,aliasWrites:0,detailRequests:0
      });
    }
    const reg=await db.from("phase15_source_registry").select("last_probe_at,consecutive_success,consecutive_failure").eq("source_key",SOURCE).maybeSingle();
    if(!force&&reg.data?.last_probe_at){
      const age=(Date.now()-new Date(reg.data.last_probe_at).getTime())/3600000;
      if(Number.isFinite(age)&&age<4)return Response.json({ok:true,skipped:"debounced",ageHours:Number(age.toFixed(2))});
    }

    const fromIso=new Date(Date.now()-6*3600000).toISOString();
    const toIso48=new Date(Date.now()+48*3600000).toISOString();
    const fixtureRes=await db.from("canonical_fixture_current")
      .select("match_id,kickoff_hkt,league,home_en,away_en")
      .gte("kickoff_hkt",fromIso).lte("kickoff_hkt",toIso48);
    if(fixtureRes.error)throw fixtureRes.error;
    const fixtures=fixtureRes.data||[];
    // Exact provider event identity matches canonical FS:<same-event> IDs,
    // but only when the independently stored kickoff agrees within 60 sec.
    // This prevents short-name variants from losing already captured details.
    const fixtureBySourceEvent=new Map(
      fixtures.filter((f:any)=>String(f.match_id||"").startsWith("FS:"))
        .map((f:any)=>[String(f.match_id).slice(3),f])
    );

    const fsMapRes=await db.from("team_identity_current")
      .select("source_key,team_key,canonical_name_en,confidence,status")
      .eq("source",SOURCE)
      .eq("status","VERIFIED")
      .gte("confidence",0.94);
    if(fsMapRes.error)throw fsMapRes.error;
    const fsMap=new Map((fsMapRes.data||[]).map((x:any)=>[
      keyName(x.source_key),
      {teamKey:x.team_key,canonical:keyName(x.canonical_name_en)}
    ]));

    const matches=[];
    for(const day of [0,1,2]){
      const text=await feed(`f_1_${day}_8_en_1`,true);
      let header=null;
      for(const r of parseRecords(text)){
        if(r.ZA){header=r;continue;}
        if(!r.AA||!r.AE||!r.AF)continue;
        matches.push({
          id:r.AA,homeName:r.AE,awayName:r.AF,homeId:r.PX||null,awayId:r.PY||null,
          kickoff:iso(r.AD),status:r.AB||null,leagueName:compName(header?.ZA),
          leagueId:header?.ZE||header?.ZC||null,raw:r
        });
      }
    }
    const uniq=new Map();for(const m of matches)uniq.set(m.id,m);
    const rows=[],detailIds=[];
    for(const m of uniq.values()){
      const ko=m.kickoff?new Date(m.kickoff).getTime():NaN;let best=null;
      const exactById:any=fixtureBySourceEvent.get(String(m.id));
      if(exactById && Number.isFinite(ko) &&
         Math.abs(ko-new Date(exactById.kickoff_hkt).getTime())<=60_000){
        best={matchId:exactById.match_id,conf:.995,identity:"VERIFIED_IDENTITY"};
      }
      for(const h of fixtures){
        if(best?.conf===.995)break;
        const fixtureMs=new Date(h.kickoff_hkt).getTime();
        if(Number.isFinite(ko)&&Math.abs(ko-fixtureMs)>20*60000)continue;
        const hm=keyName(m.homeName),am=keyName(m.awayName),ch=keyName(h.home_en),ca=keyName(h.away_en);
        let conf=0,identity="UNMATCHED";
        if(hm===ch&&am===ca){conf=.99;identity="EXACT_PAIR";}
        else{
          const lmh=looseName(m.homeName),lma=looseName(m.awayName),lch=looseName(h.home_en),lca=looseName(h.away_en);
          const fsh:any=fsMap.get(hm),fsa:any=fsMap.get(am);
          const tsh=teamTokenScore(m.homeName,h.home_en),tsa=teamTokenScore(m.awayName,h.away_en);
          if(fsh?.canonical===ch&&fsa?.canonical===ca){conf=.985;identity="VERIFIED_IDENTITY";}
          else if(lmh&&lma&&lch&&lca&&lmh===lch&&lma===lca){conf=.97;identity="LOOSE_PAIR";}
          else if(tsh>=.90&&tsa>=.90){conf=.96;identity="TOKEN_PAIR";}
          else if((hm===ch&&fsa?.canonical===ca)||(am===ca&&fsh?.canonical===ch)){conf=.95;identity="MIXED_CONTEXT";}
          else if((hm===ch&&lma&&lca&&lma===lca)||(am===ca&&lmh&&lch&&lmh===lch)){conf=.95;identity="MIXED_LOOSE";}
          else if((tsh>=.95&&fsa?.canonical===ca)||(tsa>=.95&&fsh?.canonical===ch)){conf=.95;identity="TOKEN_IDENTITY_MIXED";}
        }
        if(conf>0&&(!best||conf>best.conf))best={matchId:h.match_id,conf,identity};
      }
      rows.push({
        source_key:SOURCE,external_event_id:m.id,fetched_at:nowIso,kickoff_utc:m.kickoff,
        league_name:m.leagueName,league_external_id:m.leagueId,home_name:m.homeName,away_name:m.awayName,
        home_external_id:m.homeId,away_external_id:m.awayId,match_status:m.status,
        match_id:best?.matchId||null,match_confidence:best?.conf||null,
        identity_status:best?.identity||"UNMATCHED",updated_at:nowIso,raw:m.raw
      });
      if(best&&best.conf>=.94&&m.kickoff&&new Date(m.kickoff).getTime()<=Date.now()+24*3600000)detailIds.push(m.id);
    }
    for(let i=0;i<rows.length;i+=300){
      const up=await db.rpc("ft_upsert_source_shadow_generic",{rows_data:rows.slice(i,i+300)});
      if(up.error)throw up.error;
    }

    let detailOk=0,detailFail=0,statsRows=0,xgRows=0,lineupRows=0,promotedRows=0,promotedMatches=0,benchRows=0,managerRows=0,managerMatches=0;
    const kickoffById=new Map(rows.map((r)=>[r.external_event_id,r.kickoff_utc?new Date(r.kickoff_utc).getTime():Number.POSITIVE_INFINITY]));
    const orderedDetailIds=[...new Set(detailIds)].sort((a,b)=>{
      const da=Math.abs((kickoffById.get(a)??Number.POSITIVE_INFINITY)-Date.now());
      const dbb=Math.abs((kickoffById.get(b)??Number.POSITIVE_INFINITY)-Date.now());
      return da-dbb;
    });
    for(const id of orderedDetailIds.slice(0,10)){
      try{
        const [st,li]=await Promise.all([feed(`df_st_1_${id}`,true),feed(`df_li_1_${id}`,true)]);
        const ds=detectStats(st),dl=detectLineup(li);
        const upd=await db.from("phase15_source_shadow_current").update({
          detail_available:ds.hasStats||dl,stats_available:ds.hasStats,xg_available:ds.hasXg,
          lineup_available:dl,detail_fetched_at:new Date().toISOString(),
          detail_raw:{statistics_raw:st?st.slice(0,120000):"",lineups_raw:li?li.slice(0,120000):""},
          updated_at:new Date().toISOString()
        }).eq("source_key",SOURCE).eq("external_event_id",id);
        if(upd.error)throw upd.error;
        detailOk++;if(ds.hasStats)statsRows++;if(ds.hasXg)xgRows++;
        if(dl){
          lineupRows++;
          const parent=rows.find((x)=>x.external_event_id===id);
          if(parent?.match_id){
            const sourceUpdatedAt=new Date().toISOString();
            const promoted=parseFlashLineupRows(li,parent.match_id,id,sourceUpdatedAt);
            if(promoted.length>=22){
              const wr=await db.rpc("ft_upsert_lineup_evidence_generic",{rows_data:promoted});
              if(wr.error)throw wr.error;
              promotedRows+=promoted.length;
              benchRows+=promoted.filter(x=>!x.starter).length;
              promotedMatches++;
            }
            const coaches=parseFlashCoaches(li,parent.match_id,id,sourceUpdatedAt);
            if(coaches.length){
              const mr=await db.rpc("ft_replace_manager_evidence_generic",{
                p_match_id:parent.match_id,
                p_source_name:"FLASHSCORE_OFFICIAL",
                rows_data:coaches
              });
              if(mr.error)throw mr.error;
              managerRows+=coaches.length;managerMatches++;
            }
          }
        }
      }catch{detailFail++;}
    }

    const matched=rows.filter(r=>r.match_id).length;
    const exact=rows.filter(r=>r.identity_status==="EXACT_PAIR").length;
    const aliasMatched=rows.filter(r=>["VERIFIED_IDENTITY","TOKEN_IDENTITY_MIXED"].includes(r.identity_status)).length;
    const tokenMatched=rows.filter(r=>r.identity_status==="TOKEN_PAIR").length;
    const prev=reg.data?.consecutive_success||0;
    const trust=Math.min(.79,.20+Math.min(.30,rows.length/1000)+(matched>0?.15:0)+(detailOk>0?.10:0));
    await db.from("phase15_source_registry").update({
      last_probe_at:nowIso,last_success_at:nowIso,last_failure_at:null,consecutive_success:prev+1,
      consecutive_failure:0,total_records:rows.length,trust_score:trust,last_seen_at:nowIso,updated_at:nowIso,
      raw:{rows:rows.length,matched,exact,aliasMatched,tokenMatched,detailOk,detailFail,statsRows,xgRows,lineupRows,promotedRows,promotedMatches,benchRows,managerRows,managerMatches,feedSign:SIGN}
    }).eq("source_key",SOURCE);
    await db.from("source_health").upsert({
      source:"PHASE15_FLASHSCORE_SCOUT",metric:"6h",
      value_text:JSON.stringify({rows:rows.length,matched,exact,aliasMatched,tokenMatched,detailOk,detailFail,statsRows,xgRows,lineupRows,promotedRows,promotedMatches,benchRows,managerRows,managerMatches}),
      status:rows.length>0?"OK":"WARN",
      notes:"Flashscore scout anchored to canonical fixture identity; complete 11v11 official lineups promote into Phase 2 evidence.",
      observed_at:new Date().toISOString(),raw:{rows:rows.length,matched,exact,aliasMatched,tokenMatched,detailOk,detailFail,statsRows,xgRows,lineupRows,promotedRows,promotedMatches,benchRows,managerRows,managerMatches,feedSign:SIGN}
    },{onConflict:"source,metric"});
    return Response.json({ok:true,rows:rows.length,matched,exact,aliasMatched,tokenMatched,detailOk,detailFail,statsRows,xgRows,lineupRows,promotedRows,promotedMatches,benchRows,managerRows,managerMatches});
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    const rr=await db.from("phase15_source_registry").select("consecutive_failure").eq("source_key",SOURCE).maybeSingle();
    await db.from("phase15_source_registry").update({
      last_probe_at:nowIso,last_failure_at:nowIso,consecutive_failure:(rr.data?.consecutive_failure||0)+1,
      consecutive_success:0,updated_at:nowIso,raw:{error:message}
    }).eq("source_key",SOURCE);
    await db.from("source_health").upsert({
      source:"PHASE15_FLASHSCORE_SCOUT",metric:"6h",value_text:message,status:"FAIL",
      notes:"Experimental Flashscore scout failed; production unaffected.",observed_at:new Date().toISOString(),raw:{error:message}
    },{onConflict:"source,metric"});
    return Response.json({ok:false,error:message},{status:500});
  }
});