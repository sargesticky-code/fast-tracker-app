const { test, expect } = require("@playwright/test");
const fs = require("fs");
fs.mkdirSync("test-results",{recursive:true});
const snapshot = {
  source:"FLASHSCORE_BET365",captured_at:new Date().toISOString(),
  discovered:Array.from({length:40},(_,i)=>({
    provider_event_id:"event"+i,home:"Home "+i,away:"Away "+i,
    competition:i%2?"League A":"League B",fixture_date:i<35?"2026-10-11":"2026-10-12",
    time_text:i?"15:30":null
  })),
  fixtures:[{provider_event_id:"event1",hda:{home:2.2,draw:3.3,away:4.4},captured_at:"2026-10-11T00:59:00Z"}]
};
const summary = {
  source:"flashscore-single-rpc-canonical",generatedAt:"2026-10-11T01:00:00Z",
  count:2,
  matches:[
    {id:"FS:event0",home:"Home 0",away:"Away 0",league:"League B",kickoff:"2026-10-11T15:30:00Z",forebet:{home:0.45,draw:0.25,away:0.30},
      forebetDetail:{predictedScore:"2-1",ou25:{over:0.62,under:0.38,pick:"Over",avgGoals:3.08},corners95:{over:0.44,under:0.56,pick:"Under",predictedScore:"5-3",avgCorners:8.75}},
      scoreHome:1,scoreAway:0,scoreSource:"FLASHSCORE",
      sourceContext:{source:"FLASHSCORE",lineupAvailable:true,
        lineupCoverage:{homeStarters:11,awayStarters:11,updatedAt:"2026-10-11T00:50:00Z"},
        observedStats:{source:"FLASHSCORE",capturedAt:"2026-10-11T00:55:00Z",
          stats:{shots:{home:3,away:2},corners:{home:1,away:0},xg:{home:0.33,away:0.12}}}}},
    {id:"FS:event1",home:"Home 1",away:"Away 1",league:"League A",kickoff:"2026-10-11T16:00:00Z",forebetDetail:{predictedScore:"0-2"},
      sourceContext:{source:"FLASHSCORE",lineupAvailable:false}}
  ],
  systemHealth:{FLASHSCORE_BET365:{status:"OK",raw:{snapshotFresh:true}}}
};
const lineups=Array.from({length:22},(_,i)=>({
  player_key:""+(i+1),player_name:"Player "+i,team_side:i<11?"H":"A",
  confirmed:true,starter:true,source_name:"FOTMOB_OFFICIAL"
}));
const detail = {
  id:"FS:event0",requestedId:"FS:event0",fixtureSource:"CANONICAL_FLASHSCORE",
  fixture:{match_id:"FS:event0",home_en:"Home 0",away_en:"Away 0",
    tournament:"League B",kickoff_hkt:"2026-10-11T15:30:00Z",score_home:1,score_away:0,status:"FINISHED"},
  models:{
    forebet:{predicted_score:"2-1",avg_goals:2.71,
      prob_home:45,prob_draw:25,prob_away:30,prob_over25:62,prob_under25:38,corner_prob_under95:56,corner_prob_over95:44,corner_predicted_score:"5-3",avg_corners:8.75,fetched_at:"2026-10-11T00:30:00Z"},
    internal:{quality:"MODELED",dc_prob_home:0.45,dc_prob_draw:0.25,dc_prob_away:0.30,model_source:"RESULTS_HISTORY"}
  },
  flashscoreStats:{source:"FLASHSCORE",capturedAt:"2026-10-11T00:55:00Z",
    stats:{shots:{home:3,away:2},corners:{home:1,away:0},
      xg:{home:0.33,away:0.12},possession:{home:51,away:49}}},
  humanFactors:{
    lineup:lineups,
    lineupProvenance:{sourceConfirmed:true,canonicalIdentitiesVerified:true,
      source:"FOTMOB_OFFICIAL",confirmedAt:"2026-10-11T00:55:00Z"},
    managers:[{team_side:"H",manager_name:"Manager Home",source_name:"FLASHSCORE"}],
    playerMatchStats:[{playerId:"1",playerName:"Player 0",teamName:"Home 0",rating:7.82,totalShots:3,
      shotsOnTarget:2,accuratePasses:30,passAttempts:35,goals:1,assists:0}],
    playerMatchStatsMeta:{source:"FOTMOB",observedAt:"2026-10-11T01:00:00Z",lineupRowsMatched:1}
  }
};
const cors={"access-control-allow-origin":"*"};
function mockEndpoints(page,{raw=snapshot,source=summary,deep=detail}={}){
  page.route("**/snapshot",r=>raw===null?r.fulfill({status:503,body:"Unavailable",headers:cors}):r.fulfill({json:raw,headers:cors}));
  page.route("**/functions/v1/app-phase1-feed**",r=>source===null?r.fulfill({status:503,body:"Unavailable",headers:cors}):r.fulfill({json:source,headers:cors}));
  page.route("**/functions/v1/app-match-detail**",r=>deep===null?r.fulfill({status:503,body:"Unavailable",headers:cors}):r.fulfill({json:deep,headers:cors}));
}
test("Flashscore team names use the matching Supabase logo sprite tiles",async({page})=>{
 const raw={...snapshot,discovered:snapshot.discovered.map(f=>f.provider_event_id==="event0"
   ?{...f,home:"Coventry",away:"Newcastle"}:f)};
 mockEndpoints(page,{raw});
 page.route("**/storage/v1/object/public/football-logos/team-logo-index-v20261012b.json",r=>r.fulfill({json:{
  atlas:"football-logo-atlas.webp",columns:64,rows:73,aliases:{},logos:{
   "coventry city":[{x:1,y:0}],newcastle:[{x:2,y:0}]
  }
 },headers:cors}));
 await page.goto("http://127.0.0.1:4173/");
 const firstRow=page.locator(".ft-match-row").first();
 await expect(firstRow.getByText("Coventry",{exact:true})).toBeVisible();
 await expect(firstRow.getByText("Newcastle",{exact:true})).toBeVisible();
 await expect(firstRow.locator(".ft-team-logo")).toHaveCount(2);
 await expect(firstRow.locator(".ft-team-logo").first()).toHaveCSS("background-image",/football-logo-atlas(?:-v\d{8}b?)?\.webp/);
});
for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 test("raw with exact-ID verified enrichment "+viewport.width,async({page})=>{
  await page.setViewportSize(viewport);
  const external=[];
  page.on("request",r=>{
    if(!r.url().startsWith("http://127.0.0.1:4173"))external.push(r.url());
  });
  mockEndpoints(page);
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.locator(".ft-match-row")).toHaveCount(40);
  await expect(page.getByTestId("verified-status")).toContainText("2 exact Flashscore IDs linked");
  expect(external.some(url=>url.includes("/app-phase1-feed?view=compact&hours=48"))).toBeTruthy();
  await expect(page.getByRole("button",{name:"2026-10-11 · 35"})).toBeVisible();
  await expect(page.getByText("Time not supplied")).toBeVisible();
  await expect(page.getByText("Forebet predicted score", {exact:false}).first()).toBeVisible();
  await expect(page.getByText("Forebet Goals 2.5", {exact:false}).first()).toBeVisible();
  await expect(page.getByText("Forebet Corners 9.5", {exact:false}).first()).toBeVisible();
  await expect(page.getByTestId("historical-match-stats").first()).toContainText("Not final/live totals");
  await page.screenshot({path:"test-results/enriched-board-"+viewport.width+".png",fullPage:true});

  await page.getByRole("button",{name:"2026-10-12 · 5"}).click();
  await expect(page.locator(".ft-match-row")).toHaveCount(5);
  await page.getByRole("button",{name:"All fixtures · 40"}).click();
  await page.getByLabel("Search",{exact:true}).fill("Home 1");
  await expect(page.locator(".ft-match-row")).toHaveCount(11);
  await page.getByLabel("Search",{exact:true}).fill("Home 0");
  await page.locator(".ft-match-row").click();
  await expect(page.getByRole("heading",{name:"Home 0 vs Away 0"})).toBeVisible();
  await expect(page.getByText("Raw prices: — / — / —")).toBeVisible();
  await expect(page.getByTestId("verified-match-analysis")).toContainText("Forebet predicted score: 2-1");
  await expect(page.getByTestId("forebet-goals-25")).toContainText("Over 62%");
  await expect(page.getByTestId("forebet-corners-95")).toContainText("Under 56%");
  await expect(page.getByTestId("official-xi")).toContainText("Player 21");
  await expect(page.getByTestId("fotmob-player-stats")).toContainText("Player 0");
  await expect(page.getByTestId("historical-flashscore-stats")).toContainText("not verified final totals");
  await expect(page.getByTestId("historical-flashscore-stats")).toContainText("Expected goals (xG)");
  await page.getByText("Original Flashscore source fields").click();
  await expect(page.locator("pre")).toContainText('"time_text": null');
  expect(external.every(url=>url.includes("fast-tracker-dashboard-production.up.railway.app/snapshot")
    ||url.includes("hekqxhgjexzxnecwhyao.supabase.co/functions/v1/")
    ||url.includes("hekqxhgjexzxnecwhyao.supabase.co/storage/v1/object/public/football-logos/"))).toBeTruthy();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({path:"test-results/enriched-detail-"+viewport.width+".png",fullPage:true});
 });
}
test("raw remains available when verified analysis fails",async({page})=>{
  mockEndpoints(page,{source:null,deep:null});
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.locator(".ft-match-row")).toHaveCount(40);
  await expect(page.getByTestId("verified-status")).toContainText("temporarily unavailable");
  await page.getByLabel("Search",{exact:true}).fill("Home 0");
  await page.locator(".ft-match-row").click();
  await expect(page.getByRole("heading",{name:"Home 0 vs Away 0"})).toBeVisible();
  await expect(page.getByText("Verified analysis unavailable. Raw fixture fields remain visible.")).toBeVisible();
});
test("unavailable raw source does not invent fixture counts",async({page})=>{
  mockEndpoints(page,{raw:null,source:null,deep:null});
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.locator("p[role=alert]")).toContainText("Fixture counts are unknown");
  await expect(page.getByRole("button",{name:"All fixtures · —"})).toBeVisible();
});
test("mismatched analysis identity is rejected, not joined by team names",async({page})=>{
  mockEndpoints(page,{deep:{...detail,id:"FS:wrong",fixture:{...detail.fixture,match_id:"FS:wrong"}}});
  await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
  await expect(page.getByRole("heading",{name:"Home 0 vs Away 0"})).toBeVisible();
  await expect(page.getByText("Verified analysis unavailable. Raw fixture fields remain visible.")).toBeVisible();
  await expect(page.getByTestId("official-xi")).toHaveCount(0);
});

test("cold or stale raw snapshot uses exact canonical source fallback without invented quotes",async({page})=>{
  mockEndpoints(page,{raw:{...snapshot,captured_at:null,discovered:[],fixtures:[],count:0}});
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.getByTestId("canonical-fallback")).toContainText("2 verified Flashscore canonical fixtures");
  await expect(page.locator(".ft-match-row")).toHaveCount(2);
  await expect(page.getByText("Canonical kickoff 15:30 UTC")).toBeVisible();
  await expect(page.locator(".ft-raw-odds").first()).toContainText("—");
  await page.locator(".ft-match-row").first().click();
  await expect(page.getByRole("heading",{name:"Home 0 vs Away 0"})).toBeVisible();
  await expect(page.getByTestId("verified-match-analysis")).toContainText("Forebet predicted score: 2-1");
  await expect(page.getByText("Raw prices: — / — / —")).toHaveCount(0);
});

test("stale raw bookmaker prices are suppressed without hiding the fixture",async({page})=>{
  mockEndpoints(page,{source:null,deep:null});
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.locator(".ft-match-row")).toHaveCount(40);
  await page.getByLabel("Search",{exact:true}).fill("Home 1");
  const row=page.locator(".ft-match-row").filter({hasText:"Home 1"}).first();
  await expect(row.locator(".ft-raw-odds")).toContainText("Stale quote hidden");
  await expect(row.locator(".ft-raw-odds")).not.toContainText("2.2");
});
test("fresh complete bookmaker reference prices display but are never called live",async({page})=>{
  const captured=new Date().toISOString();
  const raw={...snapshot,captured_at:captured,
    fixtures:[{provider_event_id:"event1",hda:{home:2.2,draw:3.3,away:4.4},captured_at:captured}]};
  mockEndpoints(page,{raw,source:null,deep:null});
  await page.goto("http://127.0.0.1:4173/");
  await page.getByLabel("Search",{exact:true}).fill("Home 1");
  const row=page.locator(".ft-match-row").filter({hasText:"Home 1"}).first();
  await expect(row.locator(".ft-raw-odds")).toContainText("2.2");
  await expect(row.locator(".ft-raw-odds")).toContainText("Reference captured");
});
test("incomplete Forebet HDA remains unknown instead of treating null as zero",async({page})=>{
  const invalid={...summary,matches:[
    {...summary.matches[0],forebet:{home:null,draw:0.45,away:0.55}}
  ]};
  mockEndpoints(page,{source:invalid,deep:null});
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.getByTestId("verified-status")).toContainText("1 exact Flashscore IDs linked");
  await page.getByLabel("Search",{exact:true}).fill("Home 0");
  const row=page.locator(".ft-match-row").first();
  await expect(row).toContainText("Forebet predicted score");
  await expect(row).not.toContainText("Forebet H/D/A");
});

test("invalid incomplete Forebet market pair remains unknown",async({page})=>{
  const broken={...summary,matches:[
    {...summary.matches[0],forebetDetail:{predictedScore:"2-1",
      ou25:{over:null,under:0.38,pick:"Over"},corners95:{over:0.9,under:0.7,pick:"Over"}}}
  ]};
  mockEndpoints(page,{source:broken,deep:null});
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.locator(".ft-match-row")).toHaveCount(40);
  await page.getByLabel("Search",{exact:true}).fill("Home 0");
  const row=page.locator(".ft-match-row").first();
  await expect(row).not.toContainText("Forebet Goals 2.5");
  await expect(row).not.toContainText("Forebet Corners 9.5");
});
