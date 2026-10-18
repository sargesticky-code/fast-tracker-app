import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";

const dir="supabase/migrations";
const cases=[
  ["20261018013217_ft_20261018_provisional_adviser_review_025.sql","f0f185dc2945823222eff93e5e232743"],
  ["20261018015819_ft_20261018_reversible_adviser_pair_denials_private.sql","38100bf7635ea354c8a7f5017c949554"],
  ["20261018034320_ft_20261018_sportytrader_linked_clocks_provisional.sql","d3d83ce3163a9197dedd50b32966a5dd"],
  ["20261018040020_ft_20261018_restore_football_data_daily_csv.sql","8abdad4a52504faa6f61955c72d752e7"]
];
const all=readdirSync(dir).filter(f=>f.endsWith(".sql"));
for(const [name,hash] of cases){
  const content=readFileSync(dir+"/"+name,"utf8");
  assert.equal(createHash("md5").update(content).digest("hex"),hash,
    "Applied migration SQL changed: "+name);
  assert.equal(all.filter(f=>f.slice(0,14)===name.slice(0,14)).length,1,
    "Duplicate migration version: "+name);
}
for(const obsolete of [
 "20261018013500_ft_adviser_provisional_025_review_only.sql",
 "20261018024500_ft_adviser_pair_rejections_private.sql",
 "20261018043000_ft_sportytrader_linked_clock_provisional.sql",
 "20261018044500_ft_football_data_daily_cron.sql"
])assert.ok(!all.includes(obsolete),"Retired timestamp must not replay: "+obsolete);
console.log("PHASE12_16_LIVE_STORED_SQL_PARITY_PASSED");
