import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const LIVE = "https://football-fast-tracker-live-sargesticky-9289.vercel.app/api/live_scores";
const DB_READ_TIMEOUT_MS = 8_000;
const UPSTREAM_TIMEOUT_MS = 20_000;
function boundedDbFetch(input:any,init:any={}){
  return fetch(input,{...init,signal:init?.signal??AbortSignal.timeout(DB_READ_TIMEOUT_MS)});
}

function blank(v:any){return v===null||v===undefined||String(v).trim()==="";}
function text(v:any){return blank(v)?null:String(v).trim();}
function num(v:any){if(blank(v)) return null; const n=Number(String(v).trim()); return Number.isFinite(n)?n:null;}
function int(v:any){const n=num(v); return n===null?null:Math.trunc(n);}
function ts(v:any){
  if(blank(v)) return null;
  const s=String(v).trim();
  const serial=Number(s);
  if(Number.isFinite(serial)&&serial>=20000&&serial<=80000) return new Date(Date.UTC(1899,11,30)+serial*86400000-8*3600000).toISOString();
  if(/Z$|[+-]\d\d:\d\d$/.test(s)) return s;
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s+"T00:00:00+08:00";
  return s.replace(" ","T")+"+08:00";
}
function serviceKey(){
  const a=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if(a) return a;
  const m=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(m){try{const j=JSON.parse(m); if(j?.default) return j.default;}catch{}}
  return "";
}
Deno.serve(async (_req:Request)=>{
  const now=new Date(), supabaseUrl=Deno.env.get("SUPABASE_URL")||"", key=serviceKey();
  if(!supabaseUrl||!key) return Response.json({ok:false,error:"server_config_missing"},{status:500});
  const db=createClient(supabaseUrl,key,{auth:{persistSession:false,autoRefreshToken:false},db:{retry:false},global:{fetch:boundedDbFetch}});
  try{
    const {data:hb}=await db.from("source_health").select("observed_at").eq("source","LIVE_SCORE_EDGE").eq("metric","heartbeat").maybeSingle();
    if(hb?.observed_at){
      const age=(now.getTime()-new Date(hb.observed_at).getTime())/60000;
      if(Number.isFinite(age)&&age<0.75) return Response.json({ok:true,skipped:"debounced",ageMinutes:Number(age.toFixed(2))});
    }

    const r=await fetch(LIVE+"?nocache="+Date.now(),{
      headers:{"cache-control":"no-cache","accept":"application/json"},
      signal:AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });
    if(!r.ok) throw new Error("live_json_http_"+r.status);
    const payload=await r.json();
    const rows=Array.isArray(payload?.matches)?payload.matches:[];
    const capturedAt=ts(payload?.updatedAt)||now.toISOString();

    const upstreamBuild=text(payload?.buildVersion);
    const {data:buildCfg}=await db.from("system_config")
      .select("value")
      .eq("key","live_upstream_expected_build")
      .maybeSingle();
    const expectedBuild=text(buildCfg?.value);
    // buildVersion is optional in the live API contract. A missing build id is
    // not deployment drift when the endpoint itself is healthy and parseable.
    // Only flag a mismatch when both sides expose comparable build ids.
    const buildComparable=Boolean(expectedBuild && upstreamBuild);
    const buildStatus=buildComparable && upstreamBuild!==expectedBuild ? "WARN" : "OK";
    await db.from("source_health").upsert({
      source:"LIVE_UPSTREAM_DEPLOY",
      metric:"heartbeat",
      status:buildStatus,
      value_text:upstreamBuild || "BUILD_ID_NOT_EXPOSED",
      notes:buildComparable
        ? (buildStatus==="OK"
            ? "Live upstream deployment matches expected build."
            : `Live upstream deployment drift: expected ${expectedBuild}, got ${upstreamBuild}.`)
        : "Live upstream endpoint healthy; buildVersion is not exposed, so deployment identity is not comparable.",
      observed_at:now.toISOString(),
      raw:{
        expected_build:expectedBuild,
        upstream_build:upstreamBuild,
        build_comparable:buildComparable,
        upstream_updated_at:payload?.updatedAt??null,
        endpoint:LIVE
      }
    },{onConflict:"source,metric"});

    const stubs=rows.filter((x:any)=>x?.hkjc_event_id).map((x:any)=>({
      hkjc_event_id:text(x.hkjc_event_id),kickoff_hkt:ts(x.kickoff_hkt),tournament:text(x.league),
      home_en:text(x.home_en),away_en:text(x.away_en),status:"HISTORICAL_STUB",selling:false,in_play:false,
      raw:{edge_sync_stub:true}
    }));
    if(stubs.length){
      const {error}=await db.from("matches").upsert(stubs,{onConflict:"hkjc_event_id",ignoreDuplicates:true});
      if(error) throw new Error("matches:"+error.message);
    }

    const eventIds=rows.map((x:any)=>text(x?.hkjc_event_id)).filter(Boolean);
    const verifiedIdentity=new Map<string,any>();
    if(eventIds.length){
      const {data:maps}=await db.from("phase3_live_identity_map")
        .select("hkjc_event_id,source,source_match_id,confidence,evidence_count,mapping_state")
        .in("hkjc_event_id",eventIds)
        .eq("mapping_state","VERIFIED");
      for(const m of maps??[]) verifiedIdentity.set(String(m.hkjc_event_id),m);
    }

    const enrichedRows=rows.map((x:any)=>{
      const id=text(x?.hkjc_event_id);
      const mapped=id?verifiedIdentity.get(id):null;
      if(!mapped || text(x?.source_match_id)) return x;
      return {
        ...x,
        source_match_id:mapped.source_match_id,
        identity_backfill:{
          source:mapped.source,
          confidence:mapped.confidence,
          evidence_count:mapped.evidence_count
        }
      };
    });

    const current=enrichedRows.filter((x:any)=>x?.hkjc_event_id).map((x:any)=>({
      hkjc_event_id:text(x.hkjc_event_id),updated_at_source:capturedAt,kickoff_hkt:ts(x.kickoff_hkt),
      league:text(x.league),home_en:text(x.home_en),away_en:text(x.away_en),live_score:text(x.live_score),
      home_score:int(x.home_score),away_score:int(x.away_score),minute:int(x.minute),match_status:text(x.match_status),
      source:text(x.source),source_match_id:text(x.source_match_id),source_home:text(x.source_home),source_away:text(x.source_away),
      match_confidence:num(x.match_confidence),source_updated_at:ts(x.source_updated_at),
      home_corners:int(x.home_corners),away_corners:int(x.away_corners),total_corners:int(x.total_corners),
      corner_line_ref:text(x.corner_line_ref),corners_to_hi:num(x.corners_to_hi),corner_progress:text(x.corner_progress),raw:x
    }));
    if(current.length){
      const {error}=await db.from("live_score_current").upsert(current,{onConflict:"hkjc_event_id"});
      if(error) throw new Error("live_score_current:"+error.message);
    }

    const stats=enrichedRows.filter((x:any)=>x?.hkjc_event_id).map((x:any)=>({
      hkjc_event_id:text(x.hkjc_event_id),captured_at_hkt:capturedAt,api_updated_at:ts(x.source_updated_at),
      kickoff_hkt:ts(x.kickoff_hkt),league:text(x.league),home_en:text(x.home_en),away_en:text(x.away_en),
      live_score:text(x.live_score),match_minute:int(x.minute),match_status:text(x.match_status),source:text(x.source),
      source_match_id:text(x.source_match_id),match_confidence:num(x.match_confidence),detail_status:text(x.detail_status),
      home_corners:int(x.home_corners),away_corners:int(x.away_corners),total_corners:int(x.total_corners),
      corner_line_ref:text(x.corner_line_ref),corner_progress:text(x.corner_progress),
      team_stats:Array.isArray(x.team_stats)?x.team_stats:[],events:Array.isArray(x.events)?x.events:[],
      momentum:Array.isArray(x.momentum)?x.momentum:[],full_capture:false,
      raw:{scenario_shadow:x.scenario_shadow??null,hkjc_live_market:x.hkjc_live_market??null,
        shotmap_available:Boolean(x.shotmap),lineup_available:Boolean(x.lineup)}
    }));

    if(stats.length){
      // Keep active diagnostic cycles, but do not write the same terminal
      // score-only row every minute after a match has finished.
      const terminal = new Set(["FULLTIME","FINISHED","FT","ENDED","MATCHENDED","INPLAYMATCHENDED","AET","PEN","CANCELLED","CANCELED","VOID","ABANDONED"]);
      const history=stats
        .filter((x:any)=>{
          const status=String(x.match_status||"").toUpperCase().replaceAll("_","").replaceAll(" ","");
          const hasDetail=(Array.isArray(x.team_stats)&&x.team_stats.length>0) ||
            (Array.isArray(x.events)&&x.events.length>0) ||
            (Array.isArray(x.momentum)&&x.momentum.length>0);
          return hasDetail || !terminal.has(status);
        })
        .map((x:any)=>({...x,raw_full_capture_key:null,raw_full_chunk_count:null}));
      if(history.length){
        const {error:he}=await db.from("live_stats_history").upsert(history,{onConflict:"hkjc_event_id,captured_at_hkt",ignoreDuplicates:true});
        if(he) throw new Error("live_stats_history:"+he.message);
      }

      // live_stats_current means "latest successful detail snapshot", not
      // "latest polling cycle". Never let a rate-guard/empty cycle erase xG,
      // shots, possession, events or momentum captured minutes earlier.
      const currentStats=stats.filter((x:any)=>
        (Array.isArray(x.team_stats)&&x.team_stats.length>0) ||
        (Array.isArray(x.events)&&x.events.length>0) ||
        (Array.isArray(x.momentum)&&x.momentum.length>0)
      );
      if(currentStats.length){
        const {error}=await db.from("live_stats_current").upsert(currentStats,{onConflict:"hkjc_event_id"});
        if(error) throw new Error("live_stats_current:"+error.message);
      }

      const deferred=stats.filter((x:any)=>String(x.detail_status||"")==="DEFERRED_RATE_GUARD").length;
      const empty=stats.filter((x:any)=>String(x.detail_status||"")==="DETAIL_EMPTY").length;
      const identityBackfills=enrichedRows.filter((x:any)=>x?.identity_backfill&&text(x?.source_match_id)).length;
      const terminalStatuses=new Set(["FULLTIME","FINISHED","FT","ENDED","MATCHENDED","INPLAYMATCHENDED","AET","PEN","CANCELLED","CANCELED","VOID","ABANDONED"]);
      const activeRows=rows.filter((x:any)=>!terminalStatuses.has(String(x.match_status||"").toUpperCase().replaceAll("_","").replaceAll(" ","")));
      await db.from("source_health").upsert({
        source:"LIVE_SCORE_EDGE",metric:"heartbeat",value_text:String(activeRows.length),status:"OK",
        notes:"Supabase direct live score/stats sync",observed_at:now.toISOString(),
        raw:{
          rows:rows.length,
          active_rows:activeRows.length,
          terminal_rows:rows.length-activeRows.length,
          identity_backfills:identityBackfills,
          history_writes:history.length,
          detail_current_updates:currentStats.length,
          deferred_rows:deferred,
          detail_empty_rows:empty,
          upstream_updated_at:payload?.updatedAt??null,
          upstream_build:upstreamBuild,
          expected_build:expectedBuild,
          health:payload?.health??null
        }
      },{onConflict:"source,metric"});

      return Response.json({
        ok:true,rows:rows.length,activeRows:activeRows.length,identityBackfills,historyWrites:history.length,
        detailCurrentUpdates:currentStats.length,
        deferredRows:deferred,detailEmptyRows:empty,capturedAt,
        upstreamUpdatedAt:payload?.updatedAt??null,
        upstreamBuild,
        expectedBuild
      });
    }

    await db.from("source_health").upsert({
      source:"LIVE_SCORE_EDGE",metric:"heartbeat",value_text:"0",status:"OK",
      notes:"Supabase direct live score/stats sync",observed_at:now.toISOString(),
      raw:{rows:0,detail_current_updates:0,upstream_updated_at:payload?.updatedAt??null,upstream_build:upstreamBuild,expected_build:expectedBuild,health:payload?.health??null}
    },{onConflict:"source,metric"});

    return Response.json({ok:true,rows:0,detailCurrentUpdates:0,capturedAt,upstreamUpdatedAt:payload?.updatedAt??null,upstreamBuild,expectedBuild});
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    try{
      await db.from("source_health").upsert({
        source:"LIVE_SCORE_EDGE",metric:"heartbeat",value_text:message,status:"FAIL",
        notes:"Supabase direct live score/stats sync failed",observed_at:now.toISOString(),raw:{error:message}
      },{onConflict:"source,metric"});
    }catch(healthError){
      console.warn("live_score_health_write_failed",String(healthError));
    }
    return Response.json({ok:false,error:message},{status:503});
  }
});