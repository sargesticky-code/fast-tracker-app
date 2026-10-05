import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

function serviceKey(){
  const a=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if(a) return a;
  const m=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(m){ try{ const j=JSON.parse(m); if(j?.default) return j.default; }catch{} }
  return "";
}
function txt(v:any){ return v==null ? "" : String(v).trim(); }
function num(v:any){ const n=Number(v); return Number.isFinite(n)?n:null; }
function int(v:any){ const n=num(v); return n==null?null:Math.trunc(n); }
function ended(v:any){
  const s=txt(v).toUpperCase().replaceAll("_","").replaceAll(" ","");
  return ["PREEVENT","FULLTIME","FINISHED","FT","ENDED","MATCHENDED","INPLAYMATCHENDED","CANCEL","POSTPON","ABANDON"].some(x=>s.includes(x));
}
function hktParts(d=new Date()){
  const parts=new Intl.DateTimeFormat("en-CA",{
    timeZone:"Asia/Hong_Kong",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"
  }).formatToParts(d);
  const o:any={};
  for(const p of parts) o[p.type]=p.value;
  return {ymd:`${o.year}${o.month}${o.day}`,hour:Number(o.hour)};
}
function previousYmd(ymd:string){
  const y=Number(ymd.slice(0,4)),m=Number(ymd.slice(4,6)),d=Number(ymd.slice(6,8));
  const dt=new Date(Date.UTC(y,m-1,d)-86400000);
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth()+1).padStart(2,"0")}${String(dt.getUTCDate()).padStart(2,"0")}`;
}
function liveMinute(status:any){
  const vals=[status?.liveTime?.short,status?.liveTime,status?.minutes,status?.minute,status?.period];
  for(const v of vals){
    if(v==null) continue;
    const m=String(v).match(/\d+/);
    if(m) return Number(m[0]);
  }
  return null;
}
function scorePair(m:any){
  let h=int(m?.home?.score), a=int(m?.away?.score);
  if(h!=null && a!=null) return [h,a];
  const s=txt(m?.status?.scoreStr);
  const mm=s.match(/(\d+)\s*[-:]\s*(\d+)/);
  return mm ? [Number(mm[1]),Number(mm[2])] : [null,null];
}
async function fotmobBoard(ymd:string){
  const u=new URL("https://www.fotmob.com/api/data/matches");
  u.searchParams.set("date",ymd);
  u.searchParams.set("timezone","Asia/Hong_Kong");
  u.searchParams.set("ccode3","HKG");
  const r=await fetch(u,{
    headers:{
      "Accept":"application/json, text/plain, */*",
      "Accept-Language":"en-US,en;q=0.9",
      "Referer":"https://www.fotmob.com/",
      "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36"
    },
    signal:AbortSignal.timeout(8000)
  });
  if(!r.ok) throw new Error("fotmob_http_"+r.status);
  const j=await r.json();
  const out:any[]=[];
  for(const lg of (j?.leagues||[])){
    for(const m of (lg?.matches||[])) out.push(m);
  }
  return out;
}

Deno.serve(async (_req:Request)=>{
  const now=new Date(), url=Deno.env.get("SUPABASE_URL")||"", key=serviceKey();
  if(!url||!key) return Response.json({ok:false,error:"server_config_missing"},{status:500});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});

  const {data:snapshot}=await db.from("phase3_live_fast_snapshot")
    .select("fetched_at,payload,ok,source,lease_until").eq("id",1).maybeSingle();
  if(snapshot?.fetched_at){
    const age=(now.getTime()-new Date(snapshot.fetched_at).getTime())/1000;
    if(Number.isFinite(age)&&age<4){
      return Response.json({ok:true,cached:true,ageSeconds:Number(age.toFixed(2)),source:snapshot.source,rows:snapshot.payload||[]});
    }
  }

  const {data:claimed,error:claimError}=await db.rpc("phase3_claim_fast_refresh");
  if(claimError) return Response.json({ok:false,error:"claim_failed:"+claimError.message},{status:500});
  if(!claimed){
    return Response.json({ok:true,cached:true,refreshInProgress:true,source:snapshot?.source||null,rows:snapshot?.payload||[]});
  }

  try{
    const cutoff=new Date(now.getTime()-10*60*1000).toISOString();
    const {data:liveRows,error:liveError}=await db.from("live_score_current")
      .select("hkjc_event_id,match_status,updated_at_source,source_updated_at,source,source_match_id,match_confidence")
      .gte("updated_at_source",cutoff);
    if(liveError) throw new Error("live_score_authority:"+liveError.message);
    const live=(liveRows||[]).filter((r:any)=>!ended(r.match_status));
    const ids=[...new Set(live.map((r:any)=>String(r.hkjc_event_id||"")).filter(Boolean))];

    if(!ids.length){
      await db.from("phase3_live_fast_current").delete().neq("hkjc_event_id","");
      await db.from("phase3_live_fast_snapshot").update({
        fetched_at:now.toISOString(),source:"FOTMOB_DAILY_BOARD_FAST",ok:true,lease_until:null,payload:[],raw:{live_ids:0}
      }).eq("id",1);
      return Response.json({ok:true,cached:false,source:"FOTMOB_DAILY_BOARD_FAST",rows:[]});
    }

    const {data:maps,error:mapError}=await db.from("live_score_current")
      .select("hkjc_event_id,source,source_match_id,match_confidence")
      .in("hkjc_event_id",ids)
      .not("source_match_id","is",null)
      .gte("match_confidence",0.74);
    if(mapError) throw new Error("mapping:"+mapError.message);

    const mapByEvent=new Map<string,any>();
    for(const r of (maps||[])){
      const src=txt(r.source);
      if(!["FOOTBALL_LIVE_API_SELF_HOSTED","FOTMOB_BOARD_FALLBACK"].includes(src)) continue;
      mapByEvent.set(r.hkjc_event_id,r);
    }

    const hp=hktParts(now);
    const dates=[hp.ymd];
    if(hp.hour<3) dates.push(previousYmd(hp.ymd));
    const boards=(await Promise.all(dates.map(fotmobBoard))).flat();
    const boardById=new Map<string,any>();
    for(const m of boards) if(m?.id!=null) boardById.set(String(m.id),m);

    const out:any[]=[];
    const upserts:any[]=[];
    for(const id of ids){
      const mp=mapByEvent.get(id);
      if(!mp) continue;
      const m=boardById.get(String(mp.source_match_id));
      if(!m) continue;
      const [h,a]=scorePair(m);
      const status=m?.status||{};
      if(status?.finished || status?.cancelled || status?.awarded) continue;
      const rec={
        hkjc_event_id:id,
        source:"FOTMOB_DAILY_BOARD_FAST",
        source_match_id:String(mp.source_match_id),
        match_confidence:Number(mp.match_confidence),
        score_home:h,
        score_away:a,
        live_score:h!=null&&a!=null?`${h}-${a}`:null,
        minute:liveMinute(status),
        match_status:txt(status?.finished?"FINISHED":status?.started?"LIVE":status?.status)||"LIVE",
        source_status:status,
        fetched_at:now.toISOString()
      };
      upserts.push(rec);
      out.push(rec);
    }

    if(upserts.length){
      const {error}=await db.from("phase3_live_fast_current").upsert(upserts,{onConflict:"hkjc_event_id"});
      if(error) throw new Error("fast_upsert:"+error.message);
    }
    const keep=new Set(upserts.map(x=>x.hkjc_event_id));
    const {data:existing}=await db.from("phase3_live_fast_current").select("hkjc_event_id");
    const stale=(existing||[]).map((r:any)=>r.hkjc_event_id).filter((id:string)=>!keep.has(id));
    if(stale.length) await db.from("phase3_live_fast_current").delete().in("hkjc_event_id",stale);

    await db.from("phase3_live_fast_snapshot").update({
      fetched_at:now.toISOString(),source:"FOTMOB_DAILY_BOARD_FAST",ok:true,lease_until:null,payload:out,
      raw:{live_ids:ids.length,mapped_ids:mapByEvent.size,returned:out.length,board_rows:boards.length,dates}
    }).eq("id",1);

    return Response.json({ok:true,cached:false,source:"FOTMOB_DAILY_BOARD_FAST",liveIds:ids.length,mapped:mapByEvent.size,rows:out});
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    await db.from("phase3_live_fast_snapshot").update({
      ok:false,lease_until:null,updated_at:now.toISOString(),raw:{error:message}
    }).eq("id",1);
    return Response.json({ok:false,error:message,rows:snapshot?.payload||[]},{status:500});
  }
});