import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const ENDPOINT = "https://info.cld.hkjc.com/graphql/base/";
const MATCH_ODDS = "\n      query ESmatchList($startIndex: Int, $endIndex: Int,$startDate: String, $endDate: String, $matchIds: [String], $tournIds: [String], $fbOddsTypes: [FBOddsType]!, $fbOddsTypesM: [FBOddsType]!, $inplayOnly: Boolean, $featuredMatchesOnly: Boolean, $frontEndIds: [String], $earlySettlementOnly: Boolean, $showAllMatch: Boolean) {\n        matches(startIndex: $startIndex,endIndex: $endIndex, startDate: $startDate, endDate: $endDate, matchIds: $matchIds, tournIds: $tournIds, fbOddsTypes: $fbOddsTypesM, inplayOnly: $inplayOnly, featuredMatchesOnly: $featuredMatchesOnly, frontEndIds: $frontEndIds, earlySettlementOnly: $earlySettlementOnly, showAllMatch: $showAllMatch) {\n          id\n          frontEndId\n          matchDate\n          kickOffTime\n          status\n          updateAt\n          sequence\n          esIndicatorEnabled\n          homeTeam {\n            id\n            name_en\n            name_ch\n          }\n          awayTeam {\n            id\n            name_en\n            name_ch\n          }\n          tournament {\n            id\n            frontEndId\n            nameProfileId\n            isInteractiveServiceAvailable\n            code\n            name_en\n            name_ch\n          }\n          isInteractiveServiceAvailable\n          inplayDelay\n          venue {\n            code\n            name_en\n            name_ch\n          }\n          tvChannels {\n            code\n            name_en\n            name_ch\n          }\n          liveEvents {\n            id\n            code\n          }\n          featureStartTime\n          featureMatchSequence\n          poolInfo {\n            normalPools\n            inplayPools\n            sellingPools\n            ntsInfo\n            entInfo\n            definedPools\n            ngsInfo {\n              str\n              name_en\n              name_ch\n              instNo\n            }\n            agsInfo {\n              str\n              name_en\n              name_ch\n            }\n          }\n          runningResult {\n            homeScore\n            awayScore\n            corner\n            homeCorner\n            awayCorner\n          }\n          runningResultExtra {\n            homeScore\n            awayScore\n            corner\n            homeCorner\n            awayCorner\n          }\n          results {\n            sequence\n            resultType\n            stageId\n            homeResult\n            awayResult\n            resultConfirmType\n            payoutConfirmed\n          }\n          adminOperation {\n            remark {\n              typ\n            }\n          }\n          foPools(fbOddsTypes: $fbOddsTypes) {\n            id\n            status\n            oddsType\n            instNo\n            inplay\n            name_ch\n            name_en\n            updateAt\n            expectedSuspendDateTime\n            lines {\n              lineId\n              status\n              condition\n              main\n              combinations {\n                combId\n                str\n                status\n                offerEarlySettlement\n                currentOdds\n                selections {\n                  selId\n                  str\n                  name_ch\n                  name_en\n                }\n              }\n            }\n          }\n        }\n      }\n      ";
const HEADERS = {
  "Content-Type": "application/json",
  "Origin": "https://bet.hkjc.com",
  "Referer": "https://bet.hkjc.com/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};

function num(v:any){ const n=Number(v); return Number.isFinite(n)?n:null; }
function txt(v:any){ return v==null ? "" : String(v).trim(); }
function truthy(v:any){ return v===true || ["1","true","yes","y"].includes(txt(v).toLowerCase()); }
function price(v:any){ const n=num(v); return n!=null && n>1 ? n : null; }
function liveStatus(v:any){
  const s=txt(v).toUpperCase().replaceAll("_","").replaceAll(" ","");
  if(!s) return false;
  if(["PREEVENT","ENDED","FINISHED","FULLTIME","CANCEL","POSTPON","ABANDON"].some(x=>s.includes(x))) return false;
  return ["FIRSTHALF","SECONDHALF","HALFTIME","INPLAY","EXTRATIME","PENALTY","BREAK"].some(x=>s.includes(x));
}
function vars(types:string[]){
  return {
    fbOddsTypes: types,
    fbOddsTypesM: types,
    inplayOnly: false,
    featuredMatchesOnly: false,
    startDate: null, endDate: null, tournIds: null, matchIds: null,
    tournId: null, tournProfileId: null, subType: null,
    startIndex: null, endIndex: null, frontEndIds: null,
    earlySettlementOnly: false, showAllMatch: false, tday: null, tIdList: null,
  };
}
async function gql(types:string[]){
  const r=await fetch(ENDPOINT,{
    method:"POST",headers:HEADERS,
    body:JSON.stringify({query:MATCH_ODDS,variables:vars(types)}),
    signal:AbortSignal.timeout(25000),
  });
  if(!r.ok) throw new Error("hkjc_http_"+r.status);
  const j=await r.json();
  if(j?.errors?.length) throw new Error("hkjc_gql_"+j.errors.map((x:any)=>x?.message||"?").join(";"));
  return Array.isArray(j?.data?.matches) ? j.data.matches : [];
}
function flatten(matches:any[]){
  const out:any[]=[];
  for(const m of matches){
    const rr=m?.runningResult||m?.runningResultExtra||{};
    const base={
      match_id:m?.id,front_end_id:m?.frontEndId,kick_off:m?.kickOffTime,status:m?.status,
      tournament:m?.tournament?.code,tournament_ch:m?.tournament?.name_ch,
      home:m?.homeTeam?.name_en,away:m?.awayTeam?.name_en,
      home_ch:m?.homeTeam?.name_ch,away_ch:m?.awayTeam?.name_ch,
      running_home_score:num(rr?.homeScore),
      running_away_score:num(rr?.awayScore),
      running_home_corner:num(rr?.homeCorner),
      running_away_corner:num(rr?.awayCorner),
      running_corner:num(rr?.corner),
      match_updated_at:m?.updateAt||null,
    };
    for(const pool of (m?.foPools||[])){
      for(const line of (pool?.lines||[])){
        for(const comb of (line?.combinations||[])){
          out.push({...base,odds_type:pool?.oddsType,pool_status:pool?.status,in_play:pool?.inplay,
            line_id:line?.lineId,condition:line?.condition,main_line:line?.main,comb_id:comb?.combId,
            selection:comb?.str,odds:comb?.currentOdds,comb_status:comb?.status,updated_at:pool?.updateAt});
        }
      }
    }
  }
  return out;
}
function chooseHandicap(rows:any[]){
  const grouped=new Map<string,any>();
  for(const r of rows){
    if(txt(r.odds_type).toUpperCase()!=="HDC") continue;
    if(!truthy(r.in_play)||!liveStatus(r.status)) continue;
    if(!["","AVAILABLE"].includes(txt(r.comb_status).toUpperCase())) continue;
    if(txt(r.pool_status).toUpperCase()!=="SELLINGSTARTED") continue;
    const eid=txt(r.front_end_id); if(!eid) continue;
    const line=txt(r.condition), key=eid+"|"+line;
    const rec=grouped.get(key)||{event_id:eid,line,main:false,home:null,away:null,updated_at:""};
    rec.main=rec.main||truthy(r.main_line);
    const sel=txt(r.selection).toUpperCase();
    if(sel==="H") rec.home=price(r.odds);
    else if(sel==="A") rec.away=price(r.odds);
    if(txt(r.updated_at)) rec.updated_at=txt(r.updated_at);
    grouped.set(key,rec);
  }
  const byEvent=new Map<string,any[]>();
  for(const rec of grouped.values()){
    if(rec.home==null||rec.away==null) continue;
    const a=byEvent.get(rec.event_id)||[]; a.push(rec); byEvent.set(rec.event_id,a);
  }
  const chosen=new Map<string,any>();
  for(const [eid,a] of byEvent) chosen.set(eid,a.find(x=>x.main)||a[0]);
  return chosen;
}
function chooseTwoWay(rows:any[], oddsType:string){
  const grouped=new Map<string,any>();
  for(const r of rows){
    if(txt(r.odds_type).toUpperCase()!==oddsType) continue;
    if(!truthy(r.in_play)||!liveStatus(r.status)) continue;
    if(!["","AVAILABLE"].includes(txt(r.comb_status).toUpperCase())) continue;
    if(txt(r.pool_status).toUpperCase()!=="SELLINGSTARTED") continue;
    const eid=txt(r.front_end_id); if(!eid) continue;
    const line=txt(r.condition), key=eid+"|"+line;
    const rec=grouped.get(key)||{event_id:eid,line,main:false,over:null,under:null,updated_at:""};
    rec.main=rec.main||truthy(r.main_line);
    const sel=txt(r.selection).toUpperCase();
    if(sel==="H") rec.over=price(r.odds);
    if(sel==="L") rec.under=price(r.odds);
    if(txt(r.updated_at)) rec.updated_at=txt(r.updated_at);
    grouped.set(key,rec);
  }
  const byEvent=new Map<string,any[]>();
  for(const rec of grouped.values()){
    if(rec.over==null||rec.under==null) continue;
    const a=byEvent.get(rec.event_id)||[]; a.push(rec); byEvent.set(rec.event_id,a);
  }
  const chosen=new Map<string,any>();
  for(const [eid,a] of byEvent) chosen.set(eid,a.find(x=>x.main)||a[0]);
  return chosen;
}
function serviceKey(){
  const a=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if(a) return a;
  const m=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(m){ try{ const j=JSON.parse(m); if(j?.default) return j.default; }catch{} }
  return "";
}

Deno.serve(async (_req:Request)=>{
  const now=new Date();
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const key=serviceKey();
  if(!supabaseUrl||!key) return Response.json({ok:false,error:"server_config_missing"},{status:500});
  const db=createClient(supabaseUrl,key,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    const {data:hb}=await db.from("source_health").select("observed_at").eq("source","HKJC_LIVE_EDGE").eq("metric","heartbeat").maybeSingle();
    if(hb?.observed_at){
      const age=(now.getTime()-new Date(hb.observed_at).getTime())/60000;
      if(Number.isFinite(age)&&age<0.75) return Response.json({ok:true,skipped:"debounced",ageMinutes:Number(age.toFixed(2))});
    }

    const hadRows=flatten(await gql(["HAD","EHA"]));
    const liveHad=hadRows.filter(r=>truthy(r.in_play)&&liveStatus(r.status)&&["","AVAILABLE"].includes(txt(r.comb_status).toUpperCase()));
    const liveIds=[...new Set(liveHad.map(r=>txt(r.front_end_id)).filter(Boolean))].sort();
    let hdc=new Map<string,any>(), hil=new Map<string,any>(), chl=new Map<string,any>();
    if(liveIds.length){
      const [hdcMatches,hilMatches,chlMatches]=await Promise.all([
        gql(["HDC","EDC"]),
        gql(["HIL","EHL"]),
        gql(["CHL","ECH"])
      ]);
      hdc=chooseHandicap(flatten(hdcMatches));
      hil=chooseTwoWay(flatten(hilMatches),"HIL");
      chl=chooseTwoWay(flatten(chlMatches),"CHL");
    }

    const base=new Map<string,any>();
    const fetchedAt=now.toISOString();
    for(const r of liveHad){
      const eid=txt(r.front_end_id); if(!liveIds.includes(eid)) continue;
      const rec=base.get(eid)||{
        fetched_at:fetchedAt,hkjc_event_id:eid,match_id:txt(r.match_id),kickoff_hkt:txt(r.kick_off)||null,
        status:txt(r.status),tournament:txt(r.tournament),tournament_zh:txt(r.tournament_ch)||null,
        home_en:txt(r.home),away_en:txt(r.away),
        home_zh:txt(r.home_ch),away_zh:txt(r.away_ch),had_home:null,had_draw:null,had_away:null,
        hdc_line:null,hdc_home:null,hdc_away:null,
        hil_line:null,hil_over:null,hil_under:null,chl_line:null,chl_over:null,chl_under:null,
        pool_status:txt(r.pool_status),odds_updated_at:txt(r.updated_at)||null,
        running_home_score:num(r.running_home_score),running_away_score:num(r.running_away_score),
        running_home_corner:num(r.running_home_corner),running_away_corner:num(r.running_away_corner),
        running_corner:num(r.running_corner),match_updated_at:txt(r.match_updated_at)||null
      };
      const p=txt(r.pool_status).toUpperCase()==="SELLINGSTARTED" ? price(r.odds) : null;
      const sel=txt(r.selection).toUpperCase();
      if(sel==="H") rec.had_home=p; else if(sel==="D") rec.had_draw=p; else if(sel==="A") rec.had_away=p;
      if(txt(r.pool_status)) rec.pool_status=txt(r.pool_status);
      if(txt(r.updated_at)) rec.odds_updated_at=txt(r.updated_at);
      base.set(eid,rec);
    }

    const out:any[]=[];
    for(const eid of liveIds){
      const rec=base.get(eid); if(!rec) continue;
      const a=hdc.get(eid)||{}, h=hil.get(eid)||{}, c=chl.get(eid)||{};
      rec.hdc_line=a.line||null; rec.hdc_home=a.home??null; rec.hdc_away=a.away??null;
      rec.hil_line=h.line||null; rec.hil_over=h.over??null; rec.hil_under=h.under??null;
      rec.chl_line=c.line||null; rec.chl_over=c.over??null; rec.chl_under=c.under??null;
      const ups=[rec.odds_updated_at,a.updated_at,h.updated_at,c.updated_at].filter(Boolean).sort();
      rec.odds_updated_at=ups.length?ups[ups.length-1]:null;
      rec.raw={source:"supabase-direct-hkjc",requests:liveIds.length?4:1,tournament_zh:rec.tournament_zh};
      out.push(rec);
    }

    if(out.length){
      const matchRows=out.map(r=>({
        hkjc_event_id:r.hkjc_event_id,hkjc_match_id:r.match_id,kickoff_hkt:r.kickoff_hkt,status:r.status,
        tournament:r.tournament,tournament_zh:r.tournament_zh,
        home_en:r.home_en,away_en:r.away_en,home_zh:r.home_zh,away_zh:r.away_zh,
        in_play:true,selling:r.pool_status==="SELLINGSTARTED",fetched_at:fetchedAt,
        source_updated_at:r.odds_updated_at,raw:{source:"supabase-direct-hkjc-live"}
      }));
      const {error:me}=await db.from("matches").upsert(matchRows,{onConflict:"hkjc_event_id"}); if(me) throw me;
      const marketRows=out.map((r:any)=>{
        const {
          running_home_score,running_away_score,running_home_corner,running_away_corner,
          running_corner,match_updated_at,...market
        }=r;
        return market;
      });
      const {error:le}=await db.from("hkjc_live_odds_current").upsert(marketRows,{onConflict:"hkjc_event_id"}); if(le) throw new Error("hkjc_live_odds_current:"+le.message);

      const scoreRows=out.map((r:any)=>{
        const hs=num(r.running_home_score),as=num(r.running_away_score);
        const hc=num(r.running_home_corner),ac=num(r.running_away_corner);
        const totalCorners=hc!=null&&ac!=null ? hc+ac : num(r.running_corner);
        const cornerTarget=r.chl_line!=null && Number.isFinite(Number(r.chl_line))
          ? Math.floor(Number(r.chl_line))+1
          : null;
        const cornersToHi=cornerTarget!=null && totalCorners!=null ? Math.max(0,cornerTarget-totalCorners) : null;
        return {
          hkjc_event_id:r.hkjc_event_id,
          updated_at_source:fetchedAt,
          kickoff_hkt:r.kickoff_hkt,
          league:r.tournament,
          home_en:r.home_en,
          away_en:r.away_en,
          live_score:hs!=null&&as!=null ? `${hs}-${as}` : null,
          home_score:hs,
          away_score:as,
          minute:null,
          match_status:r.status,
          source:"HKJC_RUNNING_RESULT",
          source_match_id:r.match_id||null,
          source_home:r.home_en,
          source_away:r.away_en,
          match_confidence:1,
          source_updated_at:r.match_updated_at||r.odds_updated_at||fetchedAt,
          home_corners:hc,
          away_corners:ac,
          total_corners:totalCorners,
          corner_line_ref:r.chl_line||null,
          corners_to_hi:cornersToHi,
          corner_progress:totalCorners==null||r.chl_line==null
            ? null
            : cornersToHi===0
              ? `${totalCorners}/${r.chl_line} · 已過大`
              : `${totalCorners}/${r.chl_line} · 差${cornersToHi}`,
          raw:{
            source:"hkjc-running-result",
            exact_hkjc_identity:true,
            running_result_available:hs!=null||as!=null||totalCorners!=null
          }
        };
      });
      const {error:se}=await db.from("live_score_current").upsert(scoreRows,{onConflict:"hkjc_event_id"}); if(se) throw new Error("live_score_current:"+se.message);
    }

    const {data:existing,error:ee}=await db.from("hkjc_live_odds_current").select("hkjc_event_id"); if(ee) throw ee;
    const keep=new Set(out.map(r=>r.hkjc_event_id));
    const stale=(existing||[]).map((r:any)=>r.hkjc_event_id).filter((id:string)=>!keep.has(id));
    if(stale.length){
      const {error:de}=await db.from("hkjc_live_odds_current").delete().in("hkjc_event_id",stale); if(de) throw de;
    }

    await db.from("source_health").upsert({
      source:"HKJC_LIVE_EDGE",metric:"heartbeat",value_text:String(out.length),
      status:"OK",notes:"Supabase direct HKJC live capture",observed_at:fetchedAt,
      raw:{
        live_rows:out.length,
        requests:liveIds.length?4:1,
        running_result_rows:out.filter((r:any)=>r.running_home_score!=null||r.running_away_score!=null||r.running_corner!=null).length
      }
    },{onConflict:"source,metric"});

    return Response.json({
      ok:true,
      liveRows:out.length,
      scoreRows:out.length,
      runningResultRows:out.filter((r:any)=>r.running_home_score!=null||r.running_away_score!=null||r.running_corner!=null).length,
      requests:liveIds.length?4:1,
      ids:out.map(r=>r.hkjc_event_id),
      fetchedAt
    });
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    await db.from("source_health").upsert({
      source:"HKJC_LIVE_EDGE",metric:"heartbeat",value_text:message,status:"FAIL",
      notes:"Supabase direct HKJC live capture failed",observed_at:now.toISOString(),raw:{error:message}
    },{onConflict:"source,metric"});
    return Response.json({ok:false,error:message},{status:500});
  }
});