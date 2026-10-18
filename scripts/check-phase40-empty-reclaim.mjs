import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("./sql/phase40-reclaim-four-empty-tables.sql",import.meta.url),"utf8");
const tables=["private.multisource_consensus_current","public.prediction_fallback_current",
"public.team_alias_evidence_v2","public.team_name_context_master"];
for(const t of tables){
 assert.match(sql,new RegExp(t.replaceAll(".","\\.")));
}
for(const token of ["lock_timeout='750ms'","statement_timeout='7000ms'",
 "IN ACCESS EXCLUSIVE MODE NOWAIT;","FOREACH v_table IN ARRAY ARRAY[",
 "IF v_count<>0 THEN","IF v_fk_count<>0 THEN","IF v_allocation<400000 THEN",
 "PHASE40_NONEMPTY_TABLE","PHASE40_REFERENCED_TABLE","PHASE40_ALREADY_COMPACTED","END;\n$guard$;\nCOMMIT;"])
 assert.ok(sql.includes(token),"missing guard "+token);
assert.equal((sql.match(/EXECUTE 'TRUNCATE TABLE ONLY/g)||[]).length,1);
assert.doesNotMatch(sql,/^(?!\s*--).*\b(DROP TABLE|DELETE FROM|VACUUM FULL|CASCADE|RESTART IDENTITY)\b/im);
console.log("PHASE40_EMPTY_TABLES_RECLAIM_GUARDS_PASSED");
