import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function serverKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const j = JSON.parse(modern);
      if (j?.default) return j.default;
    } catch {}
  }
  return "";
}

function n(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function p(v: unknown): number | null {
  const x = n(v);
  if (x === null) return null;
  const q = x > 1.5 ? x / 100 : x;
  return q >= 0 && q <= 1 ? q : null;
}

type T = { home: number; draw: number; away: number };
type Family = { key: string; label: string; probs: T; weight: number; sources?: number };

function triplet(h: unknown, d: unknown, a: unknown): T | null {
  const home = p(h), draw = p(d), away = p(a);
  if (home === null || draw === null || away === null) return null;
  const s = home + draw + away;
  if (s <= 0) return null;
  return { home: home / s, draw: draw / s, away: away / s };
}

function avgTriplets(items: T[]): T | null {
  if (!items.length) return null;
  return {
    home: items.reduce((s, x) => s + x.home, 0) / items.length,
    draw: items.reduce((s, x) => s + x.draw, 0) / items.length,
    away: items.reduce((s, x) => s + x.away, 0) / items.length,
  };
}

function weighted(items: Family[]): T | null {
  const w = items.reduce((s, x) => s + x.weight, 0);
  if (!w) return null;
  return {
    home: items.reduce((s, x) => s + x.probs.home * x.weight, 0) / w,
    draw: items.reduce((s, x) => s + x.probs.draw * x.weight, 0) / w,
    away: items.reduce((s, x) => s + x.probs.away * x.weight, 0) / w,
  };
}

function pick(t: T | null): "H" | "D" | "A" | null {
  if (!t) return null;
  if (t.home >= t.draw && t.home >= t.away) return "H";
  if (t.draw >= t.home && t.draw >= t.away) return "D";
  return "A";
}

function val(t: T | null, side: "H" | "D" | "A") {
  if (!t) return null;
  return side === "H" ? t.home : side === "D" ? t.draw : t.away;
}

function pct(v: number | null, dp = 1) {
  return v === null ? "—" : (v * 100).toFixed(dp) + "%";
}

function sideLabel(side: string | null, home: string, away: string) {
  if (side === "H") return "主勝 · " + home;
  if (side === "D") return "和局";
  if (side === "A") return "客勝 · " + away;
  return "暫無投注位";
}

function oddsFor(r: any, side: string | null) {
  if (side === "H") return n(r.hkjc_home_odds);
  if (side === "D") return n(r.hkjc_draw_odds);
  if (side === "A") return n(r.hkjc_away_odds);
  return null;
}

function fairMarket(r: any): T | null {
  const direct = triplet(r.hkjc_novig_home, r.hkjc_novig_draw, r.hkjc_novig_away);
  if (direct) return direct;
  const oh = n(r.hkjc_home_odds), od = n(r.hkjc_draw_odds), oa = n(r.hkjc_away_odds);
  if (!oh || !od || !oa || oh <= 0 || od <= 0 || oa <= 0) return null;
  const s = 1 / oh + 1 / od + 1 / oa;
  return { home: (1 / oh) / s, draw: (1 / od) / s, away: (1 / oa) / s };
}

function maxEdge(consensus: T | null, market: T | null) {
  if (!consensus || !market) return { side: null as "H"|"D"|"A"|null, edge: null as number|null };
  const edges = [
    { side: "H" as const, edge: consensus.home - market.home },
    { side: "D" as const, edge: consensus.draw - market.draw },
    { side: "A" as const, edge: consensus.away - market.away },
  ].sort((a,b) => b.edge - a.edge);
  return edges[0];
}

function oneError(e: any) {
  return e ? { code: e.code ?? null, message: e.message ?? String(e) } : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return Response.json({ error: "method_not_allowed" }, { status: 405, headers: cors });

  const u = new URL(req.url);
  const id = String(u.searchParams.get("id") || "").trim();
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(id)) {
    return Response.json({ error: "invalid_match_id" }, { status: 400, headers: { ...cors, "Cache-Control": "no-store" } });
  }

  const sbUrl = Deno.env.get("SUPABASE_URL") || "";
  const key = serverKey();
  if (!sbUrl || !key) return Response.json({ error: "server_config_missing" }, { status: 500, headers: cors });
  const db = createClient(sbUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const baseResult = await db.rpc("ft_internal_app_phase1_feed", { window_hours: 48 });
  if (baseResult.error) {
    return Response.json({ error: "phase1_feed_failed", detail: oneError(baseResult.error) }, { status: 500, headers: cors });
  }
  const rows = Array.isArray(baseResult.data) ? baseResult.data : [];
  let r: any = rows.find((x: any) => String(x.hkjc_event_id) === id) || null;
  let fallbackMode = false;

  if (!r) {
    const [matchRes, oddsRes, forebetRes, modelRes, formRes] = await Promise.all([
      db.from("matches").select("*").eq("hkjc_event_id", id).maybeSingle(),
      db.from("hkjc_odds_current").select("*").eq("hkjc_event_id", id).maybeSingle(),
      db.from("forebet_predictions").select("*").eq("hkjc_event_id", id).maybeSingle(),
      db.from("model_predictions").select("*").eq("hkjc_event_id", id).maybeSingle(),
      db.from("form_predictions").select("*").eq("hkjc_event_id", id).maybeSingle(),
    ]);

    const m:any = matchRes.data || null;
    const o:any = oddsRes.data || null;
    const fb:any = forebetRes.data || null;
    const im:any = modelRes.data || null;
    const fr:any = formRes.data || null;

    if (m || o || fb || im || fr) {
      r = {
        hkjc_event_id:id,
        home_zh:m?.home_zh ?? fb?.raw?.hkjc_home_zh ?? null,
        away_zh:m?.away_zh ?? fb?.raw?.hkjc_away_zh ?? null,
        home_en:m?.home_en ?? im?.home ?? fb?.raw?.hkjc_home_team ?? fb?.forebet_home_team ?? null,
        away_en:m?.away_en ?? im?.away ?? fb?.raw?.hkjc_away_team ?? fb?.forebet_away_team ?? null,
        tournament:m?.tournament ?? fb?.raw?.hkjc_league ?? null,
        kickoff_hkt:m?.kickoff_hkt ?? fb?.raw?.hkjc_kickoff_hkt ?? null,

        hkjc_home_odds:o?.had_home ?? fb?.raw?.hkjc_had_home ?? null,
        hkjc_draw_odds:o?.had_draw ?? fb?.raw?.hkjc_had_draw ?? null,
        hkjc_away_odds:o?.had_away ?? fb?.raw?.hkjc_had_away ?? null,
        hkjc_novig_home:null,
        hkjc_novig_draw:null,
        hkjc_novig_away:null,

        forebet_home:fb?.prob_home ?? null,
        forebet_draw:fb?.prob_draw ?? null,
        forebet_away:fb?.prob_away ?? null,

        dc_home:im?.dc_prob_home ?? null,
        dc_draw:im?.dc_prob_draw ?? null,
        dc_away:im?.dc_prob_away ?? null,
        pi_home:im?.pi_prob_home ?? null,
        pi_draw:im?.pi_prob_draw ?? null,
        pi_away:im?.pi_prob_away ?? null,

        form_home:fr?.form_prob_home ?? null,
        form_draw:fr?.form_prob_draw ?? null,
        form_away:fr?.form_prob_away ?? null,

        multisource_home:null,
        multisource_draw:null,
        multisource_away:null,
        multisource_count:0,
        multisource_member_count:0,

        health_status:"FALLBACK",
        hkjc_freshness:"DB_FALLBACK",
        decision:"CALIBRATION_PENDING_FALLBACK",
        decision_engine_version:"db_fallback_fail_closed_v2",
        evidence_channel_count:[
          fb?.prob_home,
          im?.dc_prob_home,
          im?.pi_prob_home,
          fr?.form_prob_home,
        ].filter((x)=>x!==null&&x!==undefined&&x!=="").length,
        unified_coverage_status:"DB_FALLBACK",
        diagnostic_codes:["MATCH_NOT_IN_ACTIVE_FEED","DB_FALLBACK_FAIL_CLOSED"],
        live_now:false,
        hkjc_fetched_at:o?.fetched_at ?? m?.fetched_at ?? fb?.fetched_at ?? null,
      };
      fallbackMode = true;
    }

    if (!r) {
      return Response.json({ error:"match_not_in_active_48h_feed", id }, {
        status:404,
        headers:{...cors,"Cache-Control":"no-store"}
      });
    }
  }

  const one = async (table: string, schema = "public") => {
    const q = (schema === "public" ? db : db.schema(schema)).from(table).select("*").eq("hkjc_event_id", id).maybeSingle();
    const x = await q;
    return { data: x.data ?? null, error: oneError(x.error) };
  };
  const many = async (table: string, schema = "public") => {
    const q = (schema === "public" ? db : db.schema(schema)).from(table).select("*").eq("hkjc_event_id", id);
    const x = await q;
    return { data: x.data ?? [], error: oneError(x.error) };
  };

  const [
    human, eventMap, playerStatus, lineups, managers, movement,
    liveScore, liveStats, liveOdds, liveShadow, scenarios
  ] = await Promise.all([
    one("human_factors_current"),
    one("api_football_event_map"),
    many("phase2_player_status_evidence"),
    many("phase2_match_lineup_evidence"),
    many("phase2_manager_evidence"),
    one("odds_movement_current"),
    one("live_score_current"),
    one("live_stats_current"),
    one("hkjc_live_odds_current"),
    one("live_expected_actual_current"),
    many("match_scenario_current"),
  ]);

  const forebet = triplet(r.forebet_home, r.forebet_draw, r.forebet_away);
  const dc = triplet(r.dc_home, r.dc_draw, r.dc_away);
  const pi = triplet(r.pi_home, r.pi_draw, r.pi_away);
  const form = triplet(r.form_home, r.form_draw, r.form_away);
  const multi = triplet(r.multisource_home, r.multisource_draw, r.multisource_away);
  const internal = avgTriplets([dc, pi].filter(Boolean) as T[]);

  const families: Family[] = [];
  if (forebet) families.push({ key: "FOREBET", label: "Forebet", probs: forebet, weight: 1 });
  if (internal) families.push({ key: "INTERNAL", label: "Dixon-Coles + Pi family", probs: internal, weight: 1 });
  if (form) families.push({ key: "FORM", label: "Team Form", probs: form, weight: 0.9 });
  const multiCount = Number(r.multisource_count ?? r.multisource_member_count ?? 0);
  if (multi) families.push({
    key: "MULTI",
    label: "External consensus",
    probs: multi,
    weight: multiCount >= 2 ? 0.75 : 0.35,
    sources: multiCount,
  });

  const consensus = weighted(families);
  const market = fairMarket(r);
  const best = maxEdge(consensus, market);
  const bestSide = best.edge !== null && best.edge > 0 ? best.side : null;
  const bestProb = bestSide ? val(consensus, bestSide) : null;
  const marketProb = bestSide ? val(market, bestSide) : null;
  const bestOdds = oddsFor(r, bestSide);
  const familyPicks = families.map(x => ({ key: x.key, pick: pick(x.probs), probability: val(x.probs, pick(x.probs) || "H") }));
  // Value support means the family prices the candidate side above HKJC's no-vig market probability.
  // This is intentionally different from asking whether that side is the family's most likely 1X2 outcome.
  const support = bestSide && market
    ? families.filter(x => (val(x.probs, bestSide) ?? -1) > (val(market, bestSide) ?? 2)).length
    : 0;
  const agreement = families.length ? support / families.length : 0;
  const selectedFamilyValues = bestSide ? families.map(x => val(x.probs, bestSide)).filter((x): x is number => x !== null) : [];
  const dispersion = selectedFamilyValues.length >= 2 ? Math.max(...selectedFamilyValues) - Math.min(...selectedFamilyValues) : null;
  const familySupport = bestSide && market
    ? families.map((f) => {
        const probability = val(f.probs, bestSide);
        const fair = val(market, bestSide);
        return {
          key: f.key,
          label: f.label,
          probability,
          edgePp: probability === null || fair === null ? null : (probability - fair) * 100,
          supports: probability !== null && fair !== null ? probability > fair : false,
        };
      })
    : [];
  const supportingFamilies = familySupport.filter((x) => x.supports).sort((a,b) => (b.edgePp ?? -999) - (a.edgePp ?? -999));
  const opposingFamilies = familySupport.filter((x) => !x.supports).sort((a,b) => (a.edgePp ?? 999) - (b.edgePp ?? 999));

  const healthOk = String(r.health_status || "").toUpperCase() === "OK";
  const fresh = String(r.hkjc_freshness || "").toUpperCase() === "FRESH";
  const pipelineGate = String(r.decision || "").toUpperCase();
  let candidate = "NO_EDGE";
  if (!market || !families.length || !healthOk || !fresh) candidate = "DATA_RISK";
  else if (families.length < 2) candidate = "WATCH";
  else if ((best.edge ?? -1) >= 0.10 && agreement >= 0.66) candidate = "STRONG_VALUE_CANDIDATE";
  else if ((best.edge ?? -1) >= 0.05 && agreement >= 0.50) candidate = "VALUE_CANDIDATE";
  else if ((best.edge ?? -1) >= 0.025) candidate = "LEAN";
  else candidate = "NO_EDGE";

  const productionValidated = !fallbackMode && !pipelineGate.includes("CALIBRATION") && pipelineGate !== "";
  const action = candidate === "DATA_RISK" ? "NO_BET"
    : candidate === "NO_EDGE" ? "PASS"
    : productionValidated ? candidate
    : "WATCH_CANDIDATE";

  const home = r.home_zh || r.home_en || "主隊";
  const away = r.away_zh || r.away_en || "客隊";
  const selection = sideLabel(bestSide, home, away);
  const edgeText = best.edge === null ? "—" : ((best.edge >= 0 ? "+" : "") + (best.edge * 100).toFixed(1) + "%");
  const oddsText = bestOdds === null ? "—" : bestOdds.toFixed(2);

  const lineupConfirmed = Boolean(eventMap.data?.lineup_confirmed_at);
  const injuryHome = Number(human.data?.raw?.injury_count_home ?? (playerStatus.data || []).filter((x:any)=>x.team_side==="HOME").length ?? 0);
  const injuryAway = Number(human.data?.raw?.injury_count_away ?? (playerStatus.data || []).filter((x:any)=>x.team_side==="AWAY").length ?? 0);
  const humanQuality = human.data?.quality ?? (eventMap.data ? "MAPPED" : "NO_DATA");

  const live = Boolean(r.live_now || liveScore.data || liveOdds.data);
  const shadow = liveShadow.data;
  const liveState = live ? {
    minute: liveScore.data?.minute ?? liveStats.data?.match_minute ?? shadow?.match_minute ?? null,
    score: liveScore.data?.live_score ?? liveStats.data?.live_score ?? null,
    shadowStatus: shadow?.shadow_status ?? null,
    expectedSide: shadow?.expected_control_side ?? null,
    actualSide: shadow?.actual_control_side ?? null,
    controlScore: n(shadow?.actual_control_score),
    metricCount: Number(shadow?.live_metric_count ?? 0),
    detailStatus: liveStats.data?.detail_status ?? null,
  } : null;

  const movementData = movement.data;
  const movementText = movementData
    ? `${movementData.signal || "COLLECTING"} · ${movementData.movement_side || "—"} · 24H ${movementData.move_24h_pp == null ? "—" : Number(movementData.move_24h_pp).toFixed(1) + "%"} · ${movementData.model_alignment || "—"}`
    : "未有足夠 odds history";

  const modelSentence = families.length
    ? bestSide
      ? `支持 ${selection} 嘅模型：${supportingFamilies.length ? supportingFamilies.map(x => `${x.label} ${x.edgePp === null ? "" : (x.edgePp >= 0 ? "+" : "") + x.edgePp.toFixed(1) + "%"}`).join("、") : "暫無"}；未支持：${opposingFamilies.length ? opposingFamilies.map(x => `${x.label} ${x.edgePp === null ? "" : x.edgePp.toFixed(1) + "%"}`).join("、") : "無"}。`
      : families.map(f => `${f.label}: ${sideLabel(pick(f.probs), home, away)}`).join("；")
    : "目前沒有足夠模型 evidence";
  const marketSentence = market && consensus
    ? `HKJC no-vig H/D/A 為 ${pct(market.home)}/${pct(market.draw)}/${pct(market.away)}；跨 evidence-family 中心為 ${pct(consensus.home)}/${pct(consensus.draw)}/${pct(consensus.away)}。`
    : "市場或模型資料未足以建立可比較機率。";
  const humanSentence = `Phase 2：${humanQuality}；傷停 evidence 主/客 ${injuryHome}/${injuryAway}；正選 ${lineupConfirmed ? "已確認" : "未確認"}。`;
  const liveSentence = liveState
    ? `Phase 3：${liveState.minute ?? "—"}' ${liveState.score || "—"}；Expected-vs-Actual ${liveState.shadowStatus || "WAIT"}，預期控制 ${liveState.expectedSide || "—"}、實際控制 ${liveState.actualSide || "—"}，${liveState.metricCount} 個 live metrics。`
    : "Phase 3：賽事未進入可用 live evidence 狀態。";

  const invalidators: string[] = [];
  if (fallbackMode) invalidators.push("賽事暫不在 canonical active feed；只用 database fallback，投注 action 強制 NO_BET");
  if (!fresh) invalidators.push("HKJC 市場不新鮮");
  if (!healthOk) invalidators.push("Phase 1 data health 非 OK");
  if (families.length < 2) invalidators.push("獨立 evidence family 少於 2");
  if (!lineupConfirmed) invalidators.push("Official XI 尚未確認");
  if (dispersion !== null && dispersion > 0.18) invalidators.push("模型分歧較大");
  if (!productionValidated) invalidators.push("Phase 5 calibration gate 尚未通過");
  if (liveState?.shadowStatus && ["CONTRADICTION","REJECT","RISK"].some(k => String(liveState.shadowStatus).toUpperCase().includes(k))) {
    invalidators.push("Live actual 與 pre-match expectation 出現明顯矛盾");
  }

  const headline = bestSide && best.edge !== null
    ? `${selection} · ${edgeText} 模型—市場差`
    : `${home} vs ${away} · 暫未見可執行 Edge`;

  const confidenceLabel = families.length >= 3 && agreement >= 0.66 && (dispersion === null || dispersion <= 0.12)
    ? "模型共識較集中"
    : families.length >= 2 && agreement >= 0.5
      ? "模型有一定支持"
      : "模型支持有限";
  const strongestSupport = supportingFamilies[0] || null;
  const strongestOpposition = opposingFamilies[0] || null;
  const professionalSummary = bestSide && best.edge !== null
    ? `HKJC 對 ${selection} 嘅 fair probability 約 ${pct(marketProb)}，跨模型中心約 ${pct(bestProb)}，形成 ${edgeText} 差距。現價 ${oddsText}；${confidenceLabel}，${supportingFamilies.length}/${families.length} 個 evidence family 定價高過市場。`
    : `目前市場與可用模型未形成清晰正 Edge；先以資料完整度同價格變化為主。`;
  const supportRead = bestSide
    ? `主要支持：${strongestSupport ? strongestSupport.label + " " + (strongestSupport.edgePp! >= 0 ? "+" : "") + strongestSupport.edgePp!.toFixed(1) + "%" : "暫無明顯支持"}。`
    : "暫未形成可比較支持。";
  const counterRead = bestSide
    ? `反方／風險：${strongestOpposition ? strongestOpposition.label + " " + strongestOpposition.edgePp!.toFixed(1) + "%" : "暫無模型明顯反對"}；${invalidators.length ? invalidators.join("；") : "未見額外 data-risk flag"}。`
    : `風險：${invalidators.length ? invalidators.join("；") : "資料不足以建立 Edge"}。`;

  let advice = "PASS：現時未見足夠正 Edge。";
  if (candidate === "DATA_RISK") advice = "暫不下注：先等資料健康與 freshness 回復正常，再重新評估。";
  else if (candidate === "WATCH") advice = bestSide ? `觀察 ${selection} @ ${oddsText}：市場與模型有初步差異，但獨立 evidence family 太少，未足以提升信心。` : advice;
  else if (candidate === "LEAN") advice = `輕微傾向 ${selection} @ ${oddsText}：Edge ${edgeText}，但屬觀察級，重點睇後續 odds movement、lineup 同模型一致性有冇改善。`;
  else if (candidate.includes("VALUE_CANDIDATE")) advice = `Value 候選 ${selection} @ ${oddsText}：Edge ${edgeText}，${supportingFamilies.length}/${families.length} 個 evidence family 支持。下一步重點係確認 lineup、價格有冇被市場壓低，以及 live evidence 有冇反轉。`;
  if (!productionValidated && !["DATA_RISK","NO_EDGE"].includes(candidate)) {
    advice += " Phase 5 calibration gate 未通過，所以暫時維持候選／觀察級，而唔自動升格為正式 Best Bet 或注碼建議。";
  }

  const phaseCoverage = {
    phase1: { status: fallbackMode ? "DB_FALLBACK" : (families.length ? "ACTIVE" : "PARTIAL"), evidenceFamilies: families.length },
    phase2: { status: human.data || eventMap.data ? "ACTIVE" : "PARTIAL", quality: humanQuality, lineupConfirmed },
    phase3: { status: live ? "LIVE_ACTIVE" : (scenarios.data.length ? "PREMATCH_SCENARIO_ONLY" : "WAIT"), live: liveState },
    phase4: { status: movementData ? "ACTIVE" : "COLLECTING", movement: movementText },
    phase5: { status: productionValidated ? "VALIDATED" : "CALIBRATION_PENDING" },
    phase6: { status: "NOT_PRODUCTION", note: "scenario rows are Phase 3 context, not a validated simulation engine" },
    phase7: { status: "NOT_BUILT" },
    phase8: { status: "NOT_BUILT" },
    phase9: { status: "ACTIVE_V2", note: "deterministic betting narrative + explainability interpreter" },
    phase10: { status: "NOT_BUILT" },
  };

  const errors: any = {};
  for (const [k,v] of Object.entries({ human,eventMap,playerStatus,lineups,managers,movement,liveScore,liveStats,liveOdds,liveShadow,scenarios })) {
    if ((v as any).error) errors[k] = (v as any).error;
  }

  return Response.json({
    generatedAt: new Date().toISOString(),
    id,
    engine: "FT_INTERPRETER_RULES_V2",
    narrationMode: "DETERMINISTIC_GROUNDED",
    match: { home, away, homeEn: r.home_en, awayEn: r.away_en, tournament: r.tournament, kickoff: r.kickoff_hkt },
    decision: {
      productionDecision: r.decision ?? null,
      productionEngine: r.decision_engine_version ?? null,
      action,
      candidateClass: candidate,
      market: "1X2",
      selection: bestSide,
      selectionLabel: selection,
      currentOdds: bestOdds,
      marketFairProbability: marketProb,
      analystConsensusProbability: bestProb,
      candidateEdgePp: best.edge === null ? null : best.edge * 100,
      evidenceFamilyCount: families.length,
      supportCount: support,
      valueSupportRatio: agreement,
      dispersion,
    },
    story: {
      headline,
      summary: professionalSummary,
      marketRead: marketSentence,
      modelRead: modelSentence,
      humanRead: humanSentence,
      liveRead: liveSentence,
      movementRead: `Phase 4：${movementText}。`,
      supportRead,
      counterRead,
      riskRead: invalidators.length ? `主要風險/失效條件：${invalidators.join("；")}。` : "目前未見額外 data-risk flag。",
      advice,
    },
    evidence: {
      market,
      consensus,
      families: families.map(f => ({ key:f.key, label:f.label, weight:f.weight, sources:f.sources ?? null, probabilities:f.probs, pick:pick(f.probs) })),
      familySupport,
      phase1Health: {
        status: r.health_status,
        freshness: r.hkjc_freshness,
        sourceMode: fallbackMode ? "DB_FALLBACK_FAIL_CLOSED" : "CANONICAL_ACTIVE_FEED",
        evidenceChannelCount: r.evidence_channel_count,
        unifiedCoverageStatus: r.unified_coverage_status,
        diagnostics: r.diagnostic_codes ?? [],
      },
      phase2: { quality: humanQuality, injuryHome, injuryAway, lineupConfirmed, playerRows: playerStatus.data.length, lineupRows: lineups.data.length, managerRows: managers.data.length },
      phase3: liveState,
      phase4: movementData,
    },
    invalidators,
    phaseCoverage,
    errors,
    governance: {
      rule: "Numbers and candidate selection are deterministic. Narration must not invent odds, probabilities, injuries, lineups or live statistics.",
      calibrationGate: productionValidated ? "PASSED_BY_CURRENT_ENGINE_STATE" : "NOT_PASSED",
      sourceMode: fallbackMode ? "DB_FALLBACK_FAIL_CLOSED" : "CANONICAL_ACTIVE_FEED",
      staking: "No automated stake sizing until Phase 5 calibration and Phase 7 risk controls are validated.",
    },
  }, {
    headers: { ...cors, "Cache-Control": "public, max-age=20, stale-while-revalidate=40" },
  });
});
