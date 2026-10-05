import assert from "node:assert/strict";
import fs from "node:fs";

// Load the actual public calculation module without changing the app's module mode.
const source = fs.readFileSync("lib/fast-tracker.js", "utf8");
const { normalizedTriplet, preferredModel, valueEdge, prematchValueSignal, marketSourceLabel } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
for (const missing of [null, undefined, "", "  ", false, true, [], {}, NaN, Infinity, -0.2, 101]) {
  assert.equal(normalizedTriplet({ home: missing, draw: 0.3, away: 0.2 }), null);
  assert.equal(valueEdge({ forebet: { home: missing, draw: 0.3, away: 0.2 }, odds: { home: 2, draw: 3, away: 4 } }), null);
}
assert.deepEqual(normalizedTriplet({ home: 0, draw: 0.4, away: 0.6 }), { home: 0, draw: 0.4, away: 0.6 });
assert.deepEqual(normalizedTriplet({ home: "50", draw: "30", away: "20" }), { home: 0.5, draw: 0.3, away: 0.2 });
assert.equal(normalizedTriplet({ home: 0, draw: 0, away: 0 }), null);
const fallback = { home: 0.5, draw: 0.3, away: 0.2 };
assert.equal(preferredModel({ multi: { home: null, draw: 0.3, away: 0.2 }, form: fallback }), fallback);
assert.equal(preferredModel({ multi: fallback, form: { home: 0.4, draw: 0.3, away: 0.3 } }), fallback);
assert.equal(preferredModel({}), null);
console.log("Prematch probability gates passed: missing remains unknown; valid fallback and genuine zero survive.");

const now = Date.parse("2026-10-05T00:00:00Z");
const valueMatch = {
  kickoff: "2026-10-05T05:00:00Z", status: "PREEVENT",
  forebet: { home: .6, draw: .2, away: .2 },
  form: { home: .59, draw: .21, away: .2 }, formDetail: { source: "HKJC_RESULTS" },
  odds: { home: 2.2, draw: 3.3, away: 3.1 },
  health: { hkjcFreshness: "FRESH", hkjcPriceChangedAt: "2026-10-04T23:30:00Z" }
};
assert.equal(prematchValueSignal(valueMatch, now).eligible, true);
assert.equal(prematchValueSignal({ ...valueMatch, inPlay: true, liveNow: false }, now).eligible, true);
assert.equal(prematchValueSignal({ ...valueMatch, forebet: null }, now).status, "WATCH");
const correlated = { ...valueMatch, forebet: null, dc: valueMatch.form, dcDetail: { source: "HKJC_RESULTS" } };
assert.equal(prematchValueSignal(correlated, now).edge.familyCount, 1);
assert.equal(prematchValueSignal(correlated, now).eligible, false);
for (const hkjcPriceChangedAt of [null, "", "invalid", "2026-10-04T10:00:00Z", "2026-10-05T00:00:01Z"]) {
  const signal = prematchValueSignal({ ...valueMatch, updatedAt: new Date(now).toISOString(), health: { ...valueMatch.health, hkjcPriceChangedAt, hkjcFetchedAt: new Date(now).toISOString() } }, now);
  assert.equal(signal.status, "REFERENCE");
  assert.equal(signal.eligible, false);
  assert.ok(signal.edge, "real nominal comparison remains reference-only");
}
assert.equal(prematchValueSignal(valueMatch, now, false).status, "REFERENCE");
assert.equal(prematchValueSignal({ ...valueMatch, health: { ...valueMatch.health, hkjcFreshness: "STALE" } }, now).eligible, false);
assert.equal(prematchValueSignal({ ...valueMatch, kickoff: new Date(now).toISOString() }, now).edge, null);
assert.equal(prematchValueSignal({ ...valueMatch, liveNow: true }, now).edge, null);
assert.equal(prematchValueSignal({ ...valueMatch, odds: { ...valueMatch.odds, draw: null } }, now).edge, null);
console.log("Prematch Value gates passed: source-time freshness, kickoff, market completeness and independent evidence.");

assert.equal(marketSourceLabel(valueMatch, valueMatch.odds), "HKJC");
assert.equal(marketSourceLabel(valueMatch, { ...valueMatch.odds, providerKey: "BET365" }), "Bet365");
assert.equal(marketSourceLabel(valueMatch, { providerKey: "UNKNOWN" }), "Source unverified");
assert.equal(marketSourceLabel(valueMatch, { providerLabel: "International Bookmaker" }), "International Bookmaker");
assert.equal(marketSourceLabel(valueMatch, valueMatch.odds, true), "Source unverified");
assert.equal(marketSourceLabel({}, {}), "Source unverified");
console.log("Quote attribution passed: explicit source wins; unknown/live never inherits prematch bookmaker.");
