import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validatedOddsMovement} from "../lib/verified-evidence-feed.js";
const now=Date.parse("2026-10-18T04:10:00Z");
const item={
 id:"FS:Very7654",kickoff:"2026-10-18T18:00:00Z",
 odds:{home:2.05,draw:3.4,away:3.4},oddsCapturedAt:"2026-10-18T04:04:00Z",
 oddsLabel:"Bookmaker reference",
 oddsMovement:{side:"H",current:2.05,prior:1.95,
 capturedAt:"2026-10-18T04:03:00Z",
 source:"FLASHSCORE_BET365",window:"1h"}
};
assert.deepEqual(validatedOddsMovement(item,now),{
 side:"H",change:0.1,direction:"up",current:2.05,prior:1.95,
 capturedAt:"2026-10-18T04:03:00.000Z",label:"Observed 1h decimal odds movement"
});
assert.equal(validatedOddsMovement({...item,oddsMovement:{...item.oddsMovement,current:1.88}},now),null,"reject move not matching current quote");
assert.equal(validatedOddsMovement({...item,oddsMovement:{...item.oddsMovement,source:"CHINA_500_SPF"}},now),null);
assert.equal(validatedOddsMovement({...item,oddsLabel:"China 500 reference"},now),null);
assert.equal(validatedOddsMovement({...item,oddsMovement:{...item.oddsMovement,capturedAt:"2026-10-18T03:00:00Z"}},now),null);
assert.equal(validatedOddsMovement({...item,oddsMovement:{...item.oddsMovement,prior:null}},now),null);
assert.equal(validatedOddsMovement({...item,oddsMovement:{...item.oddsMovement,side:"C"}},now),null);
assert.equal(validatedOddsMovement({...item,oddsMovement:{...item.oddsMovement,prior:2.05}},now),null);
assert.equal(validatedOddsMovement({...item,oddsCapturedAt:"2026-10-18T01:00:00Z"},now),null);
assert.equal(validatedOddsMovement({...item,kickoff:"2026-10-18T03:00:00Z"},now),null);
assert.equal(validatedOddsMovement({...item,oddsMovement:{...item.oddsMovement,prior:2.15}},now)?.direction,"down");
const edge=readFileSync(new URL("../supabase/functions/app-phase1-feed/index.ts",import.meta.url),"utf8");
const home=readFileSync(new URL("../components/homepage-client.js",import.meta.url),"utf8");
assert.match(edge,/db\.from\("odds_movement_feed_current"\)/);
assert.match(edge,/m\.oddsMovement\?\?null/);
assert.match(edge,/captured<Date\.now\(\)-30\*60_000/);
assert.match(edge,/movementById\.has\(id\)/);
assert.match(home,/data-testid="odds-movement"/);
assert.match(home,/ft-price-arrow/);
assert.match(home,/aria-label=\{type\+" decimal odds "/);
assert.match(home,/m\.evidence\.oddsMovement\.prior\.toFixed\(2\)/);
assert.match(home,/m\.quote\?\.type==="recent"/);
assert.match(home,/m\.evidence\.oddsMovement\.current/);
console.log("PHASE17_ODDS_MOVEMENT_INDEPENDENT_PRICE_HISTORY_PASSED");
