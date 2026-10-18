import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {adviserPairId,adviserMismatchReport,readRejectedPairs,setRejectedPair,readConfirmedPairs,setConfirmedPair} from "../lib/adviser-pair-review.js";
const pairs=[
 {provider:"BETCLAN",sourceUrl:"https://www.betclan.com/predictionsdetails/football/1495988/odd-strommen/",sourceHome:"ODD Ballklubb",sourceAway:"Strommen"},
 {provider:"SPORTYTRADER",sourceUrl:"https://www.sportytrader.com/en/betting-tips/a-b-379602/",sourceHome:"Atlanta United",sourceAway:"Inter Miami"},
 {provider:"PRIMATIPS",sourceUrl:"https://primatips.com/tip/a-b-987654/",sourceHome:"Home",sourceAway:"Away"},
 {provider:"STATAREA",sourceUrl:"https://www.statarea.com/olddevices/prediction/2026-10-18/",sourceHome:"Home",sourceAway:"Away"}
];
const fid="FS:UilQ56TQ";
const storage=new Map();
const fake={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
assert.equal(readRejectedPairs(fake).size,0);
for(const p of pairs){
 const k=adviserPairId(fid,p);
 assert.match(k,new RegExp("^"+p.provider+"\\|FS:"));
 assert.equal(setRejectedPair(fake,fid,p,true),true);
 assert.ok(readRejectedPairs(fake).has(k));
 const report=adviserMismatchReport(fid,p,"Odd","Strommen","2026-10-18T15:00:00Z");
 for(const value of [p.provider,p.sourceUrl,fid,p.sourceHome,p.sourceAway,"Flashscore home: Odd"])
  assert.ok(report.includes(value),"report needs "+value);
}
assert.equal(readRejectedPairs(fake).size,4);
assert.equal(readConfirmedPairs(fake).size,0);
const firstKey=adviserPairId(fid,pairs[0]);
assert.equal(setConfirmedPair(fake,fid,pairs[0],true),true);
assert.ok(readConfirmedPairs(fake).has(firstKey));
assert.ok(!readRejectedPairs(fake).has(firstKey),"local confirm clears rejection");
assert.equal(setRejectedPair(fake,fid,pairs[0],true),true);
assert.ok(!readConfirmedPairs(fake).has(firstKey),"local rejection clears confirmation");
assert.equal(setConfirmedPair(fake,fid,pairs[0],true),true);
assert.equal(setConfirmedPair(fake,fid,pairs[0],false),false);
assert.ok(!readConfirmedPairs(fake).has(firstKey));
assert.equal(setConfirmedPair(fake,"BAD_ID",pairs[0],true),null);
assert.equal(setConfirmedPair(fake,fid,{...pairs[0],sourceUrl:"https://evil.invalid/"},true),null);
assert.equal(setRejectedPair(fake,fid,pairs[0],false),false);
assert.equal(readRejectedPairs(fake).size,3);
assert.equal(adviserPairId(fid,{...pairs[0],sourceUrl:"https://malicious.example/reject"}),null);
assert.equal(adviserMismatchReport("HACKED",pairs[0],"","",null),null);
assert.equal(setRejectedPair(fake,fid,{...pairs[0],provider:"UNKNOWN"},true),null);
const sql=readFileSync(new URL("../supabase/migrations/20261018015819_ft_20261018_reversible_adviser_pair_denials_private.sql",import.meta.url),"utf8");
assert.match(sql,/CREATE TABLE IF NOT EXISTS private\.ft_adviser_pair_rejections/);
assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
assert.match(sql,/REVOKE ALL ON private\.ft_adviser_pair_rejections FROM PUBLIC,anon,authenticated/);
assert.ok(!/GRANT (?:INSERT|ALL) ON private\.ft_adviser_pair_rejections TO (?:anon|authenticated|PUBLIC)/i.test(sql));
assert.equal((sql.match(/NOT EXISTS \(SELECT 1 FROM private\.ft_adviser_pair_rejections/g)||[]).length,4,
  "both periodic rechecks AND both public read RPCs must reject pairs");
assert.match(sql,/EXISTS \(SELECT 1 FROM private\.ft_adviser_pair_rejections rejected/);
for(const ref of ["rejected.provider=o.provider","rejected.source_url=o.source_url",
 "rejected.canonical_event_id=f.match_id","rejected.provider=s.provider",
 "rejected.source_url=s.source_url","rejected.provider=c.provider",
 "rejected.source_url=c.source_url","rejected.provider=p.provider",
 "rejected.source_url=s.source_url"])assert.ok(sql.includes(ref),"review key must be scoped: "+ref);
assert.ok(!sql.includes("DELETE FROM public.adviser_source_observations"));
const ui=readFileSync(new URL("../components/flashscore-raw-match.js",import.meta.url),"utf8");
assert.doesNotMatch(ui,/Reject this pairing locally|Verify this pairing|Undo my pairing verification|Undo local rejection|Copy correction report/);
assert.doesNotMatch(ui,/adviser-verify-|adviser-reject-|adviser-copy-report-|setConfirmedPair|adviserMismatchReport/);
assert.match(ui,/Daily alias table/);
assert.match(ui,/Provisional forecast/);
assert.doesNotMatch(ui,/SourceTeamComparison/);
assert.doesNotMatch(ui,/fetch\(.*reject|fetch\(.*moderation/i);
console.log("PHASE13_REJECTION_REVIEW_NO_PUBLIC_WRITES_PASSED");
