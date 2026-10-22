import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

// Public read-only verified fixture snapshot. Supabase's existing Flashscore
// scout is the collector; this function performs NO new scraping or writes.
const headers = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "cache-control": "public, max-age=45, s-maxage=90"
};
function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers });
}
function serverKey(): string {
  const plain = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (plain) return plain;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return typeof keys?.default === "string" ? keys.default : "";
  } catch { return ""; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "GET") return response({ ok: false, error: "method_not_allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const key = serverKey();
  if (!supabaseUrl || !key) return response({ ok: false, error: "server_config_missing" }, 503);

  const now = Date.now();
  const lower = new Date(now - 3 * 3600_000).toISOString();
  const upper = new Date(now + 72 * 3600_000).toISOString();
  const freshSince = new Date(now - 30 * 60_000).toISOString();
  try {
    const db = createClient(supabaseUrl, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data, error } = await db.from("flashscore_primary_fixture_current")
      .select("match_id,provider_event_id,home_en,away_en,league,kickoff_hkt,fetched_at,status")
      .gte("kickoff_hkt", lower)
      .lte("kickoff_hkt", upper)
      .gte("fetched_at", freshSince)
      .order("kickoff_hkt", { ascending: true })
      .limit(450);
    if (error) return response({ ok: false, error: "fixture_read_failed" }, 503);
    const candidates = Array.isArray(data) ? data : [];
    const seen = new Set<string>();
    const discovered: Record<string, unknown>[] = [];
    let latestSourceMs = 0;
    for (const item of candidates) {
      const eventId = String(item.provider_event_id || "");
      const kickoffMs = Date.parse(String(item.kickoff_hkt || ""));
      const capturedMs = Date.parse(String(item.fetched_at || ""));
      const home = String(item.home_en || "").trim();
      const away = String(item.away_en || "").trim();
      if (!/^[A-Za-z0-9_-]{5,32}$/.test(eventId) ||
          item.match_id !== "FS:" + eventId || !home || !away ||
          !Number.isFinite(kickoffMs) || !Number.isFinite(capturedMs) ||
          capturedMs > now + 60_000 || capturedMs < now - 30 * 60_000 ||
          seen.has(eventId)) continue;
      seen.add(eventId);
      latestSourceMs = Math.max(latestSourceMs, capturedMs);
      const kickoff = new Date(kickoffMs).toISOString();
      discovered.push({
        provider_event_id: eventId,
        home, away,
        competition: String(item.league || "Football"),
        fixture_date: kickoff.slice(0, 10),
        time_text: kickoff.slice(11, 16),
        kickoff_utc: kickoff,
        status: String(item.status || "STATUS_UNVERIFIED"),
        source: "FLASHSCORE_CANONICAL",
      });
    }
    if (!discovered.length) {
      return response({ ok: false, error: "no_fresh_verified_fixtures", discovered: [] }, 503);
    }
    return response({
      source: "FLASHSCORE_VERIFIED_FIXTURES",
      captured_at: new Date(latestSourceMs).toISOString(),
      capture_kind: "EXISTING_SCOUT_VERIFIED_DATABASE",
      bookmaker_quotes_available: false,
      discovered,
      fixtures: [],
      count: discovered.length
    });
  } catch {
    return response({ ok: false, error: "snapshot_unavailable" }, 503);
  }
});
