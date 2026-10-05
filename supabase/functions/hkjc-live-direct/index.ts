import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  return Response.json({
    error: "source_retired",
    source: "hkjc-live-direct",
    replacement: "BET365_BROWSER",
    message: "HKJC authority collection was retired on 2026-10-05. Use the Bet365 browser-feed pipeline.",
  }, {
    status: 410,
    headers: { ...cors, "Cache-Control": "no-store" },
  });
});
