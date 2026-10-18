import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const s=readFileSync(new URL("../supabase/migrations/20261018113000_phase43_legacy_live_archive.sql",import.meta.url),"utf8");
const e=readFileSync(new URL("../supabase/functions/legacy-live-cold-archive/index.ts",import.meta.url),"utf8");
for(const x of ["SECURITY INVOKER","ft_legacy_live_archive_read","ft_legacy_live_archive_restore_check",
 "v_count<>15","^FB[0-9]{4,}$","interval '7 days'","CURRENT_FLASHSCORE_MATCH_IN_ARCHIVE",
 "v_original IS DISTINCT FROM p_rows","REVOKE ALL ON FUNCTION public.ft_legacy_live_archive_read",
 "REVOKE ALL ON FUNCTION public.ft_legacy_live_archive_restore_check"]){
 assert.ok(s.includes(x),"SQL guard missing "+x);
}
for(const x of ["ft_internal_cron_key_matches","req.method!==\"POST\"","upsert:false",
 "legacy-live/v1/","SHA256_READBACK_FAILED","ft_legacy_live_archive_restore_check",
 "postgresRestoreDryRun:true","deletionPerformed:false"]){
 assert.ok(e.includes(x),"Backup worker missing "+x);
}
assert.doesNotMatch(s,/^(?!\s*--).*\b(DELETE FROM|TRUNCATE|DROP TABLE|INSERT INTO|UPDATE public\.|cron\.schedule)\b/im);
assert.doesNotMatch(e,/\.remove\(|\.delete\(/);
console.log("PHASE43_OBSOLETE_FB_LIVE_SOURCE_BACKUP_SHA256_AND_RESTORE_PROOF_PASSED");
