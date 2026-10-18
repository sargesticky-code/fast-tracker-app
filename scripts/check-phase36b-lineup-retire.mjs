import assert from "node:assert/strict";
import{readFileSync}from"node:fs";
const sql=readFileSync(new URL("../supabase/migrations/20261018094500_phase36b_retire_archived_lineup_batch.sql",import.meta.url),"utf8");
const edge=readFileSync(new URL("../supabase/functions/lineup-cold-retire/index.ts",import.meta.url),"utf8");
for(const t of ["security invoker","ft_retire_verified_lineup_batch","pg_advisory_xact_lock","storage.objects",
  "p_archive_sha","p_archive_bytes","p_rows","v_distinct<>v_expected","v_eligible<>v_expected",
  "v_deleted<>v_expected","l.raw is not distinct from e.raw","not exists(select 1 from public.flashscore_primary_fixture_current",
  "public.canonical_fixture_current","interval '14 days'",
  "revoke all on function public.ft_retire_verified_lineup_batch","grant execute on function public.ft_retire_verified_lineup_batch"])
  assert.ok(sql.includes(t),"SQL guard absent: "+t);
for(const t of ["ft_internal_cron_key_matches","ft_retire_verified_lineup_batch",
  'lineup-cold/v3/','SHA256_BACKUP_READBACK_THEN_ATOMIC_RETIRE',
  "crypto.subtle.digest","ARCHIVE_SHA256_MISMATCH","MANIFEST_ROUNDTRIP_FAILED",
  "ATOMIC_RETIRE_FAILED","deletionPerformed:true","deleted:deleted.data"])
  assert.ok(edge.includes(t),"Edge guard absent: "+t);
assert.match(edge,/req.method!=="POST"/);
assert.match(edge,/MAX_ROWS=200/);
assert.match(edge,/const cutoff=new Date\(Date.now\(\)-COLD_DAYS\*86400000\)/);
assert.match(edge,/await st.download\(path\)/);
assert.match(edge,/const deleted=await db.rpc/);
assert.ok(edge.indexOf("ARCHIVE_SHA256_MISMATCH")<edge.indexOf('const deleted=await db.rpc'));
assert.ok(edge.indexOf("MANIFEST_ROUNDTRIP_FAILED")<edge.indexOf('const deleted=await db.rpc'));
assert.equal((sql.match(/delete from public\.phase2_match_lineup_evidence/g)||[]).length,1);
assert.doesNotMatch(sql,/\b(DELETE FROM storage\.objects|TRUNCATE|DROP TABLE|VACUUM FULL)\b/i);
console.log("PHASE36B_SHA_ARCHIVE_BEFORE_EXACT_ATOMIC_DELETE_PASSED");
