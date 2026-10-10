import assert from 'node:assert/strict';
import { openFootballSchedule } from '../lib/openfootball-schedule.js';
const options = { sourcePath: '2026-27/en.1.json', revision: 'a'.repeat(40), fetchedAt: '2026-10-05T00:00:00Z', sourceCommittedAt: '2026-09-22T00:00:00Z' };
// Synthetic contract cases only, not production records.
const row = { date: '2026-10-05', time: '15:00', team1: 'Test Home', team2: 'Test Away' };
const result = openFootballSchedule({ name: 'Test Competition', matches: [row, row, { ...row, date: '2026-02-30' }] }, options);
assert.equal(result.fixtures.length, 1); assert.equal(result.rejected.length, 2);
assert.equal(result.fixtures[0].kickoff, null); assert.equal(result.fixtures[0].observedAt, null);
assert.equal(result.fixtures[0].canonicalMatchId, null); assert.equal(result.quotes.length, 0);
assert.equal(result.fixtures[0].verificationStatus, 'COMMUNITY_UNCORROBORATED');
assert.throws(() => openFootballSchedule({ matches: [] }, { ...options, revision: 'master' }));
assert.equal(openFootballSchedule({ name: 'Test', matches: [{ ...row, time: '25:00' }] }, options).fixtures[0].localTime, null);
console.log('OpenFootball schedule safety checks passed');

import { scheduleCoverage, collectOpenFootball } from './collect-openfootball.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const coverage = scheduleCoverage(result.fixtures, new Date(options.fetchedAt));
assert.equal(coverage.scheduleRecords, 1);
assert.equal(coverage.verifiedKickoffs, 0);
assert.equal(coverage.bettingAuthorityReady, false);
assert.throws(() => scheduleCoverage([], new Date('invalid')));
const root = await mkdtemp(join(tmpdir(), 'openfootball-contract-'));
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commit = (message, date) => execFileSync('git', ['-C', root, 'commit', '-m', message], {
  env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }, stdio: 'pipe' });
try {
  git('init'); git('config', 'user.name', 'Contract Test'); git('config', 'user.email', 'test@example.invalid');
  git('remote', 'add', 'origin', 'https://github.com/openfootball/football.json.git');
  await mkdir(join(root, '2026-27'));
  await writeFile(join(root, options.sourcePath), JSON.stringify({ name: 'Test', matches: [row] }));
  git('add', '.'); commit('schedule', options.sourceCommittedAt);
  await writeFile(join(root, 'README.md'), 'Synthetic test only');
  git('add', '.'); commit('unrelated newer commit', options.fetchedAt);
  const collected = await collectOpenFootball(root, '2026-27', new Date(options.fetchedAt));
  assert.equal(collected.fixtures[0].sourceCommittedAt, new Date(options.sourceCommittedAt).toISOString());
  assert.equal(collected.sourceCommittedAt, options.fetchedAt);
  assert.equal(collected.coverage.scheduleRecords, 1);
  // A local edit must not alter evidence attributed to a committed revision.
  await writeFile(join(root, options.sourcePath), '{}');
  assert.equal((await collectOpenFootball(root, '2026-27', new Date(options.fetchedAt))).fixtures.length, 1);
  git('remote', 'set-url', 'origin', 'https://untrusted.example/openfootball/football.json');
  await assert.rejects(() => collectOpenFootball(root, '2026-27'), /UNEXPECTED_SOURCE_REPOSITORY/);
} finally { await rm(root, { recursive: true, force: true }); }
console.log('OpenFootball committed provenance and coverage checks passed');
