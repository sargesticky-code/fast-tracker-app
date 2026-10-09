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
  return id ? `${table}:${id}` : `${table}:${String(row?.match_id||"unknown")}:${compactToken(row?.player_key||row?.player_name||"unknown")}`;
}
function playerClaimFingerprint(row:any,canonicalIdentity:string|null){
  return [
    String(row?.match_id||""),
    normalizedSide(row?.team_side)||"?",
    canonicalIdentity || "UNRESOLVED:" + compactToken(row?.player_name||row?.raw?.player?.name||row?.raw?.player_name||row?.player_key||"unknown"),
    compactToken(row?.status_type),
    compactToken(row?.status_value),
  ].join("|");
}
function annotatePlayerEvidence(row:any,canonicalPlayers:Map<string,{canonicalKey:string,canonicalName:string,teamKey:string,position:string|null,nationality:string|null,dateOfBirth:string|null,profile:any,sourceUpdatedAt:string|null,identityMethod:string}>,table:string){
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
    canonical_player_key:canonicalPlayer?.canonicalKey ?? null,
    canonical_player_name:canonicalPlayer?.canonicalName ?? null,
    canonical_player_identity:canonicalIdentity,
    canonical_identity_method:canonicalPlayer?.identityMethod ?? null,
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
    signal:AbortSignal.timeout(3_000),
  });
  if(!res.ok) return null;
  const body=await res.json();
  const m=Array.isArray(body?.matches)?body.matches.find((x:any)=>String(x?.id||"")===id):null;
  if(!m) return null;
  return {
    match_id:id,
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

function sanitizePublicCompatibility(value:any):any{
  if(Array.isArray(value))return value.map(sanitizePublicCompatibility);
  if(!value||typeof value!=="object")return value;
  const out:any={};
  for(const [key,raw] of Object.entries(value)){
    if(key!=="match_id" && /_event_id$/i.test(key))continue;
    if(/^raw(?:_|$)/i.test(key))continue;
    out[key]=sanitizePublicCompatibility(raw);
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

// Flashscore transports section-scoped metrics as SG/SH/SI triplets.
 // Parse only the full-match SE÷Match section, never half-time duplicates.
 // These are observed match statistics, NOT independent confirmation of live status.
function compactFlashscoreMatchStats(raw:any, fetchedAt:any, kickoff:any) {
  const body=typeof raw?.statistics_raw==="string"?raw.statistics_raw:"";
  const capturedMs=Date.parse(String(fetchedAt||""));
  const kickoffMs=Date.parse(String(kickoff||""));
  if(!body.startsWith("SE÷Match") || !Number.isFinite(capturedMs) || !Number.isFinite(kickoffMs) ||
     capturedMs < kickoffMs || capturedMs>Date.now()+60_000) return null;
  const full=body.split("¬~SE÷")[0];
  const names:any={
    "Expected goals (xG)":"xg",
    "xG on target (xGOT)":"xgot",
    "Ball possession":"possession",
    "Total shots":"shots",
    "Shots on target":"shotsOnTarget",
    "Big chances":"bigChances",
    "Corner kicks":"corners",
    "Shots inside the box":"shotsInsideBox",
  };
  const stats:any={};
  const parse=(value:string)=> {
    const match=String(value).trim().match(/^-?(?:\d+(?:\.\d+)?|\.\d+)/);
    return match?Number(match[0]):null;
  };
  for(const section of full.split("¬~")) {
    const m=section.match(/(?:^|¬)SG÷([^¬~]+)¬SH÷([^¬~]+)¬SI÷([^¬~]+)/);
    if(!m)continue;
    const key=names[m[1]];
    if(!key || stats[key])continue;
    const home=parse(m[2]),away=parse(m[3]);
    if(home!==null && away!==null && Number.isFinite(home) && Number.isFinite(away)){
      stats[key]={home,away};
    }
  }
  if(!stats.shots || !stats.corners || !stats.possession) return null;
  const ageMinutes=Math.max(0,(Date.now()-capturedMs)/60000);
  return {
    source:"FLASHSCORE",capturedAt:fetchedAt,matchStart: kickoff,
    freshness:ageMinutes<=20?"FRESH":"HISTORICAL_SNAPSHOT",
    semantics:"SOURCE_OBSERVED_STATS_NOT_VERIFIED_LIVE_STATUS",
    stats,
  };
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="GET") return Response.json({error:"method_not_allowed"},{status:405,headers:{...cors,"Cache-Control":"no-store"}});
  const url=new URL(req.url);
  const requestedId=String(url.searchParams.get("id")||"").trim();
  if(!/^[A-Za-z0-9:_-]{2,80}$/.test(requestedId)){
    return Response.json({error:"invalid_match_id"},{status:400,headers:{...cors,"Cache-Control":"no-store"}});
  }
  const sbUrl=Deno.env.get("SUPABASE_URL")||"",key=serverKey();
  if(!sbUrl||!key) return Response.json({error:"server_config_missing"},{status:500,headers:{...cors,"Cache-Control":"no-store"}});
  const db=createReadClient(sbUrl,key);
  const coreDb=createReadClientWithTimeout(sbUrl,key,4_000);
  const criticalDb=createReadClientWithTimeout(sbUrl,key,8_000);
  const optionalDb=createReadClientWithTimeout(sbUrl,key,2_000);

  // Fast Flashscore evidence lane: two indexed/equality-scoped reads and
  // no 25-way optional PostgREST fanout. Only exact FS fixture IDs qualify.
  // Preserve all recorded numbers and reject statistics captured pre-kickoff.
  if (requestedId.startsWith("FS:")) {
    const [fixtureDirect,sourceDirect]=await Promise.all([
      criticalDb.from("matches")
        .select("hkjc_event_id,kickoff_hkt,status,tournament,home_en,away_en,home_zh,away_zh,fetched_at,updated_at")
        .eq("hkjc_event_id",requestedId).maybeSingle(),
      criticalDb.from("phase15_source_shadow_current")
        .select("match_id,source_key,detail_raw,detail_fetched_at")
        .eq("match_id",requestedId).eq("source_key","FLASHSCORE").maybeSingle(),
    ]);
    if(!fixtureDirect.error && !sourceDirect.error && fixtureDirect.data && sourceDirect.data?.detail_raw?.statistics_raw) {
      const f=fixtureDirect.data;
      const stats=compactFlashscoreMatchStats(
        sourceDirect.data.detail_raw,sourceDirect.data.detail_fetched_at,f.kickoff_hkt
      );
      if(stats){
        return Response.json(sanitizePublicCompatibility({
          generatedAt:new Date().toISOString(),id:requestedId,requestedId,
          fixtureSource:"CANONICAL_FLASHSCORE",redirect:null,
          fixture:{
            match_id:requestedId,kickoff_hkt:f.kickoff_hkt,status:f.status,
            tournament:f.tournament,home_en:f.home_en,away_en:f.away_en,
            home_zh:f.home_zh,away_zh:f.away_zh,
            fetched_at:f.fetched_at,updated_at:f.updated_at,
          },
          flashscoreStats:stats,
          models:{internal:null,forebet:null,form:null,opta:null,multisource:null,evidence:[]},
          humanFactors:{
            summary:null,eventMap:null,playerStatus:[],lineup:[],
            playerProfiles:[],playerMatchStats:[],playerMatchStatsMeta:null,
            lineupStrength:[],managers:[]
          },
          scenario:[],oddsMovement:null,
          h2h:{status:"PARTIAL",isFailure:false,label:"Not requested in fast evidence lane"},
          headToHead:{status:"PARTIAL",isFailure:false,label:"Not requested in fast evidence lane"},
          marketIntelligence:{bestValue:null,value:[],arbitrage:[],nearArbitrage:null,mode:"DETECT_ONLY"},
          errors:{},evidenceMode:"EXACT_FLASHSCORE_MATCH_STATISTICS"
        }),{headers:{...cors,"Cache-Control":"public, max-age=10, stale-while-revalidate=30"}});
      }
    }
  }

  let id=requestedId;
  let fixtureRedirect:any=null;
  try{
    const redirectResult=await optionalDb.from("fixture_identity_redirects")
      .select("source_match_id,target_match_id,source_name,confidence,evidence,updated_at")
      .eq("source_match_id",requestedId)
      .eq("active",true)
      .gte("confidence",0.99)
      .order("confidence",{ascending:false})
      .limit(2);
    if(!redirectResult.error && Array.isArray(redirectResult.data) && redirectResult.data.length===1){
      const row=redirectResult.data[0];
      const target=String(row?.target_match_id||"").trim();
      if(target && target!==requestedId){
        id=target;
        fixtureRedirect={
          requestedMatchId:requestedId,
          canonicalMatchId:target,
          source:row?.source_name||null,
          confidence:Number(row?.confidence)||null,
          updatedAt:row?.updated_at||null,
          evidence:row?.evidence||null
        };
      }
    }
  }catch(e){console.error("detail_fixture_redirect_failed",e);}

  const oneWith=async(client:any,table:string,select="*",schema="public")=>{
    const q=(schema==="public"?client:client.schema(schema)).from(table).select(select).eq("match_id",id).maybeSingle();
    const r=await q;
    return {data:r.data||null,error:cleanError(r.error)};
  };
  const manyWith=async(client:any,table:string,select="*",schema="public")=>{
    const q=(schema==="public"?client:client.schema(schema)).from(table).select(select).eq("match_id",id);
    const r=await q;
    return {data:r.data||[],error:cleanError(r.error)};
  };

  // One RPC carries the critical public evidence to avoid request amplification
  // through multiple concurrent PostgREST reads under production load.
  // Prioritize one critical read. A database timeout is NOT an empty match:
  // return an explicit service failure before the optional fan-out can further
  // saturate PostgREST under load.
  const criticalResult=await criticalDb.rpc("ft_internal_app_match_detail_critical",{p_match_id:id});
  if(criticalResult.error){
    console.error("critical_match_detail_unavailable",cleanError(criticalResult.error));
    return Response.json({
      error:"critical_match_detail_unavailable",
      requestedId,
      retryable:true,
      message:"Fixture evidence cannot be read right now; no zero or missing result is implied."
    },{status:503,headers:{...cors,"Cache-Control":"no-store"}});
  }
  const flashscoreDetailResult=(requestedId.startsWith("FS:") || id.startsWith("FS:"))
    ? await optionalDb.from("source_match_detail_current")
        .select("match_id,source_key,detail_raw,detail_fetched_at")
        .eq("match_id",requestedId.startsWith("FS:")?requestedId:id)
        .eq("source_key","FLASHSCORE").maybeSingle()
    : {data:null,error:null};
  const criticalPayload=criticalResult.data&&typeof criticalResult.data==="object"?criticalResult.data:{};
  const criticalError=cleanError(criticalResult.error);
  const fixtureUpcomingDb={data:criticalPayload?.fixture||null,error:criticalError};
  const lineupsRaw={data:Array.isArray(criticalPayload?.lineups)?criticalPayload.lineups:[],error:criticalError};
  const valueMarket={data:Array.isArray(criticalPayload?.value)?criticalPayload.value:[],error:criticalError};
  const sourceMatchDetail={data:criticalPayload?.source_match_detail||null,error:criticalError};
  const criticalPlayers=Array.isArray(criticalPayload?.players)?criticalPayload.players:[];

  const summaryFixture=null;
  const latestLineupFetchBySource=new Map<string,number>();
  for(const row of lineupsRaw.data||[]){
    const source=String(row?.source_name||"UNKNOWN");
    const ts=new Date(row?.fetched_at||0).getTime();
    if(Number.isFinite(ts) && ts>=(latestLineupFetchBySource.get(source)??-Infinity)){
      latestLineupFetchBySource.set(source,ts);
    }
  }
  const lineups={
    ...lineupsRaw,
    data:(lineupsRaw.data||[]).filter((row:any)=>{
      const source=String(row?.source_name||"UNKNOWN");
      const ts=new Date(row?.fetched_at||0).getTime();
      const latest=latestLineupFetchBySource.get(source);
      return latest===undefined || ts===latest;
    })
  };

  const [
    fixtureLive,forebet,power,human,scenario,movement,h2h,eventMap,
    playerStatus,lineupStrength,managers,multisource,arbMarket,arbWatch,
    predictionEvidence,modelRaw,formRaw
  ]=await Promise.all([
    (async()=>{
      const r=await optionalDb.from("live_score_feed_current")
        .select("match_id,updated_at_source,live_score,home_score,away_score,minute,match_status,source,match_confidence,source_updated_at,source_match_id")
        .eq("match_id",id)
        .gte("updated_at_source",new Date(Date.now()-10*60*1000).toISOString())
        .maybeSingle();
      return {data:r.data?{
        match_id:id,
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
    oneWith(optionalDb,"forebet_prediction_current"),
    (async()=>{
      const r=await optionalDb.from("team_power_current")
        .select("match_id,fetched_at,home_rating,away_rating,home_opta_name,away_opta_name,home_match_confidence,away_match_confidence,home_rank,away_rank,coverage,source,power_updated")
        .eq("match_id",id).maybeSingle();
      return {data:r.data||null,error:cleanError(r.error)};
    })(),
    oneWith(optionalDb,"human_factor_feed_current"),
    manyWith(optionalDb,"match_scenario_feed_current"),
    oneWith(optionalDb,"odds_movement_feed_current"),
    (async()=>{
      const r=await optionalDb.from("match_h2h_feed_current")
        .select("match_id,fetched_at,kickoff_hkt,home_id,away_id,home,away,h2h_games,home_wins,draws,away_wins,home_goals,away_goals,avg_total_goals,last5,meetings,quality,updated_at")
        .eq("match_id",id).maybeSingle();
      return {data:r.data?{...r.data,source:"VERIFIED_RESULTS_HISTORY"}:null,error:cleanError(r.error)};
    })(),
    oneWith(optionalDb,"provider_event_map_current"),
    manyWith(optionalDb,"player_status_evidence_current"),
    manyWith(optionalDb,"lineup_strength_feed_current"),
    manyWith(optionalDb,"manager_evidence_current"),
    oneWith(optionalDb,"multisource_consensus_feed_current","*"),
    manyWith(optionalDb,"arb_market_feed_current"),
    (async()=>{
      const r=await optionalDb.from("arb_watch_feed_current")
        .select("match_id,market_key,period_key,inverse_sum,gross_roi_pct,distance_to_arb_pct,best_home_provider,best_home_odds,best_home_currency,best_home_liquidity,best_draw_provider,best_draw_odds,best_draw_currency,best_draw_liquidity,best_away_provider,best_away_odds,best_away_currency,best_away_liquidity,provider_count,currency_count,status,calculated_at")
        .eq("match_id",id).maybeSingle();
      return {data:r.data||null,error:cleanError(r.error)};
    })(),
    manyWith(coreDb,"prediction_evidence_feed_current","*"),
    oneWith(coreDb,"model_prediction_current","match_id,fetched_at,home,away,model_league,model_home_name,model_away_name,dc_prob_home,dc_prob_draw,dc_prob_away,dc_xg_home,dc_xg_away,dc_prob_over25,pi_prob_home,pi_prob_draw,pi_prob_away,pi_home_rating,pi_away_rating,pi_diff,training_matches,team_match_quality,quality,updated_at"),
    oneWith(coreDb,"form_prediction_current","match_id,fetched_at,home,away,form_prob_home,form_prob_draw,form_prob_away,form_xg_home,form_xg_away,home_games,away_games,home_venue_games,away_venue_games,quality,updated_at"),
  ]);
  const model={...modelRaw,data:modelRaw.data?{...modelRaw.data,model_source:"VERIFIED_RESULTS_HISTORY"}:null};
  const form={...formRaw,data:formRaw.data?{...formRaw.data,model_source:"VERIFIED_RESULTS_HISTORY"}:null};

  const fixtureUpcoming=fixtureUpcomingDb;

  const fixture = fixtureUpcoming.data ? fixtureUpcoming : fixtureLive;
  const flashscoreStats=compactFlashscoreMatchStats(
    flashscoreDetailResult.data?.detail_raw,
    flashscoreDetailResult.data?.detail_fetched_at,
    fixture.data?.kickoff_hkt
  );
  const fixtureSource = summaryFixture ? "AUTHORITY_SUMMARY" : fixtureUpcoming.data ? "CANONICAL" : fixtureLive.data ? "LIVE_SCORE_CURRENT" : "MISSING";
  const errors:any={};
  for(const [k,v] of Object.entries({fixtureUpcoming,fixtureLive,model,forebet,form,power,human,scenario,movement,h2h,eventMap,playerStatus,lineups,lineupStrength,managers,predictionEvidence,multisource,valueMarket,arbMarket,arbWatch,sourceMatchDetail})){
    if((v as any).error) errors[k]=(v as any).error;
  }


  const playerEvidenceRaw=[...(playerStatus.data||[]),...(lineups.data||[])];
  const playerKeys=[...new Set(playerEvidenceRaw.map((row:any)=>String(row?.player_key||"").trim()).filter(Boolean))];
  let canonicalPlayersByKey=new Map<string,{canonicalKey:string,canonicalName:string,teamKey:string,position:string|null,nationality:string|null,dateOfBirth:string|null,profile:any,sourceUpdatedAt:string|null,identityMethod:string}>();
  let canonicalPlayerError:any=null;
  for(const row of criticalPlayers){
    const canonical={
      canonicalKey:String(row.player_key),
      canonicalName:String(row.canonical_name||row.player_key),
      teamKey:String(row.team_key||""),
      position:row.position??null,
      nationality:row.nationality??null,
      dateOfBirth:row.date_of_birth??null,
      profile:row.profile??null,
      sourceUpdatedAt:row.source_updated_at??null,
      identityMethod:"EXACT_CANONICAL_PLAYER_KEY"
    };
    canonicalPlayersByKey.set(String(row.player_key),canonical);
    const flashscoreId=String(row?.source_ids?.flashscore||"").trim();
    if(flashscoreId){
      canonicalPlayersByKey.set(flashscoreId,{...canonical,identityMethod:"EXACT_FLASHSCORE_PLAYER_ID"});
    }
  }
  if(canonicalPlayerError) errors.playerIdentity=canonicalPlayerError;
  const annotatedPlayerStatus=(playerStatus.data||[]).map((row:any)=>annotatePlayerEvidence(row,canonicalPlayersByKey,"player_status_evidence_current"));
  const annotatedLineups=(lineups.data||[]).map((row:any)=>annotatePlayerEvidence(row,canonicalPlayersByKey,"lineup_evidence_current"));
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
  const playerMatchStatsById=new Map(
    playerMatchStats
      .filter((row:any)=>row?.playerId!=null)
      .map((row:any)=>[String(row.playerId),row])
  );
  const playerMatchStatsByCanonicalIdentity=new Map<string,any>();
  for(const row of annotatedLineups){
    const source=String(row?.source_name||"").toUpperCase();
    if(!source.startsWith("FOTMOB"))continue;
    const key=String(row?.player_key||"").trim();
    const canonicalIdentity=String(row?.canonical_player_identity||"").trim();
    const matchStats=key?playerMatchStatsById.get(key)||null:null;
    if(matchStats&&canonicalIdentity)playerMatchStatsByCanonicalIdentity.set(canonicalIdentity,matchStats);
  }
  const lineupsWithMatchStats=annotatedLineups.map((row:any)=>{
    const source=String(row?.source_name||"").toUpperCase();
    const key=String(row?.player_key||"").trim();
    const canonicalIdentity=String(row?.canonical_player_identity||"").trim();
    const exactFotmobStats=source.startsWith("FOTMOB")&&key
      ? playerMatchStatsById.get(key)||null
      : null;
    const canonicalStats=canonicalIdentity?playerMatchStatsByCanonicalIdentity.get(canonicalIdentity)||null:null;
    const matchStats=exactFotmobStats||canonicalStats;
    return matchStats?{...row,match_stats:matchStats}:row;
  });
  const publicLineups=(()=>{
    const officialStarterCounts=new Map<string,{H:number,A:number}>();
    for(const row of lineupsWithMatchStats){
      const source=String(row?.source_name||"").toUpperCase();
      if(row?.starter!==true || row?.confirmed!==true || !["FOTMOB_OFFICIAL","FLASHSCORE_OFFICIAL"].includes(source))continue;
      if(!officialStarterCounts.has(source))officialStarterCounts.set(source,{H:0,A:0});
      const counts=officialStarterCounts.get(source)!;
      if(row?.team_side==="H")counts.H++;
      if(row?.team_side==="A")counts.A++;
    }
    const hasCompleteOfficialSourceXI=[...officialStarterCounts.values()].some((counts)=>counts.H>=11&&counts.A>=11);
    const eligibleLineups=hasCompleteOfficialSourceXI
      ? lineupsWithMatchStats.filter((row:any)=>row?.confirmed===true)
      : lineupsWithMatchStats;
    const byIdentity=new Map<string,any>();
    const norm=(value:any)=>String(value||"")
      .normalize("NFD").replace(/\p{M}+/gu,"").toLowerCase().replace(/[^a-z0-9]+/g,"");
    const score=(row:any)=>
      (row?.match_stats?100:0)
      +(row?.confirmed?20:0)
      +(row?.starter?10:0)
      +(String(row?.source_name||"").toUpperCase().startsWith("FOTMOB")?5:0);
    for(const row of eligibleLineups){
      const name=row?.canonical_player_name||row?.player_name||row?.player_key||"";
      const canonicalIdentity=String(row?.canonical_player_identity||"").trim();
      const sourceName=String(row?.source_name||"UNKNOWN").trim();
      const providerPlayerKey=String(row?.player_key||"").trim();
      const identity=canonicalIdentity
        ? "CANONICAL|"+String(row?.team_side||"")+"|"+canonicalIdentity
        : "UNRESOLVED|"+String(row?.team_side||"")+"|"+sourceName+"|"+(providerPlayerKey||norm(name));
      if(!canonicalIdentity && !providerPlayerKey && !norm(name))continue;
      const current=byIdentity.get(identity);
      const sources=[...new Set([
        ...(current?.evidence_sources||[]),
        current?.source_name,
        row?.source_name
      ].filter(Boolean))];
      const preferred=!current||score(row)>score(current)?row:current;
      byIdentity.set(identity,{...preferred,evidence_sources:sources});
    }
    const stageOne=[...byIdentity.values()];
    const byOfficialRoster=new Map<string,any>();
    const passthrough:any[]=[];
    for(const row of stageOne){
      const sourceUpper=String(row?.source_name||"").toUpperCase();
      const shirt=Number(row?.shirt_number);
      const officialConfirmed=Boolean(row?.confirmed)
        && (sourceUpper==="FOTMOB_OFFICIAL"||sourceUpper==="FLASHSCORE_OFFICIAL")
        && Number.isFinite(shirt)
        && shirt>0;
      if(!officialConfirmed){
        passthrough.push(row);
        continue;
      }
      const rosterKey=[
        String(row?.team_side||"?"),
        row?.starter?"STARTER":"BENCH",
        String(shirt)
      ].join("|");
      const current=byOfficialRoster.get(rosterKey);
      const sources=[...new Set([
        ...(current?.evidence_sources||[]),
        current?.source_name,
        ...(row?.evidence_sources||[]),
        row?.source_name
      ].filter(Boolean))];
      const preferred=!current||score(row)>score(current)?row:current;
      byOfficialRoster.set(rosterKey,{...preferred,evidence_sources:sources});
    }
    return [...byOfficialRoster.values(),...passthrough].sort((a:any,b:any)=>{
      const side=String(a?.team_side||"").localeCompare(String(b?.team_side||""));
      if(side)return side;
      if(Boolean(a?.starter)!==Boolean(b?.starter))return a?.starter?-1:1;
      return String(a?.player_name||"").localeCompare(String(b?.player_name||""));
    });
  })();
  const playerMatchStatsMeta=playerMatchStats.length?{
    source:"FOTMOB",
    externalEventId:sourceMatchDetail.data?.external_event_id??null,
    observedAt:sourceMatchDetail.data?.detail_fetched_at??sourceMatchDetail.data?.updated_at??null,
    players:playerMatchStats.length,
    lineupRowsMatched:publicLineups.filter((row:any)=>row?.match_stats).length,
    joinMethod:"EXACT_FOTMOB_PLAYER_ID"
  }:null;

  const valueRows=[...(valueMarket.data||[])].sort((a:any,b:any)=>Number(b.expected_roi_pct||0)-Number(a.expected_roi_pct||0));
  const arbRows=[...(arbMarket.data||[])].sort((a:any,b:any)=>Number(b.net_roi_pct||0)-Number(a.net_roi_pct||0));
  const publicModel=model.data?{
    ...model.data,
    model_league:fixture.data?.tournament??fixture.data?.league??null,
    model_source:"VERIFIED_RESULTS_HISTORY"
  }:null;

  const publicDetail=englishDetailPayload({
    generatedAt:new Date().toISOString(),
    id,
    requestedId,
    redirect:fixtureRedirect,
    fixture:fixture.data,
    fixtureSource,
    flashscoreStats,
    models:{
      internal:publicModel,
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
      lineup:publicLineups,
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
  return Response.json(sanitizePublicCompatibility(publicDetail),{
    headers:{...cors,"Cache-Control":"public, max-age=10, stale-while-revalidate=30"}
  });
});