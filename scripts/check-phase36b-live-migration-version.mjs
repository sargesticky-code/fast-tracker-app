import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";

const directory="supabase/migrations";
const applied="20261018084141_phase36b_retire_archived_lineup_batch.sql";
const files=readdirSync(directory).filter(x => /^\d{14}_phase36b_.*\.sql$/.test(x));
assert.deepEqual(files,[applied],"Phase 36B must exist exactly once at the Supabase applied version");
const sql=readFileSync(directory+"/"+applied,"utf8");
for(const token of [
 "ft_retire_verified_lineup_batch",
 "ARCHIVED_LINEUP_OBJECT_NOT_PRESENT",
 "INVALID_ARCHIVED_LINEUP_SHA_PATH",
 "ARCHIVED_LINEUP_SOURCE_CHANGED_OR_STILL_ACTIVE",
 "PARTIAL_LINEUP_DELETE_ROLLED_BACK",
 "storage.objects",
 "public.flashscore_primary_fixture_current",
 "public.canonical_fixture_current"
])assert.ok(sql.includes(token),"Missing retirement safety check: "+token);
assert.ok(sql.includes("grant execute on function public.ft_retire_verified_lineup_batch"),"Missing restricted service grant");
console.log("PHASE36B_APPLIED_VERSION_AND_ARCHIVE_FIRST_GUARDS_PASSED");
