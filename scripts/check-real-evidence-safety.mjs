import fs from "node:fs";

const analysis = fs.readFileSync("supabase/functions/app-match-analysis/index.ts", "utf8");
const detail = fs.readFileSync("components/match-detail-client.js", "utf8");
const article = fs.readFileSync("components/evidence-article.js", "utf8");

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
  [analysis.includes('provenanceGroup: provenanceGroup(modelTotals.data?.model_source'), "Dixon-Coles goals provenance must come from the actual model source"],
  [analysis.includes('provenanceGroup: provenanceGroup(formRow?.model_source'), "Team Form goals provenance must come from the actual model source"],
  [detail.includes("priceObservedAt = fixture.odds_updated_at"), "detail fallback must use actual quote observation timestamp"],
  [detail.includes("fallbackStale || previousStarted"), "stale authoritative detail must replace cached prematch price state"],
  [article.includes("confirmedStarters"), "article must distinguish starters from confirmed bench rows"],
  [article.includes("kickoffStarted"), "article must independently fail closed after kickoff"],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error("Real-evidence safety contract failed:");
  for (const message of failed) console.error("- " + message);
  process.exit(1);
}
console.log("Real-evidence safety contract passed");
