import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/migrations/20261018114500_phase45_source_day_retention.sql",import.meta.url),"utf8");
const edge=readFileSync(new URL("../supabase/functions/source-day-retention/index.ts",import.meta.url),"utf8");
for(const key of ["ft_source_day_retirement_ledger","alter table private.ft_source_day_retirement_ledger enable row level security",
 "ft_source_day_retention_candidates","ft_source_day_retire_proven",
 "security invoker","source_day < v_today - 1","source_day >= v_today - 30",
 "blockedOlderThan30Days","limit 3","pg_try_advisory_xact_lock",
 "SOURCE_RETIRE_ARCHIVE_OBJECT_MISMATCH","p_archive_sha !~ '^[a-f0-9]{64}$'",
 "md5(s.source_rows::text)","SOURCE_RETIRE_ROW_CHANGED_AFTER_ARCHIVE",
 "SOURCE_RETIRE_PARTIAL_ROLLBACK","row_count","storage.objects",
 "revoke all on function public.ft_source_day_retention_candidates()",
 "revoke all on function public.ft_source_day_retire_proven("])
 assert.ok(sql.toLowerCase().includes(key.toLowerCase()),"SQL safety guard absent: "+key);
assert.equal(sql.split("delete from private.ft_source_day_snapshot").length,2);
assert.match(sql,/insert into private.ft_source_day_retirement_ledger/);
assert.doesNotMatch(sql,/\b(TRUNCATE|DROP TABLE|VACUUM FULL|cron\.schedule)\b/i);
for(const key of ["req.method!==\"POST\"","ft_internal_cron_key_matches",
 "ft_source_day_retention_candidates","source-day-cold-archive",
 "SOURCE_DAY_ARCHIVED_SHA256_AND_RESTORE_PROVED","dbRestoreDryRunVerified!==true",
 "deletionPerformed!==false","snapshotRowUnchanged!==true",
 "ft_source_day_retire_proven","retired.data!==1","UNSAFE_OR_EXPIRED_RETENTION_BACKLOG",
 "NO_COLD_SNAPSHOTS","DAILY_SOURCE_ARCHIVE_RETIRE_VERIFIED"])
 assert.ok(edge.includes(key),"edge safety guard absent: "+key);
assert.ok(edge.indexOf("ft_source_day_retire_proven")>edge.indexOf("dbRestoreDryRunVerified!==true"));
assert.doesNotMatch(edge,/\.delete\(|\.remove\(|\.upsert\(/);
console.log("PHASE45_DAILY_SOURCE_ARCHIVE_FIRST_RETIRE_GUARDS_PASSED");
