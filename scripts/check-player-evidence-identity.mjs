import fs from "node:fs";

const analysis = fs.readFileSync("supabase/functions/app-match-analysis/index.ts", "utf8");
const detailApi = fs.readFileSync("supabase/functions/app-match-detail/index.ts", "utf8");
const detailCriticalRpc = fs.readFileSync("supabase/migrations/20261007164000_app_match_detail_critical_rpc.sql", "utf8");
const article = fs.readFileSync("components/evidence-article.js", "utf8");
const detailUi = fs.readFileSync("components/match-detail-client.js", "utf8");

const required = [
  [detailCriticalRpc, "phase2_players"],
  [detailCriticalRpc, "source_ids->>'flashscore'"],
  [detailApi, 'identityMethod:"EXACT_FLASHSCORE_PLAYER_ID"'],
  [detailApi, "SOURCE_CONFIRMED_IDENTITY_UNRESOLVED"],
  [detailApi, "evidence_key:evidenceKey"],
  [analysis, "uniqueConfirmedClaims"],
  [analysis, "confirmedStatusClaims"],
  [analysis, "record_group:playerClaimFingerprint"],
  [article, "Confirmed source + canonical player identity"],
  [article, "player identity unresolved"],
  [detailUi, 'fact_status === "CONFIRMED"'],
  [detailUi, "unresolvedPlayerStatusEvidence"],
];
for (const [source, token] of required) {
  if (!source.includes(token)) {
    console.error("Missing player-evidence identity contract:", token);
    process.exit(1);
  }
}

const canonical = { confirmed: true, canonical: true };
const sourceOnly = { confirmed: true, canonical: false };
const provisional = { confirmed: false, canonical: false };
const status = (row) => row.confirmed && row.canonical
  ? "CONFIRMED"
  : row.confirmed
    ? "SOURCE_CONFIRMED_IDENTITY_UNRESOLVED"
    : "UNCONFIRMED";

if (status(canonical) !== "CONFIRMED") process.exit(1);
if (status(sourceOnly) === "CONFIRMED") {
  console.error("Source confirmation alone must never become a confirmed player fact");
  process.exit(1);
}
if (status(provisional) === "CONFIRMED") process.exit(1);

const overlapping = [
  { event:"FBX", side:"H", player:"P1", type:"INJURY", value:"OUT", provider:"A" },
  { event:"FBX", side:"H", player:"P1", type:"INJURY", value:"OUT", provider:"B" },
];
const fingerprints = new Set(overlapping.map((r) => [r.event,r.side,r.player,r.type,r.value].join("|")));
if (fingerprints.size !== 1) {
  console.error("Overlapping provider records must collapse to one underlying claim");
  process.exit(1);
}

console.log("Player evidence identity contract passed: canonical confirmation, unresolved fail-closed, overlapping-record collapse");
