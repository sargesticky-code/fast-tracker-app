import assert from "node:assert/strict";
import {parseExternalProvisional} from "../lib/external-adviser-provisional-feed.js";

const now = Date.parse("2026-10-16T12:00:00Z");
const fixture = {
  id:"FS:ZxA01489",provider:"BETCLAN",status:"PROVISIONAL_NOT_VERIFIED",
  sourceUrl:"https://www.betclan.com/predictionsdetails/football/1492782/test-v-test/",
  homeSimilarity:0.41,awaySimilarity:0.53,leagueEvidence:"CORROBORATED",
  kickoff:"2026-10-16T18:00:00Z",
  sourceCapturedAt:"2026-10-16T09:30:00Z",
  lastChecked:"2026-10-16T11:30:00Z",
  sourceHome:"Warta Poznan",sourceAway:"Vitesse",
  hda:{home:.35,draw:.3,away:.35},predictedScore:"1-2",over25:.65,bttsYes:.54,
};
const wrap=rows=>({
  source:"ADVISER_PROVISIONAL_FLASHscore_0_4",
  quality:"PROVISIONAL_NOT_VERIFIED",
  generatedAt:"2026-10-16T12:00:00Z",rows
});
const run=rows=>parseExternalProvisional(wrap(rows),now);
assert.equal(run([fixture]).get(fixture.id)?.length,1);
// 30% floor: one stronger (70%+) side and corroborated league is mandatory.
assert.equal(run([{...fixture,homeSimilarity:.29,awaySimilarity:.83}]).size,0);
assert.equal(run([{...fixture,homeSimilarity:.35,awaySimilarity:.82,leagueEvidence:"CORROBORATED"}]).get(fixture.id)?.length,1);
assert.equal(run([{...fixture,homeSimilarity:.35,awaySimilarity:.82,leagueEvidence:"NEEDS_REVIEW"}]).size,0);
assert.equal(run([{...fixture,homeSimilarity:.35,awaySimilarity:.65,leagueEvidence:"CORROBORATED"}]).size,0);
assert.equal(run([{...fixture,status:"VERIFIED"}]).size,0);
assert.equal(run([{...fixture,kickoff:"2026-10-15T18:00:00Z"}]).size,0);
assert.equal(run([{...fixture,sourceUrl:"https://example.com/fake"}]).size,0);
assert.equal(run([{...fixture,hda:{home:.95,draw:.8,away:.8},
                   predictedScore:null,over25:null,bttsYes:null}]).size,0);
assert.equal(run([fixture,fixture]).get(fixture.id)?.length,0);
assert.equal(run([{...fixture,leagueEvidence:"NEEDS_REVIEW"}]).get(fixture.id)?.length,1);
assert.throws(()=>parseExternalProvisional(
  {...wrap([fixture]),generatedAt:"2026-10-15T10:00:00Z"},now),/stale/);
console.log("PASS: 0.3 gated adviser provisional is display only, validated, unique, and fail-closed");
