import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifiedSummaryMap} from "../lib/verified-evidence-feed.js";

const linesGoals={
 "1.5":{overCount:4,underCount:1,sample:5},
 "2.5":{overCount:3,underCount:2,sample:5},
 "3.5":{overCount:2,underCount:3,sample:5},
 "4.5":{overCount:1,underCount:4,sample:5}
};
const linesCorners={
 "8.5":{overCount:4,underCount:1,sample:5},
 "9.5":{overCount:3,underCount:2,sample:5},
 "10.5":{overCount:2,underCount:3,sample:5},
 "11.5":{overCount:1,underCount:4,sample:5}
};
const basis={
 source:"football-data.co.uk",scope:"domestic-league-results-only",
 resultsNewestFirst:"WWDLW",matches:5,wins:3,draws:1,losses:1,
 goalsFor:10,goalsAgainst:6,throughDate:"2026-10-05",
 over25Count:3,over25Rate:60,averageGoals:3.2,
 bttsCount:3,bttsRate:60,
 matchesWithCorners:5,over95CornersCount:3,under95CornersCount:2,
 over95CornersRate:60,under95CornersRate:40,
 averageCornersFor:5.6,averageCornersAgainst:4.2,averageTotalCorners:9.8,
 observedGoalLines:linesGoals,observedCornerLines:linesCorners,
 limitedToFileCoverage:true
};
const item=(h)=>({
 id:"FS:SxpU5PzH",home:"Test Home",away:"Test Away",league:"Premier League",
 kickoff:"2026-10-20T19:00:00Z",sourceContext:{source:"FLASHSCORE"},
 historicalForm:{home:h,away:basis}
});
function parsed(h){
 const out=verifiedSummaryMap({
  source:"flashscore-single-rpc-canonical",
  generatedAt:"2026-10-17T12:45:00Z",matches:[item(h)]
 });
 return out.byId.get("FS:SxpU5PzH")?.historicalForm?.home;
}
const good=parsed(basis);
assert.ok(good);
assert.equal(good.observedGoalLines["3.5"].overCount,2);
assert.equal(good.observedGoalLines["4.5"].sample,5);
assert.equal(good.observedCornerLines["10.5"].overCount,2);
assert.equal(good.observedCornerLines["11.5"].underCount,4);
assert.equal(good.observedGoalLines["2.5"].overCount,good.over25Count);
assert.equal(good.observedCornerLines["9.5"].overCount,good.over95CornersCount);
assert.equal(parsed({...basis,observedGoalLines:{...linesGoals,"3.5":{overCount:6,underCount:-1,sample:5}}}).observedGoalLines,undefined,"invalid counts fail closed");
assert.equal(parsed({...basis,observedCornerLines:{...linesCorners,"10.5":{overCount:5,underCount:0,sample:5}}}).observedCornerLines,undefined,"historical over counts must decrease at higher line");
assert.equal(parsed({...basis,observedGoalLines:{...linesGoals,"2.5":{overCount:4,underCount:1,sample:5}}}).observedGoalLines,undefined,"must match prior validated 2.5");
assert.equal(parsed({...basis,observedCornerLines:{...linesCorners,"9.5":{overCount:4,underCount:1,sample:5}}}).observedCornerLines,undefined,"must match prior validated 9.5");
const beforeKickoff=parsed({...basis,throughDate:"2026-10-21"});
assert.equal(beforeKickoff,null,"future result leakage forbidden");
const noCornerSample=parsed({...basis,matchesWithCorners:2,
 observedCornerLines:{"8.5":{overCount:1,underCount:1,sample:2}}});
assert.equal(noCornerSample?.observedCornerLines,undefined,"tiny corner sample cannot look meaningful");
const sql=readFileSync(new URL("../supabase/migrations/20261017125000_phase9_historical_exact_goal_corner_lines.sql",import.meta.url),"utf8");
assert.ok(sql.includes("m.match_date<(p_fixture_kickoff AT TIME ZONE 'Europe/London')::date"),"past-only protection retained");
assert.ok(sql.includes("LIMIT 5"),"short, bounded results sample retained");
assert.ok(sql.includes("observedGoalLines")&&sql.includes("observedCornerLines"));
const ui=readFileSync(new URL("../components/homepage-client.js",import.meta.url),"utf8");
assert.ok(ui.includes("Recorded goals O/U"));
assert.ok(ui.includes("Recorded corners O/U"));
assert.ok(ui.includes("Historical results, not a forecast"));
assert.ok(ui.includes("goalsLine={goalsLine} cornersLine={cornersLine}"));
console.log("PHASE9_HISTORICAL_MULTI_LINES_VALIDATED");
