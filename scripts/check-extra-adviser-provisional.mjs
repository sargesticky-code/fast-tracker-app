import assert from "node:assert/strict";
import { parseExtraAdviserProvisional } from "../lib/extra-adviser-provisional-feed.js";
import { reviewAdviserSourceTeams } from "../lib/adviser-source-team-review.js";
import { readFileSync } from "node:fs";
const now=Date.parse("2026-10-16T12:00:00Z");
const baseline={
 id:"FS:2wo3m634",provider:"PRIMATIPS",status:"PROVISIONAL_NOT_VERIFIED",
 kickoff:"2026-10-17T14:00:00Z",sourceUrl:"https://primatips.com/tip/fulham-hull-city-949985",
 sourceHome:"Fulham",sourceAway:"Hull City",homeSimilarity:1,awaySimilarity:.4,leagueSimilarity:.8,
 sourceCapturedAt:"2026-10-16T11:00:00Z",lastChecked:"2026-10-16T11:30:00Z",
 leagueEvidence:"NAME_SIMILAR",clockEvidence:"CALIBRATED_FROM_DAY_COHORT_NOT_SOURCE_VERIFIED",
 kickoffTimezoneVerified:false,clockOffsetMinutes:60,clockCalibrationSamples:40,
 clockCalibrationAgreement:0.99,timeDeltaSeconds:0,
 hda:{home:.41,draw:.26,away:.33},over25:null,bttsYes:null
};
const wrap=(rows)=>({
 source:"EXTRA_ADVISER_PROVISIONAL_04",
 quality:"PROVISIONAL_NOT_VERIFIED_CALIBRATED_WALL_TIME",
 generatedAt:"2026-10-16T12:00:00Z",rows
});
const parse=rows=>parseExtraAdviserProvisional(wrap(rows),now);
assert.equal(parse([baseline]).get(baseline.id)?.length,1);
assert.equal(parse([{...baseline,homeSimilarity:.29}]).size,0);
assert.equal(parse([{...baseline,homeSimilarity:.35,awaySimilarity:.85,leagueSimilarity:.6,timeDeltaSeconds:40}]).get(baseline.id)?.length,1);
assert.equal(parse([{...baseline,homeSimilarity:.35,awaySimilarity:.85,leagueSimilarity:.2,timeDeltaSeconds:40}]).size,0);
assert.equal(parse([{...baseline,homeSimilarity:.35,awaySimilarity:.85,leagueSimilarity:.6,timeDeltaSeconds:70}]).size,0);
assert.equal(parse([{...baseline,homeSimilarity:.35,awaySimilarity:.45,leagueSimilarity:.6,timeDeltaSeconds:40}]).size,0);
assert.equal(parse([{...baseline,status:"VERIFIED"}]).size,0);
assert.equal(parse([{...baseline,kickoffTimezoneVerified:true}]).size,0);
assert.equal(parse([{...baseline,clockEvidence:"VERIFIED_SOURCE_TIMEZONE"}]).size,0);
assert.equal(parse([{...baseline,clockCalibrationSamples:9}]).size,0);
assert.equal(parse([{...baseline,clockCalibrationAgreement:.88}]).size,0);
assert.equal(parse([{...baseline,timeDeltaSeconds:310}]).size,0);
assert.equal(parse([{...baseline,sourceUrl:"https://example.org/fake"}]).size,0);
assert.equal(parse([{...baseline,hda:{home:0.9,draw:.5,away:.5}}]).size,0);
assert.equal(parse([baseline,baseline]).get(baseline.id)?.length,0);
const statarea={...baseline,provider:"STATAREA",
 sourceUrl:"https://www.statarea.com/olddevices/prediction/2026-10-17/",
 clockOffsetMinutes:-240,over25:.58,bttsYes:.61};
const combined=parse([baseline,statarea]);
assert.equal(combined.get(baseline.id)?.length,2);
assert.equal(combined.get(baseline.id)[1].over25,.58);
assert.equal(combined.get(baseline.id)[1].bttsYes,.61);
assert.throws(()=>parseExtraAdviserProvisional({...wrap([baseline]),
 generatedAt:"2026-10-15T12:00:00Z"},now),/stale/);
console.log("PASS calibrated 0.3 gated adviser source evidence, unique candidate contract, no false verified promotion");

// Human-readable pair comparison must never silently certify provisional matches.
const compare=(sourceHome,sourceAway,home,away)=>
  reviewAdviserSourceTeams({sourceHome,sourceAway},home,away);
assert.equal(compare("Liverpool","Brentford","Liverpool","Brentford").code,"same");
assert.match(compare("Liverpool","Brentford","Liverpool","Brentford").label,/provisional/i);
assert.equal(compare("Brentford","Liverpool","Liverpool","Brentford").code,"reversed");
assert.equal(compare("Newcastle United","Aston Villa","Newcastle","Aston Villa").code,"different");
assert.equal(compare("Shafa Baku","Shamakhi","Shamakhi","Safa Baku").code,"different");
assert.equal(compare("","","Newcastle","Aston Villa").code,"unknown");
assert.equal(compare("Bayern München","Borussia Dortmund","Bayern Munchen","Borussia Dortmund").code,"same");
assert.equal(combined.get(baseline.id)[0].sourceHome,"Fulham");
assert.equal(combined.get(baseline.id)[0].sourceAway,"Hull City");
for(const path of ["../components/homepage-client.js","../components/flashscore-raw-match.js"]){
  const source=readFileSync(new URL(path,import.meta.url),"utf8");
  assert.match(source,/SourceTeamComparison/);
  assert.match(source,/flashscoreHome=/);
  assert.match(source,/flashscoreAway=/);
}
const comparison=readFileSync(new URL("../components/adviser-source-team-comparison.js",import.meta.url),"utf8");
assert.match(comparison,/candidate.sourceHome/);
assert.match(comparison,/candidate.sourceAway/);
assert.match(comparison,/Names|name/i);
console.log("PASS source H/A vs Flashscore H/A visible on fixture list and details; difference/reversal review-only");
