import assert from "node:assert/strict";
import{readFileSync}from"node:fs";
const s=readFileSync(new URL("./sql/phase36a-first-verified-lineup-retirement.sql",import.meta.url),"utf8");
for(const t of ["v_removed","row_count","source_name='API_FOOTBALL'","id between 1 and 600","v_count<>600",
 "v_removed<>600","fast-tracker-ingest","lineup-cold/v2/201-400","lineup-cold/v2/401-600",
 "lineup-cold/2026-10-18/1-200","not exists(select 1 from public.flashscore_primary_fixture_current",
 "not exists(select 1 from public.canonical_fixture_current","interval '14 days'"])assert.ok(s.includes(t),t);
assert.equal((s.match(/delete from public\.phase2_match_lineup_evidence/g)||[]).length,1);
assert.doesNotMatch(s,/\b(TRUNCATE|DROP TABLE|VACUUM FULL|CASCADE)\b/i);
console.log("PHASE36A_600_ALREADY_ARCHIVED_COLD_ROWS_ONLY_PASSED");
