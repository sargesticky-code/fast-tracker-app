import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(() => new Response(JSON.stringify({
  error: "RETIRED_SOURCE_ENDPOINT",
  activeFixtureAuthority: "FLASHSCORE",
  activePricingAuthority: "INDEPENDENT_BOOKMAKER_ONLY",
  retriable: false
}), {
  status: 410,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
}));