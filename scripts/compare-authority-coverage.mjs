import { readFile, writeFile } from 'node:fs/promises';
import { compareAuthorityCoverage } from '../lib/authority-coverage.js';

// Local private evidence only; no database writes, feed publication or cutover.
const [baselinePath, bundlePath, outputPath, evaluationTime] = process.argv.slice(2);
if (!baselinePath || !bundlePath || !outputPath) throw new Error('Usage: compare-authority-coverage.mjs baseline.json bundle.json report.json [zoned-evaluation-time]');
if (evaluationTime && !/(Z|[+-]\d{2}:\d{2})$/.test(evaluationTime)) throw new Error('INVALID_EVALUATION_TIME');
const [baseline, bundle] = await Promise.all([baselinePath, bundlePath].map(async p => JSON.parse(await readFile(p, 'utf8'))));
const report = compareAuthorityCoverage(baseline, bundle, { now: evaluationTime ? Date.parse(evaluationTime) : Date.now() });
await writeFile(outputPath, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ readiness: report.readiness, legacyUpcoming: report.legacyUpcoming,
  verifiedUpcoming: report.verifiedUpcoming, freshHdaFixtures: report.freshHdaFixtures,
  unknownKickoffs: report.unknownKickoffProviderIds.length, staleFixtures: report.staleFixtureProviderIds.length,
  productionCutoverAuthorized: false }));
if (report.readiness !== 'SHADOW_COVERAGE_PASSED') process.exitCode = 2;
