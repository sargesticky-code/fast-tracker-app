import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const SOURCE="FOTMOB";
const MAX_DETAIL=16;
const DETAIL_TIMEOUT_MS=5_000;
const DETAIL_CONCURRENCY=3;
const WINDOW_HOURS=24;
const MAX_PLAYER_PROFILES=48;
const PLAYER_PROFILE_CONCURRENCY=3;

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
async function fetchPlayerProfile(id){
  const urls=[
    `https://www.fotmob.com/api/data/playerData?id=${encodeURIComponent(id)}`,
    `https://www.fotmob.com/api/playerData?id=${encodeURIComponent(id)}`
  ];
  let last="";
  for(const u of urls){try{return await getJson(u)}catch(e){last=String(e)}}
  throw new Error(last||"player_profile_failed");
}
function infoValue(profile,key){
  const rows=Array.isArray(profile?.playerInformation)?profile.playerInformation:[];
  const row=rows.find((x:any)=>String(x?.translationKey||x?.title||"").toLowerCase().includes(String(key).toLowerCase()));
  const v=row?.value;
  if(v==null)return null;
  if(typeof v==="string"||typeof v==="number")return String(v);
  return v?.fallback??v?.value??v?.text??null;
}
function recentPlayerSummary(profile){
  const rows=Array.isArray(profile?.recentMatches)?profile.recentMatches:
    Array.isArray(profile?.recentMatchHistory)?profile.recentMatchHistory:
    Array.isArray(profile?.lastMatches)?profile.lastMatches:[];
  const normalized=rows.slice(0,8).map((m:any)=>({
    matchId:m?.matchId??m?.id??null,
    date:m?.date?.utcTime??m?.date??m?.startDate??null,
    opponent:m?.opponent?.name??m?.opponentName??m?.away?.name??m?.home?.name??null,
    rating:Number.isFinite(Number(m?.rating??m?.performance?.rating))?Number(m?.rating??m?.performance?.rating):null,
    minutes:Number.isFinite(Number(m?.minutesPlayed??m?.minutes))?Number(m?.minutesPlayed??m?.minutes):null,
    goals:Number.isFinite(Number(m?.goals))?Number(m?.goals):null,
    assists:Number.isFinite(Number(m?.assists))?Number(m?.assists):null
  }));
  const ratings=normalized.map((m:any)=>m.rating).filter((x:any)=>Number.isFinite(x));
  return {
    matches:normalized,
    averageRating:ratings.length?Number((ratings.reduce((a:number,b:number)=>a+b,0)/ratings.length).toFixed(2)):null,
    ratedMatches:ratings.length
  };
}
function compactPlayerProfile(profile){
  const recent=recentPlayerSummary(profile);
  return {
    fotmobId:profile?.id??null,
    name:profile?.name??null,
    photo:profile?.imageUrl??profile?.photo??null,
    primaryTeam:profile?.primaryTeam??null,
    position:profile?.position??profile?.positionDescription??profile?.positionRow??null,
    country:infoValue(profile,"country"),
    height:infoValue(profile,"height"),
    age:profile?.age??infoValue(profile,"age")??null,
    birthDate:profile?.birthDate?.utcTime??profile?.birthDate??null,
    marketValue:profile?.marketValue??profile?.marketValues?.[0]??null,
    injuryInformation:profile?.injuryInformation??null,
    traits:profile?.traits??null,
    statSeasons:profile?.statSeasons??null,
    recent,
    nextMatch:profile?.nextMatch??null
  };
}
function parseLineup(detail,eventId,externalId){
  const l=detail?.content?.lineup;
  if(!l)return {rows:[],kind:null,injuries:[],managers:[],complete:false};
  const kind=String(l?.lineupType||"").toLowerCase();
  const explicitConfirmed=["confirmed","official","actual"].some(x=>kind.includes(x));
  const matchStarted=Boolean(detail?.header?.status?.started||detail?.header?.status?.finished);
  const playerStats=detail?.content?.playerStats;
  const hasPerformanceEvidence=Boolean(
    playerStats && typeof playerStats==="object" &&
    Object.values(playerStats).some((p:any)=>Array.isArray(p?.stats)&&p.stats.length>0)
  );
  const confirmed=explicitConfirmed||(matchStarted&&hasPerformanceEvidence);
  const sourceName=confirmed?"FOTMOB_OFFICIAL":"FOTMOB_PREDICTED";
  const confidence=confirmed?.98:.82;
  const fetchedAt=new Date().toISOString();
  const rows=[],injuries=[],managers=[];

  for(const [teamSide,team] of [["H",l?.homeTeam],["A",l?.awayTeam]]){
    const formation=team?.formation||null;
    const starters=Array.isArray(team?.starters)?team.starters:[];
    const subs=Array.isArray(team?.subs)?team.subs:[];

    for(const player of starters){
      const name=String(player?.name||"").trim(); if(!name)continue;
      const shirt=Number(player?.shirtNumber);
      rows.push({
        match_id:eventId,team_side:teamSide,team_key:team?.id?String(team.id):null,
        player_key:player?.id?String(player.id):keyName(name),player_name:name,
        role:roleFromPlayer(player),starter:true,formation_slot:slotFromLayout(player),
        shirt_number:Number.isFinite(shirt)?shirt:null,confirmed,confidence,
        source_name:sourceName,source_url:`https://www.fotmob.com/match/${externalId}`,
        source_updated_at:fetchedAt,fetched_at:fetchedAt,
        raw:{classification:confirmed?"CONFIRMED":"PREDICTED",squad_role:"STARTING_XI",lineupType:kind||null,formation,verticalLayout:player?.verticalLayout||null,positionId:player?.positionId??null,statistics:player?.stats??player?.statistics??null,rating:player?.rating??player?.stats?.rating??player?.statistics?.rating??null},
        created_at:fetchedAt
      });
    }

    for(const player of subs){
      const name=String(player?.name||"").trim(); if(!name)continue;
      const shirt=Number(player?.shirtNumber);
      rows.push({
        match_id:eventId,team_side:teamSide,team_key:team?.id?String(team.id):null,
        player_key:player?.id?String(player.id):keyName(name),player_name:name,
        role:roleFromPlayer(player),starter:false,formation_slot:null,
        shirt_number:Number.isFinite(shirt)?shirt:null,confirmed,confidence,
        source_name:sourceName,source_url:`https://www.fotmob.com/match/${externalId}`,
        source_updated_at:fetchedAt,fetched_at:fetchedAt,
        raw:{classification:confirmed?"CONFIRMED":"PREDICTED",squad_role:"SUBSTITUTE",lineupType:kind||null,formation:null,verticalLayout:null,positionId:player?.positionId??null,statistics:player?.stats??player?.statistics??null,rating:player?.rating??player?.stats?.rating??player?.statistics?.rating??null},
        created_at:fetchedAt
      });
    }

    const coach=team?.coach;
    if(coach?.name){
      managers.push({
        match_id:eventId,team_side:teamSide,team_key:team?.id?String(team.id):null,
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
        match_id:eventId,team_side:teamSide,team_key:team?.id?String(team.id):null,
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
  const complete=hStarters.length===11&&aStarters.length===11;
  return {rows:complete?rows:[],kind,injuries,managers,complete};
}

Deno.serve(async (req:Request)=>{
  const requestUrl=new URL(req.url);
  const profilesOnly=requestUrl.searchParams.get("profilesOnly")==="1";
  const requestedMatchId=String(requestUrl.searchParams.get("matchId")||"").trim();
  const url=Deno.env.get("SUPABASE_URL")||"",key=serviceKey();
  if(!url||!key)return Response.json({ok:false,error:"server_config_missing"},{status:500});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const now=Date.now(),fromIso=new Date(now-4*3600000).toISOString(),toIso=new Date(now+WINDOW_HOURS*3600000).toISOString();
  try{
    const [fixtureRes,shadowRes,aliasRes]=await Promise.all([
      db.from("canonical_fixture_current").select("match_id,kickoff_hkt,home_en,away_en,home_zh,away_zh").gte("kickoff_hkt",fromIso).lte("kickoff_hkt",toIso),
      db.from("source_shadow_current").select("external_event_id,kickoff_utc,home_name,away_name,home_external_id,away_external_id,match_id,match_confidence,identity_status,detail_available,lineup_available,detail_raw,detail_fetched_at").eq("source_key",SOURCE).gte("kickoff_utc",fromIso).lte("kickoff_utc",toIso),
      db.from("team_alias_current").select("source,alias,canonical_name,confidence,status").eq("status","ACTIVE").gte("confidence",0.94)
    ]);
    if(fixtureRes.error)throw fixtureRes.error;if(shadowRes.error)throw shadowRes.error;if(aliasRes.error)throw aliasRes.error;
    const fixtures=[...(fixtureRes.data||[])],shadow=shadowRes.data||[];
    const fixtureIds=new Set(fixtures.map((x:any)=>String(x.match_id)));
    for(const s of shadow){
      const matchId=String(s?.match_id||"");
      const kickoffMs=new Date(s?.kickoff_utc||"").getTime();
      if(!matchId||fixtureIds.has(matchId)||!Number.isFinite(kickoffMs))continue;
      if(kickoffMs>now||kickoffMs<now-4*3600000)continue;
      fixtures.push({
        match_id:matchId,
        kickoff_hkt:s.kickoff_utc,
        home_en:s.home_name,
        away_en:s.away_name,
        home_zh:null,
        away_zh:null
      });
      fixtureIds.add(matchId);
    }
    if(requestedMatchId){
      for(let i=fixtures.length-1;i>=0;i--){
        if(String(fixtures[i]?.match_id||"")!==requestedMatchId)fixtures.splice(i,1);
      }
    }
    const aliasMap=new Map();
    for(const x of aliasRes.data||[]){
      const a=keyName(x.alias),c=keyName(x.canonical_name);
      if(a&&c&&!aliasMap.has(a))aliasMap.set(a,c);
    }
    const canon=(k)=>aliasMap.get(k)||k;
    const ids=fixtures.map(x=>x.match_id);
    const lineupRes=ids.length?await db.from("lineup_evidence_current").select("match_id,team_side,starter,confirmed,source_name").in("match_id",ids):{data:[],error:null};
    if(lineupRes.error)throw lineupRes.error;
    const state=new Map();
    for(const r of lineupRes.data||[]){
      const id=String(r.match_id),source=String(r.source_name||"UNKNOWN");
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
      if(!s.match_id||!s.detail_raw||!s.detail_fetched_at)continue;
      const ageMs=now-new Date(s.detail_fetched_at).getTime();
      if(!Number.isFinite(ageMs)||ageMs<0||ageMs>12*3600000)continue;
      const parsed=parseLineup(s.detail_raw,s.match_id,s.external_event_id);
      if(parsed.complete&&parsed.rows.length>=22){
        cachedLineups.push(...parsed.rows);
        cachedLineupMatches++;
        cachedLineupRows+=parsed.rows.length;
        cachedBenchRows+=parsed.rows.filter(x=>!x.starter).length;
      }
      if(parsed.managers.length)cachedManagers.push(...parsed.managers);
      if(parsed.injuries.length)cachedInjuries.push(...parsed.injuries);
    }

    if(cachedLineups.length){
      const cachedIds=[...new Set(cachedLineups.map(x=>x.match_id))];
      const del=await db.from("lineup_evidence_current").delete()
        .in("match_id",cachedIds)
        .in("source_name",["FOTMOB_OFFICIAL","FOTMOB_PREDICTED"]);
      if(del.error)throw del.error;
      const wr=await db.from("lineup_evidence_current").insert(cachedLineups);
      if(wr.error)throw wr.error;
    }

    if(cachedManagers.length){
      const managerIds=[...new Set(cachedManagers.map(x=>x.match_id))];
      const delm=await db.from("manager_evidence_current").delete().in("match_id",managerIds).eq("source_name","FOTMOB");
      if(delm.error)throw delm.error;
      const mr=await db.from("manager_evidence_current").insert(cachedManagers);
      if(mr.error)throw mr.error;
      cachedManagerRows=cachedManagers.length;
    }

    if(cachedInjuries.length){
      const injuryIds=[...new Set(cachedInjuries.map(x=>x.match_id))];
      const ex=await db.from("player_status_evidence_current")
        .select("match_id,player_key,status_type")
        .in("match_id",injuryIds)
        .eq("source_name","FOTMOB");
      if(ex.error)throw ex.error;
      const known=new Set((ex.data||[]).map(x=>String(x.match_id)+"|"+String(x.player_key)+"|"+String(x.status_type)));
      const missing=cachedInjuries.filter(x=>!known.has(String(x.match_id)+"|"+String(x.player_key)+"|"+String(x.status_type)));
      if(missing.length){
        const ir=await db.from("player_status_evidence_current").insert(missing);
        if(ir.error)throw ir.error;
        cachedInjuryRows=missing.length;
      }
    }
    const matched=[];
    const aliasLearns=[];
    for(const h of fixtures){
      const best=bestIdentity(h,shadow,canon); if(!best)continue;
      matched.push({h,best});
      if(best.conf>=.96){
        for(const [alias,canonical] of [[best.row.home_name,h.home_en],[best.row.away_name,h.away_en]]){
          if(alias&&canonical&&!aliasMap.has(keyName(alias)))aliasLearns.push({source:SOURCE,alias,canonical_name:canonical,confidence:best.conf,first_seen_hkt:new Date().toISOString(),last_seen_hkt:new Date().toISOString(),match_count:1,status:"ACTIVE",alias_source:"PHASE2_FOTMOB_AUTO",updated_at:new Date().toISOString()});
        }
      }
    }
    if(aliasLearns.length){
      const uniq=new Map();for(const x of aliasLearns)uniq.set(x.source+"|"+x.alias,x);
      const up=await db.rpc("ft_upsert_team_aliases_generic",{rows:[...uniq.values()]});
      if(up.error)console.warn("alias_learn_failed",up.error.message);
    }
    const priority=(x)=>{
      const ko=new Date(x.h.kickoff_hkt).getTime(),st=lineupState(x.h.match_id);
      if(st.confirmed)return 99;
      if(ko<=now && ko>=now-4*3600000)return 0;
      if(!st.full && ko<=now+6*3600000)return 1;
      if(st.full && ko<=now+90*60000)return 2;
      if(!st.full)return 3;
      return 4;
    };
    matched.sort((a,b)=>{
      const pa=priority(a),pb=priority(b); if(pa!==pb)return pa-pb;
      const ak=new Date(a.h.kickoff_hkt).getTime(),bk=new Date(b.h.kickoff_hkt).getTime();
      return Math.abs(ak-now)-Math.abs(bk-now);
    });
    const picked=profilesOnly?[]:matched.filter(x=>priority(x)<99).slice(0,MAX_DETAIL);
    let detailOk=0,detailFail=0,lineupFound=0,promotedMatches=0,promotedRows=0,benchRows=0,predictedMatches=0,confirmedMatches=0,injuryRows=0,managerRows=0,managerMatches=0,identityWrites=0,playerProfilesFetched=0,playerProfilesFailed=0,playerProfilesWritten=0;
    await mapLimit(picked,DETAIL_CONCURRENCY,async(target)=>{
    const {h,best}=target;
    try{
      const d=await fetchDetail(best.row.external_event_id);
      const parsed=parseLineup(d,h.match_id,best.row.external_event_id);
      const upd=await db.from("source_shadow_current").update({
        match_id:h.match_id,match_confidence:best.conf,identity_status:best.identity,
        detail_available:true,lineup_available:parsed.complete,
        detail_fetched_at:new Date().toISOString(),detail_raw:d,updated_at:new Date().toISOString()
      }).eq("source_key",SOURCE).eq("external_event_id",best.row.external_event_id);
      if(upd.error)throw upd.error;identityWrites++;
      detailOk++;
      if(parsed.complete&&parsed.rows.length>=22){
        lineupFound++;
        const detailSources=[...new Set(parsed.rows.map(x=>x.source_name))];
        const del=await db.from("lineup_evidence_current").delete()
          .eq("match_id",h.match_id)
          .in("source_name",detailSources);
        if(del.error)throw del.error;
        const wr=await db.from("lineup_evidence_current").insert(parsed.rows);
        if(wr.error)throw wr.error;
        promotedMatches++;
        promotedRows+=parsed.rows.length;
        benchRows+=parsed.rows.filter(x=>!x.starter).length;
        if(parsed.rows[0]?.confirmed)confirmedMatches++;else predictedMatches++;
      }

      if(parsed.managers.length){
        const delm=await db.from("manager_evidence_current").delete()
          .eq("match_id",h.match_id)
          .eq("source_name","FOTMOB");
        if(delm.error)throw delm.error;
        const mr=await db.from("manager_evidence_current").insert(parsed.managers);
        if(mr.error)throw mr.error;
        managerRows+=parsed.managers.length;managerMatches++;
      }
      if(parsed.injuries.length){
        const ex=await db.from("player_status_evidence_current").select("player_key,status_type").eq("match_id",h.match_id).eq("source_name","FOTMOB");
        const known=new Set((ex.data||[]).map(x=>String(x.player_key)+"|"+String(x.status_type)));
        const missing=parsed.injuries.filter(x=>!known.has(String(x.player_key)+"|"+String(x.status_type)));
        if(missing.length){
          const ir=await db.from("player_status_evidence_current").insert(missing);
          if(!ir.error)injuryRows+=missing.length;
        }
      }
    }catch(e){detailFail++;console.warn("detail_fail",h.match_id,String(e));}

    });
    const profileCandidates=(await db.from("lineup_evidence_current")
      .select("player_key,player_name,team_key,role,starter,confirmed,source_name,source_updated_at")
      .in("match_id",ids)
      .in("source_name",["FOTMOB_OFFICIAL","FOTMOB_PREDICTED"])
      .order("starter",{ascending:false})
      .order("source_updated_at",{ascending:false})
      .limit(2000)).data||[];
    const uniqueProfiles=new Map();
    for(const row of profileCandidates){
      const id=String(row.player_key||"");
      if(!/^\d+$/.test(id)||uniqueProfiles.has(id))continue;
      uniqueProfiles.set(id,row);
    }
    const playerKeys=[...uniqueProfiles.keys()];
    const existingProfileRows:any[]=[];
    for(let offset=0;offset<playerKeys.length;offset+=400){
      const chunk=playerKeys.slice(offset,offset+400);
      if(!chunk.length)continue;
      const rr=await db.from("phase2_players")
        .select("player_key,source_updated_at,profile")
        .in("player_key",chunk);
      if(rr.error)console.warn("player_profile_cache_read_failed",rr.error.message);
      else existingProfileRows.push(...(rr.data||[]));
    }
    const cachedByKey=new Map(existingProfileRows.map((r:any)=>[String(r.player_key),r]));
    const staleBefore=Date.now()-24*3600000;
    const profileTargets=[...uniqueProfiles.entries()]
      .map(([id,row]:any)=>{
        const current:any=cachedByKey.get(id);
        const ts=current?.source_updated_at?new Date(current.source_updated_at).getTime():0;
        const missing=!current?.profile;
        const stale=!Number.isFinite(ts)||ts<staleBefore;
        return {id,row,missing,stale,ts};
      })
      .filter((x:any)=>x.missing||x.stale)
      .sort((a:any,b:any)=>{
        if(a.missing!==b.missing)return a.missing?-1:1;
        const aOfficialMissing=a.missing && a.row?.confirmed===true && String(a.row?.source_name||"").toUpperCase()==="FOTMOB_OFFICIAL";
        const bOfficialMissing=b.missing && b.row?.confirmed===true && String(b.row?.source_name||"").toUpperCase()==="FOTMOB_OFFICIAL";
        if(aOfficialMissing!==bOfficialMissing)return aOfficialMissing?-1:1;
        if(Boolean(a.row?.starter)!==Boolean(b.row?.starter))return a.row?.starter?-1:1;
        return a.ts-b.ts;
      })
      .slice(0,MAX_PLAYER_PROFILES)
      .map((x:any)=>[x.id,x.row]);
    await mapLimit(profileTargets,PLAYER_PROFILE_CONCURRENCY,async([id,row]:any)=>{
      try{
        const profile=await fetchPlayerProfile(id);
        playerProfilesFetched++;
        const compact=compactPlayerProfile(profile);
        const primaryTeam=profile?.primaryTeam||{};
        const position=compact?.position?.primaryPosition?.label
          || profile?.position?.primaryPosition?.label
          || profile?.positionDescription?.positions?.find((p:any)=>p?.isMainPosition)?.strPos?.label
          || profile?.positionDescription?.positions?.[0]?.strPos?.label
          || (typeof profile?.position==="string"?profile.position:null)
          || profile?.primaryTeam?.role
          || row?.role
          || null;
        const nationality=compact.country||null;
        const dateOfBirth=compact.birthDate&&/^\d{4}-\d{2}-\d{2}/.test(String(compact.birthDate))
          ? String(compact.birthDate).slice(0,10):null;
        const wr=await db.from("phase2_players").upsert({
          player_key:String(id),
          canonical_name:String(profile?.name||row?.player_name||id),
          team_key:String(primaryTeam?.teamId??row?.team_key??"")||null,
          team_name:primaryTeam?.teamName??null,
          position,
          nationality,
          date_of_birth:dateOfBirth,
          source_ids:{fotmob:Number(id)},
          profile:compact,
          source_updated_at:new Date().toISOString(),
          updated_at:new Date().toISOString()
        },{onConflict:"player_key"});
        if(wr.error)throw wr.error;
        playerProfilesWritten++;
      }catch(e){
        playerProfilesFailed++;
        console.warn("player_profile_fail",id,String(e));
      }
    });

    const health={profilesOnly,requestedMatchId:requestedMatchId||null,matched:matched.length,picked:picked.length,detailOk,detailFail,lineupFound,promotedMatches,promotedRows,benchRows,predictedMatches,confirmedMatches,injuryRows,managerRows,managerMatches,identityWrites,playerProfilesFetched,playerProfilesFailed,playerProfilesWritten,cachedLineupMatches,cachedLineupRows,cachedBenchRows,cachedManagerRows,cachedInjuryRows};
    await db.from("source_health").upsert({
      source:"PHASE2_FOTMOB_LINEUPS",metric:"30m",value_text:JSON.stringify(health),
      status:detailFail===0?"OK":detailOk>0?"WARN":"FAIL",
      notes:"Canonical fixture identity -> FotMob near-kickoff XI + bench + coach + player profiles + unavailable players -> Phase 2.",
      observed_at:new Date().toISOString(),raw:health
    },{onConflict:"source,metric"});
    return Response.json({ok:true,...health});
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    return Response.json({ok:false,error:message},{status:500});
  }
});