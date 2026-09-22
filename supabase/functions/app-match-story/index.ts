import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { generateText, Output } from "npm:ai@7.0.109";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@3.0.53";
import { z } from "npm:zod@3.25.76";

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

function cleanError(e: unknown) {
  const x = e as any;
  return {
    name: x?.name ?? "Error",
    message: String(x?.message ?? x ?? "unknown_error").slice(0, 500),
  };
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const PhaseNarrativeSchema = z.object({
  phase: z.number().int().min(1).max(10),
  status: z.string(),
  interpretation: z.string(),
  evidenceUsed: z.array(z.string()).max(8),
});

const StorySchema = z.object({
  headline: z.string(),
  executiveSummary: z.string(),
  matchStory: z.string(),
  marketInterpretation: z.string(),
  modelConsensusInterpretation: z.string(),
  humanFactorsInterpretation: z.string(),
  liveInterpretation: z.string(),
  movementInterpretation: z.string(),
  thesis: z.string(),
  counterCase: z.string(),
  confidenceExplanation: z.string(),
  watchNext: z.array(z.string()).max(8),
  caveats: z.array(z.string()).max(8),
  phaseNarratives: z.array(PhaseNarrativeSchema).min(1).max(10),
});

function n(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function pctText(v: unknown, digits = 0): string {
  const x = n(v);
  if (x === null) return "—";
  const p = Math.abs(x) <= 1 ? x * 100 : x;
  return p.toFixed(digits) + "%";
}

function numText(v: unknown, digits = 2): string {
  const x = n(v);
  return x === null ? "—" : x.toFixed(digits);
}

function compactDetail(d: any) {
  if (!d || d?.error) return null;
  const forebet = d?.models?.forebet ?? null;
  const internal = d?.models?.internal ?? null;
  const form = d?.models?.form ?? null;
  const opta = d?.models?.opta ?? null;
  const multisource = d?.models?.multisource ?? null;
  const human = d?.humanFactors ?? {};
  const scenario = Array.isArray(d?.scenario) ? d.scenario : [];
  const live = d?.live ?? d?.liveDetail ?? null;

  return {
    generatedAt: d?.generatedAt ?? null,
    fixture: d?.fixture ? {
      id: d.fixture.hkjc_event_id ?? null,
      status: d.fixture.status ?? null,
      tournament: d.fixture.tournament ?? null,
      kickoff: d.fixture.kickoff_hkt ?? null,
      selling: d.fixture.selling ?? null,
      liveEligible: d.fixture.live_eligible ?? null,
      oddsUpdatedAt: d.fixture.odds_updated_at ?? null,
      hkjc: {
        home: n(d.fixture.had_home),
        draw: n(d.fixture.had_draw),
        away: n(d.fixture.had_away),
        goalsLine: d.fixture.hil_line ?? null,
        goalsOver: n(d.fixture.hil_over),
        goalsUnder: n(d.fixture.hil_under),
        cornersLine: d.fixture.chl_line ?? null,
        cornersOver: n(d.fixture.chl_over),
        cornersUnder: n(d.fixture.chl_under),
      },
    } : null,
    forebet: forebet ? {
      fetchedAt: forebet.fetched_at ?? null,
      home: forebet.forebet_home_team ?? null,
      away: forebet.forebet_away_team ?? null,
      hda: {
        home: n(forebet.prob_home),
        draw: n(forebet.prob_draw),
        away: n(forebet.prob_away),
      },
      prediction1x2: forebet.prediction_1x2 ?? null,
      predictedScore: forebet.predicted_score ?? null,
      avgGoals: n(forebet.avg_goals),
      ou25: {
        pick: forebet.prediction_ou25 ?? null,
        over: n(forebet.prob_over25),
        under: n(forebet.prob_under25),
      },
      corners: {
        pick: forebet.corner_prediction ?? null,
        over95: n(forebet.corner_prob_over95),
        under95: n(forebet.corner_prob_under95),
        predictedScore: forebet.corner_predicted_score ?? null,
        avg: n(forebet.avg_corners),
      },
    } : null,
    internalModels: internal ? {
      quality: internal.quality ?? null,
      source: internal.model_source ?? null,
      trainingMatches: n(internal.training_matches),
      teamMatchQuality: n(internal.team_match_quality),
      dixonColes: {
        home: n(internal.dc_prob_home),
        draw: n(internal.dc_prob_draw),
        away: n(internal.dc_prob_away),
        xgHome: n(internal.dc_xg_home),
        xgAway: n(internal.dc_xg_away),
        over25: n(internal.dc_prob_over25),
      },
      pi: {
        home: n(internal.pi_prob_home),
        draw: n(internal.pi_prob_draw),
        away: n(internal.pi_prob_away),
        homeRating: n(internal.pi_home_rating),
        awayRating: n(internal.pi_away_rating),
        difference: n(internal.pi_diff),
      },
    } : null,
    teamForm: form ? {
      quality: form.quality ?? null,
      source: form.model_source ?? null,
      homeGames: n(form.home_games),
      awayGames: n(form.away_games),
      homeVenueGames: n(form.home_venue_games),
      awayVenueGames: n(form.away_venue_games),
      hda: {
        home: n(form.form_prob_home),
        draw: n(form.form_prob_draw),
        away: n(form.form_prob_away),
      },
      xg: {
        home: n(form.form_xg_home),
        away: n(form.form_xg_away),
      },
    } : null,
    optaStrength: opta ? {
      source: opta.source ?? null,
      coverage: opta.coverage ?? null,
      homeRating: n(opta.home_rating),
      awayRating: n(opta.away_rating),
      homeRank: n(opta.home_rank),
      awayRank: n(opta.away_rank),
      homeMatchConfidence: n(opta.home_match_confidence),
      awayMatchConfidence: n(opta.away_match_confidence),
    } : null,
    multisource,
    humanFactors: {
      summary: human?.summary ?? null,
      eventMap: human?.eventMap ? {
        apiFixtureId: human.eventMap.api_fixture_id ?? null,
        matchQuality: n(human.eventMap.match_quality),
        lineupConfirmedAt: human.eventMap.lineup_confirmed_at ?? null,
      } : null,
      playerStatus: Array.isArray(human?.playerStatus) ? human.playerStatus.slice(0, 24).map((x: any) => ({
        teamSide: x.team_side ?? null,
        type: x.status_type ?? null,
        value: x.status_value ?? null,
        player: x?.raw?.player?.name ?? x?.raw?.player_name ?? x.player_key ?? null,
        confirmed: x.confirmed ?? null,
        source: x.source_name ?? null,
      })) : [],
      lineup: Array.isArray(human?.lineup) ? human.lineup.slice(0, 30).map((x: any) => ({
        teamSide: x.team_side ?? null,
        player: x?.raw?.player?.name ?? x?.raw?.player_name ?? x.player_key ?? null,
        starter: x.is_starter ?? x.starter ?? null,
        confirmed: x.confirmed ?? null,
        source: x.source_name ?? null,
      })) : [],
      managers: Array.isArray(human?.managers) ? human.managers.slice(0, 8).map((x: any) => ({
        teamSide: x.team_side ?? null,
        manager: x.evidence_value ?? x.manager_key ?? null,
        confirmed: x.confirmed ?? null,
        source: x.source_name ?? null,
      })) : [],
    },
    scenario: scenario.slice(0, 8).map((x: any) => ({
      segment: x.segment ?? null,
      consensus: x.model_hda_consensus ?? null,
      forebet: x.forebet_hda ?? null,
      controlSide: x.macro_control_side ?? null,
      controlBasis: x.control_basis ?? null,
      contextCoverage: n(x.context_coverage_score),
      pHomeGoal: n(x.p_home_goal_segment),
      pAwayGoal: n(x.p_away_goal_segment),
      pNoGoal: n(x.p_no_goal_segment),
      expectedHomeCorners: n(x.expected_home_corners_segment),
      expectedAwayCorners: n(x.expected_away_corners_segment),
      expectedScoreState: x.expected_score_state ?? null,
      status: x.segment_prediction_status ?? null,
      notes: x.notes ?? null,
    })),
    live,
  };
}

function deepModelSentence(d: any, language: string) {
  if (!d) return "";
  const pieces: string[] = [];
  const f = d.forebet;
  if (f) {
    const probs = f.hda;
    const hda = probs && [probs.home, probs.draw, probs.away].some((v: unknown) => n(v) !== null)
      ? `Forebet H/D/A ${pctText(probs.home)}/${pctText(probs.draw)}/${pctText(probs.away)}`
      : "Forebet H/D/A unavailable";
    const score = f.predictedScore ? `predicted score ${f.predictedScore}` : null;
    const goals = f.avgGoals !== null ? `avg goals ${numText(f.avgGoals, 2)}` : null;
    const corners = f.corners?.avg !== null
      ? `corners ${f.corners.pick || "—"} · avg ${numText(f.corners.avg, 2)} · O9.5/U9.5 ${pctText(f.corners.over95)}/${pctText(f.corners.under95)}`
      : null;
    pieces.push([hda, score, goals, corners].filter(Boolean).join(" · "));
  }

  const opta = d.optaStrength;
  if (opta && opta.homeRating !== null && opta.awayRating !== null) {
    pieces.push(`Opta strength ${numText(opta.homeRating, 1)} vs ${numText(opta.awayRating, 1)} (coverage ${opta.coverage || "—"}); this is strength evidence, not a direct betting probability`);
  }

  const internal = d.internalModels;
  if (internal?.quality && ![internal.dixonColes?.home, internal.pi?.home].some((v: unknown) => n(v) !== null)) {
    pieces.push(`DC/Pi: ${internal.quality}`);
  }

  const form = d.teamForm;
  if (form?.quality) {
    pieces.push(`Team Form: ${form.quality} · sample ${form.homeGames ?? 0}/${form.awayGames ?? 0}`);
  }

  if (!pieces.length) return "";
  return language === "en"
    ? pieces.join(". ") + "."
    : pieces.join("；") + "。";
}

function fallbackStory(a: any, detail: any, language: string) {
  const deep = compactDetail(detail);
  const phaseNarratives = Object.entries(a?.phaseCoverage || {}).map(([k, v]: [string, any]) => ({
    phase: Number(String(k).replace("phase", "")) || 0,
    status: String(v?.status || "UNKNOWN"),
    interpretation: String(v?.note || v?.movement || (v?.live ? "Live evidence available." : "No additional validated interpretation yet.")),
    evidenceUsed: [],
  })).filter((x) => x.phase >= 1 && x.phase <= 10);

  const s = a?.story || {};
  const modelDeep = deepModelSentence(deep, language);
  const scenarioRows = deep?.scenario || [];
  const scenario = scenarioRows[0] || null;
  const human = deep?.humanFactors;
  const injuryRows = human?.playerStatus?.length || 0;
  const lineupRows = human?.lineup?.length || 0;
  const managerRows = human?.managers?.length || 0;

  const detailStoryZh = [
    deep?.forebet?.predictedScore ? `Forebet 預測比分 ${deep.forebet.predictedScore}，平均入球 ${numText(deep.forebet.avgGoals, 2)}。` : "",
    deep?.optaStrength?.homeRating !== null && deep?.optaStrength?.awayRating !== null
      ? `Opta strength 主/客 ${numText(deep.optaStrength.homeRating, 1)}/${numText(deep.optaStrength.awayRating, 1)}；呢個係球隊強弱 evidence，唔係直接勝率。`
      : "",
    deep?.forebet?.corners?.avg !== null
      ? `角球模型平均 ${numText(deep.forebet.corners.avg, 2)}，Forebet ${deep.forebet.corners.pick || "—"} 9.5，O/U ${pctText(deep.forebet.corners.over95)}/${pctText(deep.forebet.corners.under95)}。`
      : "",
    scenario
      ? `Phase 3 pre-match scenario：${scenario.segment || "—"} 控制方向 ${scenario.controlSide || "—"}，context coverage ${numText(scenario.contextCoverage, 0)}%，狀態 ${scenario.status || "—"}。`
      : "",
  ].filter(Boolean).join(" ");

  const detailStoryEn = [
    deep?.forebet?.predictedScore ? `Forebet projects ${deep.forebet.predictedScore}, with average goals ${numText(deep.forebet.avgGoals, 2)}.` : "",
    deep?.optaStrength?.homeRating !== null && deep?.optaStrength?.awayRating !== null
      ? `Opta strength is ${numText(deep.optaStrength.homeRating, 1)} versus ${numText(deep.optaStrength.awayRating, 1)}; this is team-strength evidence rather than a direct win probability.`
      : "",
    deep?.forebet?.corners?.avg !== null
      ? `The corner model averages ${numText(deep.forebet.corners.avg, 2)}, with Forebet leaning ${deep.forebet.corners.pick || "—"} 9.5 and O/U probabilities of ${pctText(deep.forebet.corners.over95)}/${pctText(deep.forebet.corners.under95)}.`
      : "",
    scenario
      ? `Phase 3 pre-match scenario for ${scenario.segment || "—"} has control ${scenario.controlSide || "—"}, context coverage ${numText(scenario.contextCoverage, 0)}%, status ${scenario.status || "—"}.`
      : "",
  ].filter(Boolean).join(" ");

  const humanExtra = language === "en"
    ? `Human-factor evidence: ${injuryRows} player-status rows, ${lineupRows} lineup rows and ${managerRows} manager rows.`
    : `Human-factor evidence：${injuryRows} 個 player-status、${lineupRows} 個 lineup、${managerRows} 個 manager rows。`;

  return {
    headline: String(s.headline || "Match intelligence"),
    executiveSummary: String(s.summary || s.advice || "No validated narrative is available yet."),
    matchStory: [
      s.marketRead,
      s.modelRead,
      modelDeep,
      language === "en" ? detailStoryEn : detailStoryZh,
      humanExtra,
      s.liveRead,
      s.movementRead,
    ].filter(Boolean).join(" "),
    marketInterpretation: String(s.marketRead || "Market evidence unavailable."),
    modelConsensusInterpretation: [s.modelRead, modelDeep].filter(Boolean).join(" "),
    humanFactorsInterpretation: [s.humanRead, humanExtra].filter(Boolean).join(" "),
    liveInterpretation: String(s.liveRead || "Live evidence unavailable."),
    movementInterpretation: String(s.movementRead || "Market-movement evidence unavailable."),
    thesis: String(s.advice || "No validated betting thesis."),
    counterCase: String(s.counterRead || s.riskRead || "No additional counter-case is available."),
    confidenceExplanation: String(s.supportRead || "Confidence is constrained by current evidence coverage."),
    watchNext: Array.isArray(a?.invalidators) ? a.invalidators.slice(0, 8).map(String) : [],
    caveats: Array.isArray(a?.invalidators) ? a.invalidators.slice(0, 8).map(String) : [],
    phaseNarratives,
  };
}

function evidencePack(a: any, detail: any) {
  return {
    match: a?.match ?? null,
    decision: a?.decision ?? null,
    deterministicStory: a?.story ?? null,
    phaseCoverage: a?.phaseCoverage ?? null,
    invalidators: a?.invalidators ?? [],
    evidence: {
      market: a?.evidence?.market ?? null,
      consensus: a?.evidence?.consensus ?? null,
      families: a?.evidence?.families ?? [],
      familySupport: a?.evidence?.familySupport ?? [],
      phase1Health: a?.evidence?.phase1Health ?? null,
      phase2: a?.evidence?.phase2 ?? null,
      phase3: a?.evidence?.phase3 ?? null,
      phase4: a?.evidence?.phase4 ?? null,
      deepDetail: compactDetail(detail),
    },
    governance: a?.governance ?? null,
  };
}

function promptFor(pack: any, language: string, style: string) {
  const langRule = language === "en"
    ? "Write in professional British English."
    : "Write in natural professional Cantonese using Traditional Chinese. Keep common football/data terms such as Edge, xG, odds and lineup in English where clearer.";
  return `You are the editorial interpretation layer for a professional football betting-intelligence dashboard.

Your job is to turn VERIFIED structured evidence into a clear match story and analyst commentary.
You are NOT the calculation engine.

NON-NEGOTIABLE RULES:
1. Never invent or recalculate odds, probabilities, edge, injuries, lineups, scores, xG, market movement or model outputs.
2. Never change the deterministic betting action, selection or candidate class supplied in the evidence.
3. If a phase is NOT_BUILT, NOT_PRODUCTION, WAIT, PARTIAL, COLLECTING or CALIBRATION_PENDING, say so plainly and do not pretend the data exists.
4. Explain model agreement AND disagreement. Give the strongest counter-case, not only the bullish case.
5. Betting language must be conditional and evidence-led. Never imply certainty, guaranteed profit or a sure win.
6. Separate what the data says from what still needs confirmation.
7. Phase 5 calibration and Phase 7 risk controls govern whether a candidate can become a production bet/stake. Do not bypass them.
8. Keep the writing compact enough for a dashboard detail page, but rich enough to understand why the advice exists.
9. ${langRule}
10. Requested style: ${style}.

Return only the requested structured output.

VERIFIED EVIDENCE:
${JSON.stringify(pack)}`;
}

async function createAiStory(pack: any, language: string, style: string) {
  const enabled = String(Deno.env.get("AI_INTERPRETER_ENABLED") || "").toLowerCase() === "true";
  const apiKey = Deno.env.get("AI_API_KEY") || Deno.env.get("OPENAI_API_KEY") || "";
  const modelName = Deno.env.get("AI_MODEL") || "";
  const baseURL = Deno.env.get("AI_BASE_URL") || "https://api.openai.com/v1";
  const providerName = Deno.env.get("AI_PROVIDER_NAME") || "openai-compatible";

  if (!enabled || !apiKey || !modelName) {
    return {
      ok: false,
      mode: "DETERMINISTIC_FALLBACK",
      model: modelName || null,
      provider: providerName,
      reason: !enabled ? "ai_disabled" : !apiKey ? "api_key_missing" : "model_missing",
      output: null,
    };
  }

  const provider = createOpenAICompatible({
    name: providerName,
    baseURL,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const model = provider.chatModel(modelName);
  const prompt = promptFor(pack, language, style);

  try {
    const result = await generateText({
      model,
      output: Output.object({ schema: StorySchema }),
      prompt,
      temperature: 0.2,
    });
    return { ok: true, mode: "AI_GROUNDED", model: modelName, provider: providerName, output: result.output };
  } catch (firstError) {
    try {
      const retry = await generateText({
        model,
        prompt: prompt + "\nReturn a single valid JSON object matching the requested fields exactly. No markdown fences.",
        temperature: 0.1,
      });
      const raw = String(retry.text || "").trim()
        .replace(/^\`\`\`(?:json)?\s*/i, "")
        .replace(/\s*\`\`\`$/i, "");
      const parsed = StorySchema.safeParse(JSON.parse(raw));
      if (!parsed.success) throw new Error("structured_retry_validation_failed");
      return { ok: true, mode: "AI_GROUNDED_RETRY", model: modelName, provider: providerName, output: parsed.data };
    } catch (secondError) {
      return {
        ok: false,
        mode: "DETERMINISTIC_FALLBACK",
        model: modelName,
        provider: providerName,
        reason: "ai_generation_failed",
        error: { first: cleanError(firstError), second: cleanError(secondError) },
        output: null,
      };
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") {
    return Response.json({ error: "method_not_allowed" }, { status: 405, headers: cors });
  }

  const u = new URL(req.url);
  const id = String(u.searchParams.get("id") || "").trim();
  const language = u.searchParams.get("lang") === "en" ? "en" : "zh-HK";
  const styleRaw = String(u.searchParams.get("style") || "professional").toLowerCase();
  const style = ["professional", "concise", "broadcast"].includes(styleRaw) ? styleRaw : "professional";

  if (!/^[A-Za-z0-9_-]{2,40}$/.test(id)) {
    return Response.json({ error: "invalid_match_id" }, {
      status: 400,
      headers: { ...cors, "Cache-Control": "no-store" },
    });
  }

  const sbUrl = Deno.env.get("SUPABASE_URL") || "";
  const key = serverKey();
  if (!sbUrl || !key) {
    return Response.json({ error: "server_config_missing" }, { status: 500, headers: cors });
  }

  const analysisUrl = `${sbUrl}/functions/v1/app-match-analysis?id=${encodeURIComponent(id)}`;
  const detailUrl = `${sbUrl}/functions/v1/app-match-detail?id=${encodeURIComponent(id)}`;
  const upstreamHeaders = { Authorization: `Bearer ${key}`, apikey: key };

  const [analysisRes, detailRes] = await Promise.all([
    fetch(analysisUrl, { headers: upstreamHeaders }),
    fetch(detailUrl, { headers: upstreamHeaders }).catch(() => null),
  ]);

  if (!analysisRes.ok) {
    const upstreamDetail = await analysisRes.text();
    return Response.json({
      error: "analysis_unavailable",
      upstreamStatus: analysisRes.status,
      detail: upstreamDetail.slice(0, 800),
    }, { status: analysisRes.status, headers: { ...cors, "Cache-Control": "no-store" } });
  }

  const analysis = await analysisRes.json();
  let detail: any = null;
  if (detailRes?.ok) {
    try {
      const parsed = await detailRes.json();
      if (!parsed?.error) detail = parsed;
    } catch {}
  }

  const pack = evidencePack(analysis, detail);
  const analysisHash = await sha256(pack);
  const db = createClient(sbUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const cached = await db
    .from("match_interpretations")
    .select("analysis_hash,payload,model,framework,generated_at")
    .eq("hkjc_event_id", id)
    .eq("language", language)
    .eq("style", style)
    .maybeSingle();

  if (!cached.error && cached.data?.analysis_hash === analysisHash && cached.data?.payload) {
    return Response.json({
      ...cached.data.payload,
      cache: { hit: true, analysisHash, generatedAt: cached.data.generated_at },
    }, { headers: { ...cors, "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } });
  }

  const ai = await createAiStory(pack, language, style);
  const story = ai.ok && ai.output ? ai.output : fallbackStory(analysis, detail, language);

  const finalPayload = {
    generatedAt: new Date().toISOString(),
    id,
    engine: {
      name: "FT_STORY_INTERPRETER_V2",
      framework: "vercel/ai",
      frameworkVersion: "7.0.109",
      evidenceContract: "PHASE_AWARE_V2",
      providerAdapter: "@ai-sdk/openai-compatible@3.0.53",
      mode: ai.mode,
      provider: ai.provider,
      model: ai.model,
      fallbackReason: ai.ok ? null : ai.reason,
    },
    match: analysis.match ?? null,
    bettingAdvice: {
      action: analysis?.decision?.action ?? null,
      candidateClass: analysis?.decision?.candidateClass ?? null,
      market: analysis?.decision?.market ?? null,
      selection: analysis?.decision?.selection ?? null,
      selectionLabel: analysis?.decision?.selectionLabel ?? null,
      currentOdds: analysis?.decision?.currentOdds ?? null,
      candidateEdgePp: analysis?.decision?.candidateEdgePp ?? null,
      marketFairProbability: analysis?.decision?.marketFairProbability ?? null,
      analystConsensusProbability: analysis?.decision?.analystConsensusProbability ?? null,
      evidenceFamilyCount: analysis?.decision?.evidenceFamilyCount ?? null,
      supportCount: analysis?.decision?.supportCount ?? null,
      valueSupportRatio: analysis?.decision?.valueSupportRatio ?? null,
      thesis: story.thesis,
      counterCase: story.counterCase,
      confidenceExplanation: story.confidenceExplanation,
    },
    story,
    phaseCoverage: analysis.phaseCoverage ?? null,
    evidenceSummary: {
      detailAvailable: Boolean(detail),
      forebet: Boolean(detail?.models?.forebet),
      internalModels: Boolean(detail?.models?.internal),
      teamForm: Boolean(detail?.models?.form),
      optaStrength: Boolean(detail?.models?.opta),
      multisource: Boolean(detail?.models?.multisource),
      humanFactorRows: (detail?.humanFactors?.playerStatus?.length || 0) + (detail?.humanFactors?.lineup?.length || 0) + (detail?.humanFactors?.managers?.length || 0),
      scenarioRows: detail?.scenario?.length || 0,
    },
    invalidators: analysis.invalidators ?? [],
    governance: {
      sourceEngine: analysis.engine ?? null,
      sourceNarrationMode: analysis.narrationMode ?? null,
      rule: "AI explains verified evidence only. Deterministic action, selection, odds, probability and edge fields are copied from app-match-analysis and cannot be overridden by the language model.",
      calibrationGate: analysis?.governance?.calibrationGate ?? null,
      staking: analysis?.governance?.staking ?? null,
    },
    cache: { hit: false, analysisHash },
    diagnostics: ai.ok ? null : (ai.error ?? { reason: ai.reason }),
  };

  if (ai.ok) {
    const now = new Date().toISOString();
    await db.from("match_interpretations").upsert({
      hkjc_event_id: id,
      language,
      style,
      analysis_hash: analysisHash,
      framework: "vercel-ai@7.0.109",
      model: ai.model,
      payload: finalPayload,
      source_generated_at: analysis.generatedAt ?? null,
      generated_at: now,
      updated_at: now,
    }, { onConflict: "hkjc_event_id,language,style" });
  }

  return Response.json(finalPayload, {
    headers: { ...cors, "Cache-Control": ai.ok ? "public, max-age=30, stale-while-revalidate=60" : "no-store" },
  });
});
