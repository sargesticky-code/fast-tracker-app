import assert from "node:assert/strict";
import{readFileSync}from"node:fs";
const s=readFileSync(new URL("./sql/phase36c-hourly-lineup-retire.sql",import.meta.url),"utf8");
for(const token of ["ft-lineup-cold-retire-200-hourly","58 * * * *",
 "lineup-cold-retire?after=0","vault.decrypted_secrets","fast_tracker_cron_secret",
 "net.http_post","timeout_milliseconds:=20000","if not exists(select 1 from cron.job",
 "REQUIRED_PRIVATE_CRON_KEY_NOT_CONFIGURED"])assert.ok(s.includes(token),token);
assert.doesNotMatch(s,/\b(DELETE|TRUNCATE|DROP|VACUUM FULL|INSERT INTO|CREATE TABLE|ALTER TABLE)\b/im);
assert.doesNotMatch(s,/x-ft-cron-key'\s*,\s*'[^']+[')]/i);
assert.equal((s.match(/cron\.schedule\(/g)||[]).length,1);
console.log("PHASE36C_CAPPED_HOURLY_ARCHIVE_FIRST_RETIRE_CRON_PASSED");
