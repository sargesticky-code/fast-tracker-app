// This endpoint is a live readiness check, not a build-time/static placeholder.
// Read-only: uses the public Supabase Edge feeds, never privileged credentials.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const root = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1";

async function inspectFeed(path, type) {
  try {
    const response = await fetch(root + path, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8500),
    });
    if (!response.ok) {
      return { ready: false, reason: "upstream_http_error", upstreamStatus: response.status };
    }
    const feed = await response.json();
    const now = Date.now();
    if (type === "verified") {
      const captured = Date.parse(String(feed?.captured_at || ""));
      const count = Array.isArray(feed?.discovered) ? feed.discovered.length : 0;
      const fresh = feed?.source === "FLASHSCORE_VERIFIED_FIXTURES"
        && Number.isFinite(captured) && captured <= now + 60_000
        && captured >= now - 30 * 60_000;
      return {
        ready: Boolean(fresh && count > 0),
        reason: fresh && count > 0 ? "fresh_verified_fixtures" : "empty_or_stale_verified_fixtures",
        count,
        capturedAt: Number.isFinite(captured) ? new Date(captured).toISOString() : null,
      };
    }
    const count = Array.isArray(feed?.matches) ? feed.matches.length : 0;
    const generated = Date.parse(String(feed?.generatedAt || ""));
    const responseFresh = Number.isFinite(generated) && generated <= now + 60_000
      && generated >= now - 5 * 60_000;
    return {
      ready: Boolean(responseFresh && count > 0),
      reason: responseFresh && count > 0 ? "canonical_feed_reachable" : "empty_or_unfresh_canonical_response",
      count,
      generatedAt: Number.isFinite(generated) ? new Date(generated).toISOString() : null,
      // Fresh response generation is not proof that every underlying record is fresh.
      recordsFreshnessVerified: false,
    };
  } catch {
    return { ready: false, reason: "upstream_timeout_or_network_error" };
  }
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  const [verified, canonical] = await Promise.all([
    inspectFeed("/flashscore-verified-fixtures", "verified"),
    inspectFeed("/app-phase1-feed?view=compact&hours=48", "canonical"),
  ]);
  const ready = verified.ready || canonical.ready;
  const status = !ready ? "UNAVAILABLE"
    : verified.ready && canonical.ready ? "READY" : "DEGRADED";
  return Response.json({
    ok: ready,
    service: "fast-tracker-dashboard",
    frontend: "VERCEL",
    checkedAt,
    status,
    dependencies: { verifiedFixtures: verified, canonicalFeed: canonical },
  }, {
    status: ready ? 200 : 503,
    headers: { "cache-control": "no-store, max-age=0, must-revalidate" },
  });
}
