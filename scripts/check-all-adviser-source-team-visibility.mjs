import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reviewAdviserSourceTeams} from "../lib/adviser-source-team-review.js";
import {currentExternalAdvisers} from "../lib/verified-evidence-feed.js";

// Upstream exact fixture identity must be preserved, independent of spelling.
const now=Date.parse("2026-10-17T14:00:00Z");
const base={
 provider:"BETCLAN",id:"FS:42ti0Di4",identityStatus:"VERIFIED",
 sourceHome:"Houston Dynamo",sourceAway:"FC Dallas",
 sourceUrl:"https://www.betclan.com/predictionsdetails/football/1490549/houston-dynamo-v-fc-dallas-prediction-h2h-tip-and-match-preview/",
 kickoff:"2026-10-18T00:30:00Z",capturedAt:"2026-10-17T09:36:06Z",
 hda:{home:.47,draw:.25,away:.28},predictedScore:"3-2",over25:.57,bttsYes:.61
};
const item={id:base.id,kickoff:base.kickoff,externalAdvisers:[base]};
const filtered=currentExternalAdvisers(item,now);
assert.equal(filtered.length,1,"actual BetClan verified source must reach display");
assert.deepEqual([filtered[0].sourceHome,filtered[0].sourceAway],
 ["Houston Dynamo","FC Dallas"]);
const verified=reviewAdviserSourceTeams(filtered[0],"Houston Dynamo","FC Dallas");
assert.equal(verified.code,"same");
assert.match(verified.label,/verified/i);
const alias=reviewAdviserSourceTeams({...filtered[0],sourceAway:"FC Dallas USA"},
 "Houston Dynamo","FC Dallas");
assert.equal(alias.code,"different");
assert.match(alias.label,/aliases/i);
assert.match(alias.label,/verified/i);
const reversed=reviewAdviserSourceTeams({...filtered[0],sourceHome:"FC Dallas",sourceAway:"Houston Dynamo"},
 "Houston Dynamo","FC Dallas");
assert.equal(reversed.code,"reversed");
const provisional=reviewAdviserSourceTeams({...filtered[0],identityStatus:"PROVISIONAL_NOT_VERIFIED"},
 "Houston Dynamo","FC Dallas");
assert.match(provisional.label,/provisional/i);
assert.doesNotMatch(provisional.label,/independently verified/i);
const sporty={...base,provider:"SPORTYTRADER",sourceHome:"Test H",sourceAway:"Test A",
 sourceUrl:"https://www.sportytrader.com/en/betting-tips/test-h-test-a-123456/",
 predictedScore:null};
assert.equal(currentExternalAdvisers({
 id:base.id,kickoff:base.kickoff,externalAdvisers:[sporty]
},now).length,1);
assert.equal(currentExternalAdvisers({
 id:base.id,kickoff:base.kickoff,
 externalAdvisers:[{...base,identityStatus:"PROVISIONAL_NOT_VERIFIED"}]
},now).length,0,"never falsely certify provisional results");
const comp=readFileSync(new URL("../components/adviser-source-team-comparison.js",import.meta.url),"utf8");
const home=readFileSync(new URL("../components/homepage-client.js",import.meta.url),"utf8");
const details=readFileSync(new URL("../components/flashscore-raw-match.js",import.meta.url),"utf8");
assert.match(comp,/BETCLAN:"BetClan"/);
assert.match(comp,/SPORTYTRADER:"SportyTrader"/);
assert.match(comp,/verified-provider-fixture-identity/);
assert.match(home,/adviser-details-link/);
assert.match(details,/SourceTeamComparison/);
assert.match(details,/<SourceTeamComparison candidate=/,
 "existing PrimaTips/Statarea comparisons retained in match Details");
console.log("ALL_FOUR_ADVISERS_SOURCE_HA_COMPARISON_PASSED");
