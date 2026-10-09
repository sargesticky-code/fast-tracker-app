
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
    xgOpenPlay: statPair(row.team_stats, ["expected_goals_open_play"]),
    xgSetPlay: statPair(row.team_stats, ["expected_goals_set_play"]),
    shots: statPair(row.team_stats, ["total_shots", "shots"]),
    shotsOnTarget: statPair(row.team_stats, ["shotsontarget"]),
    shotsOffTarget: statPair(row.team_stats, ["shotsofftarget"]),
    shotsInsideBox: statPair(row.team_stats, ["shots_inside_box"]),
    possession: statPair(row.team_stats, ["ballpossesion"]),
    bigChances: statPair(row.team_stats, ["big_chance"]),
    bigChancesMissed: statPair(row.team_stats, ["big_chance_missed_title"]),
    boxTouches: statPair(row.team_stats, ["touches_opp_box"]),
    corners: statPair(row.team_stats, ["corners"]),
    accuratePasses: statPair(row.team_stats, ["accurate_passes"]),
    tackles: statPair(row.team_stats, ["matchstats_headers_tackles"]),
    interceptions: statPair(row.team_stats, ["interceptions"]),
    clearances: statPair(row.team_stats, ["clearances"]),
    keeperSaves: statPair(row.team_stats, ["keeper_saves"]),
    duelsWon: statPair(row.team_stats, ["duel_won"]),
    dribblesSucceeded: statPair(row.team_stats, ["dribbles_succeeded"]),
    fouls: statPair(row.team_stats, ["fouls"]),
    yellowCards: statPair(row.team_stats, ["yellow_cards"]),
    redCards: statPair(row.team_stats, ["red_cards"]),
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
    const liveCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    let marketRows:any[] = [];
    const marketSource = "FLASHSCORE_BET365_REFERENCE";

    const scoreSeedResult = await db
      .from("live_score_feed_current")
      .select("match_id,updated_at_source,live_score,home_score,away_score,minute,match_status,source,match_confidence,source_updated_at,home_corners,away_corners,total_corners,source_match_id")
      .gte("updated_at_source", liveCutoff);
    if (scoreSeedResult.error) throw scoreSeedResult.error;

    const liveScores = (scoreSeedResult.data ?? []).filter((r:any) => {
      const status = String(r?.match_status ?? "").trim().toUpperCase();
      return status && !["FINISHED","FT","FULLTIME","FULL_TIME","ENDED","POSTPONED","CANCELLED"].includes(status);
    });
    const canonicalIds = [...new Set(liveScores.map((r:any)=>String(r.match_id||"")).filter(Boolean))];

    const [matchResult, referenceOddsResult] = await Promise.all([
      canonicalIds.length
        ? db.from("canonical_fixture_current").select("match_id,kickoff_hkt,tournament:league,home_en,away_en,status").in("match_id", canonicalIds)
        : Promise.resolve({data:[],error:null} as any),
      canonicalIds.length
        ? db.from("bookmaker_odds_current")
            .select("match_id,fetched_at,bet365_home,bet365_draw,bet365_away,bet365_fixture_id,source")
            .in("match_id", canonicalIds)
        : Promise.resolve({data:[],error:null} as any),
    ]);
    if (matchResult.error) throw matchResult.error;
    if (referenceOddsResult.error) console.error("live_reference_odds_unavailable",referenceOddsResult.error);

    const matchById = new Map((matchResult.data ?? []).map((r:any)=>[String(r.match_id),r]));
    const referenceById = new Map((referenceOddsResult.data ?? []).map((r:any)=>[String(r.match_id),r]));
    const scoreSeedById = new Map(liveScores.map((r:any)=>[String(r.match_id),r]));

    marketRows = liveScores.flatMap((s:any)=>{
      const id=String(s.match_id||"");
      const canonical:any=matchById.get(id)||null;
      if (!canonical) return [];
      const ref:any=referenceById.get(id)||null;
      return [{
        match_id:id,
        provider_match_id:s.source_match_id??null,
        fetched_at:s.updated_at_source??s.source_updated_at??null,
        kickoff_hkt:canonical.kickoff_hkt??null,
        status:s.match_status??canonical.status??"LIVE",
        tournament:canonical.tournament??null,
        home_en:canonical.home_en??null,
        away_en:canonical.away_en??null,
        home_zh:canonical.home_en??null,
        away_zh:canonical.away_en??null,
        had_home:num(ref?.bet365_home),had_draw:num(ref?.bet365_draw),had_away:num(ref?.bet365_away),
        hil_line:null,hil_over:null,hil_under:null,
        chl_line:null,chl_over:null,chl_under:null,
        pool_status:ref?"REFERENCE_ONLY":"UNKNOWN",
        odds_updated_at:ref?.fetched_at??null,
        running_home_score:num(s.home_score),
        running_away_score:num(s.away_score),
        running_home_corner:num(s.home_corners),
        running_away_corner:num(s.away_corners),
        running_corner:num(s.total_corners),
        match_updated_at:s.source_updated_at??s.updated_at_source??null,
        bet365_minute:null,
        reference_odds_source:ref?.source??null,
        live_score_source:s.source??null,
      }];
    });

    const ids = (marketRows ?? []).map((r: any) => r.match_id).filter(Boolean);
    const scoreMap = new Map<string, any>();
    for (const row of marketRows ?? []) {
      const home = num(row.running_home_score);
      const away = num(row.running_away_score);
      const homeCorners = num(row.running_home_corner);
      const awayCorners = num(row.running_away_corner);
      if (home != null || away != null || homeCorners != null || awayCorners != null) {
        scoreMap.set(row.match_id, {
          live_score: home != null && away != null ? `${home}-${away}` : null,
          home_score: home,
          away_score: away,
          minute: null,
          match_status: row.status ?? null,
          source: row.live_score_source ?? "LIVE_SCORE_CURRENT",
          source_match_id: row.provider_match_id ?? null,
          match_confidence: 1,
          updated_at_source: row.fetched_at ?? null,
          source_updated_at: row.match_updated_at ?? row.odds_updated_at ?? row.fetched_at ?? null,
          home_corners: homeCorners,
          away_corners: awayCorners,
          total_corners: homeCorners != null && awayCorners != null ? homeCorners + awayCorners : num(row.running_corner),
        });
      }
    }
    const statsMap = new Map<string, any>();
    const detailMap = new Map<string, any>();
    const shadowMap = new Map<string, any>();
    const shadowDetailMap = new Map<string, any>();

    const bet365HealthResult = await db.from("source_health")
      .select("source,status,value_text,observed_at,notes,raw")
      .eq("source","FLASHSCORE_BET365")
      .eq("metric","cloud_ingest")
      .maybeSingle();
    const bet365Heartbeat = bet365HealthResult.data ?? null;
    const bet365HeartbeatAgeSeconds = bet365Heartbeat?.observed_at
      ? Math.max(0,(Date.now()-new Date(bet365Heartbeat.observed_at).getTime())/1000)
      : null;
    const bet365HeartbeatStatus=String(bet365Heartbeat?.status||"").toUpperCase();
    const bet365HeartbeatValue=String(bet365Heartbeat?.value_text||"").toUpperCase();
    const bet365SourceHealthy=bet365HeartbeatStatus==="OK" && !["STALE","ERROR","FETCH_FAILED"].includes(bet365HeartbeatValue);
    const bet365MarketHealth = bet365HealthResult.error
      ? {status:"UNAVAILABLE",source:marketSource,reason:"heartbeat_read_failed"}
      : !bet365Heartbeat
        ? {status:"UNAVAILABLE",source:marketSource,reason:"cloud_bookmaker_health_missing"}
        : !bet365SourceHealthy
          ? {status:"STALE",source:marketSource,reason:"cloud_bookmaker_health_not_ok",ageSeconds:bet365HeartbeatAgeSeconds,upstreamStatus:bet365HeartbeatStatus,upstreamValue:bet365HeartbeatValue}
          : !Number.isFinite(bet365HeartbeatAgeSeconds) || bet365HeartbeatAgeSeconds > 1200
            ? {status:"STALE",source:marketSource,reason:"cloud_bookmaker_health_stale",ageSeconds:bet365HeartbeatAgeSeconds}
            : marketRows.length
              ? {status:"REFERENCE_AVAILABLE",source:marketSource,ageSeconds:bet365HeartbeatAgeSeconds,semantics:"prematch_reference_not_verified_in_play"}
              : {status:"REFERENCE_EMPTY",source:marketSource,ageSeconds:bet365HeartbeatAgeSeconds,semantics:"live_fixture_state_independent_of_bookmaker_reference"};

    const readHealth: Record<string, any> = {
      market: bet365MarketHealth,
      score: { status: ids.length ? "PENDING" : "NOT_REQUIRED" },
      stats: { status: ids.length ? "PENDING" : "NOT_REQUIRED" },
      detail: { status: ids.length ? "PENDING" : "NOT_REQUIRED" },
      shadow: { status: ids.length ? "PENDING" : "NOT_REQUIRED" },
      shadowDetail: { status: ids.length ? "PENDING" : "NOT_REQUIRED" },
      heartbeats: { status: "PENDING" },
    };
    let heartbeats: any[] = bet365Heartbeat ? [bet365Heartbeat] : [];

    if (ids.length) {
      const [scoreResult, statsResult, detailResult, shadowResult, shadowDetailResult, heartbeatResult] = await Promise.all([
        db.from("live_score_feed_current")
          .select("match_id,updated_at_source,live_score,home_score,away_score,minute,match_status,source,match_confidence,source_updated_at,home_corners,away_corners,total_corners,source_match_id")
          .in("match_id", ids)
          .gte("updated_at_source", liveCutoff),
        db.from("live_stats_feed_current")
          .select("match_id,captured_at_hkt,detail_status,source,match_confidence,team_stats")
          .in("match_id", ids),
        db.from("live_detail_state_feed_current")
          .select("match_id,captured_at_hkt,source,source_match_id,match_confidence,match_minute,match_status,raw_detail_status,effective_detail_status,team_stats_count,events_count,momentum_count")
          .in("match_id", ids),
        db.from("live_expected_actual_feed_current")
          .select("match_id,segment,match_minute,expected_control_side,actual_control_side,actual_control_score,live_metric_count,control_basis,context_coverage_score,model_hda_consensus,shadow_status,shadow_reason,xg_home,xg_away,shots_home,shots_away,sot_home,sot_away,possession_home,possession_away,box_touches_home,box_touches_away,big_chances_home,big_chances_away,corners_home,corners_away,captured_at_hkt")
          .in("match_id", ids),
        db.from("live_detail_shadow_feed_current")
          .select("match_id,captured_at,source,source_match_id,detail_status,events")
          .in("match_id", ids),
        db.from("source_health")
          .select("source,status,observed_at")
          .in("source", ["LIVE_SCORE_EDGE", "LIVE_LAYER_GUARD", "PHASE3_IDENTITY_REGISTRY"])
          .eq("metric", "heartbeat"),
      ]);

      const laneResults = {
        score: scoreResult,
        stats: statsResult,
        detail: detailResult,
        shadow: shadowResult,
        shadowDetail: shadowDetailResult,
        heartbeats: heartbeatResult,
      };
      for (const [lane, result] of Object.entries(laneResults)) {
        const error = (result as any)?.error ?? null;
        readHealth[lane] = error
          ? { status: "UNAVAILABLE", reason: "db_read_failed" }
          : { status: "OK" };
      }

      const scores = scoreResult.data ?? [];
      const stats = statsResult.data ?? [];
      const details = detailResult.data ?? [];
      const shadows = shadowResult.data ?? [];
      const shadowDetails = shadowDetailResult.data ?? [];
      heartbeats = [...(bet365Heartbeat ? [bet365Heartbeat] : []), ...(heartbeatResult.data ?? [])];

      for (const row of scores ?? []) scoreMap.set(row.match_id, row);
      for (const row of details ?? []) {
        detailMap.set(row.match_id, {
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
        if (Number.isFinite(age) && age <= 20) statsMap.set(row.match_id, compactStats(row));
      }
      for (const row of shadows ?? []) {
        shadowMap.set(row.match_id, {
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
      for (const row of shadowDetails ?? []) {
        const age = row.captured_at ? (Date.now() - new Date(row.captured_at).getTime()) / 60000 : Infinity;
        const events = Array.isArray(row.events) ? row.events : [];
        if (!Number.isFinite(age) || age > 10 || String(row.detail_status || "").toUpperCase() !== "CAPTURED" || !events.length) continue;
        shadowDetailMap.set(row.match_id, {
          capturedAt: row.captured_at ?? null,
          detailStatus: row.detail_status ?? null,
          source: row.source ?? null,
          sourceMatchId: row.source_match_id ?? null,
          eventsCount: events.length,
          events,
          provenance: "SHADOW_PROVIDER_DETAIL",
        });
      }
    }

    if(!bet365SourceHealthy){
      for(const row of marketRows){
        row.had_home=null;
        row.had_draw=null;
        row.had_away=null;
        row.reference_odds_source=null;
        row.odds_updated_at=null;
      }
    }

    const rows = (marketRows ?? []).map((r: any) => {
      const score = scoreMap.get(r.match_id) ?? {};
      return {
        id: r.match_id,
        kickoff: r.kickoff_hkt,
        status: r.status,
        league: r.tournament,
        home: r.home_en,
        away: r.away_en,
        homeZh: r.home_en,
        awayZh: r.away_en,
        liveNow: true,
        inPlay: true,
        live: {
          status: r.status ?? null,
          fetchedAt: r.fetched_at ?? null,
          poolStatus: r.pool_status ?? null,
          oddsUpdatedAt: r.odds_updated_at ?? null,
          odds: { home: null, draw: null, away: null },
          oddsSemantics: "NO_VERIFIED_IN_PLAY_BOOKMAKER_ODDS",
          referenceOdds: {
            home: num(r.had_home),
            draw: num(r.had_draw),
            away: num(r.had_away),
            source: r.reference_odds_source ?? null,
            capturedAt: r.odds_updated_at ?? null,
            semantics: "PREMATCH_OR_NON_LIVE_REFERENCE_ONLY"
          },
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
          detail: detailMap.get(r.match_id) ?? null,
          stats: statsMap.get(r.match_id) ?? null,
          shadow: shadowMap.get(r.match_id) ?? null,
          shadowDetail: shadowDetailMap.get(r.match_id) ?? null,
        },
      };
    });

    if (!ids.length) {
      readHealth.heartbeats = bet365Heartbeat
        ? { status: "OK", source: "FLASHSCORE_BET365" }
        : { status: "UNAVAILABLE", reason: "cloud_bookmaker_health_missing" };
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
    console.error("live_feed_unavailable", e);
    return Response.json({
      error: "live_feed_unavailable",
      semantics: "read_failure_not_fixture_absence",
    }, {
      status: 503,
      headers: { ...corsHeaders, "Cache-Control": "no-store" },
    });
  }
});
