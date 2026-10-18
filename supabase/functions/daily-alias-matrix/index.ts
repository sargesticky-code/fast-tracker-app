import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// One HKT day at a time, GET-only, existing source records only.
// RPC access is service_role-only; never return the service key to callers.
const cors={
 "access-control-allow-origin":"*",
 "access-control-allow-methods":"GET,OPTIONS",
 "access-control-allow-headers":"content-type",
 "cache-control":"public, max-age=120, s-maxage=300",
 "x-content-type-options":"nosniff",
};
const respond=(body:unknown,status=200)=>Response.json(body,{status,headers:cors});
const dayString=()=>new Date(Date.now()+8*3600_000).toISOString().slice(0,10);
function dateWithinWindow(day:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;
 const t=new Date(day+"T00:00:00Z");
 if(!Number.isFinite(t.getTime())||t.toISOString().slice(0,10)!==day)return false;
 const today=Date.parse(dayString()+"T00:00:00Z");
 return Math.abs(t.getTime()-today)<=7*86400_000;
}
function serviceKey(){
 const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(legacy)return legacy;
 try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}
 catch{return "";}
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="GET")return respond({error:"READ_ONLY"},405);
 const url=new URL(req.url);
 if([...url.searchParams.keys()].some(k=>k!=="date"))return respond({error:"UNSUPPORTED_PARAMETER"},400);
 const date=url.searchParams.get("date")||dayString();
 if(!dateWithinWindow(date))return respond({error:"HKT_DATE_OUT_OF_BOUNDS"},400);
 const root=Deno.env.get("SUPABASE_URL"),key=serviceKey();
 if(!root||!key)return respond({error:"SOURCE_UNAVAILABLE"},503);
 try{
  const r=await fetch(root+"/rest/v1/rpc/ft_daily_alias_audit",{
   method:"POST",
   headers:{"apikey":key,"Authorization":"Bearer "+key,
     "Content-Type":"application/json","Accept":"application/json"},
   body:JSON.stringify({p_hkt_date:date}),
   signal:AbortSignal.timeout(12000),
  });
  if(!r.ok)return respond({error:"SOURCE_UNAVAILABLE"},503);
  const data=await r.json();
  if(data?.hktDate!==date||!Array.isArray(data.rows)||data.rows.length>800)
    return respond({error:"INVALID_SOURCE_PAYLOAD"},503);
  return respond({source:"FAST_TRACKER_DAILY_ALIAS_MATRIX_V1",
   quality:"SOURCE_LINKED_AND_PROVISIONAL_DISPLAY_ONLY",...data});
 }catch{return respond({error:"SOURCE_UNAVAILABLE"},503);}
});
