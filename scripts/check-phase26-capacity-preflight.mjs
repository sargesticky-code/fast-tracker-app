// Static gate for the read-only Phase 26 capacity preflight.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("./sql/phase26-capacity-preflight.sql",import.meta.url),"utf8");
assert.match(sql,/pg_database_size\(current_database\(\)\)/i);
assert.match(sql,/pg_total_relation_size/i);
assert.match(sql,/storage\.objects/i);
assert.match(sql,/private\.ft_retired_storage_archive_ledger/i);
assert.match(sql,/phase2_match_lineup_evidence/i);
assert.match(sql,/interval '14 days'/);
assert.match(sql,/flashscore_primary_fixture_current/i);
const noComments=sql.split("\n").filter(x=>!/^\s*--/.test(x)).join("\n");
assert.doesNotMatch(noComments,/\b(DELETE|TRUNCATE|VACUUM|REINDEX|INSERT|UPDATE|ALTER|DROP|CREATE|COPY|EXECUTE|GRANT|REVOKE)\b/i);
assert.equal((noComments.match(/\bSELECT\b/gi)||[]).length,4);
console.log("PHASE26_READ_ONLY_CAPACITY_PREFLIGHT_PASSED");
