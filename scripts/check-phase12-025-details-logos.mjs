import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseExternalProvisional } from "../lib/external-adviser-provisional-feed.js";
import { parseExtraAdviserProvisional } from "../lib/extra-adviser-provisional-feed.js";

const now=Date.parse("2026-10-18T02:00:00Z");
const later=new Date(now+4*3600000).toISOString();
const recent=new Date(now-20*60000).toISOString();
const legacy={
 source:"ADVISER_PROVISIONAL_FLASHscore_0_25",
 quality:"PROVISIONAL_NOT_VERIFIED", generatedAt:new Date(now).toISOString(),
 rows:[{
 id:"FS:abcde123",provider:"BETCLAN",status:"PROVISIONAL_NOT_VERIFIED",
 sourceUrl:"https://www.betclan.com/predictionsdetails/football/1493745/example/",
 sourceHome:"Austin",sourceAway:"Some Opponent",
 homeSimilarity:0.25,awaySimilarity:0.28,leagueEvidence:"CORROBORATED",
 kickoff:later,lastChecked:recent,sourceCapturedAt:recent,
 hda:{home:.4,draw:.3,away:.3},predictedScore:"2-1",over25:.56,bttsYes:.64
 }]
};
let m=parseExternalProvisional(legacy,now);
assert.equal(m.get("FS:abcde123")?.length,1,"25% eligible within exact-clock league-evidence feed");
assert.equal(m.get("FS:abcde123")[0].status,"PROVISIONAL_NOT_VERIFIED");
assert.equal(parseExternalProvisional({...legacy,rows:[{...legacy.rows[0],leagueEvidence:"NEEDS_REVIEW"}]},now).size,0,
 "two weak names without independent league confirmation fail closed");
assert.equal(parseExternalProvisional({...legacy,rows:[{...legacy.rows[0],homeSimilarity:0.249}]},now).size,0,
 "below 25% rejected");
const extra={
 source:"EXTRA_ADVISER_PROVISIONAL_025",
 quality:"PROVISIONAL_NOT_VERIFIED_CALIBRATED_WALL_TIME",
 generatedAt:new Date(now).toISOString(),
 rows:[{
 id:"FS:abcde123",provider:"PRIMATIPS",status:"PROVISIONAL_NOT_VERIFIED",
 sourceUrl:"https://primatips.com/tip/a-b-123456/",
 sourceHome:"Example Home",sourceAway:"Example Away",
 kickoffTimezoneVerified:false,
 clockEvidence:"CALIBRATED_FROM_DAY_COHORT_NOT_SOURCE_VERIFIED",
 clockOffsetMinutes:-300,clockCalibrationSamples:12,clockCalibrationAgreement:.92,
 timeDeltaSeconds:35,homeSimilarity:.25,awaySimilarity:.27,leagueSimilarity:.63,
 leagueEvidence:"NAME_SIMILAR",kickoff:later,lastChecked:recent,sourceCapturedAt:recent,
 hda:{home:.4,draw:.3,away:.3},over25:.54,bttsYes:.52
 }]
};
m=parseExtraAdviserProvisional(extra,now);
assert.equal(m.get("FS:abcde123")?.[0]?.status,"PROVISIONAL_NOT_VERIFIED");
assert.equal(parseExtraAdviserProvisional({...extra,rows:[{...extra.rows[0],clockCalibrationAgreement:.85}]},now).size,0,"weak clock calibrations fail");
assert.equal(parseExtraAdviserProvisional({...extra,rows:[{...extra.rows[0],timeDeltaSeconds:120}]},now).size,0,"weak 25% match needs <=60s exact time");
assert.equal(parseExtraAdviserProvisional({...extra,rows:[{...extra.rows[0],leagueSimilarity:.2}]},now).size,0,"weak 25% match needs 50% league evidence");
const ui=readFileSync(new URL("../components/homepage-client.js",import.meta.url),"utf8");
const detail=readFileSync(new URL("../components/flashscore-raw-match.js",import.meta.url),"utf8");
assert.ok(ui.includes("adviser-details-link"));
assert.ok(!ui.includes("betclan-hda")&&!ui.includes("SourceTeamComparison")&&!ui.includes("ExternalProvisionalChip"),"other adviser market stats and comparisons no longer on homepage");
assert.ok(detail.includes("Match predictions and adviser statistics"));
assert.ok(detail.includes("AdviserReviewCard")&&detail.includes("Daily alias table")&&!detail.includes("<SourceTeamComparison"));
assert.ok(!detail.includes("Reject this pairing locally"),"owner deliberately retired pairing buttons");
assert.ok(detail.includes("TeamNameWithLogo"));
const registry=JSON.parse(readFileSync(new URL("../data/team-logo-aliases.json",import.meta.url)));
const guaranteed={
 "leverkusen":"bayer leverkusen","monchengladbach":"borussia monchengladbach",
 "alaves":"deportivo alaves","celta vigo":"celta",
 "le havre":"le havre ac","lorient":"lorient fc","lyon":"olympique lyonnais","monaco":"as monaco",
 "leeds":"leeds united","nottm forest":"nottingham forest","ac milan":"milan","como":"como 1907"
};
for(const [source,target] of Object.entries(guaranteed))assert.equal(registry.aliases[source],target);
const sql=readFileSync(new URL("../supabase/migrations/20261018013500_ft_adviser_provisional_025_review_only.sql",import.meta.url),"utf8");
assert.ok(sql.includes("home_similarity BETWEEN 0.25 AND 1"));
assert.ok(sql.includes("ADVISER_PROVISIONAL_FLASHscore_0_25"));
assert.ok(sql.includes("EXTRA_ADVISER_PROVISIONAL_025"));
for(const token of ["source_n=1 AND target_n=1","matching_targets=1 AND matching_sources=1","n>=10","n::numeric/total>=0.9","c.league_evidence='CORROBORATED'","p.league_similarity>=0.5 AND p.time_delta_seconds<=60","NOT EXISTS"])
  assert.ok(sql.includes(token),"preserve identity check: "+token);
assert.ok(!sql.includes("INSERT INTO public.adviser_prediction_current"),"no false verified promotion");
assert.ok(sql.includes("NOT_QUALIFIED_BY_CURRENT_SOURCE_CANONICAL_RECHECK"),"reversible provisionals");
console.log("PHASE12_ALL_FOUR_ADVISERS_025_DETAILS_LOGOS_QA_PASSED");
