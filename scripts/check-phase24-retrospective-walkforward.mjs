import assert from "node:assert/strict";
import {evaluateFootballDataWalkForward} from "../lib/football-data-retrospective-evaluation.mjs";
const start=Date.parse("2025-08-01T15:00:00Z"),DAY=86400000;
const teams=Array.from({length:20},(_,i)=>"Club_"+i);
const history=Array.from({length:390},(_,i)=>({
 source:"FOOTBALL_DATA",league:"E0",homeId:teams[i%20],awayId:teams[(i+7)%20],
 hg:(i*7)%4,ag:(i*3)%3,
 playedAt:new Date(start+Math.floor(i/2)*DAY).toISOString(),
 capturedAt:"2026-10-18T12:00:00Z" // imported AFTER most target games
}));
const normal=evaluateFootballDataWalkForward({history,league:"E0"});
assert.equal(normal.status,"RETROSPECTIVE_EVALUATION_ONLY",JSON.stringify(normal));
assert.equal(normal.evaluationMode,"RETROSPECTIVE_ONLY");
assert.equal(normal.capturedBeforeHistoricalKickoff,false);
assert.equal(normal.neverCountAsIssuedPredictions,true);
assert.equal(normal.dcAndPiIndependent,false);
assert.ok(normal.evaluated>0);
assert.ok(normal.holdoutCandidates<=60);
for(const name of ["dc","pi","baseline"]){
  assert.ok(Number.isFinite(normal.metrics[name].logLoss));
  assert.ok(normal.metrics[name].logLoss>=0);
  assert.ok(Number.isFinite(normal.metrics[name].brier));
  assert.ok(normal.metrics[name].brier>=0&&normal.metrics[name].brier<=1);
}
const withFuture=[...history,...Array.from({length:4},(_,i)=>({
 ...history[i],homeId:"Future"+i,playedAt:"2028-01-02T12:00:00Z"
}))];
const historicCut=evaluateFootballDataWalkForward({history:withFuture,league:"E0",holdoutFraction:.2,maxFixtures:40});
assert.equal(historicCut.neverCountAsIssuedPredictions,true);
assert.equal(evaluateFootballDataWalkForward({history,league:"UNKNOWN"}).status,"INVALID_BACKTEST_REQUEST");
assert.equal(evaluateFootballDataWalkForward({history:history.slice(0,40),league:"E0"}).status,"INSUFFICIENT_RESULTS");
assert.equal(evaluateFootballDataWalkForward({history,league:"E0",holdoutFraction:1}).status,"INVALID_BACKTEST_REQUEST");
assert.equal(evaluateFootballDataWalkForward({history,league:"E0",maxFixtures:10000}).status,"INVALID_BACKTEST_REQUEST");
const mixed=[...history,...history.map(x=>({...x,league:"D1",homeId:x.homeId+"_D1",
  awayId:x.awayId+"_D1",hg:9,ag:0}))];
const independent=evaluateFootballDataWalkForward({history:mixed,league:"E0"});
assert.deepEqual(normal,independent,"other leagues must not train or contaminate holdout");
console.log("PHASE24_RETROSPECTIVE_WALKFORWARD_NO_LEAKAGE_PASSED",normal.evaluated);
