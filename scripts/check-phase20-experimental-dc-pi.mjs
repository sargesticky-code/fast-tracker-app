import assert from "node:assert/strict";
import {predictFootballDataDcPi,dcScoreGrid,dcTau,DC_VERSION}
  from "../lib/fast-tracker-dixon-coles-experimental.mjs";
const day=86400000,cutoff="2026-10-18T04:00:00Z",
  kickoff="2026-10-18T13:00:00Z";
const teams=Array.from({length:12},(_,i)=>"Club_"+i);
const history=Array.from({length:240},(_,i)=>{
  const t=Date.parse("2026-07-25T08:00:00Z")+i*day/3;
  return {source:"FOOTBALL_DATA",league:"E0",
    homeId:teams[i%12],awayId:teams[(i+5)%12],
    hg:(i*7)%4,ag:(i*5)%3,hc:3+i%7,ac:4+i%3,
    playedAt:new Date(t).toISOString(),capturedAt:new Date(t+3600000).toISOString()};
});
const p=predictFootballDataDcPi({history,league:"E0",
 homeId:teams[0],awayId:teams[5],asOf:cutoff,kickoff});
assert.equal(p.status,"EXPERIMENTAL_NOT_VALIDATED",JSON.stringify(p));
assert.equal(p.modelVersion,DC_VERSION);
assert.equal(p.evaluationMode,"PROSPECTIVE_UNVERIFIED");
assert.equal(p.provenance,"PLAYED_AND_CAPTURED_BEFORE_ASOF");
assert.equal(p.releaseGate,"NOT_PROMOTED_NO_VERIFIED_ACCURACY");
assert.equal(p.trainingCount,240);
assert.equal(p.bookmakerUsed,false);
assert.equal(p.forebetUsed,false);
assert.equal(p.cornerPrediction,null);
assert.ok(p.rho>=-.15&&p.rho<=.15);
for(const model of [p.dc,p.pi]){
  assert.ok(Math.abs(model.home+model.draw+model.away-1)<1e-8);
  assert.ok(model.over25>model.over35&&model.over35>model.over45);
  assert.ok(model.home>0&&model.draw>0&&model.away>0);
  assert.match(model.mostLikelyScore,/^\d+-\d+$/);
}
assert.ok(Number.isFinite(p.pi.homeRating)&&Number.isFinite(p.pi.awayRating));
assert.equal(dcTau(0,0,1,1,-.1),1.1);
assert.equal(dcTau(0,1,1,1,-.1),.9);
assert.equal(dcTau(1,0,1,1,-.1),.9);
assert.equal(dcTau(1,1,1,1,-.1),1.1);
assert.equal(dcTau(2,2,1,1,-.1),1);
assert.equal(dcScoreGrid(1.45,1.15,.01)?.over35>0,true);
assert.equal(dcScoreGrid(-1,1,0),null);
assert.equal(dcScoreGrid(1,1,.5),null);
assert.equal(predictFootballDataDcPi({history,league:"D1",homeId:teams[0],
  awayId:teams[5],asOf:cutoff,kickoff}).status,"INSUFFICIENT_LEAGUE_RESULTS");
assert.equal(predictFootballDataDcPi({history,league:"E0",homeId:teams[0],
  awayId:"Nonexistent",asOf:cutoff,kickoff}).status,"INSUFFICIENT_TEAM_HISTORY");
assert.equal(predictFootballDataDcPi({history,league:"E0",homeId:teams[0],
  awayId:teams[0],asOf:cutoff,kickoff}).status,"INVALID_IDENTITY");
assert.equal(predictFootballDataDcPi({history,league:"E0",homeId:teams[0],
  awayId:teams[5],asOf:kickoff,kickoff}).status,"NOT_PREMATCH");
const leaked=history.map(x=>({...x,capturedAt:"2026-10-19T00:00:00Z"}));
assert.equal(predictFootballDataDcPi({history:leaked,league:"E0",homeId:teams[0],
  awayId:teams[5],asOf:cutoff,kickoff}).status,"INSUFFICIENT_LEAGUE_RESULTS");
const backtest=predictFootballDataDcPi({history:leaked,league:"E0",
  homeId:teams[0],awayId:teams[5],asOf:cutoff,kickoff,retrospective:true});
assert.equal(backtest.status,"EXPERIMENTAL_NOT_VALIDATED",JSON.stringify(backtest));
assert.equal(backtest.evaluationMode,"RETROSPECTIVE_ONLY");
assert.equal(backtest.sourceCapturedBeforeAsOf,false);
const afterKickoff=[...history,{...history[0],playedAt:"2026-10-18T19:00:00Z",
 capturedAt:"2026-10-18T20:00:00Z",hg:20}];
const rerun=predictFootballDataDcPi({history:afterKickoff,league:"E0",
 homeId:teams[0],awayId:teams[5],asOf:cutoff,kickoff});
assert.deepEqual(rerun,p,"later results must not change a frozen as-of forecast");
console.log("PHASE20_INDEPENDENT_DC_PI_SOURCE_AND_LEAKAGE_GATES_PASSED");
