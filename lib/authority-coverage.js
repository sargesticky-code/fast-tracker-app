import { timestamp } from "./international-authority.js";

// Transition report only: readiness is explicit and never toggles production.
export function compareAuthorityCoverage(legacyFixtures, bundle, { now = Date.now(), maxAgeSeconds = 300 } = {}) {
  if (!Array.isArray(legacyFixtures) || !Array.isArray(bundle?.fixtures) || !Array.isArray(bundle?.quotes) ||
      !Number.isFinite(now) || !Number.isFinite(maxAgeSeconds) || maxAgeSeconds < 0) throw new Error("INVALID_COVERAGE_INPUT");
  const fresh = (v) => timestamp(v) && Date.parse(v) <= now && now - Date.parse(v) <= maxAgeSeconds * 1000;
  const upcoming = (v) => timestamp(v) && Date.parse(v) > now;
  const oldIds = new Set(legacyFixtures.filter((f) => upcoming(f.kickoff ?? f.kickoff_hkt))
    .map((f) => f.canonicalMatchId ?? f.hkjc_event_id ?? f.id).filter(Boolean));
  const newFixtures = bundle.fixtures.filter((f) => upcoming(f.kickoff));
  const verified = newFixtures.filter((f) => f.canonicalMatchId && f.identityStatus === "VERIFIED" && fresh(f.fetchedAt));
  // One canonical ID cannot represent two oriented fixtures. Provider namespaces
  // may differ, so compare kickoff and each provider's own identity separately.
  const identities = new Map(), eventOwners = new Map(), conflictedIds = new Set();
  for (const f of verified) {
    const id = f.canonicalMatchId;
    const eventKey = JSON.stringify([f.providerKey, f.providerEventId]);
    if (eventOwners.has(eventKey) && eventOwners.get(eventKey) !== id) {
      conflictedIds.add(id); conflictedIds.add(eventOwners.get(eventKey));
    }
    eventOwners.set(eventKey, id);
    const key = JSON.stringify([f.providerKey, f.providerEventId, f.providerCompetitionId,
      f.homeTeamId ?? f.home?.id, f.awayTeamId ?? f.away?.id, timestamp(f.kickoff)]);
    if (!identities.has(id)) identities.set(id, new Map());
    const byProvider = identities.get(id);
    const prior = byProvider.get(f.providerKey);
    if ((prior && prior !== key) || [...byProvider.values()].some(v => JSON.parse(v).at(-1) !== timestamp(f.kickoff))) conflictedIds.add(id);
    byProvider.set(f.providerKey, key);
  }
  const newIds = new Set(verified.map((f) => f.canonicalMatchId).filter(id => !conflictedIds.has(id)));
  const groups = new Map();
  for (const quote of bundle.quotes) {
    if (!newIds.has(quote.canonicalMatchId) || quote.market !== "HDA" || quote.line !== null ||
        quote.status !== "OBSERVED" || quote.identityStatus !== "VERIFIED" || quote.bookmakerKind !== "BOOKMAKER" ||
        !quote.bookmakerKey || !["H", "D", "A"].includes(quote.selection) || typeof quote.decimalPrice !== "number" ||
        quote.decimalPrice <= 1 || !Number.isFinite(quote.decimalPrice) || !fresh(quote.observedAt) || !fresh(quote.fetchedAt)) continue;
    // A complete HDA board must be one provider/bookmaker observation, not a
    // collage of selections collected on different snapshots or transports.
    const key = JSON.stringify([quote.canonicalMatchId, quote.providerKey, quote.bookmakerKey, quote.observedAt, quote.fetchedAt]);
    if (!groups.has(key)) groups.set(key, { id: quote.canonicalMatchId, selections: new Map(), conflicted: false });
    const group = groups.get(key);
    if (group.selections.has(quote.selection) && group.selections.get(quote.selection) !== quote.decimalPrice) group.conflicted = true;
    group.selections.set(quote.selection, quote.decimalPrice);
  }
  const conflictingHdaIds = new Set([...groups.values()].filter(g => g.conflicted).map(g => g.id));
  for (const rejected of bundle.rejected ?? []) {
    if (rejected.reason === "CROSS_PAGE_CONFLICTING_OBSERVATION" && rejected.market === "HDA" &&
        newIds.has(rejected.canonicalMatchId)) conflictingHdaIds.add(rejected.canonicalMatchId);
  }
  const priced = new Set([...groups.values()].filter((g) => !conflictingHdaIds.has(g.id) && g.selections.size === 3).map((g) => g.id));
  const missingFixtures = [...oldIds].filter((id) => !newIds.has(id));
  const missingHda = [...oldIds].filter((id) => !priced.has(id));
  const unresolved = newFixtures.filter((f) => !f.canonicalMatchId || f.identityStatus !== "VERIFIED");
  return { generatedAt: new Date(now).toISOString(), legacyUpcoming: oldIds.size, newUpcoming: newFixtures.length,
    verifiedUpcoming: newIds.size, freshHdaFixtures: priced.size,
    additionalVerifiedIds: [...newIds].filter((id) => !oldIds.has(id)), missingFixtureIds: missingFixtures, missingHdaIds: missingHda,
    conflictingFixtureIds: [...conflictedIds],
    conflictingHdaFixtureIds: [...conflictingHdaIds],
    unresolvedProviderIds: unresolved.map((f) => `${f.providerKey}:${f.providerEventId}`),
    readiness: oldIds.size === 0 ? "NO_COMPARISON_BASELINE" : missingFixtures.length || missingHda.length || unresolved.length || conflictedIds.size || conflictingHdaIds.size ? "BLOCKED" : "SHADOW_COVERAGE_PASSED",
    // Coverage alone cannot authorize cutover: detail/model/lineup/live consumers
    // and database joins still need independent verification.
    productionCutoverAuthorized: false };
}
