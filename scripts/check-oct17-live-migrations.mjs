import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";

// These are exact original SQL statements stored in the production
// Supabase schema_migrations ledger. Never reapply at another timestamp.
const known=[
 ["20261017100147_ft_prior_bet365_reference_quotes_20261017.sql","4eefd9e67861ad07384c80fdc4f47d96"],
 ["20261017130438_ft_phase9_historical_exact_goal_corner_lines.sql","0e36ed9f0092726ff0a36ee937a3c66c"],
 ["20261017141307_ft_phase10_betclan_usl_obos_audited_alias.sql","1ac24a6e0bd1f3dc02bc67eef81c3fd4"]
];
const all=readdirSync("supabase/migrations");
const obsolete=[
 "20261017095500_ft_prior_bet365_reference_quotes.sql",
 "20261017125000_phase9_historical_exact_goal_corner_lines.sql",
 "20261017141700_phase10_audited_betclan_usl_obos_alias.sql"
];
for(const f of obsolete)assert.ok(!all.includes(f),"Obsolete future migration would replay: "+f);
for(const [file,expected] of known){
 const actual=readFileSync("supabase/migrations/"+file,"utf8");
 assert.equal(createHash("md5").update(actual).digest("hex"),expected,
   "Applied migration SQL must not change: "+file);
 assert.equal(all.filter(f=>f.startsWith(file.slice(0,14)+"_")).length,1,
   "Duplicate migration version: "+file);
}
console.log("OCT17_STORED_SQL_PARITY_PASSED");
