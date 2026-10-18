import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../supabase/functions/phase15-flashscore-scout/index.ts",import.meta.url),"utf8");
const start=source.indexOf("function parseFlashLineupRows(");
const finish=source.indexOf("function parseFlashCoaches(",start);
assert.ok(start>=0 && finish>start,"Flashscore lineup parser must exist");
const section=source.slice(start,finish);
assert.match(section,/raw:\{classification:"CONFIRMED",squad_role:isStarting\?"STARTING_XI":"SUBSTITUTE",formation,flash_position:ll,external_event_id:externalId,flash_index:idx\}/);
assert.doesNotMatch(section,/flash_record\s*:/,"Do not duplicate whole Flashscore provider records per lineup player");
for (const field of ["match_id","team_side","player_key","player_name","starter","formation_slot","shirt_number","confirmed","source_updated_at","fetched_at"]) {
  assert.ok(section.includes(field),"Missing required lineup field: "+field);
}
assert.match(source,/db\.rpc\("ft_upsert_lineup_evidence_generic"/);
assert.match(source,/raw:\{manager_name:name,country:r\.LQ\|\|null,external_event_id:externalId,flash_record:r\}/,
 "Manager evidence remains unchanged by the lineup-only compaction");
console.log("PHASE37_FLASH_SCORE_LINEUP_LEAN_RAW_PASSED");
