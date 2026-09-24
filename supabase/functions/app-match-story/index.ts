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

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function pctText(v: unknown, digits = 0): string {
  const x = num(v);
  if (x === null) return "—";
  const p = Math.abs(x) <= 1 ? x * 100 : x;
  return p.toFixed(digits) + "%";
}

function compactDetail(d: any) {
  if (!d || d?.error) return null;
  const fb = d?.models?.forebet ?? null;
  const internal = d?.models?.internal ?? null;
  const form = d?.models?.form ?? null;
  const opta = d?.models?.opta ?? null;
  const multi = d?.models?.multisource ?? null;
  const human = d?.humanFactors ?? {};
  const scenario = Array.isArray(d?.scenario) ? d.scenario : [];
  return {
    fixture: d?.fixture ? {
      id: d.fixture.hkjc_event_id ?? null,
      status: d.fixture.status ?? null,
      tournament: d.fixture.tournament ?? null,
      kickoff: d.fixture.kickoff_hkt ?? null,
      selling: d.fixture.selling ?? null,
      liveEligible: d.fixture.live_eligible ?? null,
      oddsUpdatedAt: d.fixture.odds_updated_at ?? null,
      hkjc: {
        home: num(d.fixture.had_home),
        draw: num(d.fixture.had_draw),
        away: num(d.fixture.had_away),
        goalsLine: d.fixture.hil_line ?? null,
        goalsOver: num(d.fixture.hil_over),
        goalsUnder: num(d.fixture.hil_under),
        cornersLine: d.fixture.chl_line ?? null,
        cornersOver: num(d.fixture.chl_over),
        cornersUnder: num(d.fixture.chl_under),
      },
    } : null,
    forebet: fb ? {
      fetchedAt: fb.fetched_at ?? null,
      prediction1x2: fb.prediction_1x2 ?? null,
      predictedScore: fb.predicted_score ?? null,
      hda: { home:num(fb.prob_home), draw:num(fb.prob_draw), away:num(fb.prob_away) },
      avgGoals: num(fb.avg_goals),
      ou25: { pick:fb.prediction_ou25 ?? null, over:num(fb.prob_over25), under:num(fb.prob_under25) },
      corners: {
        pick: fb.corner_prediction ?? null,
        over95: num(fb.corner_prob_over95),
        under95: num(fb.corner_prob_under95),
        predictedScore: fb.corner_predicted_score ?? null,
        avg: num(fb.avg_corners),
      },
    } : null,
    internal: internal ? {
      quality: internal.quality ?? null,
      source: internal.model_source ?? null,
      trainingMatches: num(internal.training_matches),
      teamMatchQuality: num(internal.team_match_quality),
      dixonColes: {
        home:num(internal.dc_prob_home), draw:num(internal.dc_prob_draw), away:num(internal.dc_prob_away),
        xgHome:num(internal.dc_xg_home), xgAway:num(internal.dc_xg_away), over25:num(internal.dc_prob_over25),
      },
      pi: {
        home:num(internal.pi_prob_home), draw:num(internal.pi_prob_draw), away:num(internal.pi_prob_away),
        homeRating:num(internal.pi_home_rating), awayRating:num(internal.pi_away_rating), difference:num(internal.pi_diff),
      },
    } : null,
    form: form ? {
      quality: form.quality ?? null,
      source: form.model_source ?? null,
      homeGames:num(form.home_games), awayGames:num(form.away_games),
      homeVenueGames:num(form.home_venue_games), awayVenueGames:num(form.away_venue_games),
      hda:{home:num(form.form_prob_home),draw:num(form.form_prob_draw),away:num(form.form_prob_away)},
      xg:{home:num(form.form_xg_home),away:num(form.form_xg_away)},
    } : null,
    opta: opta ? {
      source: opta.source ?? null,
      coverage: opta.coverage ?? null,
      homeRating:num(opta.home_rating), awayRating:num(opta.away_rating),
      homeRank:num(opta.home_rank), awayRank:num(opta.away_rank),
      homeMatchConfidence:num(opta.home_match_confidence), awayMatchConfidence:num(opta.away_match_confidence),
    } : null,
    multisource: multi,
    humanFactors: {
      summary: human?.summary ?? null,
      eventMap: human?.eventMap ? {
        matchQuality:num(human.eventMap.match_quality),
        lineupConfirmedAt:human.eventMap.lineup_confirmed_at ?? null,
      } : null,
      playerStatus: Array.isArray(human?.playerStatus) ? human.playerStatus.slice(0,24).map((x:any)=>({
        side:x.team_side ?? null,
        type:x.status_type ?? null,
        value:x.status_value ?? null,
        player:x?.raw?.player?.name ?? x?.raw?.player_name ?? x.player_key ?? null,
        confirmed:x.confirmed ?? null,
        source:x.source_name ?? null,
      })) : [],
      lineup: Array.isArray(human?.lineup) ? human.lineup.slice(0,30).map((x:any)=>({
        side:x.team_side ?? null,
        player:x?.raw?.player?.name ?? x?.raw?.player_name ?? x.player_key ?? null,
        starter:x.is_starter ?? x.starter ?? null,
        confirmed:x.confirmed ?? null,
        source:x.source_name ?? null,
      })) : [],
      managers: Array.isArray(human?.managers) ? human.managers.slice(0,8).map((x:any)=>({
        side:x.team_side ?? null,
        manager:x.evidence_value ?? x.manager_key ?? null,
        confirmed:x.confirmed ?? null,
        source:x.source_name ?? null,
      })) : [],
    },
    scenario: scenario.slice(0,8).map((x:any)=>({
      segment:x.segment ?? null,
      consensus:x.model_hda_consensus ?? null,
      forebet:x.forebet_hda ?? null,
      controlSide:x.macro_control_side ?? null,
      controlBasis:x.control_basis ?? null,
      contextCoverage:num(x.context_coverage_score),
      pHomeGoal:num(x.p_home_goal_segment),
      pAwayGoal:num(x.p_away_goal_segment),
      pNoGoal:num(x.p_no_goal_segment),
      expectedHomeCorners:num(x.expected_home_corners_segment),
      expectedAwayCorners:num(x.expected_away_corners_segment),
      expectedScoreState:x.expected_score_state ?? null,
      status:x.segment_prediction_status ?? null,
      notes:x.notes ?? null,
    })),
  };
}

function deepFacts(detail: any, language: string): string {
  const d = compactDetail(detail);
  if (!d) return "";
  const parts: string[] = [];
  if (d.forebet) {
    const f=d.forebet;
    const hda=[f.hda?.home,f.hda?.draw,f.hda?.away].some((x:any)=>num(x)!==null)
      ? `H/D/A ${pctText(f.hda.home)}/${pctText(f.hda.draw)}/${pctText(f.hda.away)}`
      : "";
    const score=f.predictedScore ? `${language==="en"?"predicted score":"預測比分"} ${f.predictedScore}` : "";
    const goals=f.avgGoals!==null ? `${language==="en"?"average goals":"平均入球"} ${Number(f.avgGoals).toFixed(2)}` : "";
    const corners=f.corners?.avg!==null
      ? `${language==="en"?"corners":"角球"} ${f.corners.pick||"—"} 9.5 · avg ${Number(f.corners.avg).toFixed(2)} · O/U ${pctText(f.corners.over95)}/${pctText(f.corners.under95)}`
      : "";
    parts.push(["Forebet",hda,score,goals,corners].filter(Boolean).join(" · "));
  }
  if (d.opta && d.opta.homeRating!==null && d.opta.awayRating!==null) {
    parts.push(`Opta strength ${Number(d.opta.homeRating).toFixed(1)} vs ${Number(d.opta.awayRating).toFixed(1)} (coverage ${d.opta.coverage||"—"}; strength evidence, not direct win probability)`);
  }
  if (d.internal?.quality) {
    parts.push(`Internal models: ${d.internal.quality}`);
  }
  if (d.form?.quality) {
    parts.push(`Team Form: ${d.form.quality} · sample ${d.form.homeGames??0}/${d.form.awayGames??0}`);
  }
  if (d.scenario?.length) {
    const s=d.scenario[0];
    parts.push(`Phase 3 scenario ${s.segment||"—"} · control ${s.controlSide||"—"} · context ${s.contextCoverage===null?"—":Number(s.contextCoverage).toFixed(0)+"%"} · ${s.status||"—"}`);
  }
  return parts.join(language==="en" ? ". " : "；") + (parts.length ? (language==="en" ? "." : "。") : "");
}

function fallbackStory(a: any, detail: any, language: string) {
  const s = a?.story || {};
  const deep = compactDetail(detail);
  const d = a?.decision || {};
  const phase2 = a?.evidence?.phase2 || {};
  const phase3 = a?.evidence?.phase3 || {};
  const phase4 = a?.evidence?.phase4 || null;
  const selection = String(d.selectionLabel || "暫無明確投注位");
  const edge = num(d.candidateEdgePp);
  const odds = num(d.currentOdds);
  const marketP = num(d.marketFairProbability);
  const modelP = num(d.analystConsensusProbability);
  const home = String(a?.match?.home || a?.match?.homeEn || "主隊");
  const away = String(a?.match?.away || a?.match?.awayEn || "客隊");
  const humanRows = (deep?.humanFactors?.playerStatus?.length || 0)
    + (deep?.humanFactors?.lineup?.length || 0)
    + (deep?.humanFactors?.managers?.length || 0);

  const zhStory: string[] = [];
  const enStory: string[] = [];

  if (d.selection && edge !== null && marketP !== null && modelP !== null) {
    zhStory.push(
      `市場同模型最大分歧暫時落喺${selection}：HKJC fair probability 約 ${pctText(marketP,1)}，模型中心約 ${pctText(modelP,1)}，差距 ${edge >= 0 ? "+" : ""}${edge.toFixed(1)}pp${odds === null ? "" : `，現價 ${odds.toFixed(2)}`}。`
    );
    enStory.push(
      `The clearest market-model disagreement is currently ${selection}: HKJC fair probability is about ${pctText(marketP,1)} versus a model centre of ${pctText(modelP,1)}, a gap of ${edge >= 0 ? "+" : ""}${edge.toFixed(1)}pp${odds === null ? "" : ` at ${odds.toFixed(2)}`}.`
    );
  } else {
    zhStory.push(`${home} 對 ${away} 暫時未形成足夠穩定嘅可比較 Edge。`);
    enStory.push(`${home} versus ${away} does not yet produce a sufficiently stable comparable edge.`);
  }

  if (deep?.forebet) {
    const f = deep.forebet;
    const partsZh = [];
    const partsEn = [];
    if (f.predictedScore) {
      partsZh.push(`預測比分 ${f.predictedScore}`);
      partsEn.push(`a projected score of ${f.predictedScore}`);
    }
    if (f.avgGoals !== null) {
      partsZh.push(`平均入球 ${Number(f.avgGoals).toFixed(2)}`);
      partsEn.push(`average goals ${Number(f.avgGoals).toFixed(2)}`);
    }
    if (partsZh.length) {
      zhStory.push(`Forebet 提供嘅比賽形態係${partsZh.join("、")}。`);
      enStory.push(`Forebet describes the likely match shape with ${partsEn.join(" and ")}.`);
    }
    if (f.corners?.avg !== null) {
      zhStory.push(
        `角球方面，Forebet 偏向 ${f.corners.pick || "—"} 9.5，模型平均 ${Number(f.corners.avg).toFixed(2)} 個角球，O/U 9.5 機率約 ${pctText(f.corners.over95)}/${pctText(f.corners.under95)}。`
      );
      enStory.push(
        `For corners, Forebet leans ${f.corners.pick || "—"} 9.5, averaging ${Number(f.corners.avg).toFixed(2)} corners with O/U 9.5 probabilities of about ${pctText(f.corners.over95)}/${pctText(f.corners.under95)}.`
      );
    }
  }

  if (deep?.opta && deep.opta.homeRating !== null && deep.opta.awayRating !== null) {
    zhStory.push(
      `Opta strength 為 ${Number(deep.opta.homeRating).toFixed(1)} 對 ${Number(deep.opta.awayRating).toFixed(1)}；呢個只用作球隊強弱背景，唔會直接當成勝率。`
    );
    enStory.push(
      `Opta strength is ${Number(deep.opta.homeRating).toFixed(1)} versus ${Number(deep.opta.awayRating).toFixed(1)}; this is team-strength context, not a direct win probability.`
    );
  }

  const limitationsZh: string[] = [];
  const limitationsEn: string[] = [];
  if (deep?.internal?.quality && String(deep.internal.quality).toUpperCase() !== "OK") {
    limitationsZh.push(`internal models：${deep.internal.quality}`);
    limitationsEn.push(`internal models: ${deep.internal.quality}`);
  }
  if (deep?.form?.quality && String(deep.form.quality).toUpperCase().includes("INSUFFICIENT")) {
    limitationsZh.push(`Team Form 樣本不足（${deep.form.homeGames ?? 0}/${deep.form.awayGames ?? 0}）`);
    limitationsEn.push(`Team Form sample is insufficient (${deep.form.homeGames ?? 0}/${deep.form.awayGames ?? 0})`);
  }
  if (!phase2?.lineupConfirmed) {
    limitationsZh.push("Official XI 未確認");
    limitationsEn.push("the official XI is not confirmed");
  }
  if (humanRows === 0) {
    limitationsZh.push("未有額外 player/manager detail rows");
    limitationsEn.push("there are no additional player/manager detail rows");
  }
  if (limitationsZh.length) {
    zhStory.push(`限制方面，${limitationsZh.join("；")}。`);
    enStory.push(`The main limitations are that ${limitationsEn.join("; ")}.`);
  }

  const action = String(d.action || "").toUpperCase();
  if (action === "NO_BET" || action === "PASS") {
    zhStory.push(`所以現階段結論仍然係${action === "NO_BET" ? "暫不下注" : "暫時跳過"}；數據可以指出值得留意嘅方向，但未足以越過現有 data / calibration gate。`);
    enStory.push(`The current conclusion is therefore ${action === "NO_BET" ? "no bet" : "pass"}: the data identifies an angle worth monitoring, but it does not clear the current data and calibration gates.`);
  } else if (action) {
    zhStory.push(`目前屬 ${action}；之後要再睇 lineup、價格變化同 live evidence 有冇令原本論點加強或者失效。`);
    enStory.push(`The current state is ${action}; lineup news, price movement and live evidence should determine whether the thesis strengthens or breaks down.`);
  }

  const phaseRows = Object.entries(a?.phaseCoverage || {}).map(([k,v]: [string, any]) => {
    const phase = Number(String(k).replace("phase","")) || 0;
    let interpretation = "";
    let evidenceUsed: string[] = [];
    if (phase === 1) {
      interpretation = language === "en"
        ? `Market/model layer: ${s.marketRead || "market comparison pending"} ${s.modelRead || ""}`
        : `市場 / 模型層：${s.marketRead || "市場比較待補"} ${s.modelRead || ""}`;
      evidenceUsed = ["HKJC", "model consensus"];
    } else if (phase === 2) {
      interpretation = language === "en"
        ? `${s.humanRead || "Human-factor evidence pending"} Additional player/lineup/manager rows: ${humanRows}.`
        : `${s.humanRead || "Human Factors evidence 待補"} 額外 player/lineup/manager rows：${humanRows}。`;
      evidenceUsed = ["human factors", "lineup", "injuries"];
    } else if (phase === 3) {
      const scenario = deep?.scenario?.[0];
      interpretation = s.liveRead || (scenario
        ? `Scenario ${scenario.segment || "—"} · control ${scenario.controlSide || "—"} · status ${scenario.status || "—"}`
        : (language === "en" ? "Live/scenario evidence is not yet available." : "Live / scenario evidence 暫未可用。"));
      evidenceUsed = ["live", "scenario"];
    } else if (phase === 4) {
      interpretation = String(s.movementRead || v?.movement || (language === "en" ? "Odds movement still collecting." : "Odds movement 仍在收集。"));
      evidenceUsed = ["odds movement"];
    } else if (phase === 5) {
      interpretation = language === "en"
        ? `Calibration gate: ${v?.status || "PENDING"}. It governs whether an observed edge can become a production recommendation.`
        : `Calibration gate：${v?.status || "PENDING"}；未通過前，觀察到嘅 Edge 唔會自動升格做正式投注建議。`;
      evidenceUsed = ["calibration"];
    } else if (phase === 6) {
      interpretation = String(v?.note || (language === "en" ? "Not yet a validated production simulation layer." : "目前未係已驗證 production simulation layer。"));
    } else if (phase === 7) {
      interpretation = language === "en" ? "Risk/staking controls are not yet built for production." : "Risk / staking controls 尚未完成 production 驗證。";
    } else if (phase === 8) {
      interpretation = language === "en" ? "Workflow/orchestration layer is not yet built." : "Workflow / orchestration layer 尚未完成。";
    } else if (phase === 9) {
      interpretation = language === "en" ? "Professional story interpreter is active and grounded in verified evidence." : "Professional Story Interpreter 已啟用，只解讀已驗證 evidence。";
      evidenceUsed = ["analysis", "deep detail"];
    } else if (phase === 10) {
      interpretation = language === "en" ? "Phase 10 is not yet built." : "Phase 10 尚未建立。";
    } else {
      interpretation = String(v?.note || v?.movement || "No additional validated interpretation yet.");
    }
    return { phase, status:String(v?.status || "UNKNOWN"), interpretation, evidenceUsed };
  }).filter((x) => x.phase >= 1 && x.phase <= 10);

  return {
    headline: String(s.headline || "賽事綜合解讀"),
    executiveSummary: String(s.summary || s.advice || "暫未有足夠 evidence 建立完整分析。"),
    matchStory: (language === "en" ? enStory : zhStory).join(" "),
    marketInterpretation: String(s.marketRead || "市場 evidence 未足。"),
    modelConsensusInterpretation: [s.modelRead, deepFacts(detail, language)].filter(Boolean).join(" "),
    humanFactorsInterpretation: String(
      s.humanRead || (language === "en" ? "Human-factor evidence is still incomplete." : "Human Factors evidence 仍未完整。")
    ),
    liveInterpretation: String(s.liveRead || "Live evidence 未足。"),
    movementInterpretation: String(s.movementRead || "Odds movement evidence 未足。"),
    thesis: String(s.advice || "暫未形成可執行投注論點。"),
    counterCase: String(s.counterRead || s.riskRead || "暫未有額外反方 evidence。"),
    confidenceExplanation: String(s.supportRead || "信心受現有 evidence coverage 限制。"),
    watchNext: Array.isArray(a?.invalidators) ? a.invalidators.slice(0,8).map(String) : [],
    caveats: Array.isArray(a?.invalidators) ? a.invalidators.slice(0,8).map(String) : [],
    phaseNarratives: phaseRows,
  };
}

function aiEnabled() {
  return String(Deno.env.get("AI_INTERPRETER_ENABLED") || "").toLowerCase() === "true"
    && Boolean(Deno.env.get("AI_API_KEY") || Deno.env.get("OPENAI_API_KEY"))
    && Boolean(Deno.env.get("AI_MODEL"));
}

async function createAiStory(analysis: any, detail: any, fallback: any, language: string, style: string, commentary: any[] = []) {
  if (!aiEnabled()) {
    return { ok:false, mode:"DETERMINISTIC_FALLBACK", model:null, provider:"none", output:fallback, reason:"ai_not_configured" };
  }

  const apiKey = Deno.env.get("AI_API_KEY") || Deno.env.get("OPENAI_API_KEY") || "";
  const model = Deno.env.get("AI_MODEL") || "";
  const base = (Deno.env.get("AI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/,"");
  const provider = Deno.env.get("AI_PROVIDER_NAME") || "openai-compatible";
  const languageRule = language === "en"
    ? "Write professional British English."
    : "Write natural professional Cantonese in Traditional Chinese. Keep football/data terms such as Edge, xG, odds and lineup in English where clearer.";

  const evidence = {
    match: analysis?.match,
    decision: analysis?.decision,
    deterministicStory: analysis?.story,
    marketAdvice: analysis?.marketAdvice,
    commentary,
    phaseCoverage: analysis?.phaseCoverage,
    invalidators: analysis?.invalidators,
    evidence: {
      ...analysis?.evidence,
      deepDetail: compactDetail(detail),
    },
  };

  const prompt = `You are an editorial layer for a football betting-intelligence dashboard.
Use only the verified evidence supplied below. Do not invent or recalculate odds, probabilities, edge, injuries, lineups, scores, xG or live stats.
Do not change the deterministic action, selection, odds or candidate class.
Explain both support and counter-case. Keep it compact. ${languageRule} Style: ${style}.
Return valid JSON only with keys: headline, executiveSummary, matchStory, marketInterpretation, modelConsensusInterpretation, humanFactorsInterpretation, liveInterpretation, movementInterpretation, thesis, counterCase, confidenceExplanation, watchNext, caveats, phaseNarratives.
VERIFIED EVIDENCE:
${JSON.stringify(evidence)}`;

  try {
    const res = await fetch(base + "/chat/completions", {
      method:"POST",
      headers:{ "Authorization":"Bearer " + apiKey, "Content-Type":"application/json" },
      body:JSON.stringify({
        model,
        temperature:0.2,
        response_format:{ type:"json_object" },
        messages:[
          { role:"system", content:"Return only grounded JSON. Never invent betting data." },
          { role:"user", content:prompt }
        ]
      })
    });
    if (!res.ok) throw new Error("ai_http_" + res.status);
    const body = await res.json();
    const raw = body?.choices?.[0]?.message?.content;
    if (!raw) throw new Error("ai_empty");
    const parsed = JSON.parse(String(raw));
    const required = ["headline","executiveSummary","thesis","counterCase"];
    if (!required.every((k) => typeof parsed?.[k] === "string")) throw new Error("ai_schema_invalid");
    return { ok:true, mode:"AI_GROUNDED", model, provider, output:{...fallback,...parsed}, reason:null };
  } catch (e) {
    return {
      ok:false,
      mode:"DETERMINISTIC_FALLBACK",
      model,
      provider,
      output:fallback,
      reason:String((e as any)?.message || e).slice(0,200)
    };
  }
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers:cors });
    if (req.method !== "GET") return Response.json({ error:"method_not_allowed" }, { status:405, headers:cors });

    const u = new URL(req.url);
    const id = String(u.searchParams.get("id") || "").trim();
    const language = u.searchParams.get("lang") === "en" ? "en" : "zh-HK";
    const styleRaw = String(u.searchParams.get("style") || "professional").toLowerCase();
    const style = ["professional","concise","broadcast"].includes(styleRaw) ? styleRaw : "professional";
    if (!/^[A-Za-z0-9_-]{2,40}$/.test(id)) {
      return Response.json({ error:"invalid_match_id" }, { status:400, headers:{...cors,"Cache-Control":"no-store"} });
    }

    const sbUrl = Deno.env.get("SUPABASE_URL") || "";
    const key = serverKey();
    if (!sbUrl || !key) {
      return Response.json({ error:"server_config_missing" }, { status:500, headers:{...cors,"Cache-Control":"no-store"} });
    }

    const upstreamHeaders = { Authorization:`Bearer ${key}`, apikey:key };
    const [analysisRes, detailRes] = await Promise.all([
      fetch(`${sbUrl}/functions/v1/app-match-analysis?id=${encodeURIComponent(id)}`, { headers:upstreamHeaders }),
      fetch(`${sbUrl}/functions/v1/app-match-detail?id=${encodeURIComponent(id)}`, { headers:upstreamHeaders }).catch(() => null),
    ]);
    if (!analysisRes.ok) {
      return Response.json({
        error:"analysis_unavailable",
        upstreamStatus:analysisRes.status,
        detail:(await analysisRes.text()).slice(0,800)
      }, { status:analysisRes.status, headers:{...cors,"Cache-Control":"no-store"} });
    }

    const analysis = await analysisRes.json();
    let detail:any = null;
    if (detailRes?.ok) {
      try {
        const x=await detailRes.json();
        if (!x?.error) detail=x;
      } catch {}
    }
    const db = createClient(sbUrl, key, { auth:{ persistSession:false, autoRefreshToken:false } });
    const commentaryQuery = await db.from("match_commentary_evidence")
      .select("source,source_type,source_url,author,published_at,captured_at,language,headline,excerpt,summary,lean_market,lean_selection,confidence,topics")
      .eq("hkjc_event_id", id)
      .order("published_at", { ascending:false, nullsFirst:false })
      .limit(8);
    const commentary = commentaryQuery.error ? [] : (commentaryQuery.data || []).map((row:any) => ({
      source:row.source ?? null,
      sourceType:row.source_type ?? null,
      sourceUrl:row.source_url ?? null,
      author:row.author ?? null,
      publishedAt:row.published_at ?? null,
      capturedAt:row.captured_at ?? null,
      language:row.language ?? null,
      headline:row.headline ?? null,
      excerpt:row.excerpt ?? null,
      summary:row.summary ?? null,
      leanMarket:row.lean_market ?? null,
      leanSelection:row.lean_selection ?? null,
      confidence:num(row.confidence),
      topics:row.topics ?? [],
    }));

    const packForHash = {
      cacheSchema:"FT_STORY_V5_MULTI_MARKET",
      match:analysis?.match,
      decision:analysis?.decision,
      marketAdvice:analysis?.marketAdvice,
      story:analysis?.story,
      commentary,
      phaseCoverage:analysis?.phaseCoverage,
      invalidators:analysis?.invalidators,
      evidence:analysis?.evidence,
      deepDetail:compactDetail(detail),
    };
    const analysisHash = await sha256(packForHash);

    const cached = await db.from("match_interpretations")
      .select("analysis_hash,payload,model,framework,generated_at")
      .eq("hkjc_event_id",id)
      .eq("language",language)
      .eq("style",style)
      .maybeSingle();

    if (!cached.error && cached.data?.analysis_hash === analysisHash && cached.data?.payload) {
      return Response.json({
        ...cached.data.payload,
        cache:{ hit:true, analysisHash, generatedAt:cached.data.generated_at }
      }, { headers:{...cors,"Cache-Control":"public, max-age=30, stale-while-revalidate=60"} });
    }

    const deterministic = fallbackStory(analysis, detail, language);
    const ai = await createAiStory(analysis, detail, deterministic, language, style, commentary);
    const story = ai.output || deterministic;

    const payload = {
      generatedAt:new Date().toISOString(),
      id,
      engine:{
        name:"FT_STORY_INTERPRETER_V4",
        framework:ai.ok ? "openai-compatible-fetch" : "ft-deterministic-story",
        mode:ai.mode,
        provider:ai.provider,
        model:ai.model,
        fallbackReason:ai.ok ? null : ai.reason,
      },
      match:analysis.match ?? null,
      bettingAdvice:{
        action:analysis?.decision?.action ?? null,
        candidateClass:analysis?.decision?.candidateClass ?? null,
        market:analysis?.decision?.market ?? null,
        selection:analysis?.decision?.selection ?? null,
        selectionLabel:analysis?.decision?.selectionLabel ?? null,
        currentOdds:analysis?.decision?.currentOdds ?? null,
        referenceOdds:analysis?.decision?.referenceOdds ?? null,
        oddsStatus:analysis?.decision?.oddsStatus ?? null,
        candidateEdgePp:analysis?.decision?.candidateEdgePp ?? null,
        marketFairProbability:analysis?.decision?.marketFairProbability ?? null,
        analystConsensusProbability:analysis?.decision?.analystConsensusProbability ?? null,
        evidenceFamilyCount:analysis?.decision?.evidenceFamilyCount ?? null,
        supportCount:analysis?.decision?.supportCount ?? null,
        valueSupportRatio:analysis?.decision?.valueSupportRatio ?? null,
        thesis:story.thesis,
        counterCase:story.counterCase,
        confidenceExplanation:story.confidenceExplanation,
      },
      marketAdvice:analysis?.marketAdvice ?? null,
      commentary,
      story,
      phaseCoverage:analysis.phaseCoverage ?? null,
      evidenceSummary:{
        detailAvailable:Boolean(detail),
        forebet:Boolean(detail?.models?.forebet),
        internalModels:Boolean(detail?.models?.internal),
        teamForm:Boolean(detail?.models?.form),
        optaStrength:Boolean(detail?.models?.opta),
        multisource:Boolean(detail?.models?.multisource) || Boolean(analysis?.evidence?.families?.some((x:any)=>x?.key==="MULTI")),
        humanFactorRows:(detail?.humanFactors?.playerStatus?.length||0)+(detail?.humanFactors?.lineup?.length||0)+(detail?.humanFactors?.managers?.length||0),
        scenarioRows:detail?.scenario?.length||0,
        commentaryRows:commentary.length,
      },
      invalidators:analysis.invalidators ?? [],
      governance:{
        sourceEngine:analysis.engine ?? null,
        sourceNarrationMode:analysis.narrationMode ?? null,
        rule:"Story explains verified evidence only. Deterministic HDA, goals O/U and corners O/U action, selection, odds, probability and edge fields come from app-match-analysis. Editorial commentary is attributed context only.",
        calibrationGate:analysis?.governance?.calibrationGate ?? null,
        sourceMode:analysis?.governance?.sourceMode ?? analysis?.evidence?.phase1Health?.sourceMode ?? null,
        staking:analysis?.governance?.staking ?? null,
      },
      cache:{ hit:false, analysisHash },
      diagnostics:ai.ok ? null : { reason:ai.reason },
    };

    const now = new Date().toISOString();
    const saved = await db.from("match_interpretations").upsert({
      hkjc_event_id:id,
      language,
      style,
      analysis_hash:analysisHash,
      framework:ai.ok ? "openai-compatible-fetch-v4" : "ft-deterministic-story-v4",
      model:ai.ok ? ai.model : null,
      payload,
      source_generated_at:analysis.generatedAt ?? null,
      generated_at:now,
      updated_at:now,
    }, { onConflict:"hkjc_event_id,language,style" });

    if (saved.error) {
      payload.diagnostics = {
        ...(payload.diagnostics || {}),
        cacheWrite:{ code:saved.error.code ?? null, message:saved.error.message ?? String(saved.error) }
      };
    }

    return Response.json(payload, {
      headers:{...cors,"Cache-Control":"public, max-age=30, stale-while-revalidate=60"}
    });
  } catch (e) {
    return Response.json({
      error:"story_internal_error",
      detail:String((e as any)?.message || e).slice(0,500)
    }, { status:500, headers:{...cors,"Cache-Control":"no-store"} });
  }
});
