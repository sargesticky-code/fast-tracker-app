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
  status: "OBSERVED",
});
const aggregate = normalizeMarketQuote({
  canonicalMatchId: "FB1",
  providerKey: "ODDSMATH",
  market: "HDA",
  selection: "H",
  decimalPrice: 2.3,
  observedAt: "2026-10-03T09:00:00+08:00",
  status: "OBSERVED",
});
const bet365 = normalizeMarketQuote({
  canonicalMatchId: "FB1",
  providerKey: "BET365",
  market: "HDA",
  selection: "H",
  decimalPrice: 2.4,
  observedAt: "2026-10-03T09:00:00+08:00",
  status: "OBSERVED",
});

const policy = { now: Date.parse("2026-10-03T09:01:00+08:00") };
const single = compareBookmakerQuotes([hkjc, aggregate], policy);
assert.equal(single.comparisonStatus, "SINGLE_BOOKMAKER_ONLY");
assert.equal(single.bookmakerCount, 1);
assert.equal(single.bestAvailablePrice, null);

const multi = compareBookmakerQuotes([hkjc, bet365, aggregate], policy);
assert.equal(multi.comparisonStatus, "MULTI_BOOKMAKER_VERIFIED");
assert.equal(multi.bookmakerCount, 2);
assert.equal(multi.bestAvailablePrice.providerKey, "BET365");
assert.equal(multi.bestAvailablePrice.decimalPrice, 2.4);
assert.equal(compareBookmakerQuotes([hkjc, { ...bet365, canonicalMatchId: "FB2" }], policy).comparisonStatus, "INCOMPARABLE_QUOTES");
assert.equal(compareBookmakerQuotes([hkjc, { ...bet365, selection: "A" }], policy).bestAvailablePrice, null);
assert.equal(compareBookmakerQuotes([hkjc, bet365], { now: policy.now + 3600000 }).bookmakerCount, 0);
assert.equal(compareBookmakerQuotes([{ ...hkjc, observedAt: null }], policy).bookmakerCount, 0);
assert.equal(compareBookmakerQuotes([{ ...hkjc, status: "STALE" }], policy).bookmakerCount, 0);
assert.equal(compareBookmakerQuotes([{ ...hkjc, observedAt: "2026-10-03 01:00:00" }], policy).comparisonStatus, "NO_USABLE_QUOTES");
assert.equal(normalizeMarketQuote({ line: "  " }).line, null);

console.log("Provider/market contract passed");
