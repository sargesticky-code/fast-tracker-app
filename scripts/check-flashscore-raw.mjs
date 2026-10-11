import assert from "node:assert/strict";
import fs from "node:fs";
import { toFlashscoreRawFeed } from "../lib/flashscore-raw-feed.js";
const fixtures = Array.from({length:40}, (_,i) => ({provider_event_id:`event${i}`,home:`Home ${i}`,away:`Away ${i}`,fixture_date:"2026-10-11",time_text:i ? "15:30" : null,competition:"Premier League"}));
const capturedAt = new Date().toISOString();
const oldQuoteAt = new Date(Date.now()-25*60*1000).toISOString();
const feed = toFlashscoreRawFeed({source:"FLASHSCORE_BET365",captured_at:capturedAt,discovered:fixtures,fixtures:[{provider_event_id:"event1",hda:{home:2,draw:3,away:4},captured_at:capturedAt}]});
assert.equal(feed.matches.length,40);
assert.equal(feed.matches[0].kickoff,null);
assert.equal(feed.matches[0].odds.home,null);
assert.equal(feed.matches.find(m=>m.id==="FS:event1").odds.home,2);
assert.equal(feed.matches.find(m=>m.id==="FS:event1").quoteStatus,"FRESH");
const stale = toFlashscoreRawFeed({source:"FLASHSCORE_BET365",captured_at:capturedAt,discovered:fixtures,fixtures:[{provider_event_id:"event1",hda:{home:2,draw:3,away:4},captured_at:oldQuoteAt}]});
assert.equal(stale.matches.find(m=>m.id==="FS:event1").odds.home,null);
assert.equal(stale.matches.find(m=>m.id==="FS:event1").quoteStatus,"STALE");
assert.equal(feed.matches[0].sourceTime,null);
assert.equal(feed.matches[0].raw,fixtures[0]);
assert.equal(toFlashscoreRawFeed({source:"OTHER",discovered:fixtures}),null);
for(const root of ["app","components","lib","services"]){
 const retired = String.fromCharCode(104, 107, 106, 99);
 const walk=p=>{for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=`${p}/${e.name}`;if(e.isDirectory()&&!e.name.startsWith("."))walk(f);else if(/\.(js|ts|py|css)$/.test(f)) assert.ok(!new RegExp(retired,"i").test(fs.readFileSync(f,"utf8")),`Retired provider in ${f}`);}};walk(root);
}
console.log("Raw fixture identity, missing data, complete enumeration and provider removal checks passed");
