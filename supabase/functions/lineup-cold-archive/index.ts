import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.116.0";

// Phase26b archive-only proof. Absolutely NO database row deletion in this function.
// A separate reviewed retention change is needed after durable SHA-256 readback.
const BUCKET="fast-tracker-ingest";
const MAX_ROWS=200;
const MAX_FILE_BYTES=3_500_000;
const COLD_DAYS=14;
const response=(payload:unknown,status=200)=>Response.json(payload,{
 status,headers:{"Cache-Control":"private, no-store"}
});
const sha256=async(bytes:Uint8Array):Promise<string>=>{
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,"0")).join("");
};
function secretKey():string{
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(key)return key;
 try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}
 catch{return "";}
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return response({ok:false,error:"METHOD_NOT_ALLOWED"},405);
 const u=new URL(req.url);
 if([...u.searchParams.keys()].some(k=>k!=="after"))return response({ok:false,error:"UNSUPPORTED_PARAMETER"},400);
 const afterRaw=u.searchParams.get("after")??"0";
 if(!/^(0|[1-9][0-9]{0,14})$/.test(afterRaw))return response({ok:false,error:"INVALID_CURSOR"},400);
 const after=Number(afterRaw);
 if(!Number.isSafeInteger(after)||after<0)return response({ok:false,error:"INVALID_CURSOR"},400);
 const url=Deno.env.get("SUPABASE_URL")||"",key=secretKey();
 if(!url||!key)return response({ok:false,error:"CONFIG_UNAVAILABLE"},503);
 const token=req.headers.get("x-ft-cron-key");
 if(!token)return response({ok:false,error:"UNAUTHORIZED"},401);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const verified=await db.rpc("ft_internal_cron_key_matches",{p_key:token});
 if(verified.error||verified.data!==true)return response({ok:false,error:"UNAUTHORIZED"},401);
 const cutoff=new Date(Date.now()-COLD_DAYS*86400000).toISOString();
 const got=await db.from("phase2_match_lineup_evidence").select("*")
  .lt("fetched_at",cutoff).gt("id",after).order("id",{ascending:true}).limit(MAX_ROWS);
 if(got.error||!Array.isArray(got.data))return response({ok:false,error:"COLD_READ_FAILED"},503);
 if(!got.data.length)return response({ok:true,status:"NO_MORE_COLD_ROWS",after,archived:0,deletionPerformed:false});
 const scannedLastId=Number(got.data.at(-1).id);
 const ids=[...new Set(got.data.map(x=>String(x.match_id||"")).filter(Boolean))];
 if(!ids.length)return response({ok:false,error:"MISSING_EVENT_ID"},422);
 const current=await db.from("flashscore_primary_fixture_current").select("match_id").in("match_id",ids);
 if(current.error||!Array.isArray(current.data))return response({ok:false,error:"CURRENT_FIXTURE_GUARD_FAILED"},503);
 const active=new Set(current.data.map(x=>String(x.match_id)));
 const safe=got.data.filter(x=>!active.has(String(x.match_id)));
 if(!safe.length)return response({ok:true,status:"NO_ELIGIBLE_AFTER_ACTIVE_GUARD",
  nextAfter:scannedLastId,archived:0,deletionPerformed:false});
 if(safe.some(x=>!Number.isSafeInteger(Number(x.id))||!x.match_id||
       !Number.isFinite(Date.parse(String(x.fetched_at)))||
       Date.parse(String(x.fetched_at))>=Date.parse(cutoff)))
   return response({ok:false,error:"ROW_VALIDATION_FAILED"},422);
 const firstId=Number(safe[0].id),lastId=Number(safe.at(-1).id);
 const manifest={schema:"FT_COLD_LINEUP_ARCHIVE_V1",source:"public.phase2_match_lineup_evidence",
  archiveMode:"BACKUP_ONLY_NO_DELETE",retentionDays:COLD_DAYS,
  rowCount:safe.length,firstId,lastId,
  sourceNames:[...new Set(safe.map(x=>String(x.source_name||"UNKNOWN")))].sort()};
 const body=[JSON.stringify({manifest}),...safe.map(x=>JSON.stringify(x))].join("\n")+"\n";
 const bytes=new TextEncoder().encode(body);
 if(bytes.length>MAX_FILE_BYTES)return response({ok:false,error:"FILE_EXCEEDS_SAFE_BOUND",
    size:bytes.length,rowCount:safe.length},413);
 const digest=await sha256(bytes);
 const path="lineup-cold/v2/"+firstId+"-"+lastId+"-"+digest+".jsonl.txt";
 const st=db.storage.from(BUCKET);
 const upload=await st.upload(path,bytes,{contentType:"text/plain",upsert:false,cacheControl:"0"});
 // Duplicate archive path can occur on safe replays. Never overwrite an object.
 if(upload.error&&!/already exists|duplicate|409/i.test(upload.error.message))
   return response({ok:false,error:"STORAGE_UPLOAD_FAILED"},503);
 const download=await st.download(path);
 if(download.error||!download.data)return response({ok:false,error:"ARCHIVE_READBACK_FAILED"},503);
 const recovered=new Uint8Array(await download.data.arrayBuffer());
 if(recovered.length!==bytes.length||await sha256(recovered)!==digest)
   return response({ok:false,error:"ARCHIVE_SHA256_MISMATCH"},409);
 const restoredText=new TextDecoder().decode(recovered);
 const lines=restoredText.trimEnd().split("\n");
 const restoredManifest=JSON.parse(lines[0])?.manifest;
 if(restoredManifest?.rowCount!==safe.length||restoredManifest?.firstId!==firstId||
    restoredManifest?.lastId!==lastId||lines.length!==safe.length+1)
   return response({ok:false,error:"MANIFEST_ROUNDTRIP_FAILED"},409);
 return response({ok:true,status:"ARCHIVED_AND_SHA256_READBACK_VERIFIED",
   source:"public.phase2_match_lineup_evidence",sourceRowsRead:got.data.length,
   sourceRowsSkippedAsCurrent:got.data.length-safe.length,archived:safe.length,
   firstId,lastId,nextAfter:scannedLastId,checksumSha256:digest,
   storageBucket:BUCKET,storagePath:path,archiveBytes:bytes.length,
   deletionPerformed:false,dbRowsUnchanged:true,
   caveat:"This proves a small cold-row archive and roundtrip only. No retention or database capacity reduction yet."});
});
