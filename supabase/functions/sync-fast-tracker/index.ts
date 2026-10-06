import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve((_req:Request)=>Response.json({
  error:"source_retired",
  active:false,
  replacement:"canonical_fixture_and_cloud_provider_pipeline",
  reason:"legacy_csv_ingestion_retired"
},{
  status:410,
  headers:{"Cache-Control":"no-store"}
}));
