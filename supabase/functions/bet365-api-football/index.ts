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
    source: "bet365-api-football",
    replacement: "FLASHSCORE_BET365",
    message: "Legacy Bet365 API collection is retired. Use the cloud Flashscore/Bet365 authority pipeline.",
  }, {
    status: 410,
    headers: { ...cors, "Cache-Control": "no-store" },
  });
});