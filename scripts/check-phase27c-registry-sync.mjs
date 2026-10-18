import assert from "node:assert/strict";import {readFileSync} from "node:fs";
const s=readFileSync(new URL("./sql/phase27c-forebet-registry-sync.sql",import.meta.url),"utf8");
for(const t of ["FOREBET_STRICT_TWO_TEAM_EXACT_FIXTURE_SOURCE","COUNT(DISTINCT verified_team_key)=1",
 "team_alias_registry_v2","ON CONFLICT(source,alias_key,team_key) DO NOTHING",
 "resolution_status='VERIFIED'","conflict_free"]){assert.ok(s.includes(t),t)}
assert.doesNotMatch(s,/\bforebet_provisional_feed_current\b/);
assert.doesNotMatch(s,/^(?!\s*--).*\b(DELETE|UPDATE|TRUNCATE|DROP|ALTER)\b/im);
console.log("PHASE27C_ADDITIVE_STRICT_FOREBET_REGISTRY_SYNC_PASSED");