import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source = readFileSync(new URL("../supabase/functions/football-data-archive/index.ts",import.meta.url),"utf8");
assert.match(source,/const BUCKET = "fast-tracker-ingest"/);
assert.match(source,/const SEASONS = new Set\(\["2223", "2324", "2425", "2526"\]\)/);
assert.match(source,/const LEAGUES = new Set/);
assert.match(source,/ft_internal_cron_key_matches/);
assert.match(source,/football-data\/history/); // storage path only, not a database table
assert.match(source,/upsert:false/);
assert.match(source,/contentType:"text\/plain"/); // manifest MIME accepted by existing private bucket
assert.match(source,/archived_source_changed_review_required/);
assert.match(source,/retrospective_only:true/);
assert.doesNotMatch(source,/cron\.schedule|football_data_matches|model_predictions|hkjc/i);
assert.doesNotMatch(source,/Deno\.env\.get\("SUPABASE_ANON_KEY"\)/);
console.log("PHASE22_ARCHIVE_STATIC_SAFETY_CONTRACT_PASSED");
