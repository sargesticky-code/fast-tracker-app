import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";

// Fingerprints of exact statements recorded in production
// supabase_migrations.schema_migrations.statements[1], 2026-10-18.
// These must not be replayed under later timestamps.
const applied=[
 ["20261016095647_ft_native_odds_movement.sql","b149061de50951907b9644be725edc47"],
 ["20261016103425_ft_internal_rls_review.sql","cebf530c89f122bfe5a3e82cf37d62cd"],
 ["20261016105505_ft_forebet_verified_source_links.sql","1e38d7b2133f78610fd2bc19756b3f6e"],
 ["20261016105957_ft_revoke_privileged_rpc_grants.sql","51a85180aa04319ef0b9589ebdd342b7"],
 ["20261016164034_ft_matching_similarity_030_crosschecked_provisional_20261017.sql","47319178ea57d44d2dfe839fa0bad975"]
];
const retired=[
 "20261016100800_ft_native_odds_movement.sql",
 "20261016104000_ft_internal_rls_review.sql",
 "20261016114500_ft_forebet_verified_source_links.sql",
 "20261016115900_ft_revoke_privileged_rpc_grants.sql",
 "20261017003000_ft_provisional_matching_threshold_030.sql"
];
const files=readdirSync("supabase/migrations");
for(const old of retired)assert.ok(!files.includes(old),"Unsafe duplicate applied migration: "+old);
for(const [filename,digest] of applied){
 const actual=readFileSync("supabase/migrations/"+filename,"utf8");
 assert.equal(createHash("md5").update(actual).digest("hex"),digest,
   "Previously applied migration contents were changed: "+filename);
 assert.equal(files.filter(f=>f.startsWith(filename.slice(0,14)+"_")).length,1,
   "Duplicate migration version "+filename);
}
console.log("OCT16_EXACT_APPLIED_SQL_REPLAY_SAFETY_PASSED");
