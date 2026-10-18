import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.116.0";

// Archive maximum 1000 stale >7d odds observations to immutable Storage,
// read back full archive, SHA-256 verify, then retire exact fingerprinted IDs.
// This endpoint does NOT collect bookmaker odds and does not touch live markets.
const KEY_BUCKET="fast-tracker-ingest";
const MAX_BYTES=4_000_000;
const respond=(payload:unknown,status=200)=>Response.json(payload,{
 status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}
});
const hash=async(bytes:Uint8Array)=>{
 const d=await crypto.subtle.digest("SHA-256",bytes);
 return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");
};
const serviceKey=()=>{
 const x=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(x)return x;
 try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}
 catch{return "";}
};
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return respond({ok:false,error:"POST_ONLY"},405);
 if([...new URL(req.url).searchParams.keys()].length)
   return respond({ok:false,error:"NO_QUERY_PARAMS"},400);
 const key=serviceKey(),url=Deno.env.get("SUPABASE_URL")||"";
 if(!url||!key)return respond({ok:false,error:"CONFIG_UNAVAILABLE"},503);
 const token=req.headers.get("x-ft-cron-key");
 if(!token)return respond({ok:false,error:"UNAUTHORIZED"},401);
 let body:any;
 try{body=await req.json();}catch{return respond({ok:false,error:"JSON_OBJECT_REQUIRED"},400);}
 if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).length)
   return respond({ok:false,error:"EMPTY_JSON_ONLY"},400);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const auth=await db.rpc("ft_internal_cron_key_matches",{p_key:token});
 if(auth.error||auth.data!==true)return respond({ok:false,error:"UNAUTHORIZED"},401);
 const eligible=await db.rpc("ft_odds_retention_candidates");
 if(eligible.error||!eligible.data||!Array.isArray(eligible.data.rows)
   ||eligible.data.rows.length>1000||eligible.data.minAgeDays!==7)
   return respond({ok:false,error:"ODDS_CANDIDATES_UNAVAILABLE"},503);
 const items=eligible.data.rows;
 if(!items.length)return respond({ok:true,status:"NO_COLD_ODDS",retired:0,deletionPerformed:false});
 if(items.some((item:any)=>!Number.isSafeInteger(item?.row?.id)
   ||!Number.isFinite(Date.parse(item?.row?.captured_at))
   ||!/^([a-f0-9]{32})$/.test(item?.rowMd5)))
   return respond({ok:false,error:"INVALID_SOURCE_ROW"},422);
 const ids=items.map((x:any)=>x.row.id);
 if(new Set(ids).size!==ids.length)return respond({ok:false,error:"DUPLICATE_ID"},422);
 const first=Math.min(...ids),last=Math.max(...ids);
 const manifest={schema:"FT_COLD_ODDS_ARCHIVE_V1",source:"public.odds_snapshots",
    minAgeDays:7,rowCount:items.length,minId:first,maxId:last};
 const data=new TextEncoder().encode(JSON.stringify({manifest,items})+"\n");
 if(data.length>MAX_BYTES)return respond({ok:false,error:"COLD_ODDS_ARCHIVE_TOO_LARGE"},413);
 const digest=await hash(data);
 const path="odds-history/v1/"+first+"-"+last+"-"+digest+".jsonl.txt";
 const storage=db.storage.from(KEY_BUCKET);
 const put=await storage.upload(path,data,{contentType:"text/plain",
    upsert:false,cacheControl:"0"});
 if(put.error&&!/already exists|duplicate|409/i.test(put.error.message))
   return respond({ok:false,error:"ODDS_STORAGE_UPLOAD_FAILED"},503);
 const back=await storage.download(path);
 if(back.error||!back.data)return respond({ok:false,error:"ODDS_ARCHIVE_READBACK_FAILED"},503);
 const recovered=new Uint8Array(await back.data.arrayBuffer());
 if(recovered.length!==data.length||await hash(recovered)!==digest)
   return respond({ok:false,error:"ODDS_ARCHIVE_SHA256_MISMATCH"},409);
 let restored:any;
 try{restored=JSON.parse(new TextDecoder().decode(recovered));}
 catch{return respond({ok:false,error:"ODDS_ARCHIVE_JSON_INVALID"},409);}
 if(restored?.manifest?.rowCount!==items.length||
    restored.manifest.minId!==first||restored.manifest.maxId!==last||
    JSON.stringify(restored.items)!==JSON.stringify(items))
   return respond({ok:false,error:"ODDS_ARCHIVE_RESTORE_MISMATCH"},409);
 // Exact source-row MD5 values are recomputed by PostgreSQL after backup.
 const proof=items.map((item:any)=>({id:item.row.id,rowMd5:item.rowMd5}));
 const retired=await db.rpc("ft_retire_proven_odds_batch",{
    p_rows:proof,p_storage_path:path,p_archive_sha:digest,p_archive_bytes:data.length
 });
 if(retired.error||retired.data!==items.length)
   return respond({ok:false,error:"ODDS_ATOMIC_RETIRE_FAILED",archiveStored:true},503);
 return respond({ok:true,status:"COLD_ODDS_SHA256_ARCHIVED_AND_RETIRED",
    retired:retired.data,archiveStored:true,archiveBytes:data.length,
    archivePath:path,source:"FLASHSCORE_BET365",
    retainedHistoryDays:7,sourceSnapshotsUnchanged:true});
});
