import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/migrations/20261018105811_phase41_source_day_archive_readback.sql",import.meta.url),"utf8");
const edge=readFileSync(new URL("../supabase/functions/source-day-cold-archive/index.ts",import.meta.url),"utf8");
for(const name of ["ft_source_day_archive_read","ft_source_day_archive_restore_check",
"SECURITY INVOKER","private.ft_source_day_snapshot","jsonb_array_length(v_rows)<>v_count",
"md5(v_rows::text)<>p_snapshot->>'content_md5'",
"v_original IS DISTINCT FROM p_snapshot",
"REVOKE ALL ON FUNCTION public.ft_source_day_archive_read(text,date) FROM PUBLIC,anon,authenticated",
"REVOKE ALL ON FUNCTION public.ft_source_day_archive_restore_check(jsonb) FROM PUBLIC,anon,authenticated",
"GRANT EXECUTE ON FUNCTION public.ft_source_day_archive_read(text,date) TO service_role",
"GRANT EXECUTE ON FUNCTION public.ft_source_day_archive_restore_check(jsonb) TO service_role"]){
 assert.ok(sql.includes(name),"SQL archive gate "+name);
}
for(const key of ["req.method!==\"POST\"","ft_internal_cron_key_matches","ft_source_day_archive_read",
"source-day/v1/","upsert:false","bucket.download(storagePath)","crypto.subtle.digest",
"ARCHIVE_SHA256_MISMATCH","ft_source_day_archive_restore_check","dbRestoreDryRunVerified:true",
"deletionPerformed:false","snapshotRowUnchanged:true","MAX_BYTES=5_500_000"]){
 assert.ok(edge.includes(key),"Edge archive gate "+key);
}
assert.ok(edge.indexOf("ft_source_day_archive_restore_check")>edge.indexOf("bucket.download(storagePath)"));
assert.doesNotMatch(sql,/^(?!\s*--).*\b(DELETE FROM|UPDATE private\.|TRUNCATE|DROP TABLE|INSERT INTO|cron\.schedule)\b/im);
assert.doesNotMatch(edge,/\.remove\(|\.delete\(|\.upsert\(/);
console.log("PHASE41_SOURCE_DAY_PRIVATE_SHA256_ARCHIVE_RESTORE_READONLY_PASSED");
