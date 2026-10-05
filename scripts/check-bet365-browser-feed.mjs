import { bet365BrowserLive, assertNoFabricatedOdds } from "../lib/bet365-browser-feed.js";

const sample = [{
  id: "12345",
  event: "Liverpool v Manchester City",
  league: "England Premier League",
  time: "62:14",
  score: "1-1",
  period: "SecondHalf"
}];

const out = bet365BrowserLive(sample, "2026-10-05T10:00:00Z");
if (out.fixtures.length !== 1) throw new Error("fixture parse failed");
const f = out.fixtures[0];
if (f.providerKey !== "BET365_BROWSER" || f.bookmakerKey !== "bet365") throw new Error("provider mismatch");
if (f.home !== "Liverpool" || f.away !== "Manchester City") throw new Error("team parse failed");
if (f.minute !== 62 || f.second !== 14 || f.homeScore !== 1 || f.awayScore !== 1) throw new Error("live state parse failed");
if (f.canonicalMatchId !== null || f.identityStatus !== "UNRESOLVED") throw new Error("identity must fail closed");
assertNoFabricatedOdds(out);

const unknown = bet365BrowserLive([{ id:"x", event:"A v B", league:"L", time:"bad", score:"", period:"FirstHalf" }], "2026-10-05T10:00:00Z");
if (unknown.fixtures[0].minute !== null || unknown.fixtures[0].homeScore !== null) throw new Error("unknown-not-zero failed");

console.log("bet365 browser-feed contract ok");
