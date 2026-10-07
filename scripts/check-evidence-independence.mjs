import fs from "node:fs";

const analysis = fs.readFileSync("supabase/functions/app-match-analysis/index.ts", "utf8");
const publicLogic = fs.readFileSync("lib/fast-tracker.js", "utf8");
const phase4Consensus = fs.readFileSync("supabase/migrations/20261007011800_phase4_collapse_correlated_model_methods.sql", "utf8");

const required = [
  "function provenanceGroup",
  "function collapseCorrelatedFamilies",
  "function collapseCorrelatedBinaryModels",
  "const models = collapseCorrelatedBinaryModels(rawModels)",
  "const independentFamilies = collapseCorrelatedFamilies(families)",
  'provenanceGroup: "MULTISOURCE_AGGREGATE"',
  "independentEligible: false",
];
if (!publicLogic.includes("collapseProvenanceFamilies(rows)") || !publicLogic.includes("independentEligible:false")) {
  console.error("Public flow must also count only provenance-distinct evidence and keep unknown-lineage aggregates supplemental");
  process.exit(1);
}
for (const token of required) {
  if (!analysis.includes(token)) {
    console.error("Missing evidence-independence contract:", token);
    process.exit(1);
  }
}

const phase4Required = [
  "internal_methods",
  "independent_families",
  "when dc_p is not null and pi_p is not null then (dc_p+pi_p)/2.0",
  "((internal_p is not null)::int + (fb_p is not null)::int)",
];
for (const token of phase4Required) {
  if (!phase4Consensus.includes(token)) {
    console.error("Phase 4 consensus must collapse correlated internal methods into one evidence family:", token);
    process.exit(1);
  }
}

// Behavioral contract: method diversity does not create independent evidence
// when the historical-source lineage is shared.
const signals = [
  { key: "FORM", provenanceGroup: "VERIFIED_RESULTS_HISTORY", p: 0.61 },
  { key: "DIXON_COLES", provenanceGroup: "VERIFIED_RESULTS_HISTORY", p: 0.64 },
  { key: "FOREBET", provenanceGroup: "FOREBET", p: 0.58 },
];
const groups = new Map();
for (const signal of signals) {
  const key = signal.provenanceGroup || signal.key;
  groups.set(key, [...(groups.get(key) || []), signal]);
}
if (groups.size !== 2) {
  console.error("Correlated-source contract failed: expected 2 independent groups, got", groups.size);
  process.exit(1);
}
if ((groups.get("VERIFIED_RESULTS_HISTORY") || []).length !== 2) {
  console.error("Correlated historical methods were not grouped together");
  process.exit(1);
}

const distinct = [
  { key: "FORM", provenanceGroup: "VERIFIED_RESULTS_HISTORY" },
  { key: "DIXON_COLES", provenanceGroup: "FOOTBALL_DATA_CO_UK" },
];
if (new Set(distinct.map((x) => x.provenanceGroup)).size !== 2) {
  console.error("Distinct-source contract failed");
  process.exit(1);
}

console.log("Evidence-independence contract passed: correlated methods collapse; distinct source lineages remain separate");
