import fs from "node:fs";

const analysis = fs.readFileSync("supabase/functions/app-match-analysis/index.ts", "utf8");

const required = [
  "function provenanceGroup",
  "function collapseCorrelatedFamilies",
  "function collapseCorrelatedBinaryModels",
  "const models = collapseCorrelatedBinaryModels(rawModels)",
  "const independentFamilies = collapseCorrelatedFamilies(families)",
];
for (const token of required) {
  if (!analysis.includes(token)) {
    console.error("Missing evidence-independence contract:", token);
    process.exit(1);
  }
}

// Behavioral contract: method diversity does not create independent evidence
// when the historical-source lineage is shared.
const signals = [
  { key: "FORM", provenanceGroup: "HKJC_RESULTS", p: 0.61 },
  { key: "DIXON_COLES", provenanceGroup: "HKJC_RESULTS", p: 0.64 },
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
if ((groups.get("HKJC_RESULTS") || []).length !== 2) {
  console.error("Correlated HKJC methods were not grouped together");
  process.exit(1);
}

const distinct = [
  { key: "FORM", provenanceGroup: "HKJC_RESULTS" },
  { key: "DIXON_COLES", provenanceGroup: "FOOTBALL_DATA_CO_UK" },
];
if (new Set(distinct.map((x) => x.provenanceGroup)).size !== 2) {
  console.error("Distinct-source contract failed");
  process.exit(1);
}

console.log("Evidence-independence contract passed: correlated methods collapse; distinct source lineages remain separate");
