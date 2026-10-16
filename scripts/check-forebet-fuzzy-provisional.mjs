import assert from "node:assert/strict";
import { provisionalMap } from "../lib/forebet-provisional-feed.js";
const now=Date.parse("2026-10-17T02:00:00Z");
const item={
 id:"FS:example0021", status:"PROVISIONAL_NOT_VERIFIED",
 kickoff:"2026-10-17T18:00:00Z", lastChecked:"2026-10-17T01:45:00Z",
 sourceUrl:"https://www.forebet.com/en/football/matches/team-a-team-b-701123",
 sourceHome:"Liverpoolz",sourceAway:"Man Ct",matchedSide:"SIMILARITY",
 nameSimilarities:[.91,.33],nameMethod:"NFKD_CASEFOLD_SEQUENCE_RATIO_V1",
 probabilities:[37,29,34],pick:"1",predictedScore:"2 - 1",avgGoals:2.9
};
const wrap=rows=>({
 source:"FOREBET_PROVISIONAL",quality:"PROVISIONAL_NOT_VERIFIED",
 generatedAt:"2026-10-17T02:00:00Z",rows
});
const parse=x=>provisionalMap(wrap(x),now);
assert.equal(parse([item]).get(item.id)?.matchedSide,"SIMILARITY");
assert.equal(parse([{...item,nameSimilarities:[.29,.91]}]).size,0);
assert.equal(parse([{...item,nameSimilarities:[.5,.55]}]).size,0);
assert.equal(parse([{...item,nameMethod:"SOURCE_ID_VERIFIED"}]).size,0);
assert.equal(parse([{...item,matchedSide:"VERIFIED"}]).size,0);
assert.equal(parse([{...item,lastChecked:"2026-10-15T02:00:00Z"}]).size,0);
assert.equal(parse([{...item,sourceUrl:"https://example.com/fake"}]).size,0);
assert.equal(parse([{...item,probabilities:[60,60,60]}]).size,0);
assert.equal(parse([item,item]).size,0);
const one={...item,matchedSide:"HOME",nameSimilarities:null,nameMethod:null};
assert.equal(parse([one]).get(item.id)?.matchedSide,"HOME");
assert.equal(parse([one]).get(item.id)?.acceptedForDisplay,true);
assert.equal(parse([one]).get(item.id)?.matchTier,"ACCEPTED_ONE_VERIFIED_TEAM");
assert.equal(parse([item]).get(item.id)?.acceptedForDisplay,false);
assert.equal(parse([item]).get(item.id)?.matchTier,"TENTATIVE_NAME_SIMILARITY");
assert.equal(parse([{...one,acceptedForDisplay:true,
  matchTier:"ACCEPTED_ONE_VERIFIED_TEAM"}]).size,1);
assert.equal(parse([{...one,acceptedForDisplay:false}]).size,0);
assert.equal(parse([{...item,acceptedForDisplay:true}]).size,0);
assert.equal(parse([{...item,matchTier:"ACCEPTED_ONE_VERIFIED_TEAM"}]).size,0);
assert.throws(()=>provisionalMap({...wrap([item]),source:"FOREBET_VERIFIED"},now),/invalid/);
console.log("PASS Forebet one-team accepted and 0.30 similarity tentative, strict verified untouched");