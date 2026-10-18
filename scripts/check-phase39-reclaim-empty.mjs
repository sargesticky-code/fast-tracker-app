import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const s=readFileSync(new URL("./sql/phase39-reclaim-empty-prematch-table.sql",import.meta.url),"utf8");
const guards=[
 "BEGIN;","COMMIT;","lock_timeout='750ms'","statement_timeout='5000ms'",
 "LOCK TABLE private.prematch_prediction_snapshot IN ACCESS EXCLUSIVE MODE NOWAIT;",
 "SELECT count(*) INTO v_count FROM private.prematch_prediction_snapshot;",
 "IF v_count<>0 THEN","confrelid='private.prematch_prediction_snapshot'::regclass",
 "IF v_ref_fks<>0 THEN","IF v_size<4194304 THEN",
 "EXECUTE 'TRUNCATE TABLE ONLY private.prematch_prediction_snapshot';",
 "NOT_EMPTY_NO_TRUNCATE","REFERENCED_TABLE_NO_TRUNCATE"
];
for(const t of guards)assert.ok(s.includes(t),"Missing transactional safety gate: "+t);
assert.equal((s.match(/TRUNCATE TABLE ONLY private\.prematch_prediction_snapshot/g)||[]).length,1);
assert.doesNotMatch(s,/^(?!\s*--).*\b(VACUUM FULL|CASCADE|DROP TABLE|DELETE FROM|INSERT INTO|ALTER TABLE)\b/im);
console.log("PHASE39_EMPTY_PRIVATE_SNAPSHOT_RECLAIM_GUARDS_PASSED");
