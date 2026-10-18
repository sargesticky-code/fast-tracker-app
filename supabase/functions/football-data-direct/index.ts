import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const MAIN_LEAGUES=["E0","E1","E2","E3","EC","SC0","SC1","SC2","SC3","D1","D2","I1","I2","SP1","SP2","F1","F2","N1","B1","P1","T1","G1"];
// Historical CSVs are fetched ONCE on explicit authenticated backfill requests.
// Daily collection remains CURRENT-season ONLY; no extra repeated HTTP calls.
const HISTORY_BOOTSTRAP_LEAGUES=["E0","D1","SP1","I1","F1","N1","P1"];
const ALLOWED_BACKFILL_SEASONS=new Set(["2526"]);

function serviceKey(){
  const a=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if(a) return a;
  const m=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(m){try{const j=JSON.parse(m); if(j&&j.default) return j.default;}catch{}}
  return "";
}
function seasonCode(d=new Date()){
  const y=d.getUTCFullYear(), m=d.getUTCMonth()+1, s=m>=7?y:y-1, e=s+1;
  return String(s).slice(-2)+String(e).slice(-2);
}
function seasonLabel(c){return "20"+c.slice(0,2)+"/20"+c.slice(2,4);}
function sourceDefs(sc=seasonCode(),historical=false){
  const leagues=historical?HISTORY_BOOTSTRAP_LEAGUES:MAIN_LEAGUES;
  const out=leagues.map(function(league){return {
    key:"RESULTS_"+sc+"_"+league,kind:"RESULTS",league:league,
    url:"https://www.football-data.co.uk/mmz4281/"+sc+"/"+league+".csv"
  };});
  // Flashscore is the sole active fixture/kickoff authority. Download results CSVs only.
  // The retired supplementary fixtures.csv endpoint returned HTML and is not requested.
  return out;
}
function parseCsv(text){
  const rows=[]; let row=[], field="", quoted=false;
  for(let p=0;p<text.length;p++){
    const c=text[p];
    if(quoted){
      if(c==='"' && text[p+1]==='"'){field+='"';p++;}
      else if(c==='"') quoted=false; else field+=c;
    }else{
      if(c==='"') quoted=true;
      else if(c===","){row.push(field);field="";}
      else if(c==="\n"){row.push(field.replace(/\r$/,""));rows.push(row);row=[];field="";}
      else field+=c;
    }
  }
  if(field.length||row.length){row.push(field.replace(/\r$/,""));rows.push(row);}
  const clean=rows.filter(function(r){return r.some(function(v){return v.trim()!=="";});});
  if(!clean.length) return [];
  const headers=clean[0].map(function(h,i){return (h||("col_"+(i+1))).replace(/^\uFEFF/,"").trim();});
  return clean.slice(1).map(function(r){const o={};headers.forEach(function(h,i){o[h]=(r[i]||"").trim();});return o;});
}
async function sha256(s){
  const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,"0");}).join("");
}
function num(v){if(v==null||String(v).trim()==="") return null;const x=Number(String(v).trim());return Number.isFinite(x)?x:null;}
function intv(v){const x=num(v);return x==null?null:Math.trunc(x);}
function txt(v){const s=String(v==null?"":v).trim();return s||null;}
function dateIso(v){
  const s=String(v==null?"":v).trim(), m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if(!m) return null;
  const yy=m[3].length===2?"20"+m[3]:m[3];
  return yy+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");
}
async function fetchSource(src){
  const r=await fetch(src.url,{headers:{
    "Accept":"text/csv,text/plain;q=0.9,*/*;q=0.1",
    "User-Agent":"FastTrackerPrivateDataSync/1.0 (+private analytical use)"
  },signal:AbortSignal.timeout(20000)});
  if(!r.ok) throw new Error("http_"+r.status);
  const body=await r.text();
  if(body.length<20||body.indexOf(",")<0||/^\s*<(!doctype|html)/i.test(body)) throw new Error("invalid_csv_or_html");
  return {body:body,hash:await sha256(body),bytes:new TextEncoder().encode(body).byteLength,etag:r.headers.get("etag"),lastModified:r.headers.get("last-modified")};
}
function normalize(row,src,season,nowIso){
  const home=txt(row.HomeTeam||row.Home), away=txt(row.AwayTeam||row.Away), date=dateIso(row.Date);
  if(!home||!away||!date) return null;
  const league=txt(row.Div)||src.league||"UNKNOWN";
  return {home:home,away:away,date:date,league:league,raw:row,base:{
    source_kind:src.kind,season:season,league_code:league,match_date:date,match_time:txt(row.Time),
    home_team:home,away_team:away,referee:txt(row.Referee),
    fthg:intv(row.FTHG),ftag:intv(row.FTAG),ftr:txt(row.FTR),hthg:intv(row.HTHG),htag:intv(row.HTAG),htr:txt(row.HTR),
    home_corners:intv(row.HC),away_corners:intv(row.AC),
    b365_home:num(row.B365H),b365_draw:num(row.B365D),b365_away:num(row.B365A),
    max_home:num(row.MaxH),max_draw:num(row.MaxD),max_away:num(row.MaxA),
    avg_home:num(row.AvgH),avg_draw:num(row.AvgD),avg_away:num(row.AvgA),
    b365_over25:num(row["B365>2.5"]),b365_under25:num(row["B365<2.5"]),
    avg_over25:num(row["Avg>2.5"]),avg_under25:num(row["Avg<2.5"]),
    ah_line:num(row.AHh),avg_ah_home:num(row.AvgAHH),avg_ah_away:num(row.AvgAHA),
    source_url:src.url,source_file:src.key,fetched_at:nowIso,updated_at:nowIso,raw:row
  }};
}
function sleep(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}

Deno.serve(async function(req){
  const requestUrl=new URL(req.url), force=requestUrl.searchParams.get("force")==="1";
  const requestedHistory=requestUrl.searchParams.get("backfill_season");
  // Reject arbitrary historical crawls and new season codes. Only an admin
  // using the internal cron credential may request this known seven-league cohort.
  if(requestedHistory!==null && !ALLOWED_BACKFILL_SEASONS.has(requestedHistory))
    return Response.json({ok:false,error:"invalid_backfill_season"},{status:400});
  const historical=requestedHistory!==null;
  const now=new Date(), nowIso=now.toISOString(),
    sc=historical?requestedHistory:seasonCode(now), season=seasonLabel(sc);
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"", key=serviceKey();
  if(!supabaseUrl||!key) return Response.json({ok:false,error:"server_config_missing"},{status:500});
  const db=createClient(supabaseUrl,key,{auth:{persistSession:false,autoRefreshToken:false}});
  // Private CSV ingestion must never be a public write-by-GET endpoint.
  // Reuse the existing Vault-backed cron credential and matching RPC.
  const cronKey=req.headers.get("x-ft-cron-key")||"";
  if(!cronKey)return Response.json({ok:false,error:"unauthorized"},{status:401});
  const auth=await db.rpc("ft_internal_cron_key_matches",{p_key:cronKey});
  if(auth.error||auth.data!==true)return Response.json({ok:false,error:"unauthorized"},{status:401});
  try{
    const hbRes=await db.from("source_health").select("observed_at").eq("source","FOOTBALL_DATA_EDGE").eq("metric","heartbeat").maybeSingle();
    if(!force && !historical && hbRes.data&&hbRes.data.observed_at){
      const age=(now.getTime()-new Date(hbRes.data.observed_at).getTime())/3600000;
      if(Number.isFinite(age)&&age<6) return Response.json({ok:true,skipped:"debounced",ageHours:Number(age.toFixed(2))});
    }
    const runRes=await db.from("football_data_sync_runs").insert({
      started_at:nowIso,status:"RUNNING",
      mode:historical?"HISTORY_2526":(force?"FORCE":"DAILY")
    }).select("id").single();
    if(runRes.error) throw runRes.error;
    const runId=runRes.data.id, defs=sourceDefs(sc,historical), wanted=defs.map(function(x){return x.key;});
    const oldRes=await db.from("football_data_files").select("source_key,content_sha256,last_success_at,content_changed_at,row_count").in("source_key",wanted);
    const oldMap=new Map((oldRes.data||[]).map(function(x){return [x.source_key,x];}));
    let filesOk=0,filesFailed=0,coreFilesOk=0,coreFilesFailed=0,optionalFilesFailed=0,rowsSeen=0,rowsUpserted=0,fixture48h=0; const errors=[],summaries=[];

    for(let start=0;start<defs.length;start+=5){
      const chunk=defs.slice(start,start+5), results=await Promise.allSettled(chunk.map(fetchSource));
      for(let z=0;z<chunk.length;z++){
        const src=chunk[z], res=results[z], old=oldMap.get(src.key), fetchedAt=new Date().toISOString();
        if(res.status==="rejected"){
          filesFailed++; if(src.kind==="RESULTS") coreFilesFailed++; else optionalFilesFailed++; const msg=res.reason instanceof Error?res.reason.message:String(res.reason); errors.push({source:src.key,kind:src.kind,error:msg});
          await db.from("football_data_files").upsert({
            source_key:src.key,source_kind:src.kind,season:season,league_code:src.league,source_url:src.url,status:"FAIL",
            http_status:(msg.match(/http_(\d+)/)||[])[1]?Number((msg.match(/http_(\d+)/)||[])[1]):null,
            row_count:old?old.row_count:0,content_sha256:old?old.content_sha256:null,fetched_at:fetchedAt,
            last_success_at:old?old.last_success_at:null,content_changed_at:old?old.content_changed_at:null,error_text:msg,raw:{error:msg}
          },{onConflict:"source_key"});
          continue;
        }
        filesOk++; if(src.kind==="RESULTS") coreFilesOk++;
        const got=res.value, parsed=parseCsv(got.body);
        const usable=parsed.filter(function(r){return txt(r.HomeTeam||r.Home)&&txt(r.AwayTeam||r.Away)&&dateIso(r.Date);});
        rowsSeen+=usable.length; const changed=!old||old.content_sha256!==got.hash; let upserted=0;
        if(changed){
          const normalized=[];
          for(const row of usable){
            const q=normalize(row,src,season,fetchedAt); if(!q) continue;
            if(src.kind==="FIXTURES"){const ms=Date.parse(q.date+"T23:59:59Z");if(ms>=now.getTime()-86400000&&ms<=now.getTime()+48*3600000) fixture48h++;}
            const mk=await sha256([season,q.league,q.date,q.home,q.away].join("|").toLowerCase());
            normalized.push(Object.assign({},q.base,{match_key:mk,row_hash:await sha256(JSON.stringify(q.raw))}));
          }
          for(let p=0;p<normalized.length;p+=400){
            const batch=normalized.slice(p,p+400), up=await db.from("football_data_matches").upsert(batch,{onConflict:"match_key"});
            if(up.error) throw new Error(src.key+"_upsert_"+up.error.message);
            upserted+=batch.length;
          }
        }else if(src.kind==="FIXTURES"){
          for(const row of usable){const d=dateIso(row.Date);if(!d)continue;const ms=Date.parse(d+"T23:59:59Z");if(ms>=now.getTime()-86400000&&ms<=now.getTime()+48*3600000)fixture48h++;}
        }
        rowsUpserted+=upserted;
        await db.from("football_data_files").upsert({
          source_key:src.key,source_kind:src.kind,season:season,league_code:src.league,source_url:src.url,status:changed?"OK":"UNCHANGED",
          http_status:200,row_count:usable.length,content_sha256:got.hash,etag:got.etag,last_modified:got.lastModified,bytes:got.bytes,
          fetched_at:fetchedAt,last_success_at:fetchedAt,content_changed_at:changed?fetchedAt:(old&&old.content_changed_at?old.content_changed_at:fetchedAt),
          error_text:null,raw:{changed:changed,upserted:upserted,headers:parsed[0]?Object.keys(parsed[0]):[]}
        },{onConflict:"source_key"});
        summaries.push({source:src.key,rows:usable.length,changed:changed,upserted:upserted});
      }
      if(start+5<defs.length) await sleep(750);
    }

    const status=coreFilesFailed===0&&coreFilesOk===defs.length?"PASS":(coreFilesOk>0?"WARN":"FAIL"), done=new Date().toISOString();

    // Long-term source alias inventory: reuse ONLY already-stored Football-Data
    // results. Never re-fetch providers or auto-verify different club names.
    // Skip unchanged CSV days, partial ingests, and explicit history backfills.
    let aliasInventory={status:"SKIPPED_SOURCE_UNCHANGED_OR_PARTIAL"};
    if(!historical && status==="PASS" && rowsUpserted>0){
      const synced=await db.rpc("ft_sync_fd_super_alias_inventory");
      aliasInventory=synced.error
        ?{status:"FAIL",reason:"SAFE_SOURCE_INVENTORY_RPC_FAILED"}
        :synced.data;
      await db.from("source_health").upsert({
        source:"FOOTBALL_DATA",metric:"alias_inventory",
        value_text:JSON.stringify(aliasInventory),status:synced.error?"FAIL":"OK",
        notes:synced.error
          ?"Football-Data CSV ingest was successful but source alias inventory requires repair."
          :"Stored Football-Data team names indexed without assuming Flashscore equivalence.",
        observed_at:done,raw:{...aliasInventory,sourceRequests:0}
      },{onConflict:"source,metric"});
    }
    await db.from("football_data_sync_runs").update({
      completed_at:done,status:status,source_count:defs.length,files_ok:filesOk,files_failed:filesFailed,
      rows_seen:rowsSeen,rows_upserted:rowsUpserted,details:{season:season,fixture48h:fixture48h,coreFilesOk:coreFilesOk,coreFilesFailed:coreFilesFailed,optionalFilesFailed:optionalFilesFailed,errors:errors,summaries:summaries}
    }).eq("id",runId);
    // A backfill must not overwrite daily 22-league health/heartbeat with
    // a seven-league snapshot, nor extend the six-hour daily debounce.
    if(!historical){
    await db.from("source_health").upsert({
      source:"FOOTBALL_DATA_EDGE",metric:"heartbeat",
      value_text:JSON.stringify({season:season,filesOk:filesOk,filesFailed:filesFailed,coreFilesOk:coreFilesOk,coreFilesFailed:coreFilesFailed,optionalFilesFailed:optionalFilesFailed,rowsSeen:rowsSeen,rowsUpserted:rowsUpserted,fixture48h:fixture48h}),
      status:status,notes:optionalFilesFailed>0?"Core Football-Data league CSVs healthy; supplementary latest-fixtures endpoint unavailable":"Private-use Football-Data core league CSV ingest healthy",
      observed_at:done,raw:{season:season,filesOk:filesOk,filesFailed:filesFailed,coreFilesOk:coreFilesOk,coreFilesFailed:coreFilesFailed,optionalFilesFailed:optionalFilesFailed,rowsSeen:rowsSeen,rowsUpserted:rowsUpserted,fixture48h:fixture48h,errors:errors}
    },{onConflict:"source,metric"});
    await db.from("source_health").upsert({
      source:"FOOTBALL_DATA",metric:"private_use_mode",value_text:"PRIVATE_USE",status:"OK",
      notes:"Operationally healthy; source is restricted to private-use mode until licensing is re-checked for public/commercial release.",observed_at:done,raw:{publish_gate:true,lifecycle:"PRIVATE_USE"}
    },{onConflict:"source,metric"});
    }
    return Response.json({ok:status!=="FAIL",status:status,
      mode:historical?"HISTORY_BACKFILL":"DAILY",season:season,filesOk:filesOk,
      filesFailed:filesFailed,coreFilesOk:coreFilesOk,coreFilesFailed:coreFilesFailed,
      optionalFilesFailed:optionalFilesFailed,rowsSeen:rowsSeen,
      rowsUpserted:rowsUpserted,fixture48h:fixture48h,errors:errors,aliasInventory:aliasInventory});
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    await db.from("source_health").upsert({source:"FOOTBALL_DATA_EDGE",metric:"heartbeat",value_text:message,status:"FAIL",
      notes:"Football-Data direct CSV ingest failed",observed_at:new Date().toISOString(),raw:{error:message}},{onConflict:"source,metric"});
    return Response.json({ok:false,error:message},{status:500});
  }
});