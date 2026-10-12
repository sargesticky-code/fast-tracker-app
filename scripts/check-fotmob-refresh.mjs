import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync("supabase/functions/phase15-source-scout/index.ts","utf8");
const migration=fs.readFileSync("supabase/migrations/20261012112500_ft_restore_bounded_fotmob_refresh_in_job32.sql","utf8");
for(const term of [
 'identityOnly=u.searchParams.get("mode")==="identity"',
 'const picked=identityOnly?[]:matchedForDetail.slice(0,MAX_DETAIL)',
 'mode:identityOnly?"identity":"full"'
]) assert.ok(source.includes(term),"missing lightweight identity contract: "+term);
for(const term of [
 "jobid=32","phase2-lineup-source-refresh","12,22,32,42,52 * * * *",
 "phase15-flashscore-scout?force=1","phase15-flashscore-scout?mode=score",
 "phase15-source-scout?mode=identity&force=1","phase2-fotmob-lineups",
 "extract(minute from (now() at time zone 'UTC'))=12",
 "mod(extract(hour from (now() at time zone 'UTC'))::integer,6)=0",
 "extract(minute from (now() at time zone 'UTC'))=22"
]) assert.ok(migration.includes(term),"missing job32 guard/schedule contract: "+term);
assert.ok(!/\bcron\.schedule\s*\(/.test(migration),"must not create another scheduled job");
assert.ok(!source.includes("FIRECRAWL"),"FotMob refresh must not add Firecrawl dependency");
console.log("BOUNDED_FOTMOB_REFRESH_CONTRACT_PASSED");
