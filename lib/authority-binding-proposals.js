import { timestamp } from './international-authority.js';

// Review-only bridge into existing canonical fixtures. Never allocate IDs,
// infer aliases, or turn a proposal into a verified binding automatically.
export function proposeAuthorityBindings(fixtures, canonicalFixtures, {
  competitions = [], teams = [], toleranceSeconds = 60, now = Date.now(), maxAgeSeconds = 300,
} = {}) {
  if (!Array.isArray(fixtures) || !Array.isArray(canonicalFixtures) ||
      !Array.isArray(competitions) || !Array.isArray(teams) ||
      !Number.isFinite(now) || !Number.isFinite(maxAgeSeconds) || maxAgeSeconds < 0 ||
      !Number.isFinite(toleranceSeconds) || toleranceSeconds < 0 || toleranceSeconds > 300) throw new Error('INVALID_BINDING_INPUT');
  const proposals = [], unresolved = [];
  const mapped = (rows, canonicalField) => {
    const ids = [...new Set(rows.filter(r => r.verified === true && typeof r[canonicalField] === 'string' && r[canonicalField].trim()).map(r => r[canonicalField]))];
    return ids.length === 1 ? ids[0] : null;
  };
  for (const f of fixtures) {
    const reject = reason => unresolved.push({ providerKey: f.providerKey, providerEventId: f.providerEventId, reason });
    if (!f.providerKey || !f.providerEventId || !f.providerCompetitionId || !f.homeTeamId || !f.awayTeamId ||
        f.homeTeamId === f.awayTeamId || !timestamp(f.kickoff)) { reject('INCOMPLETE_PROVIDER_IDENTITY'); continue; }
    const fetchedAt = timestamp(f.fetchedAt);
    if (!fetchedAt || Date.parse(fetchedAt) > now || now - Date.parse(fetchedAt) > maxAgeSeconds * 1000) {
      reject('STALE_OR_UNKNOWN_PROVIDER_FETCH'); continue;
    }
    const competition = mapped(competitions.filter(m => m.providerKey === f.providerKey && m.providerCompetitionId === f.providerCompetitionId), 'canonicalCompetitionId');
    const team = id => mapped(teams.filter(m => m.providerKey === f.providerKey &&
      m.providerCompetitionId === f.providerCompetitionId && m.providerTeamId === id), 'canonicalTeamId');
    const home = team(f.homeTeamId), away = team(f.awayTeamId);
    if (!competition || !home || !away || home === away) { reject('UNREVIEWED_OR_AMBIGUOUS_ENTITY_MAPPING'); continue; }
    const candidates = canonicalFixtures.filter(c => typeof c.canonicalMatchId === 'string' && c.canonicalMatchId.trim() &&
      c.canonicalCompetitionId === competition && c.homeTeamId === home && c.awayTeamId === away &&
      timestamp(c.kickoff) && Math.abs(Date.parse(c.kickoff) - Date.parse(f.kickoff)) <= toleranceSeconds * 1000);
    const ids = [...new Set(candidates.map(c => c.canonicalMatchId))];
    if (ids.length !== 1) { reject(ids.length ? 'AMBIGUOUS_CANONICAL_FIXTURE' : 'NO_CANONICAL_FIXTURE'); continue; }
    proposals.push({ providerKey: f.providerKey, providerEventId: f.providerEventId,
      providerCompetitionId: f.providerCompetitionId, homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId,
      kickoff: timestamp(f.kickoff), fetchedAt, canonicalMatchId: ids[0], verified: false,
      status: 'REQUIRES_IDENTITY_REVIEW', evidence: { canonicalCompetitionId: competition,
        canonicalHomeTeamId: home, canonicalAwayTeamId: away, toleranceSeconds,
        candidateKickoffs: [...new Set(candidates.map(c => timestamp(c.kickoff)))],
        kickoffDifferencesSeconds: [...new Set(candidates.map(c => Math.abs(Date.parse(c.kickoff) - Date.parse(f.kickoff)) / 1000))],
        evaluatedAt: new Date(now).toISOString(), maxAgeSeconds } });
  }
  // Multiple provider events claiming the same existing match are ambiguous.
  const owners = new Map(), events = new Map();
  for (const p of proposals) {
    const key = JSON.stringify([p.providerKey, p.canonicalMatchId]);
    if (!owners.has(key)) owners.set(key, new Set());
    owners.get(key).add(p.providerEventId);
    const eventKey = JSON.stringify([p.providerKey, p.providerEventId]);
    if (!events.has(eventKey)) events.set(eventKey, new Set());
    events.get(eventKey).add(p.canonicalMatchId);
  }
  const accepted = [], seen = new Set();
  for (const p of proposals) {
    if (owners.get(JSON.stringify([p.providerKey, p.canonicalMatchId])).size > 1 ||
        events.get(JSON.stringify([p.providerKey, p.providerEventId])).size > 1) {
      unresolved.push({ providerKey: p.providerKey, providerEventId: p.providerEventId, reason: 'MULTIPLE_PROVIDER_EVENTS_FOR_CANONICAL_FIXTURE' });
    } else {
      const key = JSON.stringify(p);
      if (!seen.has(key)) { seen.add(key); accepted.push(p); }
    }
  }
  return { generatedAt: new Date(now).toISOString(), mode: 'REVIEW_ONLY', proposals: accepted, unresolved, productionCutoverAuthorized: false };
}
