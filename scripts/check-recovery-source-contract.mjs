import fs from "node:fs";

const home = fs.readFileSync("components/homepage-client.js", "utf8");
const detail = fs.readFileSync("components/match-detail-client.js", "utf8");
const lineup = fs.readFileSync("components/lineup-panel.js", "utf8");
const story = fs.readFileSync("supabase/functions/app-match-story/index.ts", "utf8");
const detailApi = fs.readFileSync("supabase/functions/app-match-detail/index.ts", "utf8");

const checks = [
  [home.includes('feedState?.status === "error"'), "homepage must render a distinct feed-error state"],
  [home.includes("No fixtures are available in the current feed."), "successful empty-feed state must remain distinct"],
  [home.includes('setFeedState({ status: "ready", message: null })'), "valid matches array must clear outage state"],
  [home.includes("Showing the last successful fixture list; freshness is unknown until refresh recovers."), "outage with retained rows must disclose unknown freshness"],
  [home.includes('" cached matches · feed unavailable"'), "outage result count must label retained rows as cached"],
  [detail.includes('payload?.fixtureSource === "MISSING" && !payload?.fixture'), "detail must detect canonical fixture absence"],
  [detail.includes('setReady(true);'), "missing canonical fixture must be able to terminate loading"],
  [detail.includes('cached && !canonicalMissing'), "missing canonical fixture must not restore stale cached match"],
  [detailApi.includes('fixtureSource = fixtureUpcoming.data ? "UPCOMING" : fixtureLive.data ? "LIVE" : "MISSING"'), "detail API contract must expose fixtureSource=MISSING"],
  [detailApi.includes('"SOURCE_CONFIRMED_IDENTITY_UNRESOLVED"'), "detail API must preserve unresolved canonical player identity"],
  [lineup.includes('factStatus(r) === "CONFIRMED"'), "lineup counts must use canonical-confirmed rows when fact_status exists"],
  [lineup.includes('playerStatusRaw.filter((r) => factStatus(r) === "CONFIRMED")'), "availability rows must preserve canonical player identity gate"],
  [lineup.includes('"—/11"'), "identity-blocked XI count must remain unknown rather than zero"],
  [lineup.includes('"IDENTITY_BLOCKED"'), "canonical fixture absence must block lineup promotion"],
  [!story.includes("f.corners?.avg!==null") && !story.includes("f.corners?.avg !== null"), "story must not use unsafe optional-chain !== null Corners guard"],
  [!story.includes("fb?.corners?.avg!==null") && !story.includes("fb?.corners?.avg !== null"), "match script must not use unsafe optional-chain !== null Corners guard"],
  [story.includes("num(f.corners?.avg) !== null"), "fallback story must use null-safe numeric Corners gate"],
  [story.includes("num(fb?.corners?.avg)!==null"), "match script must use null-safe numeric Corners gate"],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error("Recovery source contract failed:");
  for (const message of failed) console.error("- " + message);
  process.exit(1);
}
console.log("Recovery source contract passed: outage/empty distinction, canonical fixture exit, identity unknown≠zero, null-safe Corners.");
