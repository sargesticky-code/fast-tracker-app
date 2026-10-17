import assert from "node:assert/strict";
import { validatedEarlierBookmakerQuote, verifiedSummaryMap } from "../lib/verified-evidence-feed.js";

const now=Date.now();
const id="FS:SxpU5PzH", capture=(ageMin)=>new Date(now-ageMin*60000).toISOString();
const fixture=(shiftMin=120)=>({
  id, kickoff:new Date(now+shiftMin*60000).toISOString(),home:"C. Coast Mariners",
  away:"Newcastle Jets",league:"A-League",odds:{home:null,draw:null,away:null},
  oddsCapturedAt:null,sourceContext:{source:"FLASHSCORE"},
});
const prior=(opts={})=>({
  id,source:"FLASHSCORE_BET365",quoteType:"EARLIER_REFERENCE_ONLY",
  capturedAt:capture(75),odds:{home:3.5,draw:3.75,away:1.91},...opts
});
const mapping=(match,history)=>verifiedSummaryMap({
  source:"flashscore-single-rpc-canonical",generatedAt:new Date(now).toISOString(),
  matches:[match],previousBookmakerQuotes:history
});
const item=fixture();
const seen=validatedEarlierBookmakerQuote(prior(),item,now);
assert.deepEqual([seen?.home,seen?.draw,seen?.away],[3.5,3.75,1.91]);
assert.equal(seen.label,"Earlier Bet365 reference");
assert.equal(mapping(item,[prior()]).byId.get(id)?.quote?.label,"Earlier Bet365 reference");
assert.deepEqual(mapping(item,[prior()]).byId.get(id)?.quote?.home,3.5);

for(const [what,row,match] of [
  ["fresh observation must use CURRENT lane",prior({capturedAt:capture(5)}),item],
  ["older than one day",prior({capturedAt:capture(24*60+1)}),item],
  ["no capture time",prior({capturedAt:""}),item],
  ["bad timezone",prior({capturedAt:"2026-10-17T08:55:00"}),item],
  ["future capture",prior({capturedAt:new Date(now+2*60000).toISOString()}),item],
  ["invalid canonical ID",prior({id:"NotFs:SxpU5PzH"}),item],
  ["missing provenance",prior({source:"UNKNOWN"}),item],
  ["wrong quote semantics",prior({quoteType:"LIVE"}),item],
  ["other fixture ID",prior({id:"FS:AnotherID99"}),item],
  ["missing complete triplet",prior({odds:{home:3.5,draw:null,away:1.91}}),item],
  ["non-numeric prices",prior({odds:{home:"3.5",draw:3.75,away:1.91}}),item],
  ["past kickoff",prior(),fixture(-5)],
  ["same-minute kickoff",prior(),fixture(0)],
  ["untrusted source fixture",prior(),{...item,sourceContext:{source:"OTHER"}}],
]){
  assert.equal(validatedEarlierBookmakerQuote(row,match,now),null,what);
}
assert.equal(mapping(item,[prior(),prior()]).byId.get(id).quote,null,
 "Duplicate history is ambiguous and must fail closed");
assert.equal(mapping(item,[prior({odds:{home:0,draw:3.75,away:1.91}})]).byId.get(id).quote,null,
 "Invalid old prices do not become current quotes");
const currentFixture={...item,odds:{home:2.1,draw:3.2,away:3.8},
  oddsCapturedAt:capture(7)};
const preferred=mapping(currentFixture,[prior()]).byId.get(id).quote;
assert.equal(preferred.home,2.1,"fresh canonical quote wins");
assert.equal(preferred.label,"Bookmaker reference");
assert.equal(mapping(item,[]).byId.get(id).quote,null,"no history means unknown");

console.log("PHASE6_HISTORICAL_BOOKMAKER_REFERENCE_QA_PASSED");
