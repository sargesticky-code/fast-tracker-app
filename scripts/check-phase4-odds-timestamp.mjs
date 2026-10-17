import assert from "node:assert/strict";
import { validatedCompactQuote, verifiedSummaryMap } from "../lib/verified-evidence-feed.js";

// Regression: Supabase serializes timestamptz as +00:00, not necessarily Z.
// Old validator used /\\\\d/ and rejected all 280 live HDA quotes.
const row=(time,odds={home:3.5,draw:3.75,away:1.91})=>({
  id:"FS:SxpU5PzH",kickoff:"2026-10-18T08:40:00+00:00",
  home:"Central Coast Mariners",away:"Newcastle Jets",league:"A-League",
  odds,oddsCapturedAt:time,oddsLabel:"Bookmaker reference",
});
for(const stamp of [
  "2026-10-17T08:02:22.202649+00:00",
  "2026-10-17T08:02:22Z",
  "2026-10-17T16:02:22+08:00",
  "2026-10-17T03:02:22-05:00"
]){
  const parsed=validatedCompactQuote(row(stamp));
  assert.deepEqual([parsed?.home,parsed?.draw,parsed?.away],[3.5,3.75,1.91],stamp);
  assert.ok(parsed?.capturedAt?.endsWith("Z"),"normalized UTC ISO date");
}
assert.equal(validatedCompactQuote(row("2026-10-17T08:02:22")),null,"timezone-free timestamps disallowed");
assert.equal(validatedCompactQuote(row("2026-10-17T08:02:22+0800")),null,"malformed offset disallowed");
assert.equal(validatedCompactQuote(row("2026-10-17T08:02:22+99:99")),null,"invalid timezone disallowed");
assert.equal(validatedCompactQuote(row("2026-10-17T08:02:22+00:00",{home:null,draw:3.75,away:1.91})),null,"missing price remains unknown");
assert.equal(validatedCompactQuote(row("2026-10-17T08:02:22+00:00",{home:1,draw:3.75,away:1.91})),null,"invalid price rejected");
assert.equal(validatedCompactQuote({...row("2026-10-17T08:02:22+00:00"),odds:null}),null,"no made-up quote");

const data={source:"flashscore-single-rpc-canonical",generatedAt:new Date().toISOString(),
  matches:[row("2026-10-17T08:02:22.202649+00:00")]};
const parsed=verifiedSummaryMap(data);
assert.equal(parsed.byId.size,1,"real event ID must survive");
assert.deepEqual(
  [parsed.byId.get("FS:SxpU5PzH").quote?.home,parsed.byId.get("FS:SxpU5PzH").quote?.draw,parsed.byId.get("FS:SxpU5PzH").quote?.away],
  [3.5,3.75,1.91],"the full compact-feed mapping must preserve the actual bookmaker HDA"
);
console.log("PHASE4_ODDS_TIMESTAMP_CONTRACT_PASSED");
