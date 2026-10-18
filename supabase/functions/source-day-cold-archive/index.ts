import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.116.0";

// Archive exactly one existing source-day snapshot, losslessly, to PRIVATE Storage.
// Does NOT delete/truncate/modify any database source or collector schedule.
const BUCKET="fast-tracker-ingest";
const MAX_BYTES=5_500_000;
const respond=(payload:unknown,status=200)=>Response.json(payload,{
 status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}
});
const sha256=async(bytes:Uint8Array)=>{
 const d=await crypto.subtle.digest("SHA-256",bytes);
 return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");
};
const serviceKey=()=>{
 const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(legacy)return legacy;
 try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}
 catch{return "";}
};
const hkToday=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const validDate=(x:unknown)=>{
 if(typeof x!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
 const t=Date.parse(x+"T00:00:00Z"),now=Date.parse(hkToday()+"T00:00:00Z");
 return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===x
   &&t>=now-30*86400000&&t<=now;
};
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return respond({ok:false,error:"POST_ONLY"},405);
 const path=new URL(req.url);
 if([...path.searchParams.keys()].length)return respond({ok:false,error:"NO_QUERY_PARAMS"},400);
 const url=Deno.env.get("SUPABASE_URL")||"",key=serviceKey();
 if(!url||!key)return respond({ok:false,error:"CONFIG_UNAVAILABLE"},503);
 const token=req.headers.get("x-ft-cron-key");
 if(!token)return respond({ok:false,error:"UNAUTHORIZED"},401);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const verified=await db.rpc("ft_internal_cron_key_matches",{p_key:token});
 if(verified.error||verified.data!==true)return respond({ok:false,error:"UNAUTHORIZED"},401);
 let input:any;
 try{input=await req.json();}catch{return respond({ok:false,error:"INVALID_JSON"},400);}
 const source=input?.sourceKey,day=input?.sourceDay;
 if(!["FLASHSCORE","FOREBET"].includes(source)||!validDate(day)
    ||Object.keys(input).length!==2)
   return respond({ok:false,error:"INVALID_SOURCE_OR_HKT_DATE"},400);
 const read=await db.rpc("ft_source_day_archive_read",{
   p_source_key:source,p_source_day:day
 });
 if(read.error)return respond({ok:false,error:"SOURCE_SNAPSHOT_READ_FAILED"},503);
 const record=read.data;
 if(!record)return respond({ok:false,error:"SOURCE_SNAPSHOT_NOT_FOUND"},404);
 if(record.source_key!==source||record.source_day!==day||
    !Array.isArray(record.source_rows)||record.source_rows.length!==record.record_count
    ||!/^([a-f0-9]{32})$/.test(record.content_md5))
   return respond({ok:false,error:"INVALID_SOURCE_SNAPSHOT"},422);
 const manifest={schema:"FT_SOURCE_DAY_STORAGE_ARCHIVE_V1",sourceKey:source,
   sourceDay:day,sourceRowCount:record.record_count,
   originalContentMd5:record.content_md5,table:"private.ft_source_day_snapshot"};
 const backup={manifest,snapshot:record};
 const bytes=new TextEncoder().encode(JSON.stringify(backup)+"\n");
 if(bytes.length>MAX_BYTES)return respond({ok:false,error:"ARCHIVE_TOO_LARGE",bytes:bytes.length},413);
 const hash=await sha256(bytes);
 const storagePath="source-day/v1/"+day+"/"+source+"-"+hash+".json.txt";
 const bucket=db.storage.from(BUCKET);
 const upload=await bucket.upload(storagePath,bytes,{contentType:"text/plain",
   upsert:false,cacheControl:"0"});
 if(upload.error&&!/already exists|duplicate|409/i.test(upload.error.message))
   return respond({ok:false,error:"ARCHIVE_UPLOAD_FAILED"},503);
 const downloaded=await bucket.download(storagePath);
 if(downloaded.error||!downloaded.data)
   return respond({ok:false,error:"ARCHIVE_READBACK_FAILED"},503);
 const recovered=new Uint8Array(await downloaded.data.arrayBuffer());
 if(recovered.length!==bytes.length||await sha256(recovered)!==hash)
   return respond({ok:false,error:"ARCHIVE_SHA256_MISMATCH"},409);
 let parsed:any;
 try{parsed=JSON.parse(new TextDecoder().decode(recovered));}
 catch{return respond({ok:false,error:"ARCHIVE_JSON_RESTORE_FAILED"},409);}
 if(parsed?.manifest?.schema!==manifest.schema||
    parsed.manifest.sourceRowCount!==manifest.sourceRowCount||
    parsed.manifest.originalContentMd5!==record.content_md5||
    JSON.stringify(parsed.snapshot)!==JSON.stringify(record))
   return respond({ok:false,error:"ARCHIVE_RECORD_ROUNDTRIP_FAILED"},409);
 // Postgres validates original source_rows::text MD5, all 11 columns,
 // source-day window, row-count and equality with current snapshot.
 const restore=await db.rpc("ft_source_day_archive_restore_check",{
   p_snapshot:parsed.snapshot
 });
 if(restore.error||restore.data?.restoreDryRunValid!==true||
    restore.data?.matchesCurrentDbRow!==true)
   return respond({ok:false,error:"DATABASE_RESTORE_DRY_RUN_FAILED"},409);
 return respond({ok:true,status:"SOURCE_DAY_ARCHIVED_SHA256_AND_RESTORE_PROVED",
   sourceKey:source,sourceDay:day,recordCount:record.record_count,
   archivedBytes:bytes.length,storageBucket:BUCKET,storagePath,
   sha256:hash,sourceContentMd5:record.content_md5,
   dbRestoreDryRunVerified:true,deletionPerformed:false,
   snapshotRowUnchanged:true});
});
