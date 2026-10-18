import assert from "node:assert/strict";
import{readFileSync}from"node:fs";
const s=readFileSync(new URL("./sql/phase48-schedule-odds-retention-6h.sql",import.meta.url),"utf8");
for(const k of ["ft-odds-history-archive-retire-6h","7 */6 * * *","net.http_post(",
"odds-cold-retire","fast_tracker_cron_secret","vault.decrypted_secrets",
"body:='{}'::jsonb","timeout_milliseconds:=120000","ODDS_RETENTION_JOB_ALREADY_EXISTS",
"ODDS_RETENTION_VAULT_KEY_MISSING"])assert.ok(s.includes(k),"missing: "+k);
assert.equal(s.split("cron.schedule(").length,2);
assert.doesNotMatch(s,/\b(DELETE FROM|DROP TABLE|TRUNCATE|VACUUM FULL|CASCADE|cron\.unschedule)\b/i);
console.log("PHASE48_BOUNDED_ODDS_STORAGE_MAINTENANCE_NO_EXTRA_SCRAPE_PASSED");
