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
  const newIds = new Set(verified.map((f) => f.canonicalMatchId));
  const groups = new Map();
  for (const quote of bundle.quotes) {
    if (!newIds.has(quote.canonicalMatchId) || quote.market !== "HDA" || quote.line !== null ||
        quote.status !== "OBSERVED" || quote.identityStatus !== "VERIFIED" || quote.bookmakerKind !== "BOOKMAKER" ||
        !quote.bookmakerKey || !["H", "D", "A"].includes(quote.selection) || typeof quote.decimalPrice !== "number" ||
        quote.decimalPrice <= 1 || !Number.isFinite(quote.decimalPrice) || !fresh(quote.observedAt) || !fresh(quote.fetchedAt)) continue;
    // A complete HDA board must be one provider/bookmaker observation, not a
    // collage of selections collected on different snapshots or transports.
    const key = JSON.stringify([quote.canonicalMatchId, quote.providerKey, quote.bookmakerKey, quote.observedAt, quote.fetchedAt]);
    if (!groups.has(key)) groups.set(key, { id: quote.canonicalMatchId, selections: new Set() });
    groups.get(key).selections.add(quote.selection);
  }
  const priced = new Set([...groups.values()].filter((g) => g.selections.size === 3).map((g) => g.id));
  const missingFixtures = [...oldIds].filter((id) => !newIds.has(id));
  const missingHda = [...oldIds].filter((id) => !priced.has(id));
  const unresolved = newFixtures.filter((f) => !f.canonicalMatchId || f.identityStatus !== "VERIFIED");
  return { generatedAt: new Date(now).toISOString(), legacyUpcoming: oldIds.size, newUpcoming: newFixtures.length,
    verifiedUpcoming: newIds.size, freshHdaFixtures: priced.size,
    additionalVerifiedIds: [...newIds].filter((id) => !oldIds.has(id)), missingFixtureIds: missingFixtures, missingHdaIds: missingHda,
    unresolvedProviderIds: unresolved.map((f) => `${f.providerKey}:${f.providerEventId}`),
    readiness: oldIds.size === 0 ? "NO_COMPARISON_BASELINE" : missingFixtures.length || missingHda.length || unresolved.length ? "BLOCKED" : "SHADOW_COVERAGE_PASSED",
    // Coverage alone cannot authorize cutover: detail/model/lineup/live consumers
    // and database joins still need independent verification.
    productionCutoverAuthorized: false };
}
