import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const s=readFileSync(new URL("../supabase/migrations/20261018090000_phase34_sportytrader_daily_alias_calibrated.sql",import.meta.url),"utf8");
for(const must of ["ft_daily_alias_audit","private.ft_sportytrader_calibrated_05",
  "p.state='PROVISIONAL'","p.predicted_kickoff>now()","p.calibration_samples>=4",
  "p.calibration_agreement>=0.9","p.league_similarity>=0.5",
  "f.identity_authority='FLASHSCORE'","f.provider_identity_status='VERIFIED_IDENTITY'",
  "ft_adviser_pair_rejections","jsonb_object_agg",
  "revoke all on function public.ft_daily_alias_audit(date) from PUBLIC,anon,authenticated",
  "grant execute on function public.ft_daily_alias_audit(date) to service_role"])
  assert.ok(s.includes(must),"missing phase34 guard: "+must);
const begin=s.indexOf("from private.ft_sportytrader_calibrated_05");
const end=s.indexOf("from private.ft_extra_adviser_provisional_04",begin);
assert.ok(begin>0&&end>begin);
const fragment=s.slice(begin,end);
assert.match(fragment,/source_url/);
assert.match(fragment,/identity_status='VERIFIED'/);
assert.match(fragment,/source_captured_at<=now\(\)/);
assert.match(s,/select p.canonical_event_id,'SPORTYTRADER',[\s\S]*?'PROVISIONAL',p.source_captured_at/);
assert.doesNotMatch(s,/^(?!\s*--).*\b(INSERT INTO|UPDATE|DELETE FROM|TRUNCATE|DROP TABLE|cron\.schedule)\b/im);
// Guard the complete migration structure, not just source SQL snippets.
assert.equal(s.split("create or replace function public.ft_daily_alias_audit").length,2,
 "Expected one and only one replacement function");
assert.equal(s.split("from private.ft_extra_adviser_provisional_04").length,2,
 "The original query tail must occur exactly once");
assert.equal(s.split("from private.ft_sportytrader_calibrated_05").length,2,
 "The new calibrated source must occur exactly once");
assert.ok(s.trim().endsWith("grant execute on function public.ft_daily_alias_audit(date) to service_role;"),
 "Do not append any fragments after final GRANT");
assert.ok(s.includes("p.source_url ~ '^https://www[.]sportytrader[.]com/en/betting-tips/"),
 "Exact SportyTrader URL source guard is required");
console.log("PHASE34_SPORTY_CLOCK_ALIAS_BOUNDED_REVIEW_ONLY_PASSED");
