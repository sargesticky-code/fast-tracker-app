import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const dir = 'supabase/migrations';
// Fingerprints of actual SQL statements stored in production
// supabase_migrations.schema_migrations.statements[1], verified 2026-10-18.
// Never reapply legacy aliases at new timestamps.
const applied = [
  ['20261018080942_phase34_sportytrader_daily_alias_calibrated.sql',
   '1a86b086e7155e7c00f3e5713f9cfc33'],
  ['20261018081028_phase34_recover_daily_alias_original_rpc.sql',
   '7748a8b8e9bc172dfd223e63ab260d60'],
  ['20261018081335_phase35_sporty_alias_matrix_runtime_smoke.sql',
   '9a6844921bf70f8207fab4612f6508bf']
];
const known = readdirSync(dir).filter(x =>
  /^\d{14}_phase(?:33|34|35)_.*\.sql$/.test(x)).sort();
assert.deepEqual(known, applied.map(x => x[0]).sort(),
  'Unexpected Phase 33–35 migration: may replay already-applied alias SQL');
for (const [file, expectedHash] of applied) {
  const text = readFileSync(dir + '/' + file, 'utf8');
  assert.equal(createHash('md5').update(text).digest('hex'), expectedHash,
    'Applied SQL changed: ' + file + '. Do not change an applied migration');
  assert.match(text, /ft_daily_alias_audit/);
  assert.match(text, /revoke all on function public.ft_daily_alias_audit\(date\) from PUBLIC,anon,authenticated/i);
  assert.match(text, /grant execute on function public.ft_daily_alias_audit\(date\) to service_role/i);
}
assert.ok(applied[0][0] < applied[1][0] && applied[1][0] < applied[2][0],
  'Live migration order must be calibrated -> rollback -> repaired smoke');
const repaired=readFileSync(dir+'/'+applied[2][0],'utf8');
assert.match(repaired,/PHASE35_DAILY_MATRIX_RUNTIME_SMOKE_FAILED/);
assert.match(repaired,/f\.identity_authority/);
assert.match(repaired,/ft_sportytrader_calibrated_05/);
console.log('PHASE33_35_STORED_SQL_BYTE_PARITY_PASSED');
