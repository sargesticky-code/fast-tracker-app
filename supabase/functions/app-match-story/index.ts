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

function fallbackStory(a: any) {
  const phaseNarratives = Object.entries(a?.phaseCoverage || {}).map(([k, v]: [string, any]) => ({
    phase: Number(String(k).replace("phase", "")) || 0,
    status: String(v?.status || "UNKNOWN"),
    interpretation: String(v?.note || v?.movement || (v?.live ? "Live evidence available." : "No additional validated interpretation yet.")),
    evidenceUsed: [],
  })).filter((x) => x.phase >= 1 && x.phase <= 10);

  const s = a?.story || {};
  return {
    headline: String(s.headline || "Match intelligence"),
    executiveSummary: String(s.summary || s.advice || "No validated narrative is available yet."),
    matchStory: [s.marketRead, s.modelRead, s.humanRead, s.liveRead, s.movementRead].filter(Boolean).join(" "),
    marketInterpretation: String(s.marketRead || "Market evidence unavailable."),
    modelConsensusInterpretation: String(s.modelRead || "Model evidence unavailable."),
    humanFactorsInterpretation: String(s.humanRead || "Human-factor evidence unavailable."),
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

function evidencePack(a: any) {
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
  const analysisRes = await fetch(analysisUrl, {
    headers: { Authorization: `Bearer ${key}`, apikey: key },
  });

  if (!analysisRes.ok) {
    const detail = await analysisRes.text();
    return Response.json({
      error: "analysis_unavailable",
      upstreamStatus: analysisRes.status,
      detail: detail.slice(0, 800),
    }, { status: analysisRes.status, headers: { ...cors, "Cache-Control": "no-store" } });
  }

  const analysis = await analysisRes.json();
  const pack = evidencePack(analysis);
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
  const story = ai.ok && ai.output ? ai.output : fallbackStory(analysis);

  const finalPayload = {
    generatedAt: new Date().toISOString(),
    id,
    engine: {
      name: "FT_STORY_INTERPRETER_V1",
      framework: "vercel/ai",
      frameworkVersion: "7.0.109",
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
