import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "fast-tracker-supabase";
const REPOSITORY = "sargesticky-code/fast-tracker-app";
const WORKFLOW_REF = `${REPOSITORY}/.github/workflows/publish-dashboard-snapshot.yml@refs/heads/main`;
const BUCKET = "fast-tracker-dashboard";
const MAX_SNAPSHOT_BYTES = 900_000;
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`));

function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || "";
  } catch {
    return "";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  try {
    const authorization = req.headers.get("authorization") || "";
    if (!authorization.toLowerCase().startsWith("bearer ")) {
      return Response.json({ error: "missing_github_oidc_token" }, { status: 401 });
    }
    const { payload } = await jwtVerify(authorization.slice(7).trim(), jwks, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (
      payload.repository !== REPOSITORY ||
      payload.ref !== "refs/heads/main" ||
      payload.workflow_ref !== WORKFLOW_REF ||
      !["schedule", "workflow_dispatch"].includes(String(payload.event_name || ""))
    ) {
      return Response.json({ error: "github_workflow_not_allowed" }, { status: 403 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const key = serviceKey();
    if (!supabaseUrl || !key) throw new Error("server_config_missing");

    const response = await fetch(`${supabaseUrl}/functions/v1/app-phase1-feed?hours=24`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) throw new Error(`feed_http_${response.status}`);
    const feed = await response.json();
    if (!Array.isArray(feed?.matches) || typeof feed?.generatedAt !== "string") {
      throw new Error("feed_shape_invalid");
    }

    const snapshot = {
      ...feed,
      snapshotSchemaVersion: 1,
      snapshotPublishedAt: new Date().toISOString(),
    };
    const body = JSON.stringify(snapshot);
    const bytes = new TextEncoder().encode(body).byteLength;
    if (bytes > MAX_SNAPSHOT_BYTES) {
      throw new Error(`snapshot_too_large_${bytes}`);
    }

    const storage = createClient(supabaseUrl, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await storage.storage.from(BUCKET).upload(
      "current.json",
      new Blob([body], { type: "application/json; charset=utf-8" }),
      { upsert: true, contentType: "application/json", cacheControl: "60" },
    );
    if (error) throw new Error(`snapshot_upload_failed:${error.message}`);

    return Response.json({
      ok: true,
      bytes,
      matchCount: feed.matches.length,
      generatedAt: feed.generatedAt,
      snapshotPublishedAt: snapshot.snapshotPublishedAt,
    });
  } catch (error) {
    console.error("dashboard_snapshot_publish_failed", error);
    return Response.json({ error: "snapshot_publish_failed" }, { status: 502 });
  }
});
