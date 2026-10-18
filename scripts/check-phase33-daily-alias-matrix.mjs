import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/migrations/20261018081028_phase34_recover_daily_alias_original_rpc.sql",import.meta.url),"utf8");
for(const word of ["ft_daily_alias_audit","Asia/Hong_Kong","flashscore_primary_fixture_current","forebet_prediction_current","forebet_provisional_feed_current","adviser_prediction_current","ft_adviser_provisional_05","ft_extra_adviser_provisional_04","ft_extra_adviser_source_observations","jsonb_object_agg","grant execute on function public.ft_daily_alias_audit(date) to service_role"]){
 assert.ok(sql.includes(word),word);
}
assert.match(sql,/revoke all on function public\.ft_daily_alias_audit\(date\) from PUBLIC,anon,authenticated/);
assert.doesNotMatch(sql,/^(?!\s*--).*\b(DELETE FROM|TRUNCATE|DROP TABLE|INSERT INTO|CREATE TABLE|cron\.schedule)\b/im);
const component=readFileSync(new URL("../components/flashscore-raw-match.js",import.meta.url),"utf8");
assert.doesNotMatch(component,/<SourceTeamComparison/);
assert.match(component,/Daily alias table/);
const page=readFileSync(new URL("../app/aliases/page.js",import.meta.url),"utf8");
assert.match(page,/DailyAliasMatrix/);
const endpoint=readFileSync(new URL("../supabase/functions/daily-alias-matrix/index.ts",import.meta.url),"utf8");
assert.match(endpoint,/req.method!=="GET"/);
assert.match(endpoint,/ft_daily_alias_audit/);
const ui=readFileSync(new URL("../components/daily-alias-matrix.js",import.meta.url),"utf8");
assert.match(ui,/window\.location\.search/);
assert.match(ui,/query\.get\("date"\)/);
console.log("PHASE33_DAILY_ALIAS_MATRIX_PRIVILEGED_READONLY_AND_SINGLE_SOURCE_PASSED");