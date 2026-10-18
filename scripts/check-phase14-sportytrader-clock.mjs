import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseExternalProvisional} from "../lib/external-adviser-provisional-feed.js";
const now=Date.parse("2026-10-18T03:30:00Z");
const row={
  id:"FS:r7ZNv3no",provider:"SPORTYTRADER",status:"PROVISIONAL_NOT_VERIFIED",
  sourceUrl:"https://www.sportytrader.com/en/betting-tips/bayer-leverkusen-freiburg-379879/",
  sourceHome:"Bayer Leverkusen",sourceAway:"Freiburg",
  homeSimilarity:1,awaySimilarity:1,leagueSimilarity:1,
  leagueEvidence:"CORROBORATED",
  kickoff:"2026-10-18T13:30:00Z",
  sourceCapturedAt:"2026-10-17T09:36:06Z",
  lastChecked:"2026-10-18T03:29:00Z",
  tip:"Under 3.5 goals",hda:null,predictedScore:null,over25:null,bttsYes:null,
  clockEvidence:"CALIBRATED_FROM_SPORTYTRADER_LINKED_EVENTS_NOT_SOURCE_VERIFIED",
  clockOffsetMinutes:-300,clockCalibrationSamples:6,clockCalibrationAgreement:1,
  kickoffTimezoneVerified:false,timeDeltaSeconds:0
};
const payload=rows=>({
 source:"ADVISER_PROVISIONAL_FLASHscore_0_25",quality:"PROVISIONAL_NOT_VERIFIED",
 generatedAt:new Date(now).toISOString(),rows
});
const run=rows=>parseExternalProvisional(payload(rows),now);
const good=run([row]).get(row.id);
assert.equal(good?.length,1,"text-only SportyTrader source tip must not be dropped");
assert.equal(good[0].tip,"Under 3.5 goals");
assert.equal(good[0].hda,null,"never invent a 1X2 probability");
assert.equal(good[0].status,"PROVISIONAL_NOT_VERIFIED");
assert.equal(good[0].clockOffsetMinutes,-300);
assert.equal(good[0].kickoffTimezoneVerified,false);
assert.equal(run([{...row,clockCalibrationSamples:3}]).size,0);
assert.equal(run([{...row,clockCalibrationAgreement:0.89}]).size,0);
assert.equal(run([{...row,leagueSimilarity:.4}]).size,0);
assert.equal(run([{...row,leagueEvidence:"NEEDS_REVIEW"}]).size,0);
assert.equal(run([{...row,clockEvidence:"CALIBRATED_FROM_SPORTYTRADER_LINKED_EVENTS_NOT_SOURCE_VERIFIED",kickoffTimezoneVerified:true}]).size,0);
assert.equal(run([{...row,homeSimilarity:.24}]).size,0);
assert.equal(run([{...row,timeDeltaSeconds:61}]).size,0);
assert.equal(run([{...row,tip:""}]).size,0);
assert.equal(run([row,row]).get(row.id)?.length,0,"colliding pairs cannot be shown");
const sql=readFileSync(new URL("../supabase/migrations/20261018043000_ft_sportytrader_linked_clock_provisional.sql",import.meta.url),"utf8");
for(const guard of [
 "count(distinct source_day)","n>=4 AND days>=2","calibration_agreement",
 "agreement>=0.9","AND f.identity_authority='FLASHSCORE'",
 "AND f.provider_identity_status='VERIFIED_IDENTITY'",
 "AND f.status='SCHEDULED'",
 "AND ls>=0.5","source_matches=1 AND target_sources=1",
 "ft_adviser_pair_rejections","SOURCE_KICKOFF_WRONG_DO_NOT_INFER"
 ]){if(guard==="SOURCE_KICKOFF_WRONG_DO_NOT_INFER")continue;assert.ok(sql.includes(guard),guard);}
assert.match(sql,/PERFORM private\.ft_recheck_sportytrader_calibrated_05\(\)/);
assert.ok(sql.includes("NOT EXISTS(SELECT 1 FROM private.ft_adviser_pair_rejections"));
assert.ok(sql.includes("clockEvidence','CALIBRATED_FROM_SPORTYTRADER_LINKED_EVENTS_NOT_SOURCE_VERIFIED"));
assert.ok(sql.includes("jsonb_typeof(c.observation->'hda'->'home')='number'"));
assert.ok(sql.includes("jsonb_typeof(c.observation->'hda'->'draw')='number'"));
assert.ok(sql.includes("jsonb_typeof(c.observation->'hda'->'away')='number'"));
assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,3);
assert.equal((sql.match(/\$function\$;/g)||[]).length,3);
assert.equal((sql.match(/SELECT jsonb_build_object\(\s*'source','ADVISER_PROVISIONAL_FLASHscore_0_25'/g)||[]).length,1);

assert.ok(!sql.includes("INSERT INTO public.adviser_prediction_current"));
assert.ok(!sql.includes("cron.schedule"));
const ui=readFileSync(new URL("../components/flashscore-raw-match.js",import.meta.url),"utf8");
assert.ok(ui.includes('data-testid="sportytrader-time-calibrated"'));
assert.ok(ui.includes("Reject this pairing locally"));
console.log("PHASE14_CALIBRATED_SPORTYTRADER_REVIEW_AND_TIP_ONLY_PASSED");
