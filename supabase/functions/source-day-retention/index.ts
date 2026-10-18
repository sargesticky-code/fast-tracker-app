import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.116.0";

// Retain CURRENT + PREVIOUS HKT calendar day. One bounded cron invocation
// archives, SHA256-download-verifies and SQL-restore-proves up to THREE
// older existing source-day rows BEFORE their exact DB copies are retired.
// Not a collector, no new scraping, no bulk deletion or client writes.
const reply=(body:unknown,status=200)=>Response.json(body,{
 status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}
});
const serviceKey=()=>{
 const k=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(k)return k;
 try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}
 catch{return "";}
};
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return reply({ok:false,error:"POST_ONLY"},405);
 if([...new URL(req.url).searchParams.keys()].length)
   return reply({ok:false,error:"NO_QUERY_PARAMS"},400);
 const key=serviceKey(),root=Deno.env.get("SUPABASE_URL")||"";
 if(!root||!key)return reply({ok:false,error:"CONFIG_UNAVAILABLE"},503);
 const cronKey=req.headers.get("x-ft-cron-key");
 if(!cronKey)return reply({ok:false,error:"UNAUTHORIZED"},401);
 let body:any;
 try{body=await req.json();}catch{return reply({ok:false,error:"JSON_OBJECT_REQUIRED"},400);}
 if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).length!==0)
   return reply({ok:false,error:"EMPTY_JSON_ONLY"},400);
 const db=createClient(root,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const auth=await db.rpc("ft_internal_cron_key_matches",{p_key:cronKey});
 if(auth.error||auth.data!==true)return reply({ok:false,error:"UNAUTHORIZED"},401);
 const found=await db.rpc("ft_source_day_retention_candidates");
 if(found.error||!found.data||!Array.isArray(found.data.candidates))
   return reply({ok:false,error:"RETENTION_CANDIDATES_UNAVAILABLE"},503);
 const q=found.data;
 if(q.keepDays!==2||q.candidates.length>3||q.blockedOlderThan30Days>0)
   return reply({ok:false,error:"UNSAFE_OR_EXPIRED_RETENTION_BACKLOG",
     blockedOlderThan30Days:q.blockedOlderThan30Days||0},409);
 if(q.candidates.length===0)return reply({
   ok:true,status:"NO_COLD_SNAPSHOTS",retired:0,
   remainingEligible:0,keepHktDays:2,deletionPerformed:false});
 const completed:any[]=[];
 for(const candidate of q.candidates){
  const source=candidate?.sourceKey,day=candidate?.sourceDay;
  if(!["FLASHSCORE","FOREBET"].includes(source)
     ||typeof day!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(day)
     ||!/^[a-f0-9]{32}$/.test(candidate?.contentMd5)
     ||!Number.isInteger(candidate?.recordCount)
     ||candidate.recordCount<1||candidate.recordCount>5000){
    return reply({ok:false,error:"CANDIDATE_INVALID",completed},409);
  }
  // This existing, separately deployed worker already performs:
  // no-overwrite private upload, full SHA256 download, and SQL exact-row
  // restore dry-run. Never bypass or approximate that evidence chain.
  let archived:any;
  try{
   const response=await fetch(root+"/functions/v1/source-day-cold-archive",{
    method:"POST",headers:{"Content-Type":"application/json",
      "x-ft-cron-key":cronKey},
    body:JSON.stringify({sourceKey:source,sourceDay:day}),
    signal:AbortSignal.timeout(45000)
   });
   if(!response.ok)throw Error("archive response "+response.status);
   archived=await response.json();
  }catch{
   return reply({ok:false,error:"ARCHIVE_AND_RESTORE_NOT_VERIFIED",completed},503);
  }
  if(archived?.status!=="SOURCE_DAY_ARCHIVED_SHA256_AND_RESTORE_PROVED"
     ||archived.sourceKey!==source||archived.sourceDay!==day
     ||archived.recordCount!==candidate.recordCount
     ||archived.sourceContentMd5!==candidate.contentMd5
     ||archived.dbRestoreDryRunVerified!==true
     ||archived.deletionPerformed!==false
     ||archived.snapshotRowUnchanged!==true
     ||archived.storageBucket!=="fast-tracker-ingest"
     ||typeof archived.storagePath!=="string"
     ||!/^([a-f0-9]{64})$/.test(archived.sha256)
     ||!Number.isInteger(archived.archivedBytes)){
    return reply({ok:false,error:"ARCHIVE_PROOF_INCOMPLETE",completed},409);
  }
  const retired=await db.rpc("ft_source_day_retire_proven",{
    p_source_key:source,p_source_day:day,
    p_content_md5:candidate.contentMd5,
    p_record_count:candidate.recordCount,
    p_archive_path:archived.storagePath,
    p_archive_sha:archived.sha256,
    p_archive_bytes:archived.archivedBytes
  });
  if(retired.error||retired.data!==1)
    return reply({ok:false,error:"EXACT_RETIRE_TRANSACTION_FAILED",
      completed,archiveStored:true,sourceKey:source,sourceDay:day},503);
  completed.push({sourceKey:source,sourceDay:day,records:archived.recordCount,
    verifiedBackup:true,rowsRetired:1});
 }
 return reply({ok:true,status:"DAILY_SOURCE_ARCHIVE_RETIRE_VERIFIED",
   keepHktDays:2,processed:completed.length,items:completed,
   remainingBeforeRun:q.pendingEligible-completed.length,
   note:"DB physical allocation may not decrease until a guarded future small-table repack"});
});
