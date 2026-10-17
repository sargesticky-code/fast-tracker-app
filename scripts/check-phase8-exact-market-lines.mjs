import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GOAL_LINES,CORNER_LINES,verifiedSourceMarket,exactLineForecast }
  from "../lib/line-aware-forecasts.js";
import { verifiedSummaryMap } from "../lib/verified-evidence-feed.js";

assert.deepEqual(GOAL_LINES,[1.5,2.5,3.5,4.5]);
assert.deepEqual(CORNER_LINES,[8.5,9.5,10.5,11.5]);
const goals=verifiedSourceMarket({line:2.5,over:0.54,under:0.46,pick:"Over"},"goals");
const corners=verifiedSourceMarket({line:9.5,over:0.51,under:0.49,pick:"Over",
  predictedScore:"6 - 5",avgCorners:10.34},"corners");
assert.equal(exactLineForecast(goals,2.5)?.over,0.54);
assert.equal(exactLineForecast(corners,9.5)?.over,0.51);
assert.equal(exactLineForecast(goals,3.5),null,"2.5 probabilities cannot be reused at goals 3.5");
assert.equal(exactLineForecast(goals,4.5),null,"2.5 probabilities cannot be reused at goals 4.5");
assert.equal(exactLineForecast(corners,10.5),null,"9.5 probabilities cannot be reused at corners 10.5");
assert.equal(exactLineForecast(corners,8.5),null,"9.5 probabilities cannot be reused at corners 8.5");
assert.equal(verifiedSourceMarket({line:3.5,over:0.35,under:0.65,pick:"Under"},"goals")?.line,3.5,
  "future genuine source 3.5 markets are supported");
assert.equal(verifiedSourceMarket({line:10.5,over:0.35,under:0.65,pick:"Under"},"corners")?.line,10.5,
  "future genuine source corners 10.5 markets are supported");
assert.equal(verifiedSourceMarket({over:0.54,under:0.46,pick:"Over"},"goals"),null,
 "unknown line must not default to 2.5");
assert.equal(verifiedSourceMarket({line:2.5,over:0.54,under:0.46,pick:"Over"},"corners"),null,
 "wrong market kind must fail closed");
assert.equal(verifiedSourceMarket({line:9.5,over:0.54,under:0.46,pick:"Over"},"goals"),null);
assert.equal(verifiedSourceMarket({line:2.5,over:0.8,under:0.8,pick:"Over"},"goals"),null,
 "incoherent percentage sum");
assert.equal(verifiedSourceMarket({line:2.5,over:0.54,under:0.46,pick:null},"goals"),null,
 "market pick must be genuine");
assert.equal(verifiedSourceMarket({line:2.5,over:"0.54",under:0.46,pick:"Over"},"goals"),null,
 "string odds not probability");
const item={
  id:"FS:SxpU5PzH",kickoff:new Date(Date.now()+5*3600_000).toISOString(),
  home:"Sample FC",away:"Test United",league:"Premier League",
  sourceContext:{source:"FLASHSCORE"},
  forebet:{home:0.4,draw:0.3,away:0.3},
  forebetDetail:{
    fetchedAt:new Date(Date.now()-600_000).toISOString(),
    predictedScore:"2 - 1",
    ou25:{line:2.5,over:0.54,under:0.46,pick:"Over",avgGoals:2.81},
    corners95:{line:9.5,over:0.51,under:0.49,pick:"Over",avgCorners:10.34,predictedScore:"6 - 5"}
  }
};
const response=verifiedSummaryMap({
  source:"flashscore-single-rpc-canonical",generatedAt:new Date().toISOString(),
  matches:[item]
});
const e=response.byId.get(item.id);
assert.equal(e?.forebetOU25?.line,2.5);
assert.equal(e?.forebetCorners95?.line,9.5);
assert.equal(exactLineForecast(e.forebetOU25,4.5),null);
assert.equal(exactLineForecast(e.forebetCorners95,10.5),null);
const withoutLine=verifiedSummaryMap({
  source:"flashscore-single-rpc-canonical",generatedAt:new Date().toISOString(),
  matches:[{...item,forebetDetail:{...item.forebetDetail,
    ou25:{...item.forebetDetail.ou25,line:null}}}]
});
assert.equal(withoutLine.byId.get(item.id).forebetOU25,null);
const api=readFileSync(new URL("../supabase/functions/app-phase1-feed/index.ts",import.meta.url),"utf8");
assert.ok(api.includes("line:2.5"));
assert.ok(api.includes("line:9.5"));
const ui=readFileSync(new URL("../components/homepage-client.js",import.meta.url),"utf8");
assert.ok(ui.includes("exactLineForecast(evidence.forebetOU25,goalsLine)"));
assert.ok(ui.includes("exactLineForecast(evidence.forebetCorners95,cornersLine)"));
assert.ok(ui.includes('data-testid="forebet-goals-line"'));
assert.ok(ui.includes('data-testid="forebet-corners-line"'));
console.log("PHASE8_EXPLICIT_FOREBET_MARKET_LINES_PASSED");
