import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const SOURCE="FOTMOB";
const MAX_DETAIL=12;
const DETAIL_TIMEOUT_MS=5_000;
const DETAIL_CONCURRENCY=3;
const WINDOW_HOURS=24;

function serviceKey(){
  const a=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if(a) return a;
  const m=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(m){try{const j=JSON.parse(m);if(j?.default)return j.default}catch{}}
  return "";
}
function keyName(v){
  return String(v??"").normalize("NFD").replace(/\p{M}+/gu,"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"");
}
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
  const used=new Set();let hit=0;
  for(const s of small){
    let idx=-1;
    for(let i=0;i<big.length;i++){
      if(used.has(i))continue;
      const x=big[i];
      if(s===x || (Math.min(s.length,x.length)>=3&&(s.startsWith(x)||x.startsWith(s)))){idx=i;break;}
    }
    if(idx>=0){used.add(idx);hit++;}
  }
  return hit/small.length;
}
function slotFromLayout(player){
  const x=Number(player?.verticalLayout?.x),y=Number(player?.verticalLayout?.y);
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  const row=Math.max(1,Math.min(5,Math.ceil(y*5)));
  const col=Math.max(1,Math.min(5,Math.ceil(x*5)));
  return `${row}:${col}`;
}
function roleFromPlayer(player){
  const p=Number(player?.usualPlayingPositionId);
  if(p===0)return "GK"; if(p===1)return "DEF"; if(p===2)return "MID"; if(p===3)return "ATT";
  return null;
}
function bestIdentity(h, candidates, canon){
  const hkms=new Date(h.kickoff_hkt).getTime();
  let best=null;
  for(const m of candidates){
    const ms=new Date(m.kickoff_utc).getTime();
    if(!Number.isFinite(ms)||Math.abs(ms-hkms)>20*60000)continue;
    const hm=keyName(m.home_name),am=keyName(m.away_name),hh=keyName(h.home_en),ah=keyName(h.away_en);
    let conf=0,identity="UNMATCHED";
    if(hm===hh&&am===ah){conf=.99;identity="EXACT_PAIR";}
    else{
      const cah=canon(hm),caa=canon(am),chh=canon(hh),cha=canon(ah);
      const sh=teamTokenScore(m.home_name,h.home_en),sa=teamTokenScore(m.away_name,h.away_en);
      if(cah&&caa&&cah===chh&&caa===cha){conf=.98;identity="SHARED_ALIAS";}
      else if(sh>=.90&&sa>=.90){conf=.96;identity="TOKEN_PAIR";}
      else if((sh>=.95&&caa===cha)||(sa>=.95&&cah===chh)){conf=.95;identity="TOKEN_ALIAS_MIXED";}
    }
    if(conf>0&&(!best||conf>best.conf))best={row:m,conf,identity};
  }
  return best;
}
async function getJson(url){
  const r=await fetch(url,{headers:{
    "Accept":"application/json,text/plain;q=0.9,*/*;q=0.1",
    "User-Agent":"FastTrackerPhase2Lineup/1.0 (+private analytical use)"
  },signal:AbortSignal.timeout(DETAIL_TIMEOUT_MS)});
  if(!r.ok)throw new Error("http_"+r.status);
  const text=await r.text();
  try{return JSON.parse(text)}catch{throw new Error("invalid_json")}
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

async function fetchDetail(id){
  const urls=[
    `https://www.fotmob.com/api/data/matchDetails?matchId=${encodeURIComponent(id)}`,
    `https://www.fotmob.com/api/matchDetails?matchId=${encodeURIComponent(id)}`
  ];
  let last="";
  for(const u of urls){try{return await getJson(u)}catch(e){last=String(e)}}
  throw new Error(last||"detail_failed");
}
function parseLineup(detail,eventId,externalId,capturedAt=new Date().toISOString(),expectedTeams=null){
  const l=detail?.content?.lineup;
  if(!l || typeof capturedAt!=="string" || !capturedAt.trim() || !Number.isFinite(Date.parse(capturedAt)))return {rows:[],kind:null,injuries:[],managers:[],complete:false};
  // A supplied source event or team identity must agree before any evidence is emitted.
  if(!eventId || !externalId || (l.matchId!=null && String(l.matchId)!==String(externalId))
    || (detail?.general?.matchId!=null && String(detail.general.matchId)!==String(externalId))
    || (expectedTeams?.home!=null && String(l.homeTeam?.id)!==String(expectedTeams.home))
    || (expectedTeams?.away!=null && String(l.awayTeam?.id)!==String(expectedTeams.away)))
    return {rows:[],kind:null,injuries:[],managers:[],complete:false};
  const kind=String(l?.lineupType||"").trim().toLowerCase();
  const confirmed=["confirmed","official","actual"].includes(kind);
  const sourceName=confirmed?"FOTMOB_OFFICIAL":"FOTMOB_PREDICTED";
  const confidence=confirmed?.96:.82;
  // Cache reprocessing is not a new upstream observation.
  const fetchedAt=new Date(capturedAt).toISOString();
  const rows=[],injuries=[],managers=[];

  for(const [teamSide,team] of [["H",l?.homeTeam],["A",l?.awayTeam]]){
    const formation=team?.formation||null;
    const starters=Array.isArray(team?.starters)?team.starters:[];
    const subs=Array.isArray(team?.subs)?team.subs:[];

    for(const player of starters){
      const name=String(player?.name||"").trim(); if(!name)continue;
      const shirt=Number(player?.shirtNumber);
      rows.push({
        hkjc_event_id:eventId,team_side:teamSide,team_key:team?.id?String(team.id):null,
        player_key:player?.id?String(player.id):keyName(name),player_name:name,
        role:roleFromPlayer(player),starter:true,formation_slot:slotFromLayout(player),
        shirt_number:Number.isFinite(shirt)?shirt:null,confirmed,confidence,
        source_name:sourceName,source_url:`https://www.fotmob.com/match/${externalId}`,
        source_updated_at:null,fetched_at:fetchedAt,
        raw:{classification:confirmed?"CONFIRMED":"PREDICTED",squad_role:"STARTING_XI",lineupType:kind||null,formation,verticalLayout:player?.verticalLayout||null,positionId:player?.positionId??null},
        created_at:fetchedAt
      });
    }

    for(const player of subs){
      const name=String(player?.name||"").trim(); if(!name)continue;
      const shirt=Number(player?.shirtNumber);
      rows.push({
        hkjc_event_id:eventId,team_side:teamSide,team_key:team?.id?String(team.id):null,
        player_key:player?.id?String(player.id):keyName(name),player_name:name,
        role:roleFromPlayer(player),starter:false,formation_slot:null,
        shirt_number:Number.isFinite(shirt)?shirt:null,confirmed,confidence,
        source_name:sourceName,source_url:`https://www.fotmob.com/match/${externalId}`,
        source_updated_at:null,fetched_at:fetchedAt,
        raw:{classification:confirmed?"CONFIRMED":"PREDICTED",squad_role:"SUBSTITUTE",lineupType:kind||null,formation:null,verticalLayout:null,positionId:player?.positionId??null},
        created_at:fetchedAt
      });
    }

    const coach=team?.coach;
    if(coach?.name){
      managers.push({
        hkjc_event_id:eventId,team_side:teamSide,team_key:team?.id?String(team.id):null,
        manager_key:coach?.id?String(coach.id):keyName(coach.name),
        evidence_type:"MATCH_COACH",evidence_value:String(coach.name),confirmed:true,confidence:.95,
        source_name:"FOTMOB",source_url:`https://www.fotmob.com/match/${externalId}`,
        source_published_at:null,fetched_at:fetchedAt,
        raw:{manager_name:coach.name,country:coach?.countryName||null,country_code:coach?.countryCode||null,age:coach?.age??null,primary_team:coach?.primaryTeamName||null},
        created_at:fetchedAt
      });
    }

    for(const player of Array.isArray(team?.unavailable)?team.unavailable:[]){
      const name=String(player?.name||"").trim(); if(!name)continue;
      const u=player?.unavailability||{};
      injuries.push({
        hkjc_event_id:eventId,team_side:teamSide,team_key:team?.id?String(team.id):null,
        player_key:player?.id?String(player.id):keyName(name),
        status_type:String(u?.type||"unavailable").toUpperCase(),
        status_value:String(u?.expectedReturn||u?.reason||"Unavailable"),
        confirmed:true,confidence:.90,valid_from:fetchedAt,valid_until:null,
        source_name:"FOTMOB",source_url:`https://www.fotmob.com/match/${externalId}`,
        source_published_at:null,fetched_at:fetchedAt,
        raw:{player_name:name,unavailability:u,lineupType:kind||null},created_at:fetchedAt
      });
    }
  }

  const hStarters=rows.filter(x=>x.team_side==="H"&&x.starter);
  const aStarters=rows.filter(x=>x.team_side==="A"&&x.starter);
  const keys=rows.map(row=>row.player_key);
  const validRoster=keys.every(Boolean) && new Set(keys).size===keys.length
    && hStarters.length<=11 && aStarters.length<=11;
  const complete=validRoster && hStarters.length===11 && aStarters.length===11;
  const mappedSides=expectedTeams && ["home","away"].every(side=>
    ["string","number"].includes(typeof expectedTeams[side]) && String(expectedTeams[side]).trim()!==""
    && (typeof expectedTeams[side]!=="number" || (Number.isFinite(expectedTeams[side]) && expectedTeams[side]>0)));
  const partialOfficial=validRoster && confirmed && !complete && hStarters.length+aStarters.length>0
    && String(l.matchId)===String(externalId) && mappedSides;
  return {rows:complete||partialOfficial?rows:[],kind,injuries,managers,complete,partialOfficial};
}

Deno.serve(async ()=>{
  const url=Deno.env.get("SUPABASE_URL")||"",key=serviceKey();
  if(!url||!key)return Response.json({ok:false,error:"server_config_missing"},{status:500});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const now=Date.now(),fromIso=new Date(now-2*3600000).toISOString(),toIso=new Date(now+WINDOW_HOURS*3600000).toISOString();
  try{
    const [hkRes,shadowRes,aliasRes]=await Promise.all([
      db.from("hkjc_upcoming_current").select("hkjc_event_id,kickoff_hkt,home_en,away_en,home_zh,away_zh").gte("kickoff_hkt",fromIso).lte("kickoff_hkt",toIso),
      db.from("phase15_source_shadow_current").select("external_event_id,kickoff_utc,home_name,away_name,home_external_id,away_external_id,matched_hkjc_event_id,match_confidence,identity_status,detail_available,lineup_available,detail_raw,detail_fetched_at").eq("source_key",SOURCE).gte("kickoff_utc",fromIso).lte("kickoff_utc",toIso),
      db.from("team_aliases").select("source,alias,canonical_hkjc_name,confidence,status").eq("status","ACTIVE").gte("confidence",0.94)
    ]);
    if(hkRes.error)throw hkRes.error;if(shadowRes.error)throw shadowRes.error;if(aliasRes.error)throw aliasRes.error;
    const hk=hkRes.data||[],shadow=shadowRes.data||[];
    const aliasMap=new Map();
    for(const x of aliasRes.data||[]){
      const a=keyName(x.alias),c=keyName(x.canonical_hkjc_name);
      if(a&&c&&!aliasMap.has(a))aliasMap.set(a,c);
    }
    const canon=(k)=>aliasMap.get(k)||k;
    const ids=hk.map(x=>x.hkjc_event_id);
    const lineupRes=ids.length?await db.from("phase2_match_lineup_evidence").select("hkjc_event_id,team_side,starter,confirmed,source_name").in("hkjc_event_id",ids):{data:[],error:null};
    if(lineupRes.error)throw lineupRes.error;
    const state=new Map();
    for(const r of lineupRes.data||[]){
      const id=String(r.hkjc_event_id),source=String(r.source_name||"UNKNOWN");
      if(!state.has(id))state.set(id,new Map());
      const sm=state.get(id); if(!sm.has(source))sm.set(source,{h:0,a:0,confirmed:0});
      const s=sm.get(source); if(r.starter&&r.team_side==="H")s.h++;if(r.starter&&r.team_side==="A")s.a++;if(r.confirmed)s.confirmed++;
    }
    const lineupState=(id)=>{
      const m=state.get(String(id)); if(!m)return {full:false,confirmed:false};
      const groups=[...m.values()];
      return {
        full:groups.some(s=>s.h===11&&s.a===11),
        confirmed:groups.some(s=>s.h===11&&s.a===11&&s.confirmed>=22)
      };
    };

    // Reuse fresh cached FotMob details before spending any upstream requests.
    // This lets already-captured bench, coach and injury data flow into Phase 2 every run.
    let cachedLineupMatches=0,cachedLineupRows=0,cachedBenchRows=0,cachedManagerRows=0,cachedInjuryRows=0;
    const cachedLineups=[];
    const cachedManagers=[];
    const cachedInjuries=[];
    for(const s of shadow){
      if(!s.matched_hkjc_event_id||!s.detail_raw||!s.detail_fetched_at)continue;
      const ageMs=now-new Date(s.detail_fetched_at).getTime();
      if(!Number.isFinite(ageMs)||ageMs<0||ageMs>12*3600000)continue;
      const parsed=parseLineup(s.detail_raw,s.matched_hkjc_event_id,s.external_event_id,s.detail_fetched_at,{home:s.home_external_id,away:s.away_external_id});
      if(parsed.rows.length){
        cachedLineups.push(...parsed.rows);
        cachedLineupMatches++;
        cachedLineupRows+=parsed.rows.length;
        cachedBenchRows+=parsed.rows.filter(x=>!x.starter).length;
      }
      if(parsed.managers.length)cachedManagers.push(...parsed.managers);
      if(parsed.injuries.length)cachedInjuries.push(...parsed.injuries);
    }

    if(cachedLineups.length){
      const wr=await db.from("phase2_match_lineup_evidence").upsert(cachedLineups,{onConflict:"hkjc_event_id,team_side,source_name,player_key"});
      if(wr.error)throw wr.error;
    }

    if(cachedManagers.length){
      const managerIds=[...new Set(cachedManagers.map(x=>x.hkjc_event_id))];
      const delm=await db.from("phase2_manager_evidence").delete().in("hkjc_event_id",managerIds).eq("source_name","FOTMOB");
      if(delm.error)throw delm.error;
      const mr=await db.from("phase2_manager_evidence").insert(cachedManagers);
      if(mr.error)throw mr.error;
      cachedManagerRows=cachedManagers.length;
    }

    if(cachedInjuries.length){
      const injuryIds=[...new Set(cachedInjuries.map(x=>x.hkjc_event_id))];
      const ex=await db.from("phase2_player_status_evidence")
        .select("hkjc_event_id,player_key,status_type")
        .in("hkjc_event_id",injuryIds)
        .eq("source_name","FOTMOB");
      if(ex.error)throw ex.error;
      const known=new Set((ex.data||[]).map(x=>String(x.hkjc_event_id)+"|"+String(x.player_key)+"|"+String(x.status_type)));
      const missing=cachedInjuries.filter(x=>!known.has(String(x.hkjc_event_id)+"|"+String(x.player_key)+"|"+String(x.status_type)));
      if(missing.length){
        const ir=await db.from("phase2_player_status_evidence").insert(missing);
        if(ir.error)throw ir.error;
        cachedInjuryRows=missing.length;
      }
    }
    const matched=[];
    const aliasLearns=[];
    for(const h of hk){
      const best=bestIdentity(h,shadow,canon); if(!best)continue;
      matched.push({h,best});
      if(best.conf>=.96){
        for(const [alias,canonical] of [[best.row.home_name,h.home_en],[best.row.away_name,h.away_en]]){
          if(alias&&canonical&&!aliasMap.has(keyName(alias)))aliasLearns.push({source:SOURCE,alias,canonical_hkjc_name:canonical,confidence:best.conf,first_seen_hkt:new Date().toISOString(),last_seen_hkt:new Date().toISOString(),match_count:1,status:"ACTIVE",alias_source:"PHASE2_FOTMOB_AUTO",updated_at:new Date().toISOString()});
        }
      }
    }
    if(aliasLearns.length){
      const uniq=new Map();for(const x of aliasLearns)uniq.set(x.source+"|"+x.alias,x);
      const up=await db.from("team_aliases").upsert([...uniq.values()],{onConflict:"source,alias",ignoreDuplicates:true});
      if(up.error)console.warn("alias_learn_failed",up.error.message);
    }
    const priority=(x)=>{
      const ko=new Date(x.h.kickoff_hkt).getTime(),st=lineupState(x.h.hkjc_event_id);
      if(st.confirmed)return 99;
      if(!st.full && ko<=now+6*3600000)return 0;
      if(st.full && ko<=now+90*60000)return 1;
      if(!st.full)return 2;
      return 3;
    };
    matched.sort((a,b)=>{
      const pa=priority(a),pb=priority(b); if(pa!==pb)return pa-pb;
      const ak=new Date(a.h.kickoff_hkt).getTime(),bk=new Date(b.h.kickoff_hkt).getTime();
      return Math.abs(ak-now)-Math.abs(bk-now);
    });
    const picked=matched.filter(x=>priority(x)<99).slice(0,MAX_DETAIL);
    let detailOk=0,detailFail=0,lineupFound=0,promotedMatches=0,promotedRows=0,benchRows=0,predictedMatches=0,confirmedMatches=0,injuryRows=0,managerRows=0,managerMatches=0,identityWrites=0;
    await mapLimit(picked,DETAIL_CONCURRENCY,async(target)=>{
    const {h,best}=target;
    try{
      const d=await fetchDetail(best.row.external_event_id);
      const capturedAt=new Date().toISOString();
      const parsed=parseLineup(d,h.hkjc_event_id,best.row.external_event_id,capturedAt,{home:best.row.home_external_id,away:best.row.away_external_id});
      const upd=await db.from("phase15_source_shadow_current").update({
        matched_hkjc_event_id:h.hkjc_event_id,match_confidence:best.conf,identity_status:best.identity,
        detail_available:true,lineup_available:parsed.complete,
        detail_fetched_at:capturedAt,detail_raw:d,updated_at:new Date().toISOString()
      }).eq("source_key",SOURCE).eq("external_event_id",best.row.external_event_id);
      if(upd.error)throw upd.error;identityWrites++;
      detailOk++;
      if(parsed.rows.length){
        lineupFound++;
        const wr=await db.from("phase2_match_lineup_evidence").upsert(parsed.rows,{onConflict:"hkjc_event_id,team_side,source_name,player_key"});
        if(wr.error)throw wr.error;
        promotedMatches++;
        promotedRows+=parsed.rows.length;
        benchRows+=parsed.rows.filter(x=>!x.starter).length;
        if(parsed.rows[0]?.confirmed)confirmedMatches++;else predictedMatches++;
      }

      if(parsed.managers.length){
        const delm=await db.from("phase2_manager_evidence").delete()
          .eq("hkjc_event_id",h.hkjc_event_id)
          .eq("source_name","FOTMOB");
        if(delm.error)throw delm.error;
        const mr=await db.from("phase2_manager_evidence").insert(parsed.managers);
        if(mr.error)throw mr.error;
        managerRows+=parsed.managers.length;managerMatches++;
      }
      if(parsed.injuries.length){
        const ex=await db.from("phase2_player_status_evidence").select("player_key,status_type").eq("hkjc_event_id",h.hkjc_event_id).eq("source_name","FOTMOB");
        const known=new Set((ex.data||[]).map(x=>String(x.player_key)+"|"+String(x.status_type)));
        const missing=parsed.injuries.filter(x=>!known.has(String(x.player_key)+"|"+String(x.status_type)));
        if(missing.length){
          const ir=await db.from("phase2_player_status_evidence").insert(missing);
          if(!ir.error)injuryRows+=missing.length;
        }
      }
    }catch(e){detailFail++;console.warn("detail_fail",h.hkjc_event_id,String(e));}

    });
    const health={matched:matched.length,picked:picked.length,detailOk,detailFail,lineupFound,promotedMatches,promotedRows,benchRows,predictedMatches,confirmedMatches,injuryRows,managerRows,managerMatches,identityWrites,cachedLineupMatches,cachedLineupRows,cachedBenchRows,cachedManagerRows,cachedInjuryRows};
    await db.from("source_health").upsert({
      source:"PHASE2_FOTMOB_LINEUPS",metric:"30m",value_text:JSON.stringify(health),
      status:detailFail===0?"OK":detailOk>0?"WARN":"FAIL",
      notes:"Phase 1 HKJC identity -> FotMob near-kickoff XI + bench + coach + unavailable players -> Phase 2.",
      observed_at:new Date().toISOString(),raw:health
    },{onConflict:"source,metric"});
    return Response.json({ok:true,...health});
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    return Response.json({ok:false,error:message},{status:500});
  }
});