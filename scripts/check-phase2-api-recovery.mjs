import assert from "node:assert/strict";
import fs from "node:fs";
const scout = fs.readFileSync("supabase/functions/phase15-source-scout/index.ts", "utf8");
const feed = fs.readFileSync("supabase/functions/app-phase1-feed/index.ts", "utf8");

// A deleted RPC may NEVER be called by a collector or public API again.
for (const [src, name] of [[scout,"FotMob scout"],[feed,"dashboard API"]]) {
  assert.ok(!src.includes("ft_internal_app_phase1_feed_generic"),name+": retired RPC must be absent");
  assert.ok(!src.includes('FT_PHASE1_USE_GENERIC_RPC'),name+": legacy RPC toggle must be absent");
}
for (const term of [
  '.from("prediction_evidence_feed_current")',
  '.in("status",["CURRENT","MODELED"])',
  '.gte("source_updated_at",since)',
  '.limit(1500)',
  'evidenceError',
  'gapPriorityStatus="EVIDENCE_READ_INCOMPLETE"',
  'gapPriorityStatus="READY"',
  'eligibleFixtureIds.has(id)',
  'gapPriority=new Set([...eligibleFixtureIds].filter(id=>!withEvidence.has(id)))',
  'gapPriority.has(String(a.matchId))',
  'matchedForDetail.slice(0,MAX_DETAIL)',
  'priorityGapDetailCount',
  'source:"PHASE15_FOTMOB_SCOUT"',
  'ft_internal_cron_key_matches'
]) assert.ok(scout.includes(term),"Scout gap priority contract missing: "+term);
for (const term of [
  'db.rpc("ft_fast_flashscore_summary"',
  'async function lightweightFullRecovery(',
  'const recovered=await lightweightFullRecovery(',
  'withExternalAdvisers(adviserDb,recovered.matches||[])',
  'source:"supabase-lightweight-enrichment-recovery"',
  'const summaryOnly = requestedView === "summary" || compactOnly'
]) assert.ok(feed.includes(term),"Dashboard canonical recovery contract missing: "+term);
assert.ok(!scout.includes('evidence_channel_count??0'),"Unknown evidence must never become zero coverage");
assert.ok(!scout.includes("MAX_DETAIL=7"),"This phase must not increase detail batch size");
console.log("PHASE2_SCOUT_AND_FEED_RECOVERY_CONTRACT_PASSED");
