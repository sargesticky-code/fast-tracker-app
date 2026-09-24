import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"GET, OPTIONS",
};

function serverKey(){
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(legacy) return legacy;
  const modern=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(modern){try{const j=JSON.parse(modern);if(j?.default)return j.default;}catch{}}
  return "";
}
function cleanError(e:any){return e?{code:e.code||null,message:e.message||String(e)}:null;}
function normalizeH2H(row:any,error:any){
  if(error) return {status:"FAIL",isFailure:true,label:"對賽資料讀取失敗",reason:error.message||"query_error"};
  if(!row) return {status:"NO_DATA",isFailure:false,label:"暫無對賽資料",reason:"no_h2h_row"};
  const q=String(row.quality||"").toUpperCase();
  const games=Number(row.h2h_games||0);
  if(q==="H2H_OK" && games>0) return {status:"OK",isFailure:false,label:`近${games}次對賽`,reason:null};
  if(q==="NO_PREVIOUS_H2H_IN_AVAILABLE_HISTORY") return {status:"NO_HISTORY",isFailure:false,label:"可用歷史內無過往對賽",reason:q};
  if(q==="HISTORY_PARTIAL") return {status:"PARTIAL",isFailure:false,label:"對賽歷史仍在補充",reason:q};
  return {status:"PARTIAL",isFailure:false,label:games>0?`近${games}次對賽`:"對賽資料未完整",reason:q||"unknown_quality"};
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
  const db=createClient(sbUrl,key,{auth:{persistSession:false,autoRefreshToken:false}});

  const one=async(table:string,select="*",schema="public")=>{
    const q=(schema==="public"?db:db.schema(schema)).from(table).select(select).eq("hkjc_event_id",id).maybeSingle();
    const r=await q;
    return {data:r.data||null,error:cleanError(r.error)};
  };
  const many=async(table:string,select="*",schema="public")=>{
    const q=(schema==="public"?db:db.schema(schema)).from(table).select(select).eq("hkjc_event_id",id);
    const r=await q;
    return {data:r.data||[],error:cleanError(r.error)};
  };

  const [
    fixtureUpcoming,fixtureLive,fixtureResult,model,forebet,form,power,human,scenario,movement,h2h,eventMap,
    playerStatus,lineups,managers,predictionEvidence,multisource,valueMarket,arbMarket,arbWatch
  ]=await Promise.all([
    one("hkjc_upcoming_current"),
    one("hkjc_live_odds_current"),
    one("match_results","*","private"),
    one("model_predictions"),
    one("forebet_predictions"),
    one("form_predictions"),
    one("hkjc_power_current"),
    one("human_factors_current"),
    many("match_scenario_current"),
    one("odds_movement_current"),
    one("match_h2h_current"),
    one("api_football_event_map"),
    many("phase2_player_status_evidence"),
    many("phase2_match_lineup_evidence"),
    many("phase2_manager_evidence"),
    many("prediction_evidence_current","*","private"),
    one("multisource_consensus_current","*","private"),
    many("phase4_value_api"),
    many("phase4_arb_api"),
    one("phase4_arb_watch_api"),
  ]);

  const archivedFixture = fixtureResult.data ? {
    hkjc_event_id:fixtureResult.data.hkjc_event_id,
    match_id:fixtureResult.data.match_id,
    kickoff_hkt:fixtureResult.data.kickoff_hkt,
    tournament:fixtureResult.data.tournament,
    home_en:fixtureResult.data.home,
    away_en:fixtureResult.data.away,
    home_zh:null,
    away_zh:null,
    status:"FINISHED",
    had_home:null,had_draw:null,had_away:null,
    hil_line:null,hil_over:null,hil_under:null,
    chl_line:null,chl_over:null,chl_under:null,
    fetched_at:fixtureResult.data.fetched_at,
    updated_at:fixtureResult.data.updated_at,
    final_score:{home:fixtureResult.data.home_goals,away:fixtureResult.data.away_goals},
    outcome:fixtureResult.data.outcome,
  } : null;
  const fixture = fixtureUpcoming.data
    ? fixtureUpcoming
    : fixtureLive.data
      ? fixtureLive
      : archivedFixture
        ? {data:archivedFixture,error:null}
        : {data:null,error:null};
  const fixtureSource = fixtureUpcoming.data ? "UPCOMING" : fixtureLive.data ? "LIVE" : archivedFixture ? "RESULT_ARCHIVE" : "MISSING";
  const errors:any={};
  for(const [k,v] of Object.entries({fixtureUpcoming,fixtureLive,fixtureResult,model,forebet,form,power,human,scenario,movement,h2h,eventMap,playerStatus,lineups,managers,predictionEvidence,multisource,valueMarket,arbMarket,arbWatch})){
    if((v as any).error) errors[k]=(v as any).error;
  }

  const valueRows=[...(valueMarket.data||[])].sort((a:any,b:any)=>Number(b.expected_roi_pct||0)-Number(a.expected_roi_pct||0));
  const arbRows=[...(arbMarket.data||[])].sort((a:any,b:any)=>Number(b.net_roi_pct||0)-Number(a.net_roi_pct||0));

  return Response.json({
    generatedAt:new Date().toISOString(),
    id,
    fixture:fixture.data,
    fixtureSource,
    models:{
      internal:model.data,
      forebet:forebet.data,
      form:form.data,
      opta:power.data,
      multisource:multisource.data,
      evidence:predictionEvidence.data,
    },
    humanFactors:{
      summary:human.data,
      eventMap:eventMap.data,
      playerStatus:playerStatus.data,
      lineup:lineups.data,
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
  },{
    headers:{...cors,"Cache-Control":"public, max-age=10, stale-while-revalidate=30"}
  });
});