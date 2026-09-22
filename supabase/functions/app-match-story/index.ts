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
  const extra = deepFacts(detail, language);
  const humanRows = (deep?.humanFactors?.playerStatus?.length || 0)
    + (deep?.humanFactors?.lineup?.length || 0)
    + (deep?.humanFactors?.managers?.length || 0);
  const humanExtra = language === "en"
    ? `Deep human-factor evidence rows: ${humanRows}.`
    : `Deep Human Factors evidence rows：${humanRows}。`;
  const phases = Object.entries(a?.phaseCoverage || {}).map(([k,v]: [string, any]) => ({
    phase: Number(String(k).replace("phase","")) || 0,
    status: String(v?.status || "UNKNOWN"),
    interpretation: String(
      v?.note ||
      v?.movement ||
      (v?.live ? "Live evidence available." : "No additional validated interpretation yet.")
    ),
    evidenceUsed: [],
  })).filter((x) => x.phase >= 1 && x.phase <= 10);

  return {
    headline: String(s.headline || "賽事綜合解讀"),
    executiveSummary: String(s.summary || s.advice || "暫未有足夠 evidence 建立完整分析。"),
    matchStory: [s.marketRead,s.modelRead,extra,humanExtra,s.humanRead,s.liveRead,s.movementRead].filter(Boolean).join(" "),
    marketInterpretation: String(s.marketRead || "市場 evidence 未足。"),
    modelConsensusInterpretation: [s.modelRead,extra].filter(Boolean).join(" "),
    humanFactorsInterpretation: [s.humanRead,humanExtra].filter(Boolean).join(" "),
    liveInterpretation: String(s.liveRead || "Live evidence 未足。"),
    movementInterpretation: String(s.movementRead || "Odds movement evidence 未足。"),
    thesis: String(s.advice || "暫未形成可執行投注論點。"),
    counterCase: String(s.counterRead || s.riskRead || "暫未有額外反方 evidence。"),
    confidenceExplanation: String(s.supportRead || "信心受現有 evidence coverage 限制。"),
    watchNext: Array.isArray(a?.invalidators) ? a.invalidators.slice(0,8).map(String) : [],
    caveats: Array.isArray(a?.invalidators) ? a.invalidators.slice(0,8).map(String) : [],
    phaseNarratives: phases,
  };
}

function aiEnabled() {
  return String(Deno.env.get("AI_INTERPRETER_ENABLED") || "").toLowerCase() === "true"
    && Boolean(Deno.env.get("AI_API_KEY") || Deno.env.get("OPENAI_API_KEY"))
    && Boolean(Deno.env.get("AI_MODEL"));
}

async function createAiStory(analysis: any, detail: any, fallback: any, language: string, style: string) {
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
    const packForHash = {
      match:analysis?.match,
      decision:analysis?.decision,
      story:analysis?.story,
      phaseCoverage:analysis?.phaseCoverage,
      invalidators:analysis?.invalidators,
      evidence:analysis?.evidence,
      deepDetail:compactDetail(detail),
    };
    const analysisHash = await sha256(packForHash);
    const db = createClient(sbUrl, key, { auth:{ persistSession:false, autoRefreshToken:false } });

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
    const ai = await createAiStory(analysis, detail, deterministic, language, style);
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
      story,
      phaseCoverage:analysis.phaseCoverage ?? null,
      evidenceSummary:{
        detailAvailable:Boolean(detail),
        forebet:Boolean(detail?.models?.forebet),
        internalModels:Boolean(detail?.models?.internal),
        teamForm:Boolean(detail?.models?.form),
        optaStrength:Boolean(detail?.models?.opta),
        multisource:Boolean(detail?.models?.multisource),
        humanFactorRows:(detail?.humanFactors?.playerStatus?.length||0)+(detail?.humanFactors?.lineup?.length||0)+(detail?.humanFactors?.managers?.length||0),
        scenarioRows:detail?.scenario?.length||0,
      },
      invalidators:analysis.invalidators ?? [],
      governance:{
        sourceEngine:analysis.engine ?? null,
        sourceNarrationMode:analysis.narrationMode ?? null,
        rule:"Story explains verified evidence only. Deterministic action, selection, odds, probability and edge fields come from app-match-analysis.",
        calibrationGate:analysis?.governance?.calibrationGate ?? null,
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
