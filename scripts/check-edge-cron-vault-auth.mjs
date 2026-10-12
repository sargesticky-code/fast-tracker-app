import assert from "node:assert/strict";
import fs from "node:fs";
const migration=fs.readFileSync("supabase/migrations/20261012133500_ft_vault_cron_edge_auth_job32.sql","utf8");
assert.ok(migration.includes("fast_tracker_cron_secret"),"must reuse existing Vault secret");
assert.ok(migration.includes("vault.decrypted_secrets"),"must read secret at invocation only");
assert.ok(migration.includes("digest(s.decrypted_secret::bytea,'sha256')"),"verify digested token");
assert.ok(migration.includes("REVOKE ALL ON FUNCTION public.ft_internal_cron_key_matches(text) FROM PUBLIC,anon,authenticated"),"public cannot call validator");
assert.ok(migration.includes("GRANT EXECUTE ON FUNCTION public.ft_internal_cron_key_matches(text) TO service_role"),"service role may validate");
assert.ok(migration.includes("cron.alter_job(32"),"reuse job 32");
assert.ok(migration.includes("FT_JOB32_AUTH_CUTOVER_CONTRACT_DRIFT"),"guard job drift");
assert.ok(!/\bcron\.schedule\s*\(/.test(migration),"no new cron job");
for(const path of [
 "supabase/functions/phase15-flashscore-scout/index.ts",
 "supabase/functions/phase15-source-scout/index.ts",
 "supabase/functions/phase2-fotmob-lineups/index.ts"
]){
 const s=fs.readFileSync(path,"utf8");
 for(const term of ['req.headers.get("x-ft-cron-key")',
  'db.rpc("ft_internal_cron_key_matches",{p_key:cronKey})',
  'cronAuth.error||cronAuth.data!==true',
  'error:"unauthorized"', 'status:401']){
  assert.ok(s.includes(term),path+" missing auth guard: "+term);
 }
 const pos=s.indexOf('db.rpc("ft_internal_cron_key_matches"');
 assert.ok(pos>=0 && s.indexOf(".from(")>pos,"authentication must be before normal table access");
}
console.log("INTERNAL_EDGE_CRON_VAULT_SECURITY_CONTRACT_PASSED");
