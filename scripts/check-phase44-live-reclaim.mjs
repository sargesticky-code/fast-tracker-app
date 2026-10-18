import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const s=readFileSync(new URL("./sql/phase44-reclaim-obsolete-live-current.sql",import.meta.url),"utf8");
for(const needed of ["BEGIN;","COMMIT;","lock_timeout='750ms'",
 "IN ACCESS EXCLUSIVE MODE NOWAIT;","v_score<>15 OR v_stats<>15",
 "^FB[0-9]{4,}$","interval '7 days'",
 "public.flashscore_primary_fixture_current","v_invalid_score<>0 OR v_invalid_stats<>0",
 "IMMUTABLE_LEGACY_LIVE_ARCHIVES_MISSING_ABORT",
 "legacy-live/v1/score/","legacy-live/v1/stats/",
 "v_archives<>2","INBOUND_LIVE_TABLE_FK_ABORT",
 "TRUNCATE TABLE ONLY public.live_score_current,ONLY public.live_stats_current",
 "NONEMPTY_AFTER_RECLAIM_ROLLBACK"]){
 assert.ok(s.includes(needed),"missing safety guard "+needed);
}
assert.equal((s.match(/TRUNCATE TABLE ONLY/g)||[]).length,1);
assert.doesNotMatch(s,/\b(CASCADE|VACUUM FULL|DROP TABLE|DELETE FROM)\b/i);
console.log("PHASE44_TWO_PROVEN_OBSOLETE_LIVE_TABLES_ONLY_RECLAIM_PASSED");
