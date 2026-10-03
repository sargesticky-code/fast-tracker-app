import assert from "node:assert/strict";
import {
  compareBookmakerQuotes,
  normalizeMarketQuote,
} from "../lib/market-provider-contract.js";

const unknown = normalizeMarketQuote({
  canonicalMatchId: "FB1",
  providerKey: "HKJC",
  market: "GOALS",
  selection: "OVER",
});
assert.equal(unknown.line, null);
assert.equal(unknown.decimalPrice, null);
assert.equal(unknown.observedAt, null);

const hkjc = normalizeMarketQuote({
  canonicalMatchId: "FB1",
  providerKey: "HKJC",
  market: "HDA",
  selection: "H",
  decimalPrice: 2.2,
  observedAt: "2026-10-03T09:00:00+08:00",
});
const aggregate = normalizeMarketQuote({
  canonicalMatchId: "FB1",
  providerKey: "ODDSMATH",
  market: "HDA",
  selection: "H",
  decimalPrice: 2.3,
  observedAt: "2026-10-03T09:00:00+08:00",
});
const bet365 = normalizeMarketQuote({
  canonicalMatchId: "FB1",
  providerKey: "BET365",
  market: "HDA",
  selection: "H",
  decimalPrice: 2.4,
  observedAt: "2026-10-03T09:00:00+08:00",
});

const single = compareBookmakerQuotes([hkjc, aggregate]);
assert.equal(single.comparisonStatus, "SINGLE_BOOKMAKER_ONLY");
assert.equal(single.bookmakerCount, 1);
assert.equal(single.bestAvailablePrice, null);

const multi = compareBookmakerQuotes([hkjc, bet365, aggregate]);
assert.equal(multi.comparisonStatus, "MULTI_BOOKMAKER_VERIFIED");
assert.equal(multi.bookmakerCount, 2);
assert.equal(multi.bestAvailablePrice.providerKey, "BET365");
assert.equal(multi.bestAvailablePrice.decimalPrice, 2.4);

console.log("Provider/market contract passed");
