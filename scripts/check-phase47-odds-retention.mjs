import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/migrations/20261018123000_phase47_odds_history_archive_first.sql",import.meta.url),"utf8");
const edge=readFileSync(new URL("../supabase/functions/odds-cold-retire/index.ts",import.meta.url),"utf8");
for(const p of ["ft_odds_retirement_ledger","enable row level security",
 "ft_odds_retention_candidates","ft_retire_proven_odds_batch",
 "interval '7 days'","FLASHSCORE_BET365","s.market='ML'",
 "f.kickoff_hkt>=now()-interval '48 hours'","limit 1000",
 "md5(to_jsonb(s)::text)","ODDS_RETIRE_SOURCE_CHANGED_OR_ACTIVE",
 "ODDS_RETIRE_PRIVATE_ARCHIVE_MISSING","ODDS_RETIRE_PARTIAL_DELETE_ROLLBACK",
 "revoke all on function public.ft_odds_retention_candidates()",
 "revoke all on function public.ft_retire_proven_odds_batch"])
 assert.ok(sql.toLowerCase().includes(p.toLowerCase()),"Missing SQL guard "+p);
assert.equal(sql.split("delete from public.odds_snapshots").length,2);
assert.doesNotMatch(sql,/\b(DROP TABLE|TRUNCATE|VACUUM FULL|cron\.schedule)\b/i);
for(const p of ["req.method!==\"POST\"","ft_internal_cron_key_matches",
 "ft_odds_retention_candidates","ft_retire_proven_odds_batch",
 "odds-history/v1/","upsert:false","storage.download(path)",
 "ODDS_ARCHIVE_SHA256_MISMATCH","ODDS_ARCHIVE_RESTORE_MISMATCH",
 "ODDS_ATOMIC_RETIRE_FAILED","retired:retired.data","sourceSnapshotsUnchanged:true"])
 assert.ok(edge.includes(p),"Missing Edge guard "+p);
assert.ok(edge.indexOf("ft_retire_proven_odds_batch")>edge.indexOf("ODDS_ARCHIVE_RESTORE_MISMATCH"));
assert.doesNotMatch(edge,/\.delete\(|\.remove\(/);
console.log("PHASE47_7DAY_ODDS_HISTORY_IMMUTABLE_ARCHIVE_FIRST_DELETE_PASSED");
