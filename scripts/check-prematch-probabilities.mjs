import assert from "node:assert/strict";
import fs from "node:fs";

// Load the actual public calculation module without changing the app's module mode.
const source = fs.readFileSync("lib/fast-tracker.js", "utf8");
const { normalizedTriplet, preferredModel, valueEdge } = await import(
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
