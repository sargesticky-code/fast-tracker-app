import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"GET, OPTIONS",
};

const DB_READ_TIMEOUT_MS = 15_000;
const UPSTREAM_READ_TIMEOUT_MS = 45_000;
function boundedDbFetch(input:any, init:any = {}) {
  return fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(DB_READ_TIMEOUT_MS) });
}
function createReadClient(url:string, key:string) {
  return createClient(url, key, {
    auth: { persistSession:false, autoRefreshToken:false },
    db: { retry:false },
    global: { fetch: boundedDbFetch },
  });
}
function createReadClientWithTimeout(url:string,key:string,timeoutMs:number){
  return createClient(url,key,{
    auth:{persistSession:false,autoRefreshToken:false},
    db:{retry:false},
    global:{fetch:(input:any,init:any={})=>fetch(input,{...init,signal:init?.signal??AbortSignal.timeout(timeoutMs)})},
  });
}


function serverKey(){
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(legacy) return legacy;
  const modern=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(modern){try{const j=JSON.parse(modern);if(j?.default)return j.default;}catch{}}
  return "";
}
function cleanError(e:any){return e?{code:e.code||null,message:e.message||String(e)}:null;}

function normalizedSide(value:any){
  const side=String(value||"").trim().toUpperCase();
  if(side==="H"||side==="HOME") return "H";
  if(side==="A"||side==="AWAY") return "A";
  return null;
}
function compactToken(value:any){
  return String(value||"").trim().toLowerCase().replace(/\s+/g," ").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}
function evidenceKey(table:string,row:any){
  const id=String(row?.id??"").trim();
  return id ? `${table}:${id}` : `${table}:${String(row?.hkjc_event_id||"unknown")}:${compactToken(row?.player_key||row?.player_name||"unknown")}`;
}
function playerClaimFingerprint(row:any,canonicalIdentity:string|null){
  return [
    String(row?.hkjc_event_id||""),
    normalizedSide(row?.team_side)||"?",
    canonicalIdentity || "UNRESOLVED:" + compactToken(row?.player_name||row?.raw?.player?.name||row?.raw?.player_name||row?.player_key||"unknown"),
    compactToken(row?.status_type),
    compactToken(row?.status_value),
  ].join("|");
}
function annotatePlayerEvidence(row:any,canonicalPlayers:Map<string,{canonicalName:string,teamKey:string,position:string|null,nationality:string|null,dateOfBirth:string|null,profile:any,sourceUpdatedAt:string|null}>,table:string){
  const playerKey=String(row?.player_key||"").trim();
  const side=normalizedSide(row?.team_side);
  const canonicalPlayer=playerKey ? canonicalPlayers.get(playerKey) : null;
  const canonical=Boolean(canonicalPlayer);
  const canonicalIdentity=canonicalPlayer
    ? compactToken(canonicalPlayer.teamKey) + ":" + compactToken(canonicalPlayer.canonicalName)
    : null;
  const sourceConfirmed=row?.confirmed===true;
  const identityStatus=canonical?"CANONICAL":"UNRESOLVED";
  const factStatus=sourceConfirmed&&canonical
    ?"CONFIRMED"
    : sourceConfirmed
      ?"SOURCE_CONFIRMED_IDENTITY_UNRESOLVED"
      :"UNCONFIRMED";
  return {
    ...row,
    team_side:side||row?.team_side||null,
    evidence_key:evidenceKey(table,row),
    source_link:row?.source_url||null,
    identity_status:identityStatus,
    canonical_player_identity:canonicalIdentity,
    canonical_position:canonicalPlayer?.position ?? null,
    canonical_nationality:canonicalPlayer?.nationality ?? null,
    canonical_date_of_birth:canonicalPlayer?.dateOfBirth ?? null,
    canonical_profile:canonicalPlayer?.profile ?? null,
    canonical_profile_updated_at:canonicalPlayer?.sourceUpdatedAt ?? null,
    fact_status:factStatus,
    record_group:playerClaimFingerprint(row,canonicalIdentity),
  };
}
function forebetEvidenceFallback(rows:any[]){
  const evidence=Array.isArray(rows)?rows:[];
  const byMarket=(market:string)=>evidence.find((r:any)=>String(r?.source_key||"").toUpperCase()==="FOREBET" && String(r?.market_key||"").toUpperCase()===market) || null;
  const hda=byMarket("1X2"), ou=byMarket("OU25"), corners=byMarket("CORNERS95");
  if(!hda && !ou && !corners) return null;
  const timestamps=[hda?.source_updated_at,ou?.source_updated_at,corners?.source_updated_at,hda?.updated_at,ou?.updated_at,corners?.updated_at]
    .filter(Boolean).map((v:any)=>new Date(v).getTime()).filter((v:number)=>Number.isFinite(v));
  return {
    source:"PREDICTION_EVIDENCE_CURRENT",
    source_key:"FOREBET",
    source_updated_at:timestamps.length?new Date(Math.max(...timestamps)).toISOString():null,
    status:hda?.status ?? ou?.status ?? corners?.status ?? null,
    pick:hda?.pick ?? null,
    predicted_score:hda?.predicted_score ?? null,
    prob_home:hda?.prob_home ?? null,
    prob_draw:hda?.prob_draw ?? null,
    prob_away:hda?.prob_away ?? null,
    prob_over25:ou?.prob_over ?? null,
    prob_under25:ou?.prob_under ?? null,
    avg_goals:ou?.avg_goals ?? null,
    corner_prob_over95:corners?.prob_over ?? null,
    corner_prob_under95:corners?.prob_under ?? null,
    avg_corners:corners?.avg_corners ?? null,
    confidence:hda?.confidence ?? ou?.confidence ?? corners?.confidence ?? null,
    evidence_keys:[hda&&"FOREBET:1X2",ou&&"FOREBET:OU25",corners&&"FOREBET:CORNERS95"].filter(Boolean),
    forebet_detail_url:null,
  };
}

async function readSummaryFixture(sbUrl:string,id:string){
  const res=await fetch(`${sbUrl}/functions/v1/app-phase1-feed?hours=48&view=summary`,{
    signal:AbortSignal.timeout(10_000),
  });
  if(!res.ok) return null;
  const body=await res.json();
  const m=Array.isArray(body?.matches)?body.matches.find((x:any)=>String(x?.id||"")===id):null;
  if(!m) return null;
  return {
    hkjc_event_id:id,
    kickoff_hkt:m?.kickoff??null,
    status:m?.status??null,
    tournament:m?.league??null,
    tournament_zh:m?.leagueZh??null,
    home_en:m?.home??null,
    away_en:m?.away??null,
    home_zh:m?.homeZh??null,
    away_zh:m?.awayZh??null,
    live_eligible:Boolean(m?.liveEligible||m?.liveNow),
    selling:true,
    pool_status:m?.live?.poolStatus??null,
    had_home:m?.odds?.home??null,
    had_draw:m?.odds?.draw??null,
    had_away:m?.odds?.away??null,
    hdc_line:m?.handicap?.line??null,
    hdc_home:m?.handicap?.home??null,
    hdc_away:m?.handicap?.away??null,
    hil_line:m?.goals?.line??null,
    hil_over:m?.goals?.over??null,
    hil_under:m?.goals?.under??null,
    chl_line:m?.corners?.line??null,
    chl_over:m?.corners?.over??null,
    chl_under:m?.corners?.under??null,
    fetched_at:m?.health?.authorityFetchedAt??m?.updatedAt??null,
    odds_updated_at:m?.health?.priceChangedAt??m?.live?.oddsUpdatedAt??null,
    authority_source:"APP_PHASE1_SUMMARY",
    live_now:Boolean(m?.liveNow),
  };
}

function sanitizePublicLegacy(value:any):any{
  if(Array.isArray(value))return value.map(sanitizePublicLegacy);
  if(!value||typeof value!=="object"){
    if(typeof value==="string"){
      if(value==="HKJC_RESULTS")return "VERIFIED_RESULTS";
      if(value==="HKJC_TEAM_FORM")return "VERIFIED_RESULTS_TEAM_FORM";
      if(value==="HKJC_RUNNING_RESULT")return "LEGACY_RETIRED";
    }
    return value;
  }
  const out:any={};
  for(const [key,raw] of Object.entries(value)){
    if(key==="hkjc_event_id"){
      if(out.match_id==null)out.match_id=sanitizePublicLegacy(raw);
      continue;
    }
    if(/^hkjc_/i.test(key))continue;
    out[key]=sanitizePublicLegacy(raw);
  }
  return out;
}

function compactFotmobPlayerMatchStats(detailRaw:any){
  const block=detailRaw?.content?.playerStats;
  if(!block||typeof block!=="object"||Array.isArray(block))return [];
  const valueFor=(player:any,key:string)=>{
    const groups=Array.isArray(player?.stats)?player.stats:[];
    for(const group of groups){
      const entries=group?.stats&&typeof group.stats==="object"?Object.values(group.stats):[];
      for(const item of entries as any[]){
        if(String(item?.key||"")!==key)continue;
        const stat=item?.stat||{};
        const value=stat?.value;
        const total=stat?.total;
        if(value===undefined||value===null)return null;
        return {value:Number.isFinite(Number(value))?Number(value):value,total:Number.isFinite(Number(total))?Number(total):null};
      }
    }
    return null;
  };
  const rows=[];
  for(const player of Object.values(block) as any[]){
    if(!player||!player.name)continue;
    const stat=(key:string)=>valueFor(player,key);
    const rating=stat("rating_title")?.value??null;
    const minutes=stat("minutes_played")?.value??null;
    const goals=stat("goals")?.value??null;
    const assists=stat("assists")?.value??null;
    const totalShots=stat("total_shots")?.value??null;
    const shotsOnTarget=stat("ShotsOnTarget")?.value??null;
    const chancesCreated=stat("chances_created")?.value??null;
    const accuratePasses=stat("accurate_passes");
    const tackles=stat("matchstats.headers.tackles")?.value??null;
    const interceptions=stat("interceptions")?.value??null;
    const clearances=stat("clearances")?.value??null;
    const recoveries=stat("recoveries")?.value??null;
    const duelsWon=stat("duel_won")?.value??null;
    const aerialsWon=stat("aerials_won");
    const touches=stat("touches")?.value??null;
    const saves=stat("saves")?.value??null;
    const goalsConceded=stat("goals_conceded")?.value??null;
    const hasAny=[rating,minutes,goals,assists,totalShots,shotsOnTarget,chancesCreated,tackles,interceptions,clearances,recoveries,duelsWon,touches,saves,goalsConceded,accuratePasses?.value,aerialsWon?.value].some(v=>v!==null&&v!==undefined);
    if(!hasAny)continue;
    rows.push({
      playerId:player.id?String(player.id):null,
      optaId:player.optaId?String(player.optaId):null,
      playerName:String(player.name),
      teamId:player.teamId?String(player.teamId):null,
      teamName:player.teamName??null,
      shirtNumber:player.shirtNumber??null,
      positionId:player.positionId??null,
      isGoalkeeper:Boolean(player.isGoalkeeper),
      rating,minutes,goals,assists,totalShots,shotsOnTarget,chancesCreated,tackles,interceptions,clearances,recoveries,duelsWon,touches,saves,goalsConceded,
      accuratePasses:accuratePasses?.value??null,
      passAttempts:accuratePasses?.total??null,
      aerialsWon:aerialsWon?.value??null,
      aerialDuels:aerialsWon?.total??null
    });
  }
  return rows.sort((a:any,b:any)=>(Number(b.rating)||0)-(Number(a.rating)||0));
}

function normalizeH2H(row:any,error:any){
  if(error) return {status:"FAIL",isFailure:true,label:"Head-to-head data read failed",reason:error.message||"query_error"};
  if(!row) return {status:"NO_DATA",isFailure:false,label:"No head-to-head data",reason:"no_h2h_row"};
  const q=String(row.quality||"").toUpperCase();
  const games=Number(row.h2h_games||0);
  if(q==="H2H_OK" && games>0) return {status:"OK",isFailure:false,label:`Last ${games} H2H meetings`,reason:null};
  if(q==="NO_PREVIOUS_H2H_IN_AVAILABLE_HISTORY") return {status:"NO_HISTORY",isFailure:false,label:"No previous H2H in available history",reason:q};
  if(q==="HISTORY_PARTIAL") return {status:"PARTIAL",isFailure:false,label:"H2H history is still being populated",reason:q};
  return {status:"PARTIAL",isFailure:false,label:games>0?`Last ${games} H2H meetings`:"H2H data incomplete",reason:q||"unknown_quality"};
}

function englishDetailPayload(value:any, homeZh:string, homeEn:string, awayZh:string, awayEn:string):any {
  if (typeof value === "string") {
    if (homeZh && value === homeZh) return homeEn || value;
    if (awayZh && value === awayZh) return awayEn || value;
    if (value === "資料不足") return "Insufficient data";
    if (!/[\u3400-\u9fff]/.test(value)) return value;
    const cleaned=value.replace(/[\u3400-\u9fff]+/g," ").replace(/\s+/g," ").trim();
    return cleaned || null;
  }
  if (Array.isArray(value)) return value.map(v=>englishDetailPayload(v,homeZh,homeEn,awayZh,awayEn));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,englishDetailPayload(v,homeZh,homeEn,awayZh,awayEn)]));
  return value;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="GET") return Response.json({error:"method_not_allowed"},{status:405,headers:{...cors,"Cache-Control":"no-store"}});
  const url=new URL(req.url);
  const id=String(url.searchParams.get("id")||"").trim();
  if(!/^[A-Za-z0-9_-]{2,40}$/.test(id)){
    return Response.json({error:"invalid_match_id"},{status:400,headers:{...cors,"Cache-Control":"no-store"}});
  }
  const sbUrl=Deno.env.get("SUPABASE_URL")||"",key=serverKey();
  if(!sbUrl||!key) return Response.json({error:"server_config_missing"},{status:500,headers:{...cors,"Cache-Control":"no-store"}});
  const db=createReadClient(sbUrl,key);
  const coreDb=createReadClientWithTimeout(sbUrl,key,8_000);
  const optionalDb=createReadClientWithTimeout(sbUrl,key,4_000);
  let summaryFixture:any=null;
  try{summaryFixture=await readSummaryFixture(sbUrl,id);}catch(e){console.error("detail_summary_authority_failed",e);}

  const oneWith=async(client:any,table:string,select="*",schema="public")=>{
    const q=(schema==="public"?client:client.schema(schema)).from(table).select(select).eq("hkjc_event_id",id).maybeSingle();
    const r=await q;
    return {data:r.data||null,error:cleanError(r.error)};
  };
  const manyWith=async(client:any,table:string,select="*",schema="public")=>{
    const q=(schema==="public"?client:client.schema(schema)).from(table).select(select).eq("hkjc_event_id",id);
    const r=await q;
    return {data:r.data||[],error:cleanError(r.error)};
  };

  const predictionEvidence=await manyWith(coreDb,"prediction_evidence_current","*","private");
  const [model,form]=await Promise.all([
    oneWith(coreDb,"model_predictions"),
    oneWith(coreDb,"form_predictions"),
  ]);

  const [
    fixtureUpcomingDb,fixtureLive,forebet,power,human,scenario,movement,h2h,eventMap,
    playerStatus,lineups,lineupStrength,managers,multisource,valueMarket,arbMarket,arbWatch,sourceMatchDetail
  ]=await Promise.all([
    summaryFixture?Promise.resolve({data:null,error:null}):(async()=>{
      const r=await optionalDb.from("canonical_fixture_current")
        .select("hkjc_event_id:match_id,kickoff_hkt,status,tournament:league,home_en,away_en,home_zh,away_zh,in_play,selling,pool_status,fetched_at,source_updated_at,updated_at")
        .eq("match_id",id).maybeSingle();
      return {data:r.data||null,error:cleanError(r.error)};
    })(),
    (async()=>{
      const r=await optionalDb.from("live_score_current")
        .select("hkjc_event_id,updated_at_source,live_score,home_score,away_score,minute,match_status,source,match_confidence,source_updated_at,source_match_id")
        .eq("hkjc_event_id",id)
        .gte("updated_at_source",new Date(Date.now()-10*60*1000).toISOString())
        .maybeSingle();
      return {data:r.data?{
        hkjc_event_id:id,
        fetched_at:r.data.updated_at_source??r.data.source_updated_at??null,
        status:r.data.match_status??"LIVE",
        live_eligible:true,
        source:r.data.source??"LIVE_SCORE_CURRENT",
        provider_event_id:r.data.source_match_id??null,
        home_score:r.data.home_score,
        away_score:r.data.away_score,
        minute:r.data.minute,
        stats:null,
        markets:null,
        market_semantics:"NO_VERIFIED_IN_PLAY_BOOKMAKER_MARKET"
      }:null,error:cleanError(r.error)};
    })(),
    oneWith(optionalDb,"forebet_predictions"),
    (async()=>{
      const r=await optionalDb.from("team_power_current")
        .select("hkjc_event_id:match_id,fetched_at,home_rating,away_rating,home_opta_name,away_opta_name,home_match_confidence,away_match_confidence,home_rank,away_rank,coverage,source,power_updated")
        .eq("match_id",id).maybeSingle();
      return {data:r.data||null,error:cleanError(r.error)};
    })(),
    oneWith(optionalDb,"human_factors_current"),
    manyWith(optionalDb,"match_scenario_current"),
    oneWith(optionalDb,"odds_movement_current"),
    oneWith(optionalDb,"match_h2h_current"),
    oneWith(optionalDb,"api_football_event_map"),
    manyWith(optionalDb,"phase2_player_status_evidence"),
    manyWith(optionalDb,"phase2_match_lineup_evidence"),
    manyWith(optionalDb,"phase2_lineup_strength_current"),
    manyWith(optionalDb,"phase2_manager_evidence"),
    oneWith(optionalDb,"multisource_consensus_current","*","private"),
    manyWith(optionalDb,"phase4_value_api"),
    manyWith(optionalDb,"phase4_arb_api"),
    oneWith(optionalDb,"phase4_arb_watch_api"),
    (async()=>{
      const r=await optionalDb.from("source_match_detail_current")
        .select("match_id,source_key,external_event_id,detail_raw,detail_fetched_at,updated_at")
        .eq("match_id",id)
        .eq("source_key","FOTMOB")
        .order("detail_fetched_at",{ascending:false})
        .limit(1)
        .maybeSingle();
      return {data:r.data||null,error:cleanError(r.error)};
    })(),
  ]);
  const fixtureUpcoming=summaryFixture?{data:summaryFixture,error:null}:fixtureUpcomingDb;

  const fixture = fixtureUpcoming.data ? fixtureUpcoming : fixtureLive;
  const fixtureSource = summaryFixture ? "AUTHORITY_SUMMARY" : fixtureUpcoming.data ? "CANONICAL" : fixtureLive.data ? "LIVE_SCORE_CURRENT" : "MISSING";
  const errors:any={};
  for(const [k,v] of Object.entries({fixtureUpcoming,fixtureLive,model,forebet,form,power,human,scenario,movement,h2h,eventMap,playerStatus,lineups,lineupStrength,managers,predictionEvidence,multisource,valueMarket,arbMarket,arbWatch,sourceMatchDetail})){
    if((v as any).error) errors[k]=(v as any).error;
  }


  const playerEvidenceRaw=[...(playerStatus.data||[]),...(lineups.data||[])];
  const playerKeys=[...new Set(playerEvidenceRaw.map((row:any)=>String(row?.player_key||"").trim()).filter(Boolean))];
  let canonicalPlayersByKey=new Map<string,{canonicalName:string,teamKey:string,position:string|null,nationality:string|null,dateOfBirth:string|null,profile:any,sourceUpdatedAt:string|null}>();
  let canonicalPlayerError:any=null;
  if(playerKeys.length){
    const canonicalPlayers=await db.from("phase2_players").select("player_key,canonical_name,team_key,position,nationality,date_of_birth,profile,source_updated_at").in("player_key",playerKeys);
    if(canonicalPlayers.error) canonicalPlayerError=cleanError(canonicalPlayers.error);
    else canonicalPlayersByKey=new Map((canonicalPlayers.data||[]).map((row:any)=>[
      String(row.player_key),
      {
        canonicalName:String(row.canonical_name||row.player_key),
        teamKey:String(row.team_key||""),
        position:row.position??null,
        nationality:row.nationality??null,
        dateOfBirth:row.date_of_birth??null,
        profile:row.profile??null,
        sourceUpdatedAt:row.source_updated_at??null
      }
    ]));
  }
  if(canonicalPlayerError) errors.playerIdentity=canonicalPlayerError;
  const annotatedPlayerStatus=(playerStatus.data||[]).map((row:any)=>annotatePlayerEvidence(row,canonicalPlayersByKey,"phase2_player_status_evidence"));
  const annotatedLineups=(lineups.data||[]).map((row:any)=>annotatePlayerEvidence(row,canonicalPlayersByKey,"phase2_match_lineup_evidence"));
  const playerProfiles=(()=>{
    const byKey=new Map<string,any>();
    for(const row of annotatedLineups){
      if(!row?.canonical_profile)continue;
      const key=String(row?.canonical_player_key||row?.player_key||row?.player_name||"");
      if(!key)continue;
      const candidate={
        player_key:key,
        player_name:row?.canonical_player_name||row?.player_name||null,
        team_side:row?.team_side??null,
        starter:row?.starter??null,
        role:row?.canonical_position||row?.role||null,
        nationality:row?.canonical_nationality||null,
        source_name:row?.source_name||null,
        profile:row?.canonical_profile||null,
        profile_updated_at:row?.canonical_profile_updated_at||null
      };
      const current=byKey.get(key);
      const rank=(x:any)=>(x?.starter?2:0)+(String(x?.source_name||"").startsWith("FOTMOB")?1:0);
      if(!current||rank(candidate)>rank(current))byKey.set(key,candidate);
    }
    return [...byKey.values()].sort((a:any,b:any)=>{
      const side=String(a.team_side||"").localeCompare(String(b.team_side||""));
      if(side)return side;
      if(Boolean(a.starter)!==Boolean(b.starter))return a.starter?-1:1;
      return String(a.player_name||"").localeCompare(String(b.player_name||""));
    });
  })();

  const playerMatchStats=compactFotmobPlayerMatchStats(sourceMatchDetail.data?.detail_raw);
  const playerMatchStatsMeta=playerMatchStats.length?{
    source:"FOTMOB",
    externalEventId:sourceMatchDetail.data?.external_event_id??null,
    observedAt:sourceMatchDetail.data?.detail_fetched_at??sourceMatchDetail.data?.updated_at??null,
    players:playerMatchStats.length
  }:null;

  const valueRows=[...(valueMarket.data||[])].sort((a:any,b:any)=>Number(b.expected_roi_pct||0)-Number(a.expected_roi_pct||0));
  const arbRows=[...(arbMarket.data||[])].sort((a:any,b:any)=>Number(b.net_roi_pct||0)-Number(a.net_roi_pct||0));

  const publicDetail=englishDetailPayload({
    generatedAt:new Date().toISOString(),
    id,
    fixture:fixture.data,
    fixtureSource,
    models:{
      internal:model.data,
      forebet:forebet.data || forebetEvidenceFallback(predictionEvidence.data),
      form:form.data,
      opta:power.data,
      multisource:multisource.data,
      evidence:predictionEvidence.data,
    },
    humanFactors:{
      summary:human.data,
      eventMap:eventMap.data,
      playerStatus:annotatedPlayerStatus,
      lineup:annotatedLineups,
      playerProfiles,
      playerMatchStats,
      playerMatchStatsMeta,
      lineupStrength:lineupStrength.data,
      managers:managers.data,
    },
    scenario:scenario.data,
    oddsMovement:movement.data,
    h2h:(()=>{
      const meta=normalizeH2H(h2h.data,h2h.error);
      return h2h.data ? {...h2h.data,status:meta.status,isFailure:meta.isFailure,label:meta.label,display:meta} : {status:meta.status,isFailure:meta.isFailure,label:meta.label,display:meta};
    })(),
    headToHead:(()=>{
      const meta=normalizeH2H(h2h.data,h2h.error);
      return h2h.data ? {...h2h.data,status:meta.status,isFailure:meta.isFailure,label:meta.label,display:meta} : {status:meta.status,isFailure:meta.isFailure,label:meta.label,display:meta};
    })(),
    marketIntelligence:{
      bestValue:valueRows[0]||null,
      value:valueRows,
      arbitrage:arbRows,
      nearArbitrage:arbWatch.data||null,
      mode:"DETECT_ONLY"
    },
    errors,
  }, String(fixture.data?.home_zh||""), String(fixture.data?.home_en||""), String(fixture.data?.away_zh||""), String(fixture.data?.away_en||""));
  return Response.json(sanitizePublicLegacy(publicDetail),{
    headers:{...cors,"Cache-Control":"public, max-age=10, stale-while-revalidate=30"}
  });
});