import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Production already has Phase53. Legacy migrations are not a safe replayable chain.
const BOOTSTRAP_FILE='20261018143302_phase53_future_pipeline_health_readonly.sql';
const BOOTSTRAP_MD5='930c99c48d339a9710a36bf2a57f754c';
const LEGACY='supabase/migrations';
const FUTURE='supabase/future_migrations';
const base=process.env.FT_BASE_SHA;
assert.ok(base && /^[0-9a-f]{40}$/.test(base),'FT_BASE_SHA must be the PR base commit SHA');

const diff=execFileSync('git',['diff','--name-status','--no-renames',base,'HEAD','--',LEGACY,FUTURE],{encoding:'utf8'});
const changes=diff.trim()?diff.trim().split('\n').map(s=>s.split('\t')):[];
for (const [kind,path] of changes) {
  assert.ok(kind==='A' && path.startsWith(FUTURE+'/'),
    'LEGACY_FROZEN: never modify old SQL or overwrite future SQL: '+kind+' '+path);
}
assert.ok(existsSync(FUTURE),'Missing future-only SQL folder');
const names=readdirSync(FUTURE).filter(p=>p.endsWith('.sql'));
const versions=new Set();
for (const name of names) {
  assert.match(name,/^\d{14}_[a-z0-9_]+\.sql$/,'Invalid migration filename');
  const version=name.slice(0,14);
  assert.ok(!versions.has(version),'Duplicate future migration version: '+version);
  versions.add(version);
  assert.ok(version>='20261018143302','Future SQL older than applied Phase53: '+name);
  const sql=readFileSync(join(FUTURE,name),'utf8');
  if (name===BOOTSTRAP_FILE) {
    assert.equal(createHash('md5').update(sql).digest('hex'),BOOTSTRAP_MD5,
      'Phase53 SQL differs from already-applied production statement');
    continue;
  }
  const clean=sql.replace(/--[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'');
  assert.doesNotMatch(clean,/\b(TRUNCATE|DROP\s+(?:TABLE|SCHEMA)|DELETE\s+FROM|cron\.schedule|net\.http_(?:get|post))\b/i,
    'Dangerous deletion, scheduler or network operation requires separate approval: '+name);
  assert.doesNotMatch(clean,/\b(?:hkjc|jockey[\s_-]*club)\b/i,
    'Retired HKJC dependency is prohibited: '+name);
  if (/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i.test(clean)) {
    assert.match(clean,/\bREVOKE\s+ALL\s+ON\s+FUNCTION\b/i,
      'New RPC requires explicit PUBLIC/anon/authenticated revoke: '+name);
    if (/SECURITY\s+DEFINER/i.test(clean))
      assert.match(clean,/\bSET\s+search_path\b/i,'Definer function must pin search_path: '+name);
  }
}
assert.ok(names.includes(BOOTSTRAP_FILE),'Applied Phase53 must be retained');
console.log('FUTURE_ONLY_MIGRATION_GATE_PASS',changes.length,'new additions; legacy SQL frozen');
