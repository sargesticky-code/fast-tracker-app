import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const ENDPOINT="https://info.cld.hkjc.com/graphql/base/";
const ALL_MATCH_LIST="\n    query allMatchList {\n      timeOffset {\n        fb\n      }\n      matches: matchList {\n        id\n        frontEndId\n        matchDate\n        kickOffTime\n        status\n        updateAt\n        sequence\n        esIndicatorEnabled\n        homeTeam {\n          id\n          name_en\n          name_ch\n        }\n        awayTeam {\n          id\n          name_en\n          name_ch\n        }\n        tournament {\n          id\n          frontEndId\n          nameProfileId\n          sequence\n          isInteractiveServiceAvailable\n          code\n          name_en\n          name_ch\n        }\n        isInteractiveServiceAvailable\n        inplayDelay\n        venue {\n          code\n          name_en\n          name_ch\n        }\n        tvChannels {\n          code\n          name_en\n          name_ch\n        }\n        liveEvents {\n          id\n          code\n        }\n        featureStartTime\n        featureMatchSequence\n        poolInfo {\n          normalPools\n          inplayPools\n          sellingPools\n          ntsInfo\n          entInfo\n          definedPools\n          ngsInfo {\n            str\n            name_en\n            name_ch\n            instNo\n          }\n          agsInfo {\n            str\n            name_en\n            name_ch\n          }\n        }\n        runningResult {\n          homeScore\n          awayScore\n          corner\n          homeCorner\n          awayCorner\n        }\n        runningResultExtra {\n          homeScore\n          awayScore\n          corner\n          homeCorner\n          awayCorner\n        }\n        adminOperation {\n          remark {\n            typ\n          }\n        }\n      }\n    }\n  ";
const MATCH_ODDS="\n      query ESmatchList($startIndex: Int, $endIndex: Int,$startDate: String, $endDate: String, $matchIds: [String], $tournIds: [String], $fbOddsTypes: [FBOddsType]!, $fbOddsTypesM: [FBOddsType]!, $inplayOnly: Boolean, $featuredMatchesOnly: Boolean, $frontEndIds: [String], $earlySettlementOnly: Boolean, $showAllMatch: Boolean) {\n        matches(startIndex: $startIndex,endIndex: $endIndex, startDate: $startDate, endDate: $endDate, matchIds: $matchIds, tournIds: $tournIds, fbOddsTypes: $fbOddsTypesM, inplayOnly: $inplayOnly, featuredMatchesOnly: $featuredMatchesOnly, frontEndIds: $frontEndIds, earlySettlementOnly: $earlySettlementOnly, showAllMatch: $showAllMatch) {\n          id\n          frontEndId\n          matchDate\n          kickOffTime\n          status\n          updateAt\n          sequence\n          esIndicatorEnabled\n          homeTeam {\n            id\n            name_en\n            name_ch\n          }\n          awayTeam {\n            id\n            name_en\n            name_ch\n          }\n          tournament {\n            id\n            frontEndId\n            nameProfileId\n            isInteractiveServiceAvailable\n            code\n            name_en\n            name_ch\n          }\n          isInteractiveServiceAvailable\n          inplayDelay\n          venue {\n            code\n            name_en\n            name_ch\n          }\n          tvChannels {\n            code\n            name_en\n            name_ch\n          }\n          liveEvents {\n            id\n            code\n          }\n          featureStartTime\n          featureMatchSequence\n          poolInfo {\n            normalPools\n            inplayPools\n            sellingPools\n            ntsInfo\n            entInfo\n            definedPools\n            ngsInfo {\n              str\n              name_en\n              name_ch\n              instNo\n            }\n            agsInfo {\n              str\n              name_en\n              name_ch\n            }\n          }\n          runningResult {\n            homeScore\n            awayScore\n            corner\n            homeCorner\n            awayCorner\n          }\n          runningResultExtra {\n            homeScore\n            awayScore\n            corner\n            homeCorner\n            awayCorner\n          }\n          results {\n            sequence\n            resultType\n            stageId\n            homeResult\n            awayResult\n            resultConfirmType\n            payoutConfirmed\n          }\n          adminOperation {\n            remark {\n              typ\n            }\n          }\n          foPools(fbOddsTypes: $fbOddsTypes) {\n            id\n            status\n            oddsType\n            instNo\n            inplay\n            name_ch\n            name_en\n            updateAt\n            expectedSuspendDateTime\n            lines {\n              lineId\n              status\n              condition\n              main\n              combinations {\n                combId\n                str\n                status\n                offerEarlySettlement\n                currentOdds\n                selections {\n                  selId\n                  str\n                  name_ch\n                  name_en\n                }\n              }\n            }\n          }\n        }\n      }\n      ";
const HEADERS={
  "Content-Type":"application/json",
  "Origin":"https://bet.hkjc.com",
  "Referer":"https://bet.hkjc.com/",
  "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};

function txt(v:any){return v==null?"":String(v).trim();}
function num(v:any){const n=Number(v);return Number.isFinite(n)?n:null;}
function price(v:any){const n=num(v);return n!=null&&n>1?n:null;}
function truthy(v:any){return v===true||["1","true","yes","y"].includes(txt(v).toLowerCase());}
function ended(v:any){
  const s=txt(v).toUpperCase().replaceAll("_","").replaceAll(" ","");
  return ["MATCHENDED","INPLAYMATCHENDED","FULLTIME","FINISHED","ENDED","CANCEL","POSTPON","ABANDON","VOID"].some(x=>s.includes(x));
}
function serviceKey(){
  const a=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if(a) return a;
  const m=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(m){try{const j=JSON.parse(m); if(j?.default) return j.default;}catch{}}
  return "";
}
async function post(query:string,variables:any={},timeoutMs=9000,retries=1){
  let last:any=null;
  for(let attempt=0;attempt<=retries;attempt++){
    try{
      const r=await fetch(ENDPOINT,{
        method:"POST",headers:HEADERS,body:JSON.stringify({query,variables}),
        signal:AbortSignal.timeout(timeoutMs)
      });
      if(!r.ok) throw new Error("hkjc_http_"+r.status);
      const j=await r.json();
      if(j?.errors?.length) throw new Error("hkjc_gql_"+j.errors.map((x:any)=>x?.message||"?").join(";"));
      return j?.data||{};
    }catch(e){
      last=e;
      if(attempt<retries) await new Promise(res=>setTimeout(res,250));
    }
  }
  throw last instanceof Error?last:new Error(String(last));
}
function vars(types:string[]){
  return {
    fbOddsTypes:types,fbOddsTypesM:types,inplayOnly:false,featuredMatchesOnly:false,
    startDate:null,endDate:null,tournIds:null,matchIds:null,tournId:null,tournProfileId:null,
    subType:null,startIndex:null,endIndex:null,frontEndIds:null,earlySettlementOnly:false,
    showAllMatch:false,tday:null,tIdList:null,
  };
}
async function odds(types:string[]){
  const d=await post(MATCH_ODDS,vars(types),8000,0);
  return Array.isArray(d?.matches)?d.matches:[];
}
async function safeOdds(types:string[]){
  try{
    return {matches:await odds(types),error:null as string|null};
  }catch(e){
    return {matches:[] as any[],error:e instanceof Error?e.message:String(e)};
  }
}
function flatten(matches:any[]){
  const out:any[]=[];
  for(const m of matches){
    const base={match_id:m?.id,front_end_id:m?.frontEndId,kick_off:m?.kickOffTime,status:m?.status,
      tournament:m?.tournament?.code,tournament_ch:m?.tournament?.name_ch,
      home:m?.homeTeam?.name_en,away:m?.awayTeam?.name_en,
      home_ch:m?.homeTeam?.name_ch,away_ch:m?.awayTeam?.name_ch};
    for(const pool of (m?.foPools||[])){
      for(const line of (pool?.lines||[])){
        for(const comb of (line?.combinations||[])){
          out.push({...base,odds_type:pool?.oddsType,pool_status:pool?.status,in_play:pool?.inplay,
            line_id:line?.lineId,condition:line?.condition,main_line:line?.main,
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
    if(txt(r.pool_status).toUpperCase()!=="SELLINGSTARTED") continue;
    if(!["","AVAILABLE"].includes(txt(r.comb_status).toUpperCase())) continue;
    const id=txt(r.front_end_id); if(!id) continue;
    const line=txt(r.condition), key=id+"|"+line;
    const rec=grouped.get(key)||{id,line,main:false,home:null,away:null,updated_at:""};
    rec.main=rec.main||truthy(r.main_line);
    const sel=txt(r.selection).toUpperCase();
    if(sel==="H") rec.home=price(r.odds);
    else if(sel==="A") rec.away=price(r.odds);
    if(txt(r.updated_at)) rec.updated_at=txt(r.updated_at);
    grouped.set(key,rec);
  }
  const by=new Map<string,any[]>();
  for(const rec of grouped.values()){
    if(rec.home==null||rec.away==null) continue;
    const a=by.get(rec.id)||[]; a.push(rec); by.set(rec.id,a);
  }
  const out=new Map<string,any>();
  for(const [id,a] of by) out.set(id,a.find(x=>x.main)||a[0]);
  return out;
}
function chooseHAD(rows:any[]){
  const m=new Map<string,any>();
  for(const r of rows){
    if(txt(r.odds_type).toUpperCase()!=="HAD") continue;
    if(txt(r.pool_status).toUpperCase()!=="SELLINGSTARTED") continue;
    if(!["","AVAILABLE"].includes(txt(r.comb_status).toUpperCase())) continue;
    const id=txt(r.front_end_id); if(!id) continue;
    const rec=m.get(id)||{home:null,draw:null,away:null,updated_at:""};
    const sel=txt(r.selection).toUpperCase();
    if(sel==="H") rec.home=price(r.odds);
    else if(sel==="D") rec.draw=price(r.odds);
    else if(sel==="A") rec.away=price(r.odds);
    if(txt(r.updated_at)) rec.updated_at=txt(r.updated_at);
    m.set(id,rec);
  }
  return m;
}
function chooseTwo(rows:any[],type:string){
  const grouped=new Map<string,any>();
  for(const r of rows){
    if(txt(r.odds_type).toUpperCase()!==type) continue;
    if(txt(r.pool_status).toUpperCase()!=="SELLINGSTARTED") continue;
    if(!["","AVAILABLE"].includes(txt(r.comb_status).toUpperCase())) continue;
    const id=txt(r.front_end_id); if(!id) continue;
    const line=txt(r.condition), key=id+"|"+line;
    const rec=grouped.get(key)||{id,line,main:false,over:null,under:null,updated_at:""};
    rec.main=rec.main||truthy(r.main_line);
    const sel=txt(r.selection).toUpperCase();
    if(sel==="H") rec.over=price(r.odds);
    else if(sel==="L") rec.under=price(r.odds);
    if(txt(r.updated_at)) rec.updated_at=txt(r.updated_at);
    grouped.set(key,rec);
  }
  const by=new Map<string,any[]>();
  for(const rec of grouped.values()){
    if(rec.over==null||rec.under==null) continue;
    const a=by.get(rec.id)||[]; a.push(rec); by.set(rec.id,a);
  }
  const out=new Map<string,any>();
  for(const [id,a] of by) out.set(id,a.find(x=>x.main)||a[0]);
  return out;
}

Deno.serve(async (_req:Request)=>{
  const now=new Date(), key=serviceKey(), supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  if(!key||!supabaseUrl) return Response.json({ok:false,error:"server_config_missing"},{status:500});
  const db=createClient(supabaseUrl,key,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    const {data:hb}=await db.from("source_health").select("observed_at,status")
      .eq("source","HKJC_UPCOMING_EDGE").eq("metric","heartbeat").maybeSingle();
    if(hb?.observed_at && ["OK","WARN"].includes(String(hb.status||"").toUpperCase())){
      const age=(now.getTime()-new Date(hb.observed_at).getTime())/60000;
      if(Number.isFinite(age)&&age<12) return Response.json({ok:true,skipped:"debounced",ageMinutes:Number(age.toFixed(2))});
    }

    const [listData,hadResult,hdcResult,hilResult,chlResult]=await Promise.all([
      post(ALL_MATCH_LIST,{},9000,1),
      safeOdds(["HAD","EHA"]),
      safeOdds(["HDC","EDC"]),
      safeOdds(["HIL","EHL"]),
      safeOdds(["CHL","ECH"]),
    ]);

    const matches=Array.isArray(listData?.matches)?listData.matches:[];
    const had=chooseHAD(flatten(hadResult.matches));
    const hdc=chooseHandicap(flatten(hdcResult.matches));
    const hil=chooseTwo(flatten(hilResult.matches),"HIL");
    const chl=chooseTwo(flatten(chlResult.matches),"CHL");
    const marketErrors={had:hadResult.error,hdc:hdcResult.error,hil:hilResult.error,chl:chlResult.error};
    let degraded=Boolean(marketErrors.had||marketErrors.hil||marketErrors.chl);

    const {data:previousRows}=await db.from("hkjc_upcoming_current")
      .select("hkjc_event_id,tournament_zh,had_home,had_draw,had_away,hdc_line,hdc_home,hdc_away,hil_line,hil_over,hil_under,chl_line,chl_over,chl_under,odds_updated_at");
    const previous=new Map((previousRows||[]).map((x:any)=>[String(x.hkjc_event_id),x]));
    const maxMs=now.getTime()+48*3600000;
    const fetchedAt=now.toISOString();
    const out:any[]=[];

    for(const m of matches){
      const id=txt(m?.frontEndId); if(!id) continue;
      const kickoff=txt(m?.kickOffTime); const kMs=Date.parse(kickoff);
      if(!Number.isFinite(kMs)||kMs<=now.getTime()||kMs>maxMs) continue;
      if(ended(m?.status)) continue;
      const sellingPools=Array.isArray(m?.poolInfo?.sellingPools)?m.poolInfo.sellingPools:[];
      if(!sellingPools.length) continue;
      const prev:any=previous.get(id)||{};
      const h=had.get(id)||(!hadResult.error?{}:{home:prev.had_home,draw:prev.had_draw,away:prev.had_away,updated_at:prev.odds_updated_at});
      const a=hdc.get(id)||(!hdcResult.error?{}:{line:prev.hdc_line,home:prev.hdc_home,away:prev.hdc_away,updated_at:prev.odds_updated_at});
      const g=hil.get(id)||(!hilResult.error?{}:{line:prev.hil_line,over:prev.hil_over,under:prev.hil_under,updated_at:prev.odds_updated_at});
      const c=chl.get(id)||(!chlResult.error?{}:{line:prev.chl_line,over:prev.chl_over,under:prev.chl_under,updated_at:prev.odds_updated_at});
      const updates=[h.updated_at,a.updated_at,g.updated_at,c.updated_at,txt(m?.updateAt)].filter(Boolean).sort();
      out.push({
        hkjc_event_id:id,fetched_at:fetchedAt,match_id:txt(m?.id)||null,kickoff_hkt:kickoff,
        status:txt(m?.status),tournament:txt(m?.tournament?.code),
        tournament_zh:txt(m?.tournament?.name_ch)||prev.tournament_zh||null,
        home_en:txt(m?.homeTeam?.name_en),away_en:txt(m?.awayTeam?.name_en),
        home_zh:txt(m?.homeTeam?.name_ch),away_zh:txt(m?.awayTeam?.name_ch),
        live_eligible:Array.isArray(m?.poolInfo?.inplayPools)&&m.poolInfo.inplayPools.length>0,
        selling:true,pool_status:"SELLINGSTARTED",
        had_home:h.home??null,had_draw:h.draw??null,had_away:h.away??null,
        hdc_line:a.line||null,hdc_home:a.home??null,hdc_away:a.away??null,
        hil_line:g.line||null,hil_over:g.over??null,hil_under:g.under??null,
        chl_line:c.line||null,chl_over:c.over??null,chl_under:c.under??null,
        odds_updated_at:updates.length?updates[updates.length-1]:null,
        raw:{sellingPools,inplayPools:m?.poolInfo?.inplayPools||[],source:"HKJC_OFFICIAL_GRAPHQL_DIRECT",requests:5,degraded,marketErrors,tournament_zh:txt(m?.tournament?.name_ch)}
      });
    }

    // Zero-snapshot guard: never let a transient HKJC list anomaly erase the dashboard.
    // If the direct authority unexpectedly yields zero rows, rebuild from the freshly
    // captured canonical matches plus last-good official odds and mark the run degraded.
    if(!out.length){
      const cutoff=new Date(now.getTime()-6*3600000).toISOString();
      const {data:fallbackRows,error:fallbackError}=await db.from("matches")
        .select("hkjc_event_id,hkjc_match_id,kickoff_hkt,status,tournament,tournament_zh,home_en,away_en,home_zh,away_zh,in_play,selling,pool_status,fetched_at")
        .eq("selling",true)
        .gte("kickoff_hkt",now.toISOString())
        .lte("kickoff_hkt",new Date(maxMs).toISOString())
        .gte("fetched_at",cutoff);
      if(fallbackError) throw new Error("upcoming_fallback_matches:"+fallbackError.message);

      const fallbackIds=(fallbackRows||[]).map((x:any)=>String(x.hkjc_event_id||"")).filter(Boolean);
      let fallbackOdds:any[]=[];
      if(fallbackIds.length){
        const {data:oddsRows,error:oddsError}=await db.from("hkjc_odds_current")
          .select("hkjc_event_id,had_home,had_draw,had_away,hdc_line,hdc_home,hdc_away,hil_line,hil_over,hil_under,chl_line,chl_over,chl_under,fetched_at,odds_updated_at")
          .in("hkjc_event_id",fallbackIds);
        if(oddsError) throw new Error("upcoming_fallback_odds:"+oddsError.message);
        fallbackOdds=oddsRows||[];
      }
      const oddsById=new Map(fallbackOdds.map((x:any)=>[String(x.hkjc_event_id),x]));
      for(const m of fallbackRows||[]){
        const id=String(m.hkjc_event_id||""); if(!id) continue;
        const o:any=oddsById.get(id)||{};
        out.push({
          hkjc_event_id:id,fetched_at:o.fetched_at||m.fetched_at||fetchedAt,match_id:m.hkjc_match_id||null,kickoff_hkt:m.kickoff_hkt,
          status:m.status||"",tournament:m.tournament||"",tournament_zh:m.tournament_zh||null,
          home_en:m.home_en||"",away_en:m.away_en||"",home_zh:m.home_zh||"",away_zh:m.away_zh||"",
          live_eligible:Boolean(m.in_play),selling:true,pool_status:m.pool_status||"SELLINGSTARTED",
          had_home:o.had_home??null,had_draw:o.had_draw??null,had_away:o.had_away??null,
          hdc_line:o.hdc_line||null,hdc_home:o.hdc_home??null,hdc_away:o.hdc_away??null,
          hil_line:o.hil_line||null,hil_over:o.hil_over??null,hil_under:o.hil_under??null,
          chl_line:o.chl_line||null,chl_over:o.chl_over??null,chl_under:o.chl_under??null,
          odds_updated_at:o.odds_updated_at||null,
          raw:{source:"MATCHES_FALLBACK_GUARD",reason:"OFFICIAL_UPCOMING_ZERO",odds_fetched_at:o.fetched_at||null}
        });
      }
      if(out.length){
        degraded=true;
        (marketErrors as any).fallback="OFFICIAL_UPCOMING_ZERO_MATCHES_GUARD";
      }
    }

    if(!out.length){
      await db.from("source_health").upsert({
        source:"HKJC_UPCOMING_EDGE",metric:"heartbeat",value_text:"0",status:"FAIL",
        notes:"Zero-snapshot guard blocked an empty authority refresh; last-good snapshot retained",
        observed_at:fetchedAt,raw:{matches:0,reason:"OFFICIAL_UPCOMING_ZERO_NO_FALLBACK"}
      },{onConflict:"source,metric"});
      return Response.json({ok:false,status:"FAIL",rows:0,error:"official_upcoming_zero_no_fallback"},{status:503});
    }

    if(out.length){
      const {error}=await db.from("hkjc_upcoming_current").upsert(out,{onConflict:"hkjc_event_id"});
      if(error) throw new Error("upcoming_upsert:"+error.message);
    }
    const {data:existing,error:ee}=await db.from("hkjc_upcoming_current").select("hkjc_event_id");
    if(ee) throw ee;
    const keep=new Set(out.map(x=>x.hkjc_event_id));
    const stale=(existing||[]).map((x:any)=>x.hkjc_event_id).filter((id:string)=>!keep.has(id));
    if(stale.length){
      const {error}=await db.from("hkjc_upcoming_current").delete().in("hkjc_event_id",stale);
      if(error) throw error;
    }

    const healthStatus=degraded?"WARN":"OK";
    await db.from("source_health").upsert({
      source:"HKJC_UPCOMING_EDGE",metric:"heartbeat",value_text:String(out.length),status:healthStatus,
      notes:degraded?"HKJC upcoming refreshed; one or more odds markets reused last good values":"Fresh HKJC upcoming authority snapshot",
      observed_at:fetchedAt,
      raw:{matches:out.length,with_had:out.filter(x=>x.had_home!=null&&x.had_draw!=null&&x.had_away!=null).length,
        with_hdc:out.filter(x=>x.hdc_home!=null&&x.hdc_away!=null).length,
        with_hil:out.filter(x=>x.hil_over!=null&&x.hil_under!=null).length,
        with_chl:out.filter(x=>x.chl_over!=null&&x.chl_under!=null).length,requests:5,degraded,marketErrors}
    },{onConflict:"source,metric"});

    return Response.json({ok:true,status:healthStatus,rows:out.length,withHAD:out.filter(x=>x.had_home!=null&&x.had_draw!=null&&x.had_away!=null).length,
      withHDC:out.filter(x=>x.hdc_home!=null&&x.hdc_away!=null).length,
      withHIL:out.filter(x=>x.hil_over!=null&&x.hil_under!=null).length,
      withCHL:out.filter(x=>x.chl_over!=null&&x.chl_under!=null).length,degraded,marketErrors,fetchedAt});
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    await db.from("source_health").upsert({source:"HKJC_UPCOMING_EDGE",metric:"heartbeat",value_text:message,status:"FAIL",
      notes:"Fresh HKJC upcoming authority snapshot failed",observed_at:now.toISOString(),raw:{error:message}},
      {onConflict:"source,metric"});
    return Response.json({ok:false,error:message},{status:500});
  }
});