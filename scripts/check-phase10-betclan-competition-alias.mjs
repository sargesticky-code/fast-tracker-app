import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/migrations/20261017141700_phase10_audited_betclan_usl_obos_alias.sql",import.meta.url),"utf8");
for(const [source,canonical] of [
  ["USA USL Championship","USL Championship"],
  ["Norway 1. Division","OBOS-ligaen"],
]){
  assert.ok(sql.includes("'BETCLAN','"+source+"','"+canonical+"'"),
    "provider/competition-scoped record must be exact");
}
assert.equal((sql.match(/'BETCLAN',/g)||[]).length,2);
assert.ok(sql.includes("NEVER_VERIFY_FROM_COMPETITION_ALIAS_ALONE"));
for(const id of ["1493746","1493751","1495984","1495990"])
  assert.ok(sql.includes("'"+id+"'"),"real archived event evidence is present");
assert.ok(sql.includes("on conflict(provider,source_competition,canonical_competition) do nothing"));
assert.doesNotMatch(sql,/\b(update|delete|truncate|drop|alter|create\s+or\s+replace)\b\s+(?:table|function|public\.)/i,
 "only inserts audited alias rows; do not change production matching logic");
const matcher=readFileSync(new URL("../supabase/migrations/20261015013644_betclan_competition_alias_evidence.sql",import.meta.url),"utf8");
for(const contract of [
  "f.identity_authority='FLASHSCORE'",
  "f.provider_identity_status='VERIFIED_IDENTITY'",
  "f.status='SCHEDULED'",
  "abs(extract(epoch from f.kickoff_hkt-p_kickoff))<=60",
  "lower(trim(f.home_en))=lower(trim(p_home))",
  "lower(trim(f.away_en))=lower(trim(p_away))",
  "adviser_competition_alias_evidence"
])assert.ok(matcher.includes(contract),"existing safe identity constraints must remain: "+contract);
console.log("PHASE10_AUDITED_BETCLAN_ALIASES_CONTRACT_PASSED");
