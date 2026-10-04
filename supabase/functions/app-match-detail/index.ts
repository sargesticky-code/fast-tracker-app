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
function annotatePlayerEvidence(row:any,canonicalPlayers:Map<string,{canonicalName:string,teamKey:string}>,table:string){
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
    fetched_at:m?.health?.hkjcFetchedAt??m?.updatedAt??null,
    odds_updated_at:m?.health?.hkjcPriceChangedAt??m?.live?.oddsUpdatedAt??null,
    authority_source:"APP_PHASE1_SUMMARY",
    live_now:Boolean(m?.liveNow),
  };
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
    playerStatus,lineups,lineupStrength,managers,multisource,valueMarket,arbMarket,arbWatch
  ]=await Promise.all([
    summaryFixture?Promise.resolve({data:null,error:null}):oneWith(optionalDb,"hkjc_upcoming_current"),
    oneWith(optionalDb,"hkjc_live_odds_current"),
    oneWith(optionalDb,"forebet_predictions"),
    oneWith(optionalDb,"hkjc_power_current"),
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
  ]);
  const fixtureUpcoming=summaryFixture?{data:summaryFixture,error:null}:fixtureUpcomingDb;

  const fixture = fixtureUpcoming.data ? fixtureUpcoming : fixtureLive;
  const fixtureSource = summaryFixture ? "AUTHORITY_SUMMARY" : fixtureUpcoming.data ? "UPCOMING" : fixtureLive.data ? "LIVE" : "MISSING";
  const errors:any={};
  for(const [k,v] of Object.entries({fixtureUpcoming,fixtureLive,model,forebet,form,power,human,scenario,movement,h2h,eventMap,playerStatus,lineups,lineupStrength,managers,predictionEvidence,multisource,valueMarket,arbMarket,arbWatch})){
    if((v as any).error) errors[k]=(v as any).error;
  }


  const playerEvidenceRaw=[...(playerStatus.data||[]),...(lineups.data||[])];
  const playerKeys=[...new Set(playerEvidenceRaw.map((row:any)=>String(row?.player_key||"").trim()).filter(Boolean))];
  let canonicalPlayersByKey=new Map<string,{canonicalName:string,teamKey:string}>();
  let canonicalPlayerError:any=null;
  if(playerKeys.length){
    const canonicalPlayers=await db.from("phase2_players").select("player_key,canonical_name,team_key").in("player_key",playerKeys);
    if(canonicalPlayers.error) canonicalPlayerError=cleanError(canonicalPlayers.error);
    else canonicalPlayersByKey=new Map((canonicalPlayers.data||[]).map((row:any)=>[
      String(row.player_key),
      {canonicalName:String(row.canonical_name||row.player_key),teamKey:String(row.team_key||"")}
    ]));
  }
  if(canonicalPlayerError) errors.playerIdentity=canonicalPlayerError;
  const annotatedPlayerStatus=(playerStatus.data||[]).map((row:any)=>annotatePlayerEvidence(row,canonicalPlayersByKey,"phase2_player_status_evidence"));
  const annotatedLineups=(lineups.data||[]).map((row:any)=>annotatePlayerEvidence(row,canonicalPlayersByKey,"phase2_match_lineup_evidence"));

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
  return Response.json(publicDetail,{
    headers:{...cors,"Cache-Control":"public, max-age=10, stale-while-revalidate=30"}
  });
});