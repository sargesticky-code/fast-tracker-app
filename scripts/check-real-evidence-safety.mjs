import fs from "node:fs";

const analysis = fs.readFileSync("supabase/functions/app-match-analysis/index.ts", "utf8");
const detail = fs.readFileSync("components/match-detail-client.js", "utf8");
const homepage = fs.readFileSync("components/homepage-client.js", "utf8");
const article = fs.readFileSync("components/evidence-article.js", "utf8");
const sync = fs.readFileSync("supabase/functions/sync-fast-tracker/index.ts", "utf8");
const detailApi = fs.readFileSync("supabase/functions/app-match-detail/index.ts", "utf8");
const phase1Feed = fs.readFileSync("supabase/functions/app-phase1-feed/index.ts", "utf8");
const storyApi = fs.readFileSync("supabase/functions/app-match-story/index.ts", "utf8");
const publicLogic = fs.readFileSync("lib/fast-tracker.js", "utf8");

const checks = [
  [analysis.includes("function statusIsTerminal"), "analysis must recognize terminal match states"],
  [analysis.includes("prematchPriceAgeSeconds"), "analysis must calculate prematch price age"],
  [analysis.includes("!kickoffStarted"), "prematch price must not remain actionable after kickoff"],
  [analysis.includes("prematchPriceAgeSeconds <= 6 * 60 * 60"), "prematch price-age ceiling must be enforced"],
  [analysis.includes('currentOdds: (!fresh || fallbackMode) ? null : bestOdds'), "stale HDA price must not be exposed as current"],
  [analysis.includes('oddsStatus: (!fresh || fallbackMode) ? "REFERENCE_STALE" : "CURRENT"'), "stale HDA price must be labelled reference-only"],
  [analysis.includes('else if (decisionFamilies.length < 2) candidate = "WATCH"'), "HDA value classification must require at least two independent families"],
  [analysis.includes('if (!usable || !opts.fresh || opts.fallbackMode)'), "Asian handicap must fail closed when market/model/freshness is unusable"],
  [analysis.includes('else if (!models.length) candidateClass = "NO_MODEL"'), "binary market advice must distinguish no model from no edge"],
  [analysis.includes('one("form_predictions")'), "goals analysis must query the validated Team Form model directly"],
  [analysis.includes('formQuality === "FORM_MODELED"'), "Team Form goals input must pass the model quality gate"],
  [analysis.includes('formHomeGames >= 8') && analysis.includes('formAwayGames >= 8'), "Team Form goals input must preserve minimum sample-size gates"],
  [analysis.includes('key: "FORM"') && analysis.includes('method: live ? "LIVE_FORM_RESIDUAL" : "FORM_XG_POISSON"'), "Team Form xG must remain a distinct market-specific goals family"],
  [analysis.includes("collapseCorrelatedBinaryModels(rawModels)"), "binary market evidence must collapse correlated source groups before Value gating"],
  [analysis.includes("collapseCorrelatedFamilies(families)"), "HDA evidence must collapse correlated source groups before consensus/value gating"],
  [analysis.includes('knownProvenanceGroup(modelTotals.data?.model_source)'), "Dixon-Coles goals provenance must come from the actual model source"],
  [analysis.includes('knownProvenanceGroup(formRow?.model_source)'), "Team Form goals provenance must come from the actual model source"],
  [detail.includes("priceObservedAt = fixture.odds_updated_at"), "detail fallback must use actual quote observation timestamp"],
  [detail.includes("fallbackStale || previousStarted"), "stale authoritative detail must replace cached prematch price state"],
  [article.includes("confirmedStarters"), "article must distinguish starters from confirmed bench rows"],
  [article.includes("kickoffStarted"), "article must independently fail closed after kickoff"],
  [sync.includes('batchSize=300'), "sync upsert helper must support bounded batch sizing"],
  [sync.includes('"hkjc_event_id",false,50)'), "HKJC odds sync must use smaller batches after observed statement timeout"],
  [detailApi.includes('identity_status:identityStatus') && detailApi.includes('const identityStatus=canonical?"CANONICAL":"UNRESOLVED"'), "detail API must expose canonical player identity state"],
  [detailApi.includes('fact_status:factStatus'), "detail API must distinguish source confirmation from canonical fact confirmation"],
  [analysis.includes('uniqueConfirmedClaims(playerStatusRowsAnnotated)'), "analysis must deduplicate overlapping player-status records by claim fingerprint"],
  [analysis.includes('row.fact_status!=="CONFIRMED"'), "analysis must exclude unresolved player identity from confirmed human-factor counts"],
  [analysis.includes('evidenceKey: `form_predictions:${id}`') && analysis.includes('evidenceKey: `model_predictions:${id}`'), "model claims must carry durable source-record evidence keys"],
  [article.includes("Confirmed source + canonical player identity"), "article must label canonical confirmation explicitly"],
  [article.includes("Source reports status · player identity unresolved"), "article must label source-confirmed unresolved identity explicitly"],
  [article.includes("Evidence: {row.evidenceKey}"), "article must render durable player evidence keys"],
  [publicLogic.includes("independentEligible:false"), "public value logic must exclude aggregates with unproven source-record independence"],
  [[phase1Feed, detailApi, analysis, storyApi].every((src) => src.includes("DB_READ_TIMEOUT_MS = 15_000")), "public read APIs must enforce the bounded 15s PostgREST deadline"],
  [[phase1Feed, detailApi, analysis, storyApi].every((src) => src.includes("db: { retry:false }")), "public read APIs must disable automatic PostgREST retries during saturation"],
  [analysis.includes('error:"analysis_read_unavailable"') && analysis.includes('semantics:"read_failure_not_fixture_absence"'), "analysis must distinguish upstream read failure from genuine fixture absence"],
  [analysis.includes('"AUTHORITY_RPC_DEGRADED"'), "analysis fail-closed fallback must retain authority-RPC degradation provenance"],
  [storyApi.includes("AbortSignal.timeout(UPSTREAM_READ_TIMEOUT_MS)"), "story upstream analysis/detail reads must have a bounded deadline"],
  [homepage.includes("let refreshInFlight = false") && homepage.includes("AbortSignal.timeout(15000)"), "homepage polling must remain single-flight with a bounded browser deadline"],
  [detail.includes("const requestsInFlight = {") && detail.includes("if (cancelled || requestsInFlight.live) return;"), "detail live polling must coalesce overlapping requests"],
  [detail.includes("fetchWithDeadline(LIVE_FEED_URL") && detail.includes("12000"), "detail live polling must keep a bounded browser deadline"],
  [detail.includes("requestsInFlight.match") && detail.includes("requestsInFlight.detail") && detail.includes("requestsInFlight.analysis") && detail.includes("requestsInFlight.story"), "detail full/detail/narrative lanes must remain single-flight"],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error("Real-evidence safety contract failed:");
  for (const message of failed) console.error("- " + message);
  process.exit(1);
}
console.log("Real-evidence safety contract passed");
