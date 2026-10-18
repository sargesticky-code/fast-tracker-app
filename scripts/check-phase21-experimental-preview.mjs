import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {footballDataCodeForLeague,predictFlashscoreFixtureExperimental}
 from "../lib/fast-tracker-dixon-coles-experimental.mjs";
const original=readFileSync(new URL("../lib/fast-tracker-dixon-coles-experimental.mjs",import.meta.url),"utf8");
const bundled=readFileSync(new URL("../supabase/functions/app-phase1-feed/dc-experimental.mjs",import.meta.url),"utf8");
assert.equal(bundled,original,"deployed model must match offline audited code exactly");
const edge=readFileSync(new URL("../supabase/functions/app-phase1-feed/index.ts",import.meta.url),"utf8");
const page=readFileSync(new URL("../components/flashscore-raw-match.js",import.meta.url),"utf8");
const begin=edge.indexOf('if(requestedView==="experimental")');
const end=edge.indexOf("const adviserDb=createReadClientWithTimeout",begin);
assert.ok(begin>0&&end>begin);
const handler=edge.slice(begin,end);
for(const clause of [
'footballDataCodeForLeague(fixture.league)',
'predictFlashscoreFixtureExperimental({fixture,history,asOf})',
'.eq("match_id",fixtureId)',
'.eq("source_kind","RESULTS")',
'.eq("league_code",code)',
'.limit(250)',
'start<=now||start>now+48*3600000',
'now-fetched>36*3600000',
'String(r.match_date)+"T00:00:00Z"',
'verification:"EXPERIMENTAL_UNCALIBRATED_NOT_BACKTEST_VERIFIED"',
'automaticBettingAdvice:false'
])assert.ok(handler.includes(clause),"missing fail-closed read condition "+clause);
assert.ok(!/\.insert\(|\.upsert\(|\.update\(|\.delete\(|cron\.schedule/.test(handler),"no writes or cron on public model endpoint");
assert.ok(handler.length<5200,"keep this bounded to a single fixture");
assert.match(page,/data-testid="experimental-model-load"/);
assert.match(page,/onClick=\{requestExperimental\}/);
assert.match(page,/Math\.abs\(x\.home\+x\.draw\+x\.away-1\)<0\.02/);
assert.match(page,/EXPERIMENTAL_NOT_VALIDATED/);
assert.match(page,/NOT_PROMOTED_NO_VERIFIED_ACCURACY/);
assert.match(page,/not independent advisers/);
assert.equal(footballDataCodeForLeague("Premier League"),"E0");
assert.equal(footballDataCodeForLeague("Eredivisie"),"N1");
assert.equal(footballDataCodeForLeague("Liga Portugal"),"P1");
assert.equal(footballDataCodeForLeague("K League 1"),null);
console.log("PHASE21_SINGLE_FIXTURE_READ_ONLY_MODEL_PREVIEW_PASSED");
