import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Public, read-only tentative associations. All private data access occurs
// under the service role *inside* Edge, never in browser or response metadata.
const cors={
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"GET,OPTIONS",
  "access-control-allow-headers":"content-type",
  "cache-control":"public, max-age=90"
};
Deno.serve(async(req:Request):Promise<Response>=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="GET")return Response.json({error:"READ_ONLY"},{status:405,headers:cors});
  const base=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!base||!secret)return Response.json({error:"SOURCE_CONFIGURATION_MISSING"},{status:503,headers:cors});
  try{
    const r=await fetch(base+"/rest/v1/rpc/ft_public_extra_adviser_provisional",{
      method:"POST",
      headers:{apikey:secret,authorization:"Bearer "+secret,"content-type":"application/json",
        accept:"application/json","cache-control":"no-store"},
      body:"{}",signal:AbortSignal.timeout(12000)
    });
    if(!r.ok){console.error("EXTRA_ADVISER_PROVISIONAL_RPC_FAILED",r.status);
      return Response.json({error:"SOURCE_UNAVAILABLE"},{status:503,headers:cors});}
    const data=await r.json();
    if(data?.source!=="EXTRA_ADVISER_PROVISIONAL_04"
      ||data?.quality!=="DATE_TEAM_UNIQUE_SOURCE_CLOCK_UNVERIFIED"
      ||!Array.isArray(data.rows)||data.rows.length>1200)
      return Response.json({error:"INVALID_ADVISER_PROVISIONAL_CONTRACT"},{status:503,headers:cors});
    return Response.json(data,{status:200,headers:cors});
  }catch{
    return Response.json({error:"SOURCE_TIMEOUT"},{status:503,headers:cors});
  }
});