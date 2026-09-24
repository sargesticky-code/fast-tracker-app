import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function num(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampProb(v: number) {
  return Math.min(0.999, Math.max(0.001, v));
}

function logit(p: number) {
  const q = clampProb(p);
  return Math.log(q / (1 - q));
}

function logistic(x: number) {
  return 1 / (1 + Math.exp(-x));
}

function poissonOver(meanValue: unknown, lineValue: unknown) {
  const mean = num(meanValue);
  const line = num(lineValue);
  if (mean == null || line == null || mean <= 0 || line < 0) return null;
  const threshold = Math.floor(line) + 1;
  let term = Math.exp(-mean);
  let cdf = term;
  for (let k = 1; k < threshold; k += 1) {
    term *= mean / k;
    cdf += term;
  }
  return Math.min(0.999, Math.max(0.001, 1 - cdf));
}

function lineModel(
  targetLineValue: unknown,
  avgValue: unknown,
  refLine: number,
  refOverValue: unknown,
  minLine: number,
  maxLine: number,
) {
  const targetLine = num(targetLineValue);
  const avg = num(avgValue);
  const refOver = num(refOverValue);
  if (targetLine == null || targetLine < minLine || targetLine > maxLine) return null;

  if (Math.abs(targetLine - refLine) < 0.001 && refOver != null && refOver > 0 && refOver < 1) {
    return {
      line: targetLine,
      over: refOver,
      under: 1 - refOver,
      avg,
      native: true,
      derived: false,
      method: "FOREBET_NATIVE",
      anchorLine: refLine,
    };
  }

  const baseTarget = poissonOver(avg, targetLine);
  if (baseTarget == null) return null;

  if (refOver != null && refOver > 0 && refOver < 1) {
    const baseRef = poissonOver(avg, refLine);
    if (baseRef != null) {
      const shifted = logistic(logit(baseTarget) + (logit(refOver) - logit(baseRef)));
      return {
        line: targetLine,
        over: shifted,
        under: 1 - shifted,
        avg,
        native: false,
        derived: true,
        method: "FOREBET_ANCHORED_POISSON",
        anchorLine: refLine,
      };
    }
  }

  return {
    line: targetLine,
    over: baseTarget,
    under: 1 - baseTarget,
    avg,
    native: false,
    derived: true,
    method: "FOREBET_AVG_POISSON",
    anchorLine: refLine,
  };
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

function compactLiveStats(row: any) {
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

function getServerKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      if (parsed?.default) return parsed.default as string;
    } catch (_) {}
  }
  return "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return Response.json({ error: "method_not_allowed" }, {
      status: 405,
      headers: { ...corsHeaders, "Cache-Control": "no-store" },
    });
  }

  try {
    const url = new URL(req.url);
    const requested = Number(url.searchParams.get("hours") ?? "24");
    const hours = Math.max(1, Math.min(48, Number.isFinite(requested) ? requested : 24));

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serverKey = getServerKey();
    if (!supabaseUrl || !serverKey) throw new Error("server_config_missing");

    const db = createClient(supabaseUrl, serverKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await db.rpc("ft_internal_app_phase1_feed", {
      window_hours: hours,
    });
    if (error) throw new Error(`rpc_error:${error.code ?? "unknown"}:${error.message ?? "unknown"}`);

    const rows = Array.isArray(data) ? data : [];

    const eventIds = rows.map((r: any) => r.hkjc_event_id).filter(Boolean);
    const movementMap = new Map<string, any>();
    const liveStatsMap = new Map<string, any>();
    const shadowMap = new Map<string, any>();
    const powerMap = new Map<string, any>();
    const modelDetailMap = new Map<string, any>();
    const formDetailMap = new Map<string, any>();
    const formMetaMap = new Map<string, any>();
    const storySummaryMap = new Map<string, any>();
    if (eventIds.length) {
      const { data: formDetailPayload, error: formDetailError } = await db.rpc(
        "ft_internal_team_form_details",
        { event_ids: eventIds },
      );
      if (formDetailError) {
        console.error("team_form_detail_query_failed", formDetailError);
      } else {
        for (const [id, detail] of Object.entries(formDetailPayload ?? {})) {
          formDetailMap.set(id, detail);
        }
      }

      const { data: modelDetailRows, error: modelDetailError } = await db
        .from("model_predictions")
        .select("hkjc_event_id,fetched_at,dc_prob_home,dc_prob_draw,dc_prob_away,dc_xg_home,dc_xg_away,dc_prob_over25,pi_prob_home,pi_prob_draw,pi_prob_away,pi_home_rating,pi_away_rating,pi_diff,training_matches,team_match_quality,quality,model_source,model_league")
        .in("hkjc_event_id", eventIds);
      if (modelDetailError) {
        console.error("model_detail_query_failed", modelDetailError);
      } else {
        for (const row of modelDetailRows ?? []) modelDetailMap.set(row.hkjc_event_id, row);
      }

      const { data: formRows, error: formMetaError } = await db
        .from("form_predictions")
        .select("hkjc_event_id,fetched_at,form_xg_home,form_xg_away,home_games,away_games,home_venue_games,away_venue_games,quality,model_source")
        .in("hkjc_event_id", eventIds);
      if (formMetaError) {
        console.error("team_form_meta_query_failed", formMetaError);
      } else {
        for (const row of formRows ?? []) formMetaMap.set(row.hkjc_event_id, row);
      }

      const { data: storyRows, error: storyError } = await db
        .from("match_interpretations")
        .select("hkjc_event_id,match_script:payload->matchScript,editorial_alignment:payload->editorialAlignment")
        .in("hkjc_event_id", eventIds)
        .eq("language", "zh-HK")
        .eq("style", "professional");
      if (storyError) {
        console.error("story_summary_query_failed", storyError);
      } else {
        for (const row of storyRows ?? []) {
          storySummaryMap.set(row.hkjc_event_id, {
            matchScript: row.match_script ?? null,
            editorialAlignment: row.editorial_alignment ?? null,
          });
        }
      }

      const { data: movementRows, error: movementError } = await db
        .from("odds_movement_current")
        .select("hkjc_event_id,captured_at,movement_side,now_odds,odds_24h,move_24h_pp,odds_2h,move_2h_pp,odds_1h,move_1h_pp,vol_24h_pp,signal,model_side,model_prob,model_alignment,match_confidence,alert_score")
        .in("hkjc_event_id", eventIds);

      if (movementError) {
        console.error("movement_query_failed", movementError);
      } else {
        for (const m of movementRows ?? []) {
          const nowOdds = num(m.now_odds);
          let baselineOdds = num(m.odds_24h);
          let baselineWindow = baselineOdds == null ? null : "24h";
          if (baselineOdds == null) {
            baselineOdds = num(m.odds_2h);
            baselineWindow = baselineOdds == null ? null : "2h";
          }
          if (baselineOdds == null) {
            baselineOdds = num(m.odds_1h);
            baselineWindow = baselineOdds == null ? null : "1h";
          }
          const rawOddsChangePct =
            nowOdds != null && baselineOdds != null && baselineOdds !== 0
              ? ((nowOdds / baselineOdds) - 1) * 100
              : null;

          movementMap.set(m.hkjc_event_id, {
            capturedAt: m.captured_at ?? null,
            side: m.movement_side ?? null,
            nowOdds,
            baselineOdds,
            baselineWindow,
            rawOddsChangePct,
            move24hPp: num(m.move_24h_pp),
            move2hPp: num(m.move_2h_pp),
            move1hPp: num(m.move_1h_pp),
            volatility24hPp: num(m.vol_24h_pp),
            signal: m.signal ?? null,
            modelSide: m.model_side ?? null,
            modelProb: num(m.model_prob),
            modelAlignment: m.model_alignment ?? null,
            matchConfidence: num(m.match_confidence),
            alertScore: num(m.alert_score),
          });
        }
      }
      
      const liveCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const detailHistoryCutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      const { data: liveStatRows, error: liveStatsError } = await db
        .from("live_stats_current")
        .select("hkjc_event_id,captured_at_hkt,detail_status,source,match_confidence,team_stats")
        .in("hkjc_event_id", eventIds)
        .gte("captured_at_hkt", liveCutoff);

      const currentStatRows = new Map<string, any>();
      if (liveStatsError) {
        console.error("live_stats_query_failed", liveStatsError);
      } else {
        for (const row of liveStatRows ?? []) {
          if (String(row.source ?? "") === "SOURCE_GAP") continue;
          const confidence = num(row.match_confidence);
          if (confidence != null && confidence < 0.74) continue;
          currentStatRows.set(row.hkjc_event_id, row);
          if (Array.isArray(row.team_stats) && row.team_stats.length > 0) {
            liveStatsMap.set(row.hkjc_event_id, {
              ...compactLiveStats(row),
              snapshotMode: "CURRENT_CAPTURED",
            });
          }
        }
      }

      const missingDetailIds = eventIds.filter((id: string) => !liveStatsMap.has(id));
      if (missingDetailIds.length) {
        const { data: historyRows, error: historyError } = await db
          .from("live_stats_history")
          .select("hkjc_event_id,captured_at_hkt,detail_status,source,match_confidence,team_stats")
          .in("hkjc_event_id", missingDetailIds)
          .gte("captured_at_hkt", detailHistoryCutoff)
          .order("captured_at_hkt", { ascending: false })
          .limit(1000);

        if (historyError) {
          console.error("live_stats_history_query_failed", historyError);
        } else {
          const seenHistory = new Set<string>();
          for (const row of historyRows ?? []) {
            const id = String(row.hkjc_event_id ?? "");
            if (!id || seenHistory.has(id) || liveStatsMap.has(id)) continue;
            if (String(row.source ?? "") === "SOURCE_GAP") continue;
            const confidence = num(row.match_confidence);
            if (confidence != null && confidence < 0.74) continue;
            if (!Array.isArray(row.team_stats) || row.team_stats.length === 0) continue;
            seenHistory.add(id);
            const latestRow = currentStatRows.get(id);
            liveStatsMap.set(id, {
              ...compactLiveStats(row),
              snapshotMode: "LAST_GOOD_CAPTURE",
              latestDetailStatus: latestRow?.detail_status ?? null,
            });
          }
        }
      }

      const shadowSelect = "hkjc_event_id,segment,match_minute,expected_control_side,actual_control_side,actual_control_score,live_metric_count,control_basis,context_coverage_score,model_hda_consensus,shadow_status,shadow_reason,xg_home,xg_away,shots_home,shots_away,sot_home,sot_away,possession_home,possession_away,box_touches_home,box_touches_away,big_chances_home,big_chances_away,corners_home,corners_away,captured_at_hkt";
      const shadowHistorySelect = "hkjc_event_id,segment,match_minute,expected_control_side,actual_control_side,actual_control_score,live_metric_count,control_basis,context_coverage_score,shadow_status,shadow_reason,xg_home,xg_away,shots_home,shots_away,sot_home,sot_away,possession_home,possession_away,box_touches_home,box_touches_away,big_chances_home,big_chances_away,corners_home,corners_away,captured_at_hkt";
      const shadowObject = (row: any, snapshotMode: string) => ({
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
        snapshotMode,
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

      const { data: shadowRows, error: shadowError } = await db
        .from("live_expected_actual_current")
        .select(shadowSelect)
        .in("hkjc_event_id", eventIds);

      const missingShadowIds: string[] = [];
      if (shadowError) {
        console.error("shadow_query_failed", shadowError);
        missingShadowIds.push(...eventIds);
      } else {
        for (const row of shadowRows ?? []) {
          if (Number(row.live_metric_count ?? 0) > 0) {
            shadowMap.set(row.hkjc_event_id, shadowObject(row, "CURRENT_CAPTURED"));
          } else {
            missingShadowIds.push(row.hkjc_event_id);
          }
        }
        for (const id of eventIds) {
          if (!(shadowRows ?? []).some((row: any) => row.hkjc_event_id === id)) missingShadowIds.push(id);
        }
      }

      if (missingShadowIds.length) {
        const shadowHistoryCutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
        const { data: shadowHistoryRows, error: shadowHistoryError } = await db
          .from("live_expected_actual_history")
          .select(shadowHistorySelect)
          .in("hkjc_event_id", [...new Set(missingShadowIds)])
          .gte("captured_at_hkt", shadowHistoryCutoff)
          .gt("live_metric_count", 0)
          .order("captured_at_hkt", { ascending: false })
          .limit(1000);

        if (shadowHistoryError) {
          console.error("shadow_history_query_failed", shadowHistoryError);
        } else {
          const seen = new Set<string>();
          for (const row of shadowHistoryRows ?? []) {
            const id = String(row.hkjc_event_id ?? "");
            if (!id || seen.has(id) || shadowMap.has(id)) continue;
            seen.add(id);
            shadowMap.set(id, shadowObject(row, "LAST_GOOD_CAPTURE"));
          }
        }
      }

      const { data: powerRows, error: powerError } = await db
        .from("hkjc_power_current")
        .select("hkjc_event_id,fetched_at,home_rating,away_rating,home_opta_name,away_opta_name,home_match_confidence,away_match_confidence,home_rank,away_rank,coverage,source,power_updated")
        .in("hkjc_event_id", eventIds);

      if (powerError) {
        console.error("power_query_failed", powerError);
      } else {
        for (const row of powerRows ?? []) {
          powerMap.set(row.hkjc_event_id, {
            fetchedAt: row.fetched_at ?? null,
            home: num(row.home_rating),
            away: num(row.away_rating),
            homeName: row.home_opta_name ?? null,
            awayName: row.away_opta_name ?? null,
            homeConfidence: num(row.home_match_confidence),
            awayConfidence: num(row.away_match_confidence),
            homeRank: num(row.home_rank),
            awayRank: num(row.away_rank),
            coverage: row.coverage ?? null,
            source: row.source ?? null,
            updatedAt: row.power_updated ?? null,
          });
        }
      }
    }

    const { data: heartbeatRows, error: heartbeatError } = await db
      .from("source_health")
      .select("source,status,value_text,notes,observed_at,raw")
      .in("source", ["HKJC_UPCOMING_EDGE", "HKJC_LIVE_EDGE", "LIVE_SCORE_EDGE", "LIVE_LAYER_GUARD", "LIVE_UPSTREAM_DEPLOY", "LIVE_SOURCE_SHADOW", "LIVE_SHADOW_COMPARE", "PHASE3_IDENTITY_REGISTRY", "FRONTEND_ROUTE_GUARD"])
      .eq("metric", "heartbeat");

    if (heartbeatError) console.error("heartbeat_query_failed", heartbeatError);

    const systemHealth = Object.fromEntries(
      (heartbeatRows ?? []).map((row: any) => [
        row.source,
        {
          status: row.status ?? null,
          value: row.value_text ?? null,
          notes: row.notes ?? null,
          observedAt: row.observed_at ?? null,
          raw: row.raw ?? null,
        },
      ]),
    );

    const matches = rows.map((r: any) => ({
      id: r.hkjc_event_id,
      kickoff: r.kickoff_hkt,
      status: r.status,
      league: r.tournament,
      home: r.home_en,
      away: r.away_en,
      homeZh: r.home_zh,
      awayZh: r.away_zh,
      inPlay: Boolean(r.in_play),
      liveEligible: Boolean(r.in_play),
      liveNow: Boolean(r.live_now),
      live: r.live_now ? {
        status: r.live_status ?? null,
        fetchedAt: r.live_fetched_at ?? null,
        poolStatus: r.live_pool_status ?? null,
        oddsUpdatedAt: r.live_odds_updated_at ?? null,
        odds: {
          home: num(r.live_had_home),
          draw: num(r.live_had_draw),
          away: num(r.live_had_away),
        },
        goals: {
          line: r.live_hil_line ?? null,
          over: num(r.live_hil_over),
          under: num(r.live_hil_under),
        },
        corners: {
          line: r.live_chl_line ?? null,
          over: num(r.live_chl_over),
          under: num(r.live_chl_under),
        },
        score: {
          text: r.live_score ?? null,
          home: num(r.live_home_score),
          away: num(r.live_away_score),
          minute: num(r.live_minute),
          status: r.live_score_status ?? null,
          source: r.live_score_source ?? null,
          confidence: num(r.live_score_confidence),
          capturedAt: r.live_score_captured_at ?? null,
          sourceUpdatedAt: r.live_score_source_updated_at ?? null,
          homeCorners: num(r.live_home_corners),
          awayCorners: num(r.live_away_corners),
          totalCorners: num(r.live_total_corners),
        },
        stats: liveStatsMap.get(r.hkjc_event_id) ?? null,
        shadow: shadowMap.get(r.hkjc_event_id) ?? null,
      } : null,
      odds: {
        home: num(r.hkjc_home_odds),
        draw: num(r.hkjc_draw_odds),
        away: num(r.hkjc_away_odds),
      },
      market: {
        home: num(r.hkjc_novig_home),
        draw: num(r.hkjc_novig_draw),
        away: num(r.hkjc_novig_away),
      },
      goals: {
        line: r.hkjc_goals_line ?? null,
        over: num(r.hkjc_goals_over),
        under: num(r.hkjc_goals_under),
      },
      corners: {
        line: r.hkjc_corners_line ?? null,
        over: num(r.hkjc_corners_over),
        under: num(r.hkjc_corners_under),
      },
      forebetDetail: {
        predictedScore: r.forebet_predicted_score ?? null,
        ou25: { over: num(r.forebet_ou_over), under: num(r.forebet_ou_under), avgGoals: num(r.forebet_avg_goals) },
        corners95: { over: num(r.forebet_corners_over), under: num(r.forebet_corners_under), avgCorners: num(r.forebet_avg_corners) },
        goalsCurrentLine: lineModel(
          r.hkjc_goals_line,
          r.forebet_avg_goals,
          2.5,
          r.forebet_ou_over,
          0.5,
          6.5,
        ),
        cornersCurrentLine: lineModel(
          r.hkjc_corners_line,
          r.forebet_avg_corners,
          9.5,
          r.forebet_corners_over,
          4.5,
          16.5,
        ),
      },
      multisourceDetail: {
        ou25: { over: num(r.multisource_ou_over), under: num(r.multisource_ou_under) },
        btts: { yes: num(r.multisource_btts_yes), no: num(r.multisource_btts_no) },
      },
      forebet: r.forebet_home == null ? null : {
        home: num(r.forebet_home), draw: num(r.forebet_draw), away: num(r.forebet_away),
      },
      dc: r.dc_home == null ? null : {
        home: num(r.dc_home), draw: num(r.dc_draw), away: num(r.dc_away),
      },
      dcDetail: (() => {
        const m: any = modelDetailMap.get(r.hkjc_event_id) ?? null;
        if (!m) return null;
        return {
          quality: m.quality ?? null,
          source: m.model_source ?? null,
          league: m.model_league ?? null,
          fetchedAt: m.fetched_at ?? null,
          trainingMatches: Number(m.training_matches ?? 0),
          teamMatchQuality: num(m.team_match_quality),
          probabilities: {
            home: num(m.dc_prob_home),
            draw: num(m.dc_prob_draw),
            away: num(m.dc_prob_away),
          },
          expectedGoals: {
            home: num(m.dc_xg_home),
            away: num(m.dc_xg_away),
          },
          over25: num(m.dc_prob_over25),
          available: m.quality === "MODELED" && m.dc_prob_home != null,
          missingReason: m.quality === "MODELED" ? null : (m.quality ?? "NO_MODEL_ROW"),
        };
      })(),
      pi: r.pi_home == null ? null : {
        home: num(r.pi_home), draw: num(r.pi_draw), away: num(r.pi_away),
      },
      piDetail: (() => {
        const m: any = modelDetailMap.get(r.hkjc_event_id) ?? null;
        if (!m) return null;
        return {
          quality: m.quality ?? null,
          source: m.model_source ?? null,
          league: m.model_league ?? null,
          fetchedAt: m.fetched_at ?? null,
          trainingMatches: Number(m.training_matches ?? 0),
          teamMatchQuality: num(m.team_match_quality),
          probabilities: {
            home: num(m.pi_prob_home),
            draw: num(m.pi_prob_draw),
            away: num(m.pi_prob_away),
          },
          ratings: {
            home: num(m.pi_home_rating),
            away: num(m.pi_away_rating),
            difference: num(m.pi_diff),
          },
          available: m.quality === "MODELED" && m.pi_prob_home != null,
          missingReason: m.quality === "MODELED" ? null : (m.quality ?? "NO_MODEL_ROW"),
        };
      })(),
      form: r.form_home == null ? null : {
        home: num(r.form_home), draw: num(r.form_draw), away: num(r.form_away),
      },
      formDetail: (() => {
        const detail: any = formDetailMap.get(r.hkjc_event_id) ?? null;
        const meta: any = formMetaMap.get(r.hkjc_event_id) ?? null;
        if (!detail && !meta) return null;
        const homeDetail = detail?.home ?? {};
        const awayDetail = detail?.away ?? {};
        return {
          quality: meta?.quality ?? null,
          source: meta?.model_source ?? "HKJC confirmed results",
          fetchedAt: meta?.fetched_at ?? null,
          home: {
            ...homeDetail,
            modelGames: Number(meta?.home_games ?? homeDetail?.games ?? 0),
            venueGames: Number(meta?.home_venue_games ?? 0),
            expectedGoals: num(meta?.form_xg_home),
          },
          away: {
            ...awayDetail,
            modelGames: Number(meta?.away_games ?? awayDetail?.games ?? 0),
            venueGames: Number(meta?.away_venue_games ?? 0),
            expectedGoals: num(meta?.form_xg_away),
          },
        };
      })(),
      multi: r.multisource_home == null ? null : {
        home: num(r.multisource_home),
        draw: num(r.multisource_draw),
        away: num(r.multisource_away),
        sources: Number(r.multisource_count ?? 0),
        sourceNames: r.multisource_sources ?? [],
      },
      health: {
        status: r.health_status,
        primaryMissingReason: r.primary_missing_reason,
        diagnostics: r.diagnostic_codes ?? [],
        hkjcFetchedAt: r.hkjc_fetched_at,
        hkjcPriceChangedAt: r.hkjc_price_changed_at,
        hkjcMarketCapturedAt: r.hkjc_market_captured_at,
        hkjcFetchAgeMinutes: num(r.hkjc_fetch_age_minutes),
        hkjcFreshness: r.hkjc_freshness,
        forebetCheckedAt: r.forebet_checked_at,
        forebetState: r.forebet_state,
        forebetReason: r.forebet_reason,
        forebetCheckFreshness: r.forebet_check_freshness,
        internalModelQuality: r.internal_model_quality,
        internalModelSource: r.internal_model_source,
        fallbackStatus: r.fallback_status,
        fallbackSource: r.fallback_source,
        fallbackRecommendation: r.fallback_recommendation,
        fallbackMarket: r.fallback_market,
        homeAliasPresent: r.home_alias_present,
        awayAliasPresent: r.away_alias_present,
        evidenceChannelCount: Number(r.evidence_channel_count ?? 0),
        multisourceMemberCount: Number(r.multisource_member_count ?? 0),
        missingCanonical1x2: Boolean(r.missing_canonical_1x2),
        forebetCoverageStatus: r.forebet_coverage_status ?? null,
        dcPiCoverageStatus: r.dc_pi_coverage_status ?? null,
        formCoverageStatus: r.form_coverage_status ?? null,
        multisourceCoverageStatus: r.multisource_coverage_status ?? null,
        formQuality: r.form_quality ?? null,
        multisourceMatchStatus: r.multisource_match_status ?? null,
        multisourceMatchReason: r.multisource_match_reason ?? null,
        multisourceSourceCountTotal: Number(r.multisource_source_count_total ?? 0),
        unifiedCoverageStatus: (() => {
          const evidenceCount = Number(r.evidence_channel_count ?? 0);
          const rawStatus = String(r.unified_coverage_status ?? "");
          const sourceSpecificIdentityBlock =
            r.dc_pi_coverage_status === "IDENTITY_BLOCK" ||
            r.form_coverage_status === "IDENTITY_BLOCK";

          // The underlying health view historically treated a missing source row
          // as an identity mismatch because NULL names were compared as empty
          // strings. Preserve only source-specific, confirmed identity blocks.
          if (rawStatus === "IDENTITY_BLOCK" && !sourceSpecificIdentityBlock) {
            if (evidenceCount >= 3) return "DATA_RICH";
            if (evidenceCount >= 1) return "PARTIAL_MODEL_COVERAGE";
          }

          // A missing optional model row is coverage information, not a hard
          // pipeline failure, when at least one independent channel is usable.
          if (rawStatus === "PIPELINE_COVERAGE_GAP" && evidenceCount >= 1) {
            return evidenceCount >= 3 ? "DATA_RICH" : "PARTIAL_MODEL_COVERAGE";
          }

          if (
            evidenceCount === 0 &&
            Boolean(r.home_alias_present) &&
            Boolean(r.away_alias_present) &&
            r.forebet_check_freshness === "FRESH" &&
            ["SOURCE_ABSENT", "FIXTURE_ONLY"].includes(String(r.forebet_coverage_status || "")) &&
            r.multisource_coverage_status === "NO_MATCHED_SOURCE"
          ) {
            return "SOURCE_COVERAGE_GAP";
          }

          return rawStatus || null;
        })(),
        coverageExplanation:
          Number(r.evidence_channel_count ?? 0) === 0 &&
          Boolean(r.home_alias_present) &&
          Boolean(r.away_alias_present)
            ? "Team identity is verified; prediction sources were checked but no usable independent 1X2 model is available."
            : null,
      },
      decision: r.decision,
      decisionMarket: r.decision_market,
      decisionSelection: r.decision_selection,
      decisionEdge: num(r.decision_edge),
      engineVersion: r.decision_engine_version,
      oddsMovement: (() => {
        const movement = movementMap.get(r.hkjc_event_id);
        if (!movement) return null;
        const side = movement.side;
        const freshNow =
          side === "H" ? num(r.hkjc_home_odds) :
          side === "D" ? num(r.hkjc_draw_odds) :
          side === "A" ? num(r.hkjc_away_odds) :
          null;
        const baseline = num(movement.baselineOdds);
        if (freshNow == null || baseline == null || baseline <= 0) return null;
        return {
          ...movement,
          nowOdds: freshNow,
          rawOddsChangePct: ((freshNow / baseline) - 1) * 100,
        };
      })(),
      power: powerMap.get(r.hkjc_event_id) ?? null,
      storySummary: storySummaryMap.get(r.hkjc_event_id) ?? null,
      updatedAt: r.data_updated_at,
    }));

    return Response.json({
      generatedAt: new Date().toISOString(),
      source: "supabase-canonical-live",
      windowHours: hours,
      count: matches.length,
      systemHealth,
      matches,
    }, {
      headers: { ...corsHeaders, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error(error);
    return Response.json({
      error: "feed_unavailable",
      message: error instanceof Error ? error.message : String(error),
    }, {
      status: 503,
      headers: { ...corsHeaders, "Cache-Control": "no-store" },
    });
  }
});