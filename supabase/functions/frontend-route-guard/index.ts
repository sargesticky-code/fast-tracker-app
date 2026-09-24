import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

function serviceKey(){
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(legacy) return legacy;
  const modern=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(modern){try{const j=JSON.parse(modern); if(j?.default) return j.default;}catch{}}
  return "";
}

async function hashHex(s:string){
  const bytes=new TextEncoder().encode(s);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function probe(name:string,url:string){
  try{
    const r=await fetch(url,{
      method:"GET",
      redirect:"follow",
      headers:{"cache-control":"no-cache","user-agent":"FastTrackerRouteGuard/2.0"},
      signal:AbortSignal.timeout(15000)
    });
    const body=await r.text();
    return {
      name,url,
      finalUrl:r.url,
      status:r.status,
      bodyBytes:body.length,
      bodyHash:await hashHex(body),
      hasLegacyMarker:body.includes("Redirecting to the latest Supabase match view"),
      hasHealthMarker:body.includes("Data Health"),
      body
    };
  }catch(e){
    return {name,url,finalUrl:url,status:0,bodyBytes:0,bodyHash:null,hasLegacyMarker:false,hasHealthMarker:false,body:"",error:e instanceof Error?e.message:String(e)};
  }
}

Deno.serve(async (req:Request)=>{
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const key=serviceKey();
  if(!supabaseUrl||!key) return Response.json({ok:false,error:"server_config_missing"},{status:500});
  const db=createClient(supabaseUrl,key,{auth:{persistSession:false,autoRefreshToken:false}});

  const provided=req.headers.get("x-fast-tracker-cron")||"";
  const {data:secretRow}=await db.from("system_config").select("value").eq("key","cron_secret_sha256").maybeSingle();
  if(!provided || !secretRow?.value || await hashHex(provided)!==secretRow.value){
    return Response.json({ok:false,error:"unauthorized"},{status:401});
  }

  const now=new Date().toISOString();
  try{
    const {data:cfg}=await db.from("system_config").select("value").eq("key","dashboard_primary_url").maybeSingle();
    const base=String(cfg?.value||"https://fast-tracker-public-production.up.railway.app/").replace(/\/+$/,"");

    const {data:feedRows,error:feedError}=await db.rpc("ft_internal_app_phase1_feed",{window_hours:24});
    const currentRows=Array.isArray(feedRows)?feedRows:[];
    const currentIds=[...new Set(currentRows.map((row:any)=>String(row?.hkjc_event_id||"").trim()).filter(Boolean))];

    const liveCutoff=new Date(Date.now()-5*60*1000).toISOString();
    const [{data:upcomingRows,error:upcomingError},{data:liveRows,error:liveError}]=await Promise.all([
      currentIds.length
        ? db.from("hkjc_upcoming_current").select("hkjc_event_id").in("hkjc_event_id",currentIds)
        : Promise.resolve({data:[],error:null} as any),
      currentIds.length
        ? db.from("hkjc_live_odds_current").select("hkjc_event_id,fetched_at").in("hkjc_event_id",currentIds).gte("fetched_at",liveCutoff)
        : Promise.resolve({data:[],error:null} as any),
    ]);
    const upcomingSet=new Set((upcomingRows||[]).map((row:any)=>String(row.hkjc_event_id)));
    const liveSet=new Set((liveRows||[]).map((row:any)=>String(row.hkjc_event_id)));
    const unresolvedIds=currentIds.filter((id:string)=>!upcomingSet.has(id)&&!liveSet.has(id));
    const feedConsistencyError=feedError||upcomingError||liveError;

    const liveIds=currentIds.filter((id:string)=>liveSet.has(id));
    const upcomingIds=currentIds.filter((id:string)=>upcomingSet.has(id));
    const eventId=liveIds[0]||upcomingIds[0]||currentIds[0]||null;
    const probeIds=[...new Set([
      liveIds[0],
      upcomingIds[0],
      upcomingIds[Math.floor(upcomingIds.length/2)],
      upcomingIds[upcomingIds.length-1],
    ].filter(Boolean))] as string[];

    const root=await probe("root",base+"/");
    const representativeProbes=probeIds.flatMap((id:string,index:number)=>[
      probe("details_"+index,base+"/details/?id="+encodeURIComponent(id)),
      probe("legacy_match_"+index,base+"/match/"+encodeURIComponent(id)),
    ]);
    const others=await Promise.all([
      probe("health",base+"/health/"),
      ...representativeProbes,
      ...(eventId?[probe("legacy_query",base+"/match/?id="+encodeURIComponent(eventId))]:[]),
      probe("missing_route",base+"/__route_guard_should_404__")
    ]);

    const checks=[root,...others].map((x:any)=>{
      let ok=x.status>=200&&x.status<400;
      let reason:string|null=null;
      if(x.name==="missing_route"){
        ok=x.status===404;
        if(!ok) reason="missing_route_not_404";
      } else if(x.name==="health"){
        ok=ok && x.hasHealthMarker;
        if(!ok) reason=x.status>=200&&x.status<400 ? "health_marker_missing" : "http_"+x.status;
      } else if(x.name.startsWith("legacy_match_")){
        ok=ok && x.hasLegacyMarker && x.bodyHash!==root.bodyHash;
        if(!ok) reason=x.bodyHash===root.bodyHash ? "legacy_fell_back_to_home" : x.hasLegacyMarker ? "http_"+x.status : "legacy_marker_missing";
      } else if(x.name.startsWith("details_") || x.name==="legacy_query"){
        ok=ok && x.bodyHash!==root.bodyHash;
        if(!ok) reason=x.bodyHash===root.bodyHash ? x.name+"_fell_back_to_home" : "http_"+x.status;
      } else if(x.name==="root" && !ok){
        reason="http_"+x.status;
      }
      return {
        name:x.name,
        status:x.status,
        ok,
        reason,
        url:x.finalUrl,
        bytes:x.bodyBytes,
        hash:x.bodyHash
      };
    });

    const failed=checks.filter((x:any)=>!x.ok);
    const consistencyFailed=Boolean(feedConsistencyError)||unresolvedIds.length>0;
    const status=(failed.length||consistencyFailed)?"FAIL":eventId?"OK":"WARN";
    const notes=failed.length
      ?"Frontend route guard failed: "+failed.map((x:any)=>x.name+":"+x.reason).join(", ")
      : feedConsistencyError
        ?"Frontend route resolver consistency query failed"
        : unresolvedIds.length
          ?"Current feed contains "+unresolvedIds.length+" unresolved match link(s): "+unresolvedIds.slice(0,8).join(", ")
          : eventId
            ?"Current feed link resolvers complete; representative detail/legacy/health routes validated"
            :"Root/health validated; no current match id available";

    await db.from("source_health").upsert({
      source:"FRONTEND_ROUTE_GUARD",
      metric:"heartbeat",
      status,
      value_text:String(failed.length+unresolvedIds.length+(feedConsistencyError?1:0)),
      notes,
      observed_at:now,
      raw:{
        base,event_id:eventId,checks,
        current_feed_count:currentIds.length,
        upcoming_resolved:upcomingIds.length,
        live_resolved:liveIds.length,
        unresolved_ids:unresolvedIds,
        representative_ids:probeIds,
        consistency_error:feedConsistencyError ? String((feedConsistencyError as any)?.message||feedConsistencyError) : null,
        guard_version:"CONTENT_AWARE_V3"
      }
    },{onConflict:"source,metric"});

    return Response.json({ok:failed.length===0&&!consistencyFailed,status,eventId,checks,currentFeedCount:currentIds.length,unresolvedIds,observedAt:now},{
      status:(failed.length||consistencyFailed)?503:200,
      headers:{"Cache-Control":"no-store"}
    });
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    await db.from("source_health").upsert({
      source:"FRONTEND_ROUTE_GUARD",metric:"heartbeat",status:"FAIL",value_text:"1",
      notes:"Frontend route guard exception",observed_at:now,raw:{error:message,guard_version:"CONTENT_AWARE_V3"}
    },{onConflict:"source,metric"});
    return Response.json({ok:false,error:message},{status:500});
  }
});
