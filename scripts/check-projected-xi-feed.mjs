import assert from "node:assert/strict";
import fs from "node:fs";
import {verifiedSummaryMap} from "../lib/verified-evidence-feed.js";

const id="FS:8MQeSuQE";
const future=new Date(Date.now()+4*3600000).toISOString();
const past=new Date(Date.now()-3600000).toISOString();
function evidence(lineupCoverage,kickoff=future,overrides={}) {
  const payload={source:"flashscore-single-rpc-canonical",
    generatedAt:new Date().toISOString(),
    matches:[{id,kickoff,home:"Sevilla",away:"Osasuna",league:"LaLiga",
      sourceContext:{source:"FLASHSCORE",lineupAvailable:false,lineupCoverage,...overrides},
      externalAdvisers:[]}]};
  return verifiedSummaryMap(payload).byId.get(id);
}
const projected={source:"FOTMOB_PREDICTED",status:"PREDICTED_FULL",
  homeStarters:11,awayStarters:11,confirmedStarters:0};
assert.equal(evidence(projected).projectedXI,true);
assert.equal(evidence(projected).confirmedXI,false);
assert.equal(evidence({...projected,homeStarters:10}).projectedXI,false);
assert.equal(evidence({...projected,source:"UNKNOWN"}).projectedXI,false);
assert.equal(evidence({...projected,confirmedStarters:1}).projectedXI,false);
assert.equal(evidence(projected,past).projectedXI,false);
assert.equal(evidence(projected,future,{source:"OTHER"}).projectedXI,false);
assert.equal(evidence({homeStarters:11,awayStarters:11},future,{lineupAvailable:true}).confirmedXI,true);
assert.equal(evidence({homeStarters:11,awayStarters:11},future,{lineupAvailable:true}).projectedXI,false);
// Keep the backend contract strict even if UI code changes later.
const backend=fs.readFileSync("supabase/functions/app-phase1-feed/index.ts","utf8");
for(const guard of ["phase2_lineup_coverage_display_current","PREDICTED_FULL",
  "FOTMOB_PREDICTED",'Number(r.lineup_rows)!==22',
  "Math.abs(a-b)>60000","withProjectedLineupSummary"]) {
  assert.ok(backend.includes(guard),`Missing projected-XI backend guard: ${guard}`);
}
console.log("Projected XI contract: 9 checks passed");
