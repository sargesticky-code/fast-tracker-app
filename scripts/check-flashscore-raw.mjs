import assert from "node:assert/strict";
import fs from "node:fs";
import { toFlashscoreRawFeed } from "../lib/flashscore-raw-feed.js";
const fixtures = Array.from({length:40}, (_,i) => ({provider_event_id:`event${i}`,home:`Home ${i}`,away:`Away ${i}`,fixture_date:"2026-10-11",time_text:i ? "15:30" : null,competition:"Premier League"}));
const capturedAt = new Date().toISOString();
const oldQuoteAt = new Date(Date.now()-25*60*1000).toISOString();
const feed = toFlashscoreRawFeed({source:"FLASHSCORE_BET365",captured_at:capturedAt,discovered:fixtures,fixtures:[{provider_event_id:"event1",hda:{home:2,draw:3,away:4},captured_at:capturedAt}]});
assert.equal(feed.matches.length,40);
assert.equal(feed.matches[0].kickoff,null);
assert.equal(feed.matches[0].odds.home,null);
assert.equal(feed.matches.find(m=>m.id==="FS:event1").odds.home,2);
assert.equal(feed.matches.find(m=>m.id==="FS:event1").quoteStatus,"FRESH");
const stale = toFlashscoreRawFeed({source:"FLASHSCORE_BET365",captured_at:capturedAt,discovered:fixtures,fixtures:[{provider_event_id:"event1",hda:{home:2,draw:3,away:4},captured_at:oldQuoteAt}]});
assert.equal(stale.matches.find(m=>m.id==="FS:event1").odds.home,null);
assert.equal(stale.matches.find(m=>m.id==="FS:event1").quoteStatus,"STALE");
assert.equal(feed.matches[0].sourceTime,null);
assert.equal(feed.matches[0].raw,fixtures[0]);
assert.equal(toFlashscoreRawFeed({source:"OTHER",discovered:fixtures}),null);
for(const root of ["app","components","lib","services"]){
 const retired = String.fromCharCode(104, 107, 106, 99);
 const walk=p=>{for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=`${p}/${e.name}`;if(e.isDirectory()&&!e.name.startsWith("."))walk(f);else if(/\.(js|ts|py|css)$/.test(f)) assert.ok(!new RegExp(retired,"i").test(fs.readFileSync(f,"utf8")),`Retired provider in ${f}`);}};walk(root);
}
const dbFix=fs.readFileSync("supabase/migrations/20261012015445_ft_flashscore_registry_from_verified_shadow_in_existing_bookmaker_job_20261012.sql","utf8");
for (const clause of [
  "ft_stage_verified_flashscore_from_snapshot",
  "SOURCE_INVALID","SNAPSHOT_FIXTURE_BUDGET_INVALID",
  "s.kickoff_utc<now()+interval '48 hours'",
  "s.fetched_at>=now()-interval '45 minutes'",
  "ON CONFLICT(canonical_event_id) DO NOTHING",
  "to_timestamp(provider_epoch::double precision)>now()",
  "NO_UPCOMING_BOOKMAKER_QUOTES",
  "greatest(1,ceil(coalesce(v_upcoming,0)*0.90)::int)",
  "REVOKE ALL ON FUNCTION private.ft_stage_verified_flashscore_from_snapshot"
]) assert.ok(dbFix.includes(clause),"Missing canonical safety clause: "+clause);
assert.equal((dbFix.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,2,"Only two bounded functions may change");
assert.ok(!dbFix.includes("cron.schedule"),"No new cron schedule allowed");
const archiveSQL = fs.readFileSync("supabase/migrations/20261012050500_ft_forebet_verified_180day_independent_archive.sql","utf8");
for(const contract of [
  "DROP CONSTRAINT forebet_archive_hkjc_event_id_fkey",
  "ft_archive_verified_forebet_event",
  "AFTER INSERT OR UPDATE ON public.forebet_predictions",
  "f.fetched_at <= m.kickoff_hkt",
  "COALESCE(f.match_score,0)>=0.94",
  "ON CONFLICT(match_id,captured_at) DO UPDATE",
  "cron.alter_job(48",
  "180 days",
  "REVOKE ALL ON FUNCTION private.ft_archive_verified_forebet_event"
]) assert.ok(archiveSQL.includes(contract),"Missing durable archive contract: "+contract);
assert.ok(!archiveSQL.includes("cron.schedule"),"Do not add a second archive job");
const feedSource=fs.readFileSync("supabase/functions/app-phase1-feed/index.ts","utf8");
const sourceClient=fs.readFileSync("lib/verified-evidence-feed.js","utf8");
for(const contract of ["verifiedCompactSummaryRow","compactOnly?matches.map(verifiedCompactSummaryRow):matches", 'view:compactOnly?"compact":"summary"'])
  assert.ok(feedSource.includes(contract),"Missing compact fast-RPC contract: "+contract);
assert.ok(sourceClient.includes("view=compact&hours=48"));
assert.ok(sourceClient.includes("verified_summary_contract_invalid"));
const resultArchiveSql=fs.readFileSync("supabase/migrations/20261012051600_ft_forebet_exact_fs_final_result_archive.sql","utf8");
for(const contract of [
  "ft_preserve_forebet_verified_final",
  "BEFORE DELETE ON public.matches",
  "s.source_key='FLASHSCORE'",
  "EXACT_FS_PROVIDER_ID_AND_KICKOFF",
  "s.raw->>'AB'='3'",
  "s.raw->>'AC'='3'",
  "a.captured_at<=m.kickoff_hkt",
  "NOT a.raw ? 'verified_final_result'"
]) assert.ok(resultArchiveSql.includes(contract),"Missing verified final archive contract: "+contract);
assert.ok(!resultArchiveSql.includes("cron.schedule"),"No added result cron allowed");
const assessmentSql=fs.readFileSync("supabase/migrations/20261012062400_ft_forebet_prospective_assessment_private.sql","utf8");
for (const contract of [
  "SECURITY INVOKER",
  "a.raw->>'archive_origin'='VERIFIED_PREKICKOFF_FOREBET'",
  "ORDER BY a.match_id,a.captured_at ASC",
  "a.captured_at <= a.kickoff_hkt",
  "outcome->>'source'='FLASHSCORE'",
  "outcome->>'match_id'=a.match_id",
  "EXACT_FS_PROVIDER_ID_AND_KICKOFF",
  "verified_final_n>=100",
  "'INSUFFICIENT_PROSPECTIVE_SAMPLE'",
  "REVOKE ALL ON FUNCTION private.ft_forebet_prospective_assessment()"
]) assert.ok(assessmentSql.includes(contract),"Missing prospective quality gate: "+contract);
assert.ok(!assessmentSql.includes("cron.schedule"),"Do not introduce recurring evaluation work");
const nativeDocs = [
 "supabase/migrations/20261012085100_ft_verified_flashscore_results_compact.sql",
 "supabase/migrations/20261012085500_ft_native_model_training_slice.sql",
 "supabase/migrations/20261012085900_ft_verified_flashscore_fulltime_corners.sql",
 "supabase/migrations/20261012090400_ft_native_training_include_verified_corners.sql"
].map(file => fs.readFileSync(file,"utf8"));
for(const item of [
 "FS_ID_TEAM_IDS_LEAGUE_ID_FINISHED_EPOCH",
 "ON CONFLICT(match_id) DO NOTHING",
 "raw->>'AB'='3'",
 "raw->>'AC'='3'",
 "league_external_id~'^[A-Za-z0-9]{6,16}
",
 "source_captured_at<=p_asof",
 "d.fetched_at<=p_asof",
 "s.detail_fetched_at>=s.kickoff_utc+interval '120 minutes'",
 "home_corners IS NULL AND r.away_corners IS NULL",
 "730 days"
]) assert.ok(nativeDocs.some(d=>d.includes(item)),"Native verified training missing "+item);
for(const d of nativeDocs) assert.ok(!d.includes("cron.schedule("),"No extra recurring crawler or cron");
console.log("Raw fixture identity, missing data, complete enumeration and provider removal checks passed");
