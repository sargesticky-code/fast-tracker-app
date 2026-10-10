import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openFootballSchedule } from '../lib/openfootball-schedule.js';

export function scheduleCoverage(fixtures, now = new Date(), horizonDays = 3) {
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 7) throw new Error('INVALID_COVERAGE_WINDOW');
  const fromDate = now.toISOString().slice(0, 10);
  const untilDateExclusive = new Date(now.getTime() + horizonDays * 86400000).toISOString().slice(0, 10);
  const upcoming = fixtures.filter(f => f.scheduledDate >= fromDate && f.scheduledDate < untilDateExclusive);
  const competitions = [...new Set(upcoming.map(f => f.competition))].sort();
  return { fromDate, untilDateExclusive, dateBasis: 'UTC_DATE_WINDOW_SOURCE_TIMEZONE_UNKNOWN',
    scheduleRecords: upcoming.length, competitions,
    verifiedKickoffs: upcoming.filter(f => f.kickoff && f.identityStatus === 'VERIFIED').length,
    usableCurrentQuotes: 0, bettingAuthorityReady: false };
}

// Consume an inspected local Git checkout; do not run upstream code or install it.
export async function collectOpenFootball(root, season, now = new Date()) {
  if (!/^\d{4}-\d{2}$/.test(season)) throw new Error('INVALID_SEASON');
  const git = (...args) => execFileSync('git', ['-C', resolve(root), ...args], { encoding: 'utf8' }).trim();
  const remote = git('remote', 'get-url', 'origin');
  if (!/^(?:https:\/\/github\.com\/|git@github\.com:)openfootball\/football\.json(?:\.git)?$/.test(remote)) throw new Error('UNEXPECTED_SOURCE_REPOSITORY');
  const revision = git('rev-parse', 'HEAD');
  const sourceCommittedAt = git('show', '-s', '--format=%cI', revision);
  const fetchedAt = now.toISOString(), fixtures = [], rejected = [];
  const paths = git('ls-tree', '--name-only', revision, `${season}/`).split('\n');
  for (const sourcePath of paths.filter(p => new RegExp(`^${season}/[a-z]{2}\\.\\d\\.json$`).test(p))) {
    // Read committed content, never dirty working-tree edits masquerading as source evidence.
    const payload = JSON.parse(git('show', `${revision}:${sourcePath}`));
    const fileCommittedAt = git('log', '-1', '--format=%cI', revision, '--', sourcePath);
    const result = openFootballSchedule(payload, { sourcePath, revision, sourceCommittedAt: fileCommittedAt, fetchedAt });
    fixtures.push(...result.fixtures); rejected.push(...result.rejected);
  }
  if (!fixtures.length) throw new Error('NO_SOURCE_FIXTURES');
  return { mode: 'SHADOW', generatedAt: fetchedAt, providerKey: 'OPENFOOTBALL', sourceRevision: revision,
    sourceCommittedAt, sourceAgeSeconds: Math.max(0, (now - new Date(sourceCommittedAt)) / 1000),
    sourceFreshness: 'COMMIT_TIME_IS_NOT_OBSERVATION_TIME', coverage: scheduleCoverage(fixtures, now), fixtures, rejected, quotes: [], productionCutoverAuthorized: false };
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const [root, season, output] = process.argv.slice(2);
  if (!root || !season || !output) throw new Error('Usage: collect-openfootball.mjs checkout season output.json');
  const result = await collectOpenFootball(root, season);
  await writeFile(output, JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ fixtures: result.fixtures.length, rejected: result.rejected.length,
    quotes: 0, sourceRevision: result.sourceRevision, sourceAgeSeconds: result.sourceAgeSeconds }));
}
