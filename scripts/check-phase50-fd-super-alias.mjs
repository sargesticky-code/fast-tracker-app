import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const migration=readFileSync(new URL("../supabase/migrations/20261018121154_phase50_football_data_super_alias_inventory.sql",import.meta.url),"utf8");
const ingest=readFileSync(new URL("../supabase/functions/football-data-direct/index.ts",import.meta.url),"utf8");
for(const must of ["public.ft_sync_fd_super_alias_inventory()","ft_fd_super_roster_import",
 "football_data_matches","league_code ~ '^[A-Z0-9]{1,4}$'",
 "public.ft_team_name_key(team)","v_collisions<>0","v_total<300 or v_total>1200",
 "insert into public.football_alias_supertable","'FOOTBALL_DATA'",
 "'UNMATCHED',0","SOURCE_ROSTER_ONLY_NO_CROSS_PROVIDER_IDENTITY_CLAIM",
 "'licensing','PRIVATE_USE'","'identityLinked',false",
 "on conflict do nothing","verifiedIdentityLinksAdded',0",
 "revoke all on function public.ft_sync_fd_super_alias_inventory() from PUBLIC,anon,authenticated",
 "grant execute on function public.ft_sync_fd_super_alias_inventory() to service_role"]){
 assert.ok(migration.toLowerCase().includes(must.toLowerCase()),"missing migration guard "+must);
}
assert.equal(migration.split("insert into public.football_alias_supertable").length,2);
assert.doesNotMatch(migration,/\b(DELETE FROM|TRUNCATE|DROP TABLE|VACUUM FULL|cron\.schedule)\b/i);
for(const must of ['if(!historical && status==="PASS" && rowsUpserted>0)',
 'db.rpc("ft_sync_fd_super_alias_inventory")','status:"SKIPPED_SOURCE_UNCHANGED_OR_PARTIAL"',
 'source:"FOOTBALL_DATA",metric:"alias_inventory"',
 'sourceRequests:0','errors:errors,aliasInventory:aliasInventory']){
 assert.ok(ingest.includes(must),"missing ingestion guard "+must);
}
const pos=ingest.indexOf('db.rpc("ft_sync_fd_super_alias_inventory")');
assert.ok(pos>ingest.indexOf('const status=coreFilesFailed===0'));
assert.match(ingest,/const MAIN_LEAGUES=\["E0","E1","E2","E3"/);
assert.match(ingest,/https:\/\/www\.football-data\.co\.uk\/mmz4281\//);
assert.doesNotMatch(ingest,/ft_sync_fd_super_alias_inventory[\s\S]{0,150}verification_status.*VERIFIED/);
console.log("PHASE50_FOOTBALL_DATA_ALIAS_INVENTORY_NO_UNVERIFIED_PROMOTION_PASSED");
