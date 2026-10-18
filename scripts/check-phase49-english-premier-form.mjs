import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/migrations/20261018120209_phase49_english_premier_form_native_id_guard.sql",import.meta.url),"utf8");
for(const token of ["CREATE OR REPLACE FUNCTION public.ft_fast_flashscore_summary","f.league <> 'Premier League'",
"f.identity_authority='FLASHSCORE'","f.provider_identity_status='VERIFIED_IDENTITY'",
"public.phase15_source_shadow_current","s.source_key='FLASHSCORE'",
"s.league_external_id='SY30SsKF'","s.league_name='Premier League'",
"s.identity_status='VERIFIED_IDENTITY'","s.fetched_at>=now()-interval '7 days'",
"abs(extract(epoch from (s.kickoff_utc-f.kickoff_hkt)))<=60",
"s.home_name=f.home_en AND s.away_name=f.away_en",
"s.raw->>'AB'='1'"])
 assert.ok(sql.includes(token),"missing form identity guard "+token);
assert.equal(sql.split("s.league_external_id='SY30SsKF'").length,3,"gate both sides");
assert.equal(sql.split("public.ft_historical_form_by_team(").length,3);
assert.match(sql,/'historical_form_home',CASE WHEN \(/);
assert.match(sql,/'historical_form_away',CASE WHEN \(/);
assert.match(sql,/THEN public.ft_historical_form_by_team\(f\.home_en,f\.league,f\.kickoff_hkt\) ELSE NULL END/);
assert.match(sql,/THEN public.ft_historical_form_by_team\(f\.away_en,f\.league,f\.kickoff_hkt\) ELSE NULL END/);
assert.doesNotMatch(sql,/\b(DELETE FROM|DROP TABLE|TRUNCATE|VACUUM|cron\.schedule|INSERT INTO)\b/im);
console.log("PHASE49_NATIVE_ENGLISH_PREMIER_FORM_GATES_BOTH_SIDES_PASSED");
