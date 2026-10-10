import { timestamp } from './international-authority.js';

// Community schedule evidence only: never allocate canonical IDs or infer UTC.
export function openFootballSchedule(payload, { sourcePath, revision, fetchedAt, sourceCommittedAt }) {
  if (!/^[a-f0-9]{40}$/.test(revision ?? '') || !/^\d{4}-\d{2}\/[a-z]{2}\.\d\.json$/.test(sourcePath ?? '') ||
      !timestamp(fetchedAt) || !timestamp(sourceCommittedAt) || !Array.isArray(payload?.matches)) {
    throw new Error('OPENFOOTBALL_INVALID_SOURCE');
  }
  const fixtures = [], rejected = [], seen = new Set();
  for (const row of payload.matches) {
    const home = typeof row.team1 === 'string' ? row.team1.trim() : '';
    const away = typeof row.team2 === 'string' ? row.team2.trim() : '';
    const date = row.date;
    const validDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
    if (!validDate || !home || !away || home === away || !payload.name || /[\u3400-\u9fff]/.test(home + away + payload.name)) {
      rejected.push({ reason: 'INCOMPLETE_SCHEDULE_IDENTITY' }); continue;
    }
    const key = JSON.stringify([sourcePath, date, home, away]);
    if (seen.has(key)) { rejected.push({ reason: 'DUPLICATE_SCHEDULE_RECORD' }); continue; }
    seen.add(key);
    fixtures.push({ providerKey: 'OPENFOOTBALL', sourceRecordKey: key, sourcePath, sourceRevision: revision,
      sourceUrl: `https://github.com/openfootball/football.json/blob/${revision}/${sourcePath}`,
      competition: payload.name, home, away, scheduledDate: date,
      localTime: typeof row.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(row.time) ? row.time : null,
      timezone: null, kickoff: null, canonicalMatchId: null, identityStatus: 'UNRESOLVED',
      verificationStatus: 'COMMUNITY_UNCORROBORATED', observedAt: null,
      fetchedAt: timestamp(fetchedAt), sourceCommittedAt: timestamp(sourceCommittedAt) });
  }
  return { fixtures, rejected, quotes: [] };
}
