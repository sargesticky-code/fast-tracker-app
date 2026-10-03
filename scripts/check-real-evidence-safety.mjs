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
