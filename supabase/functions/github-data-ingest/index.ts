import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

const ISSUER="https://token.actions.githubusercontent.com";
const AUDIENCE="fast-tracker-supabase";
const REPOSITORY="sargesticky-code/football-fast-tracker";
const ALLOWED_REFS=new Set(["refs/heads/main","refs/heads/supabase-ingest-v2"]);
const paths=["hkjc_current.csv","forebet_current.csv","model_current.csv","team_alias_registry.csv","form_current.csv","odds_movement.csv","prediction_fallback_current.csv","bet365_current.csv","forebet_supplement_current.csv","forebet_availability.csv","forebet_archive.csv","evaluation_summary.csv","hkjc_live_odds.csv","hkjc_power_current.csv","team_form_summary.csv","h2h_summary.csv","match_scenario_current.csv","multibetter_current.csv"];
const ALLOWED_PATHS=new Map(paths.map(x=>[`data/${x}`,x]));
const CORE_SYNC_PATHS=new Set([
  "hkjc_current.csv","forebet_current.csv","model_current.csv","team_alias_registry.csv",
  "form_current.csv","prediction_fallback_current.csv","forebet_availability.csv","h2h_summary.csv"
]);
const JWKS=createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`));
const MAX_FILE_BYTES=4_500_000;
const MAX_BATCH_BYTES=6_000_000;
const MAX_BATCH_FILES=20;

function getServerKey(){
  const x=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(x)return x;
  const y=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(y)try{return JSON.parse(y)?.default??""}catch{}
  return "";
}
async function sha256Hex(v:string){
  const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));
  return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
type InputFile={path:string;content:string};
type Prepared=InputFile & {storagePath:string;bytes:number;sha256:string};

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return Response.json({ok:false,error:"method_not_allowed"},{status:405});
  try{
    const auth=req.headers.get("authorization")??"";
    if(!auth.toLowerCase().startsWith("bearer ")) return Response.json({ok:false,error:"missing_bearer"},{status:401});
    const {payload}=await jwtVerify(auth.slice(7).trim(),JWKS,{issuer:ISSUER,audience:AUDIENCE});
    if(payload.repository!==REPOSITORY) return Response.json({ok:false,error:"repository_not_allowed"},{status:403});
    const ref=String(payload.ref??"");
    if(!ALLOWED_REFS.has(ref)) return Response.json({ok:false,error:"ref_not_allowed",ref},{status:403});

    const body=await req.json();
    const incoming:InputFile[]=Array.isArray(body?.files)
      ? body.files.map((x:any)=>({path:String(x?.path??""),content:typeof x?.content==="string"?x.content:""}))
      : [{path:String(body?.path??""),content:typeof body?.content==="string"?body.content:""}];

    if(incoming.length<1 || incoming.length>MAX_BATCH_FILES){
      return Response.json({ok:false,error:"invalid_batch_size",count:incoming.length},{status:400});
    }

    const encoder=new TextEncoder();
    const prepared:Prepared[]=[];
    let totalBytes=0;
    for(const f of incoming){
      const storagePath=ALLOWED_PATHS.get(f.path);
      if(!storagePath) return Response.json({ok:false,error:"path_not_allowed",path:f.path},{status:400});
      if(!f.content) return Response.json({ok:false,error:"empty_content",path:f.path},{status:400});
      const bytes=encoder.encode(f.content).byteLength;
      if(bytes>MAX_FILE_BYTES) return Response.json({ok:false,error:"content_too_large",path:f.path,bytes},{status:413});
      totalBytes+=bytes;
      if(totalBytes>MAX_BATCH_BYTES) return Response.json({ok:false,error:"batch_too_large",bytes:totalBytes},{status:413});
      prepared.push({...f,storagePath,bytes,sha256:await sha256Hex(f.content)});
    }

    const url=Deno.env.get("SUPABASE_URL")??"",key=getServerKey();
    if(!url||!key) throw new Error("server_config_missing");
    const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});

    const metrics=prepared.map(x=>x.storagePath);
    const [{data:previousRows,error:previousError},{data:appliedRows,error:appliedError}]=await Promise.all([
      db.from("source_health")
        .select("metric,value_text")
        .eq("source","GITHUB_OIDC_INGEST")
        .in("metric",metrics),
      db.from("source_health")
        .select("metric,value_text")
        .eq("source","SUPABASE_SYNC_APPLIED")
        .in("metric",metrics.filter((x)=>CORE_SYNC_PATHS.has(x)))
    ]);
    if(previousError) throw new Error(`health_read:${previousError.message}`);
    if(appliedError) throw new Error(`applied_health_read:${appliedError.message}`);
    const previous=new Map((previousRows??[]).map((x:any)=>[String(x.metric),String(x.value_text??"")]));
    const applied=new Map((appliedRows??[]).map((x:any)=>[String(x.metric),String(x.value_text??"")]));

    const changed:Prepared[]=[];
    const results:any[]=[];
    for(const f of prepared){
      const needsSync=CORE_SYNC_PATHS.has(f.storagePath) && applied.get(f.storagePath)!==f.sha256;
      if(previous.get(f.storagePath)===f.sha256){
        results.push({path:f.path,storagePath:f.storagePath,changed:false,needsSync,sha256:f.sha256});
      }else{
        changed.push(f);
      }
    }

    const now=new Date().toISOString();
    const healthRows:any[]=[];
    for(const f of changed){
      const {error:uploadError}=await db.storage
        .from("fast-tracker-ingest")
        .upload(f.storagePath,new Blob([f.content],{type:"text/csv; charset=utf-8"}),{upsert:true,contentType:"text/csv"});
      if(uploadError) throw new Error(`storage_upload:${f.storagePath}:${uploadError.message}`);
      healthRows.push({
        source:"GITHUB_OIDC_INGEST",
        metric:f.storagePath,
        value_text:f.sha256,
        status:"PASS",
        notes:"Private GitHub Actions OIDC batch upload to Supabase Storage",
        observed_at:now,
        raw:{
          repository:payload.repository,
          ref,
          workflow:payload.workflow,
          run_id:payload.run_id,
          sha256:f.sha256,
          bytes:f.bytes,
          batch:true
        }
      });
      results.push({
        path:f.path,
        storagePath:f.storagePath,
        changed:true,
        needsSync:CORE_SYNC_PATHS.has(f.storagePath) && applied.get(f.storagePath)!==f.sha256,
        sha256:f.sha256
      });
    }

    if(healthRows.length){
      const {error:healthError}=await db.from("source_health").upsert(healthRows,{onConflict:"source,metric"});
      if(healthError) throw new Error(`health_upsert:${healthError.message}`);
    }

    return Response.json({
      ok:true,
      batch:true,
      files:prepared.length,
      changed:changed.length,
      unchanged:prepared.length-changed.length,
      needsSync:results.some((x:any)=>Boolean(x.needsSync)),
      bytes:totalBytes,
      repository:payload.repository,
      ref,
      runId:payload.run_id,
      results
    },{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    console.error(error);
    return Response.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500,headers:{"Cache-Control":"no-store"}});
  }
});