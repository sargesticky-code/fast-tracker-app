import assert from "node:assert/strict";
import fs from "node:fs";
import {scoreFromIndependentPoisson} from "../lib/fast-tracker-native-model.mjs";
const m=fs.readFileSync("supabase/migrations/20261012101000_ft_native_fd_pregame_score.sql","utf8");
const f=fs.readFileSync("supabase/migrations/20261012101300_ft_native_e1_immutable_prospective_freeze.sql","utf8");
const a=fs.readFileSync("supabase/migrations/20261012101600_ft_native_prospective_eval.sql","utf8");
for(const [label,sql,terms] of [
 ["scorer",m,[
 "fetched_at<=p_asof","first_seen_at<=p_asof","match_date<(p_asof AT TIME ZONE 'UTC')::date",
 "IF v_n<60","h_tot<6 OR a_tot<6 OR h_n<2 OR a_n<2","v_latest",
 "trainingFingerprint","baselineHome","factorial(i)","EXPERIMENTAL_UNCALIBRATED"]],
 ["freeze",f,[
 "ft_native_prospective_frozen","CHECK(frozen_at<kickoff_utc-interval '30 minutes')",
 "ON CONFLICT(canonical_event_id,model_version) DO NOTHING","NATIVE_FORECAST_IMMUTABLE",
 "s.league_external_id='Q74g9dNP'","fd.source_competition='E1'",
 "fs.provider_team_id=rec.home_external_id","fs.provider_team_id=rec.away_external_id",
 "array_length(home_matches,1) IS DISTINCT FROM 1","experimental_not_for_public_ui",
 "cron.alter_job(48","730 days"]],
 ["evaluation",a,[
 "private.ft_verified_flashscore_results","r.league_id=f.fs_league_id",
 "r.home_team_id=f.evidence->>'flashscore_home_team_id'",
 "r.away_team_id=f.evidence->>'flashscore_away_team_id'",
 "verified_finished>=100","INSUFFICIENT_PROSPECTIVE_SAMPLE",
 "league_baseline_multiclass_brier"]]
]){
 for(const t of terms) assert.ok(sql.includes(t),label+": absent "+t);
 assert.ok(!sql.includes("cron.schedule"),"No new cron schedules");
}
assert.ok(!f.includes("REFERENCES public.matches"),"Immutable predictions must outlive fixture cleanup");
assert.ok(!f.includes("REFERENCES private.matches"),"No active fixture FK");
for(const [home,away] of [[1.27623715996922,1.16622318722837],[1.7,0.8]]){
 const result=scoreFromIndependentPoisson(home,away);
 assert.ok(result&&Math.abs(result.home+result.draw+result.away-1)<1e-9);
}
const actual=scoreFromIndependentPoisson(1.27623715996922,1.16622318722837);
for(const [key,ref] of [["home",0.389839886273309],["draw",0.273258636707749],["away",0.336901477018943],["over25",0.44134446924984]]){
 assert.ok(Math.abs(actual[key]-ref)<1e-10,"JS-SQL verified E1 parity "+key);
}
console.log("NATIVE_PROSPECTIVE_FROZEN_CONTRACT_PASSED");
