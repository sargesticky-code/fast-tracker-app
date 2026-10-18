import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("./sql/phase42-repack-archived-source-days.sql",import.meta.url),"utf8");
for(const needed of ["BEGIN;","COMMIT;","lock_timeout='750ms'","statement_timeout='12000ms'",
"IN ACCESS EXCLUSIVE MODE NOWAIT","v_all<>14 OR v_recent<>4",
"date '2026-10-18'","date '2026-10-17'","date '2026-10-11'",
"md5(s.source_rows::text)=s.content_md5",
"source-day/v1/","[a-f0-9]{64}[.]json[.]txt$",
"v_archived<>14","CREATE TEMP TABLE phase42_retain_snapshot ON COMMIT DROP",
"v_before_hash","TRUNCATE TABLE ONLY private.ft_source_day_snapshot",
"INSERT INTO private.ft_source_day_snapshot","GET DIAGNOSTICS v_inserted=ROW_COUNT",
"v_inserted<>4","v_after_hash IS DISTINCT FROM v_before_hash",
"SOURCE_DAY_RESTORE_BYTES_MISMATCH"])
 assert.ok(sql.includes(needed),"Missing: "+needed);
assert.equal((sql.match(/TRUNCATE TABLE ONLY/g)||[]).length,1);
assert.doesNotMatch(sql,/\b(VACUUM FULL|DROP TABLE.*private|CASCADE|DELETE FROM)\b/i);
console.log("PHASE42_14_ARCHIVES_PRESERVE_4_EXACT_RECENT_SOURCE_SNAPSHOTS_PASSED");
