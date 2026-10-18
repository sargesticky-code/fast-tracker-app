import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const s=readFileSync(new URL("./sql/phase46-schedule-proven-source-retention.sql",import.meta.url),"utf8");
for(const k of ["'ft-source-day-archive-retire-once-daily'","'25 16 * * *'",
 "cron.schedule(","net.http_post(","source-day-retention","fast_tracker_cron_secret",
 "vault.decrypted_secrets","body:='{}'::jsonb","timeout_milliseconds:=120000",
 "SOURCE_RETENTION_CRON_KEY_MISSING","SOURCE_RETENTION_CRON_ALREADY_EXISTS_REVIEW_FIRST"])
 assert.ok(s.includes(k),"cron guard missing "+k);
assert.equal(s.split("cron.schedule(").length,2);
assert.doesNotMatch(s,/\b(CASCADE|DELETE FROM|TRUNCATE|DROP TABLE|VACUUM FULL|cron\.unschedule)\b/i);
assert.doesNotMatch(s,/x-ft-cron-key'\s*,\s*'[^']+[')]/);
console.log("PHASE46_SINGLE_DAILY_VAULT_BACKED_SOURCE_RETENTION_CRON_PASSED");
