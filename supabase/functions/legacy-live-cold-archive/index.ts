import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.116.0";

// Private archival of two obsolete non-canonical LIVE tables.
// Never overwrites stored objects, never modifies PostgreSQL data.
const bucketName="fast-tracker-ingest";
const reply=(payload:unknown,status=200)=>Response.json(payload,{
 status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}
});
const sha=async(b:Uint8Array)=>{
 const buf=await crypto.subtle.digest("SHA-256",b);
 return [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,"0")).join("");
};
function key(){
 const k=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(k)return k;
 try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}
 catch{return "";}
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return reply({ok:false,error:"POST_ONLY"},405);
 if(new URL(req.url).searchParams.size!==0)return reply({ok:false,error:"NO_PARAMS"},400);
 const url=Deno.env.get("SUPABASE_URL")||"",secret=key();
 if(!url||!secret)return reply({ok:false,error:"CONFIG_UNAVAILABLE"},503);
 const token=req.headers.get("x-ft-cron-key");
 if(!token)return reply({ok:false,error:"UNAUTHORIZED"},401);
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const authenticated=await db.rpc("ft_internal_cron_key_matches",{p_key:token});
 if(authenticated.error||authenticated.data!==true)return reply({ok:false,error:"UNAUTHORIZED"},401);
 let body:any;
 try{body=await req.json();}catch{return reply({ok:false,error:"BAD_JSON"},400);}
 const kind=body?.kind;
 if(!["score","stats"].includes(kind)||Object.keys(body).length!==1)
   return reply({ok:false,error:"INVALID_KIND"},400);
 const result=await db.rpc("ft_legacy_live_archive_read",{p_kind:kind});
 if(result.error||!Array.isArray(result.data)||result.data.length!==15)
   return reply({ok:false,error:"SOURCE_READ_CHANGED"},409);
 const rows=result.data;
 const manifest={schema:"FT_LEGACY_LIVE_ARCHIVE_V1",
   kind,rowCount:rows.length,
   sourceTable:kind==="score"?"public.live_score_current":"public.live_stats_current",
   caution:"HISTORICAL_NONCANONICAL_FB_IDS_NOT_REAL_LIVE_FIXTURES"};
 const bytes=new TextEncoder().encode(JSON.stringify({manifest,rows})+"\n");
 if(bytes.length>2_000_000)return reply({ok:false,error:"BACKUP_EXCEEDS_SAFE_BOUND"},413);
 const digest=await sha(bytes);
 const file="legacy-live/v1/"+kind+"/"+digest+".json.txt";
 const bucket=db.storage.from(bucketName);
 const put=await bucket.upload(file,bytes,{contentType:"text/plain",upsert:false,cacheControl:"0"});
 if(put.error&&!/already exists|duplicate|409/i.test(put.error.message))
   return reply({ok:false,error:"BACKUP_UPLOAD_FAILED"},503);
 const back=await bucket.download(file);
 if(back.error||!back.data)return reply({ok:false,error:"BACKUP_DOWNLOAD_FAILED"},503);
 const recovered=new Uint8Array(await back.data.arrayBuffer());
 if(recovered.length!==bytes.length||await sha(recovered)!==digest)
   return reply({ok:false,error:"SHA256_READBACK_FAILED"},409);
 let parsed:any;
 try{parsed=JSON.parse(new TextDecoder().decode(recovered));}
 catch{return reply({ok:false,error:"JSON_RESTORE_PARSE_FAILED"},409);}
 if(parsed?.manifest?.kind!==kind||parsed?.manifest?.rowCount!==15||
    JSON.stringify(parsed.rows)!==JSON.stringify(rows))
   return reply({ok:false,error:"EXACT_PAYLOAD_RESTORE_FAILED"},409);
 const dryrun=await db.rpc("ft_legacy_live_archive_restore_check",{
   p_kind:kind,p_rows:parsed.rows
 });
 if(dryrun.error||dryrun.data?.restoreDryRunValid!==true||
    dryrun.data?.allRowsMatchDb!==true)
   return reply({ok:false,error:"POSTGRES_RESTORE_PROOF_FAILED"},409);
 return reply({ok:true,status:"LEGACY_LIVE_ARCHIVED_AND_SHA256_RESTORE_PROVED",
   kind,rowsArchived:15,storagePath:file,archiveBytes:bytes.length,sha256:digest,
   postgresRestoreDryRun:true,deletionPerformed:false});
});
