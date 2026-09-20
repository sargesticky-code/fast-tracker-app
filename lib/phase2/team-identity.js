/* Phase 2 only: deterministic team identity matching.
 * No Phase 1 probabilities/edges and no Phase 3 live signals are consumed here.
 */

const GENERIC_TOKENS = new Set([
  "fc", "cf", "sc", "afc", "ac", "club", "football", "soccer",
  "women", "woman", "ladies", "u20", "u21", "u23", "reserves"
]);

export function normalizeTeamName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\butd\b/g, " united ")
    .replace(/\bst\.?\b/g, " saint ")
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function meaningfulTokens(name) {
  return normalizeTeamName(name)
    .split(" ")
    .filter(Boolean)
    .filter((token) => !GENERIC_TOKENS.has(token));
}

function tokenSimilarity(left, right) {
  const a = new Set(meaningfulTokens(left));
  const b = new Set(meaningfulTokens(right));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}

function nameScore(hkjcName, sourceName, aliases = []) {
  const hk = normalizeTeamName(hkjcName);
  const candidates = [sourceName, ...aliases].filter(Boolean).map(normalizeTeamName);
  if (candidates.includes(hk)) return 1;
  return Math.max(0, ...candidates.map((candidate) => tokenSimilarity(hk, candidate)));
}

function kickoffDeltaMinutes(hkjcKickoff, sourceKickoff) {
  const a = new Date(hkjcKickoff).getTime();
  const b = new Date(sourceKickoff).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  return Math.abs(a - b) / 60000;
}

/**
 * Match one HKJC fixture to one source event. Both teams must independently match.
 * A reversed home/away event is rejected. Ambiguous top candidates are rejected.
 */
export function matchTeamIdentityEvent(hkjcFixture, sourceEvents, options = {}) {
  const {
    aliasBySourceTeamId = {},
    maxKickoffDeltaMinutes = 20,
    minimumTeamScore = 0.72,
    ambiguityMargin = 0.08
  } = options;

  const ranked = (sourceEvents || []).map((event) => {
    const delta = kickoffDeltaMinutes(hkjcFixture.kickoff, event.kickoff);
    const homeAliases = aliasBySourceTeamId[String(event.home?.id)] || [];
    const awayAliases = aliasBySourceTeamId[String(event.away?.id)] || [];
    const homeScore = nameScore(hkjcFixture.home, event.home?.name, homeAliases);
    const awayScore = nameScore(hkjcFixture.away, event.away?.name, awayAliases);
    const reversedHome = nameScore(hkjcFixture.home, event.away?.name, awayAliases);
    const reversedAway = nameScore(hkjcFixture.away, event.home?.name, homeAliases);
    const reversed = reversedHome >= minimumTeamScore && reversedAway >= minimumTeamScore;
    const eligible = !reversed && delta <= maxKickoffDeltaMinutes && homeScore >= minimumTeamScore && awayScore >= minimumTeamScore;
    const score = eligible ? ((homeScore + awayScore) / 2) - Math.min(delta, maxKickoffDeltaMinutes) / maxKickoffDeltaMinutes * 0.05 : 0;
    return { event, delta, homeScore, awayScore, reversed, eligible, score };
  }).filter((row) => row.eligible).sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    return { status: "UNRESOLVED", reason: "NO_SAFE_CANDIDATE", confidence: 0 };
  }

  const best = ranked[0];
  const runnerUp = ranked[1];
  if (runnerUp && best.score - runnerUp.score < ambiguityMargin) {
    return {
      status: "UNRESOLVED",
      reason: "AMBIGUOUS_CANDIDATES",
      confidence: best.score,
      candidateEventIds: [best.event.id, runnerUp.event.id]
    };
  }

  return {
    status: "CONFIRMED_IDENTITY",
    confidence: Number(best.score.toFixed(4)),
    sourceEventId: best.event.id,
    sourceHomeTeamId: best.event.home.id,
    sourceAwayTeamId: best.event.away.id,
    sourceHomeName: best.event.home.name,
    sourceAwayName: best.event.away.name,
    kickoffDeltaMinutes: Number(best.delta.toFixed(2))
  };
}

export function buildTeamIdentityEvidence({ fixture, match, source = "sofascore", fetchedAt, sourceUrl }) {
  if (!match || match.status !== "CONFIRMED_IDENTITY") return [];
  const common = {
    hkjc_event_id: fixture.id,
    source,
    source_event_id: String(match.sourceEventId),
    source_url: sourceUrl || null,
    fetched_at: fetchedAt || new Date().toISOString(),
    confirmed: true,
    confidence: match.confidence,
    evidence_type: "TEAM_IDENTITY"
  };
  return [
    { ...common, side: "HOME", hkjc_team_name: fixture.home, source_team_id: String(match.sourceHomeTeamId), source_team_name: match.sourceHomeName },
    { ...common, side: "AWAY", hkjc_team_name: fixture.away, source_team_id: String(match.sourceAwayTeamId), source_team_name: match.sourceAwayName }
  ];
}
