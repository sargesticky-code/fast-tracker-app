import assert from "node:assert/strict";
import {predictNativeModel, scoreFromIndependentPoisson, poissonOver95, VERSION}
  from "../lib/fast-tracker-native-model.mjs";
const cutoff="2026-10-12T08:00:00Z",start="2026-10-13T20:00:00Z";
const rows=Array.from({length:96},(_,i)=>{
  const played=new Date(Date.parse("2026-08-01T18:00:00Z")+i*43200000).toISOString();
  return {source:"FS_VERIFIED",league:"leagueABC",
    homeId:["TeamA","TeamB","TeamC","TeamD"][i%4],
    awayId:["TeamB","TeamC","TeamD","TeamA"][i%4],
    hg:i%3,ag:(i+1)%3,hc:3+i%7,ac:4+i%4,
    playedAt:played,capturedAt:new Date(Date.parse(played)+7200000).toISOString()};
});
const p=predictNativeModel({history:rows,source:"FS_VERIFIED",league:"leagueABC",
  homeId:"TeamA",awayId:"TeamC",asOf:cutoff,kickoff:start});
assert.equal(p.status,"EXPERIMENTAL_UNCALIBRATED",JSON.stringify(p));
assert.equal(p.source,VERSION);
assert.equal(p.provenance,"PLAYED_AND_CAPTURED_BEFORE_ASOF");
assert.ok(Math.abs(p.home+p.draw+p.away-1)<1e-10);
assert.ok(Math.abs(p.over25+p.under25-1)<1e-10);
assert.ok(p.corners&&Math.abs(p.corners.over95+p.corners.under95-1)<1e-10);
assert.match(p.predictedScore,/^\d+-\d+$/);
const leaky=rows.map(r=>({...r,capturedAt:"2026-10-14T00:00:00Z"}));
assert.equal(predictNativeModel({history:leaky,source:"FS_VERIFIED",league:"leagueABC",
  homeId:"TeamA",awayId:"TeamC",asOf:cutoff,kickoff:start}).status,"INSUFFICIENT_LEAGUE_RESULTS");
const retrospective=predictNativeModel({history:leaky,source:"FS_VERIFIED",league:"leagueABC",
  homeId:"TeamA",awayId:"TeamC",asOf:cutoff,kickoff:start,retrospective:true});
assert.equal(retrospective.evaluationMode,"RETROSPECTIVE_ONLY");
assert.equal(retrospective.provenance,"PLAYED_BEFORE_ASOF_RETROSPECTIVE_ONLY");
assert.equal(predictNativeModel({history:rows,source:"FS_VERIFIED",league:"leagueABC",
  homeId:"TeamA",awayId:"TeamC",asOf:start,kickoff:start}).status,"NOT_PREMATCH");
assert.equal(predictNativeModel({history:rows,source:"FS_VERIFIED",league:"leagueXYZ",
  homeId:"TeamA",awayId:"TeamC",asOf:cutoff,kickoff:start}).status,"INSUFFICIENT_LEAGUE_RESULTS");
assert.equal(predictNativeModel({history:rows,source:"FS_VERIFIED",league:"leagueABC",
  homeId:"TeamA",awayId:"Unrecorded",asOf:cutoff,kickoff:start}).status,"INSUFFICIENT_TEAM_HISTORY");
assert.equal(predictNativeModel({history:rows,source:"FS_VERIFIED",league:"leagueABC",
  homeId:"TeamA",awayId:"TeamA",asOf:cutoff,kickoff:start}).status,"INVALID_IDENTITY");
assert.equal(predictNativeModel({history:rows.map(x=>({...x,playedAt:"2026-07-01T00:00:00Z"})),
 source:"FS_VERIFIED",league:"leagueABC",homeId:"TeamA",awayId:"TeamC",
 asOf:cutoff,kickoff:start}).status,"STALE_TRAINING_DATA");
assert.ok(scoreFromIndependentPoisson(1.2,0.8));
assert.equal(scoreFromIndependentPoisson(-1,1),null);
assert.ok(poissonOver95(10));
const noCorners=predictNativeModel({history:rows.map(x=>({...x,hc:null,ac:null})),
 source:"FS_VERIFIED",league:"leagueABC",homeId:"TeamA",awayId:"TeamC",
 asOf:cutoff,kickoff:start});
assert.equal(noCorners.corners,null);
console.log("INDEPENDENT_NATIVE_POISSON_CONTRACT_PASSED");
