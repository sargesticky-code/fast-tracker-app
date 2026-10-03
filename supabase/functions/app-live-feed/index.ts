
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const DB_READ_TIMEOUT_MS = 15_000;
function boundedDbFetch(input: any, init: any = {}) {
  return fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(DB_READ_TIMEOUT_MS) });
}
function createReadClient(url: string, key: string) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { retry: false },
    global: { fetch: boundedDbFetch },
  });
}

function serverKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      if (parsed?.default) return parsed.default;
    } catch {}
  }
  return "";
}

function num(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function statNum(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function statPair(stats: any, keys: string[]) {
  if (!Array.isArray(stats)) return null;
  const wanted = new Set(keys.map((x) => x.toLowerCase()));
  const ordered = [...stats].sort((a, b) => {
    const pa = String(a?.period ?? "").toLowerCase();
    const pb = String(b?.period ?? "").toLowerCase();
    const wa = pa === "all" || pa === "match" ? 0 : 1;
    const wb = pb === "all" || pb === "match" ? 0 : 1;
    return wa - wb;
  });
  for (const row of ordered) {
    const key = String(row?.key ?? "").toLowerCase();
    if (!wanted.has(key)) continue;
    const home = statNum(row?.home);
    const away = statNum(row?.away);
    if (home != null || away != null) return { home, away };
  }
  return null;
}

function compactStats(row: any) {
  if (!row) return null;
  return {
    capturedAt: row.captured_at_hkt ?? null,
    detailStatus: row.detail_status ?? null,
    source: row.source ?? null,
    confidence: num(row.match_confidence),
    xg: statPair(row.team_stats, ["expected_goals"]),
    xgot: statPair(row.team_stats, ["expected_goals_on_target"]),
    shots: statPair(row.team_stats, ["total_shots", "shots"]),
    shotsOnTarget: statPair(row.team_stats, ["shotsontarget"]),
    possession: statPair(row.team_stats, ["ballpossesion"]),
    bigChances: statPair(row.team_stats, ["big_chance"]),
    boxTouches: statPair(row.team_stats, ["touches_opp_box"]),
    corners: statPair(row.team_stats, ["corners"]),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return Response.json({ error: "method_not_allowed" }, { status: 405, headers: { ...corsHeaders, "Cache-Control": "no-store" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const key = serverKey();
  if (!supabaseUrl || !key) {
    return Response.json({ error: "server_config_missing" }, { status: 500, headers: { ...corsHeaders, "Cache-Control": "no-store" } });
  }

  const db = createReadClient(supabaseUrl, key);

  try {
    const liveCutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const { data: marketRows, error: marketError } = await db
      .from("hkjc_live_odds_current")
      .select("hkjc_event_id,fetched_at,kickoff_hkt,status,tournament,home_en,away_en,home_zh,away_zh,had_home,had_draw,had_away,hil_line,hil_over,hil_under,chl_line,chl_over,chl_under,pool_status,odds_updated_at")
      .gte("fetched_at", liveCutoff);
    if (marketError) throw marketError;

    const ids = (marketRows ?? []).map((r: any) => r.hkjc_event_id).filter(Boolean);
    const scoreMap = new Map<string, any>();
    const statsMap = new Map<string, any>();
    const detailMap = new Map<string, any>();
    const shadowMap = new Map<string, any>();

    const readHealth: Record<string, any> = {
      market: { status: "OK" },
      score: { status: ids.length ? "PENDING" : "NOT_REQUIRED" },
      stats: { status: ids.length ? "PENDING" : "NOT_REQUIRED" },
      detail: { status: ids.length ? "PENDING" : "NOT_REQUIRED" },
      shadow: { status: ids.length ? "PENDING" : "NOT_REQUIRED" },
      heartbeats: { status: "PENDING" },
    };
    let heartbeats: any[] = [];

    if (ids.length) {
      const [scoreResult, statsResult, detailResult, shadowResult, heartbeatResult] = await Promise.all([
        db.from("live_score_current")
          .select("hkjc_event_id,updated_at_source,live_score,home_score,away_score,minute,match_status,source,match_confidence,source_updated_at,home_corners,away_corners,total_corners,source_match_id")
          .in("hkjc_event_id", ids)
          .gte("updated_at_source", liveCutoff),
        db.from("live_stats_current")
          .select("hkjc_event_id,captured_at_hkt,detail_status,source,match_confidence,team_stats")
          .in("hkjc_event_id", ids),
        db.from("live_detail_state_current_v")
          .select("hkjc_event_id,captured_at_hkt,source,source_match_id,match_confidence,match_minute,match_status,raw_detail_status,effective_detail_status,team_stats_count,events_count,momentum_count")
          .in("hkjc_event_id", ids),
        db.from("live_expected_actual_current")
          .select("hkjc_event_id,segment,match_minute,expected_control_side,actual_control_side,actual_control_score,live_metric_count,control_basis,context_coverage_score,model_hda_consensus,shadow_status,shadow_reason,xg_home,xg_away,shots_home,shots_away,sot_home,sot_away,possession_home,possession_away,box_touches_home,box_touches_away,big_chances_home,big_chances_away,corners_home,corners_away,captured_at_hkt")
          .in("hkjc_event_id", ids),
        db.from("source_health")
          .select("source,status,observed_at")
          .in("source", ["HKJC_LIVE_EDGE", "LIVE_SCORE_EDGE", "LIVE_LAYER_GUARD", "PHASE3_IDENTITY_REGISTRY"])
          .eq("metric", "heartbeat"),
      ]);

      const laneResults = {
        score: scoreResult,
        stats: statsResult,
        detail: detailResult,
        shadow: shadowResult,
        heartbeats: heartbeatResult,
      };
      for (const [lane, result] of Object.entries(laneResults)) {
        const error = (result as any)?.error ?? null;
        readHealth[lane] = error
          ? { status: "UNAVAILABLE", error: String(error?.message ?? error) }
          : { status: "OK" };
      }

      const scores = scoreResult.data ?? [];
      const stats = statsResult.data ?? [];
      const details = detailResult.data ?? [];
      const shadows = shadowResult.data ?? [];
      heartbeats = heartbeatResult.data ?? [];

      for (const row of scores ?? []) scoreMap.set(row.hkjc_event_id, row);
      for (const row of details ?? []) {
        detailMap.set(row.hkjc_event_id, {
          capturedAt: row.captured_at_hkt ?? null,
          detailStatus: row.effective_detail_status ?? row.raw_detail_status ?? null,
          rawDetailStatus: row.raw_detail_status ?? null,
          source: row.source ?? null,
          sourceMatchId: row.source_match_id ?? null,
          confidence: num(row.match_confidence),
          teamStatsCount: Number(row.team_stats_count ?? 0),
          eventsCount: Number(row.events_count ?? 0),
          momentumCount: Number(row.momentum_count ?? 0),
        });
      }
      for (const row of stats ?? []) {
        const age = row.captured_at_hkt ? (Date.now() - new Date(row.captured_at_hkt).getTime()) / 60000 : Infinity;
        if (Number.isFinite(age) && age <= 20) statsMap.set(row.hkjc_event_id, compactStats(row));
      }
      for (const row of shadows ?? []) {
        shadowMap.set(row.hkjc_event_id, {
          segment: row.segment ?? null,
          minute: num(row.match_minute),
          expectedSide: row.expected_control_side ?? null,
          actualSide: row.actual_control_side ?? null,
          controlScore: num(row.actual_control_score),
          metricCount: Number(row.live_metric_count ?? 0),
          controlBasis: row.control_basis ?? null,
          contextCoverage: num(row.context_coverage_score),
          modelConsensus: row.model_hda_consensus ?? null,
          status: row.shadow_status ?? "WAIT",
          reason: row.shadow_reason ?? null,
          capturedAt: row.captured_at_hkt ?? null,
          metrics: {
            xg: { home: num(row.xg_home), away: num(row.xg_away) },
            shots: { home: num(row.shots_home), away: num(row.shots_away) },
            shotsOnTarget: { home: num(row.sot_home), away: num(row.sot_away) },
            possession: { home: num(row.possession_home), away: num(row.possession_away) },
            boxTouches: { home: num(row.box_touches_home), away: num(row.box_touches_away) },
            bigChances: { home: num(row.big_chances_home), away: num(row.big_chances_away) },
            corners: { home: num(row.corners_home), away: num(row.corners_away) },
          },
        });
      }
    }

    const rows = (marketRows ?? []).map((r: any) => {
      const score = scoreMap.get(r.hkjc_event_id) ?? {};
      return {
        id: r.hkjc_event_id,
        kickoff: r.kickoff_hkt,
        status: r.status,
        league: r.tournament,
        home: r.home_en,
        away: r.away_en,
        homeZh: r.home_zh,
        awayZh: r.away_zh,
        liveNow: true,
        inPlay: true,
        live: {
          status: r.status ?? null,
          fetchedAt: r.fetched_at ?? null,
          poolStatus: r.pool_status ?? null,
          oddsUpdatedAt: r.odds_updated_at ?? null,
          odds: { home: num(r.had_home), draw: num(r.had_draw), away: num(r.had_away) },
          goals: { line: r.hil_line ?? null, over: num(r.hil_over), under: num(r.hil_under) },
          corners: { line: r.chl_line ?? null, over: num(r.chl_over), under: num(r.chl_under) },
          score: {
            text: score.live_score ?? null,
            home: num(score.home_score),
            away: num(score.away_score),
            minute: num(score.minute),
            status: score.match_status ?? null,
            source: score.source ?? null,
            sourceMatchId: score.source_match_id ?? null,
            confidence: num(score.match_confidence),
            capturedAt: score.updated_at_source ?? null,
            sourceUpdatedAt: score.source_updated_at ?? null,
            homeCorners: num(score.home_corners),
            awayCorners: num(score.away_corners),
            totalCorners: num(score.total_corners),
          },
          detail: detailMap.get(r.hkjc_event_id) ?? null,
          stats: statsMap.get(r.hkjc_event_id) ?? null,
          shadow: shadowMap.get(r.hkjc_event_id) ?? null,
        },
      };
    });

    if (!ids.length) {
      const heartbeatResult = await db
        .from("source_health")
        .select("source,status,observed_at")
        .in("source", ["HKJC_LIVE_EDGE", "LIVE_SCORE_EDGE", "LIVE_LAYER_GUARD", "PHASE3_IDENTITY_REGISTRY"])
        .eq("metric", "heartbeat");
      if (heartbeatResult.error) {
        readHealth.heartbeats = { status: "UNAVAILABLE", error: String(heartbeatResult.error.message ?? heartbeatResult.error) };
      } else {
        readHealth.heartbeats = { status: "OK" };
        heartbeats = heartbeatResult.data ?? [];
      }
    }

    return Response.json({
      generatedAt: new Date().toISOString(),
      count: rows.length,
      liveIds: rows.map((x: any) => x.id),
      readHealth,
      systemHealth: heartbeats ?? [],
      matches: rows,
    }, { headers: { ...corsHeaders, "Cache-Control": "private, no-store, max-age=0" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: "live_feed_unavailable", message }, {
      status: 503,
      headers: { ...corsHeaders, "Cache-Control": "no-store" },
    });
  }
});
