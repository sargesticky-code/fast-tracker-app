const { test, expect } = require("@playwright/test");
const { spawnSync } = require("node:child_process");
const fs = require("fs");
fs.mkdirSync("test-results",{recursive:true});
const snapshot = {
  source:"FLASHSCORE_BET365",captured_at:new Date().toISOString(),
  discovered:Array.from({length:40},(_,i)=>({
    provider_event_id:"event"+i,home:"Home "+i,away:"Away "+i,
    competition:i%2?"Europa League - League phaseEUROPE: Standings":"Champions League - League phaseEUROPE: Standings",fixture_date:i<35?"2026-10-11":"2026-10-12",
    time_text:i?"15:30":null
  })),
  fixtures:[{provider_event_id:"event1",hda:{home:2.2,draw:3.3,away:4.4},captured_at:"2026-10-11T00:59:00Z"}]
};
const summary = {
  source:"flashscore-single-rpc-canonical",generatedAt:"2026-10-11T01:00:00Z",
  count:2,
  matches:[
    {id:"FS:event0",home:"Home 0",away:"Away 0",league:"Champions League",kickoff:"2026-10-11T15:30:00Z",forebet:{home:0.45,draw:0.25,away:0.30},
      forebetDetail:{predictedScore:"2-1",ou25:{over:0.62,under:0.38,pick:"Over",avgGoals:3.08},corners95:{over:0.44,under:0.56,pick:"Under",predictedScore:"5-3",avgCorners:8.75}},
      historicalForm:{home:{source:"football-data.co.uk",scope:"domestic-league-results-only",matches:5,resultsNewestFirst:"DLDLD",wins:0,draws:3,losses:2,goalsFor:5,goalsAgainst:8,throughDate:"2026-10-08",over25Count:2,over25Rate:40,averageGoals:2.6,bttsCount:3,bttsRate:60,matchesWithCorners:5,over95CornersCount:2,under95CornersCount:3,over95CornersRate:40,under95CornersRate:60,averageCornersFor:4.8,averageCornersAgainst:4.4,averageTotalCorners:9.2},away:null},
      scoreHome:1,scoreAway:0,scoreSource:"FLASHSCORE",
      sourceContext:{source:"FLASHSCORE",lineupAvailable:true,
        lineupCoverage:{homeStarters:11,awayStarters:11,updatedAt:"2026-10-11T00:50:00Z"},
        observedStats:{source:"FLASHSCORE",capturedAt:"2026-10-11T00:55:00Z",
          stats:{shots:{home:3,away:2},corners:{home:1,away:0},xg:{home:0.33,away:0.12}}}}},
    {id:"FS:event1",home:"Home 1",away:"Away 1",league:"Champions League",kickoff:"2026-10-11T16:00:00Z",forebetDetail:{predictedScore:"0-2"},
      sourceContext:{source:"FLASHSCORE",lineupAvailable:false}}
  ],
  systemHealth:{FLASHSCORE_BET365:{status:"OK",raw:{snapshotFresh:true}}}
};
const lineups=Array.from({length:22},(_,i)=>({
  player_key:""+(1000+i),player_name:"Player "+i,team_side:i<11?"H":"A",
  confirmed:true,starter:true,source_name:"FOTMOB_OFFICIAL",formation_slot:i===0||i===11?"1:3":null,
  fotmob_profile:{fotmobId:""+(1000+i),position:"Midfielder",nationality:"England",age:25,height:"180 cm",
    updatedAt:"2026-10-11T00:55:00Z",
    recentMatches:[{minutes:90,goals:1,assists:0},{minutes:65,goals:0,assists:1}]}
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
    playerMatchStats:[{playerId:"1000",playerName:"Player 0",teamName:"Home 0",rating:7.82,totalShots:3,
      shotsOnTarget:2,accuratePasses:30,passAttempts:35,goals:1,assists:0}],
    playerMatchStatsMeta:{source:"FOTMOB",observedAt:"2026-10-11T01:00:00Z",lineupRowsMatched:1}
  }
};
const cors={"access-control-allow-origin":"*"};
function mockEndpoints(page,{raw=snapshot,source=summary,deep=detail}={}){
  page.route("**/snapshot",r=>raw===null?r.fulfill({status:503,body:"Unavailable",headers:cors}):r.fulfill({json:raw,headers:cors}));
  page.route("**/functions/v1/app-phase1-feed**",r=>source===null?r.fulfill({status:503,body:"Unavailable",headers:cors}):r.fulfill({json:source,headers:cors}));
  page.route("**/functions/v1/app-match-detail**",r=>deep===null?r.fulfill({status:503,body:"Unavailable",headers:cors}):r.fulfill({json:deep,headers:cors}));
  page.route("**/functions/v1/forebet-provisional-feed**",r=>r.fulfill({json:{
    source:"FOREBET_PROVISIONAL",quality:"PROVISIONAL_NOT_VERIFIED",
    generatedAt:new Date().toISOString(),rows:[]},headers:cors}));
}
test("reversible Forebet one-team match is visible but never classed as verified",async({page})=>{
  const kickoff=new Date(Date.now()+24*3600000).toISOString();
  const raw={...snapshot,discovered:snapshot.discovered.map(x=>x.provider_event_id==="event1"
    ? {...x,fixture_date:kickoff.slice(0,10)}:x)};
  const source={...summary,generatedAt:new Date().toISOString(),
    matches:summary.matches.map(x=>x.id==="FS:event1"?{...x,kickoff}:x)};
  mockEndpoints(page,{raw,source});
  page.route("**/functions/v1/forebet-provisional-feed**",r=>r.fulfill({json:{
    source:"FOREBET_PROVISIONAL",quality:"PROVISIONAL_NOT_VERIFIED",
    generatedAt:new Date().toISOString(),rows:[{
      id:"FS:event1",kickoff,home:"Home 1",away:"Away 1",
      sourceHome:"Home 1",sourceAway:"Source Away Alias",matchedSide:"HOME",
      pick:"1",probabilities:[48,28,24],predictedScore:"2-0",
      avgGoals:2.7,sourceUrl:"https://www.forebet.com/en/football/matches/h1-sa-123456",
      lastChecked:new Date().toISOString(),status:"PROVISIONAL_NOT_VERIFIED"
    }]
  },headers:cors}));
  await page.goto("http://127.0.0.1:4173/");
  await page.getByTestId("scope-all").click();
  const fixture=page.locator('[data-fixture-id="FS:event1"] [data-testid="fixture-row"]');
  await expect(fixture.getByTestId("forebet-provisional")).toContainText("only Home verified");
  await expect(fixture.getByTestId("forebet-provisional")).toContainText("48/28/24%");
  await expect(fixture.getByTestId("forebet-hda")).toHaveCount(0);
  await expect(page.getByTestId("advisor-forebet-provisional-summary")).toContainText("1 one-team links");
  await expect(page.getByTestId("advisor-forebet-summary")).not.toContainText("3 saved");
});

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
 const firstRow=page.locator(".ft-match-row").filter({hasText:"Coventry"}).first();
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
  await expect(page.getByTestId("match-overview")).toBeVisible();
  await expect(page.getByTestId("overview-matches")).toContainText("40");
  await expect(page.getByTestId("overview-details")).toContainText("2");
  await expect(page.getByTestId("overview-predictions")).toContainText("2");
  await expect(page.getByTestId("overview-lineups")).toContainText("1");
  await expect(page.getByTestId("overview-odds")).toContainText("0");
  await expect(page.getByTestId("overview-insight-status")).toContainText("Stats ready");
  await expect(page.locator(".ft-home")).not.toContainText("exact Flashscore IDs linked");
  await expect(page.locator(".ft-home")).not.toContainText("bookmaker snapshot");
  await expect(page.locator(".ft-home")).not.toContainText("Raw provider fixtures are preferred");
  expect(external.some(url=>url.includes("/app-phase1-feed?view=compact&hours=48"))).toBeTruthy();
  await expect(page.getByRole("button",{name:/10-11/}).first()).toBeVisible();
  await expect(page.getByTestId("fixture-row").filter({hasText:"Home 0"}).getByTestId("uk-kickoff")).toHaveText("16:30");
  await expect(page.getByTestId("fixture-row").filter({hasText:"Home 0"}).getByTestId("match-score")).toHaveAttribute("title","Actual score: 1–0");
  await expect(page.getByTestId("fixture-row").filter({hasText:"Home 0"}).getByTestId("match-prediction")).toContainText("2-1");
  // The compact feed carries verified Forebet avg_goals; never replace an
  // absent value with 0, an unrelated historical mean, or a Poisson guess.
  await expect(page.getByTestId("fixture-row").filter({hasText:"Home 0"}).getByTestId("forebet-average-goals")).toContainText("3.08");
  await expect(page.getByTestId("fixture-row").filter({hasText:"Home 1"}).getByTestId("forebet-average-goals")).toHaveCount(0);
  await expect(page.getByTestId("fixture-row").filter({hasText:"Home 0"}).getByTestId("forebet-goals-25")).toContainText("O 62%");
  await expect(page.getByTestId("fixture-row").filter({hasText:"Home 0"}).getByTestId("forebet-corners-95")).toContainText("U 56%");
  await expect(page.getByTestId("fixture-row").filter({hasText:"Home 0"}).getByTestId("confirmed-xi")).toContainText("XI");
  await expect(page.locator(".ft-match-list")).not.toContainText("Flashscore event");
  await page.screenshot({path:"test-results/enriched-board-"+viewport.width+".png",fullPage:true});

  await page.getByRole("button",{name:/10-12/}).first().click();
  await expect(page.locator(".ft-match-row")).toHaveCount(5);
  await page.getByRole("button",{name:"All days"}).click();
  await page.getByLabel("Search",{exact:true}).fill("Home 1");
  await expect(page.locator(".ft-match-row")).toHaveCount(11);
  await page.getByLabel("Search",{exact:true}).fill("Home 0");
  await page.locator(".ft-match-row").click();
  await expect(page.getByRole("heading",{name:"Home 0 vs Away 0"})).toBeVisible();
  await expect(page.getByTestId("match-odds")).toContainText("No recorded odds available");
  await expect(page.getByTestId("verified-match-analysis")).toContainText("Forebet predicted score: 2-1");
  await expect(page.locator(".ft-match-when")).toContainText("Final score 1–0");
  await expect(page.getByTestId("forebet-goals-25")).toContainText("Over 62%");
  await expect(page.getByTestId("forebet-corners-95")).toContainText("Under 56%");
  await expect(page.getByTestId("official-xi")).toContainText("Player 21");
  await expect(page.getByTestId("official-xi").getByRole("heading")).toHaveText("Confirmed starting XI");
  await expect(page.getByTestId("official-xi")).toContainText("Starting XI confirmed by the source");
  await expect(page.getByTestId("player-profile-drawer")).toHaveCount(0);
  await expect(page.getByTestId("official-xi-pitch")).toBeVisible();
  const firstPlayer=page.getByRole("button",{name:"View player profile: Player 0"});
  await firstPlayer.click();
  const drawer=page.getByRole("dialog",{name:"Player 0"});
  await expect(drawer).toBeVisible();
  await expect(page.getByTestId("fotmob-selected-player")).toContainText("Midfielder");
  await expect(page.getByTestId("fotmob-selected-player")).toContainText("155");
  await expect(page.getByTestId("fotmob-selected-player")).toContainText("7.82");
  await expect(drawer.getByRole("link",{name:/View full profile on FotMob/})).toHaveAttribute("href","https://www.fotmob.com/players/1000");
  await expect(drawer.getByRole("button",{name:"Close player profile"})).toBeFocused();
  const drawerBox=await drawer.boundingBox();
  expect(drawerBox).toBeTruthy();
  if(viewport.width<=720) expect(Math.abs(drawerBox.y+drawerBox.height-viewport.height)).toBeLessThan(4);
  else expect(Math.abs(drawerBox.x+drawerBox.width-viewport.width)).toBeLessThan(4);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(firstPlayer).toBeFocused();
  // A player without a pitch slot remains actionable from the unpositioned XI list.
  await page.getByRole("button",{name:"View player profile: Player 12"}).click();
  await expect(page.getByRole("dialog",{name:"Player 12"})).toBeVisible();
  await expect(page.getByRole("dialog",{name:"Player 12"}).getByRole("heading",{name:"Player 12"})).toBeVisible();
  await expect(page.getByRole("link",{name:/View full profile on FotMob/})).toHaveAttribute("href","https://www.fotmob.com/players/1012");
  await page.getByRole("button",{name:"Close player profile"}).click();
  await expect(page.getByTestId("player-profile-drawer")).toHaveCount(0);
  await expect(page.getByTestId("official-xi-pitch").locator(".ft-xi-marker")).toHaveCount(2);
  await expect(page.getByTestId("official-xi-pitch")).toContainText("source positions unavailable");
  await expect(page.locator(".ft-raw-detail")).not.toContainText("No verified in-play bookmaker odds.");
  await expect(page.locator(".ft-raw-detail")).not.toContainText("prematch reference only");
  await expect(page.getByTestId("fotmob-player-stats")).toContainText("Player 0");
  await expect(page.getByTestId("historical-flashscore-stats")).toContainText("not verified final totals");
  await expect(page.getByTestId("historical-flashscore-stats")).toContainText("Expected goals (xG)");
  await expect(page.getByText("Original Flashscore source fields")).toHaveCount(0);
  await expect(page.locator(".ft-raw-detail pre")).toHaveCount(0);
  expect(external.every(url=>url.includes("fast-tracker-dashboard-production.up.railway.app/snapshot")
    ||url.includes("hekqxhgjexzxnecwhyao.supabase.co/functions/v1/")
    ||url.includes("hekqxhgjexzxnecwhyao.supabase.co/storage/v1/object/public/football-logos/"))).toBeTruthy();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({path:"test-results/enriched-detail-"+viewport.width+".png",fullPage:true});
 });
}
test("actual score freshness is visible when the compact source timestamp is available",async({page})=>{
 await page.clock.install({time:new Date("2026-10-11T01:00:00Z")});
 const raw={...snapshot,discovered:[snapshot.discovered[0]]};
 const source={...summary,matches:[{...summary.matches[0],scoreCapturedAt:"2026-10-11T00:59:30Z"}]};
 mockEndpoints(page,{raw,source});
 await page.goto("http://127.0.0.1:4173/");
 await expect(page.getByTestId("match-score")).toContainText("captured just now");
});

test("official player names remain visible when canonical player identity is unresolved",async({page})=>{
  const unresolved=lineups.map(row=>({...row,source_name:"FLASHSCORE_OFFICIAL",fotmob_profile:null,
    canonical_player_key:null,canonical_player_name:null}));
  const deep={...detail,humanFactors:{...detail.humanFactors,lineup:unresolved,
    lineupProvenance:{source:"FLASHSCORE_OFFICIAL",sourceConfirmed:true,canonicalIdentitiesVerified:false,
      confirmedAt:"2026-10-11T00:55:00Z"}}};
  mockEndpoints(page,{deep});
  await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
  const panel=page.getByTestId("official-xi");
  await expect(panel.getByRole("heading")).toHaveText("Confirmed starting XI");
  await expect(panel).toContainText("Source player identities have not been resolved to canonical player records");
  await expect(panel).toContainText("Player 0");
  await expect(panel).toContainText("Player 21");
});
test("predicted lineup is never labeled as confirmed",async({page})=>{
  const predicted=lineups.map(row=>({...row,confirmed:false,predicted:true}));
  const deep={...detail,humanFactors:{...detail.humanFactors,lineup:predicted,
    lineupProvenance:{source:"FOREBET",sourceConfirmed:false,predicted:true,status:"PREDICTED",
      canonicalIdentitiesVerified:false}}};
  mockEndpoints(page,{deep});
  await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
  const panel=page.getByTestId("official-xi");
  await expect(panel.getByRole("heading")).toHaveText("Predicted starting XI");
  await expect(panel).toContainText("Predicted lineup; not confirmed by the source");
  await expect(panel).not.toContainText("Confirmed starting XI");
});
test("raw remains available when verified analysis fails",async({page})=>{
  mockEndpoints(page,{source:null,deep:null});
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.locator(".ft-match-row")).toHaveCount(40);
  await expect(page.getByTestId("overview-insight-status")).toContainText("Stats limited");
  await expect(page.getByTestId("overview-details")).toContainText("—");
  await expect(page.getByTestId("overview-matches")).toContainText("40");
  await page.getByLabel("Search",{exact:true}).fill("Home 0");
  await page.locator(".ft-match-row").click();
  await expect(page.getByRole("heading",{name:"Home 0 vs Away 0"})).toBeVisible();
  await expect(page.getByText("More match details are not available yet.")).toBeVisible();
});
test("unavailable raw source does not invent fixture counts",async({page})=>{
  mockEndpoints(page,{raw:null,source:null,deep:null});
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.locator("p[role=alert]")).toContainText("Fixtures temporarily unavailable");
  await expect(page.getByTestId("fixture-row")).toHaveCount(0);
});
test("mismatched analysis identity is rejected, not joined by team names",async({page})=>{
  mockEndpoints(page,{deep:{...detail,id:"FS:wrong",fixture:{...detail.fixture,match_id:"FS:wrong"}}});
  await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
  await expect(page.getByRole("heading",{name:"Home 0 vs Away 0"})).toBeVisible();
  await expect(page.getByText("More match details are not available yet.")).toBeVisible();
  await expect(page.getByTestId("official-xi")).toHaveCount(0);
});

test("cold or stale raw snapshot uses exact canonical source fallback without invented quotes",async({page})=>{
  mockEndpoints(page,{raw:{...snapshot,captured_at:null,discovered:[],fixtures:[],count:0}});
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.getByTestId("canonical-fallback")).toContainText("2 saved matches");
  await expect(page.locator(".ft-match-row")).toHaveCount(2);
  await expect(page.getByTestId("fixture-row").filter({hasText:"Home 0"}).getByTestId("uk-kickoff")).toHaveText("16:30");
  await expect(page.locator(".ft-odds-cell").first()).toContainText("Unavailable · no verified quote");
  await page.locator(".ft-match-row").filter({hasText:"Home 0"}).first().click();
  await expect(page.getByRole("heading",{name:"Home 0 vs Away 0"})).toBeVisible();
  await expect(page.getByTestId("verified-match-analysis")).toContainText("Forebet predicted score: 2-1");
  await expect(page.getByTestId("match-odds")).toContainText("No recorded odds available");
});

test("stale raw bookmaker prices are suppressed without hiding the fixture",async({page})=>{
  const source={...summary,fixtureKickoffs:[{id:"FS:event1",kickoff:new Date(Date.now()+3*3600000).toISOString()}]};
  const raw={...snapshot,discovered:snapshot.discovered.filter(f=>f.provider_event_id==="event1")};
  mockEndpoints(page,{raw,source,deep:null});
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.locator(".ft-match-row")).toHaveCount(1);
  await page.getByLabel("Search",{exact:true}).fill("Home 1");
  const row=page.locator(".ft-match-row").filter({hasText:"Home 1"}).first();
  await expect(row.locator(".ft-odds-cell")).toContainText("Stale quote unavailable");
  await expect(row.locator(".ft-odds-cell")).not.toContainText("2.2");
});
test("fresh complete bookmaker reference prices display but are never called live",async({page})=>{
  const captured=new Date().toISOString();
  const raw={...snapshot,captured_at:captured,
    discovered:snapshot.discovered.filter(f=>f.provider_event_id==="event1"),
    fixtures:[{provider_event_id:"event1",hda:{home:2.2,draw:3.3,away:4.4},captured_at:captured}]};
  const kickoff=new Date(Date.now()+3*3600000).toISOString();
  const source={...summary,fixtureKickoffs:[{id:"FS:event1",kickoff}]};
  mockEndpoints(page,{raw,source,deep:null});
  await page.goto("http://127.0.0.1:4173/");
  await page.getByLabel("Search",{exact:true}).fill("Home 1");
  const row=page.locator(".ft-match-row").filter({hasText:"Home 1"}).first();
  await expect(row.locator(".ft-odds-cell")).toContainText("2.20");
  await expect(row.getByTestId("match-odds-status")).toContainText("Recent");
  await expect(row.locator(".ft-odds-cell")).not.toContainText("captured");
  await expect(row.locator(".ft-odds-cell")).not.toContainText("live");
});
test("stale, invalid, and absent quotes have distinct states while fixtures remain visible",async({page})=>{
  const now=new Date().toISOString();
  const stale=new Date(Date.now()-35*60000).toISOString();
  const kickoff=new Date(Date.now()+3*3600000).toISOString();
  const raw={...snapshot,captured_at:now,discovered:[0,1,2].map(i=>({provider_event_id:"event"+i,
    home:"Home "+i,away:"Away "+i,competition:"Champions League - League phaseEUROPE",
    fixture_date:kickoff.slice(0,10),time_text:"15:30"})),fixtures:[
    {provider_event_id:"event0",captured_at:stale,hda:{home:2.1,draw:3.2,away:4.2}},
    {provider_event_id:"event1",captured_at:now,hda:{home:0,draw:3.2,away:4.2}}
  ]};
  const source={...summary,fixtureKickoffs:[0,1].map(i=>({id:"FS:event"+i,kickoff}))};
  mockEndpoints(page,{raw,source});
  await page.goto("http://127.0.0.1:4173/");
  const staleRow=page.getByTestId("fixture-row").filter({hasText:"Home 0"});
  const invalidRow=page.getByTestId("fixture-row").filter({hasText:"Home 1"});
  const missingRow=page.getByTestId("fixture-row").filter({hasText:"Home 2"});
  await expect(staleRow).toContainText("2.10");
  await expect(staleRow.getByTestId("match-odds-status")).toContainText("Earlier · stale reference");
  await expect(invalidRow.getByTestId("match-odds-status")).toContainText("Invalid quote unavailable");
  await expect(missingRow.getByTestId("match-odds-status")).toContainText("Unavailable · no verified quote");
  await expect(page.getByTestId("fixture-row")).toHaveCount(3);
});
test("incomplete Forebet HDA remains unknown instead of treating null as zero",async({page})=>{
  const invalid={...summary,matches:[
    {...summary.matches[0],forebet:{home:null,draw:0.45,away:0.55}}
  ]};
  mockEndpoints(page,{source:invalid,deep:null});
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.getByTestId("overview-details")).toContainText("1");
  await page.getByLabel("Search",{exact:true}).fill("Home 0");
  const row=page.locator(".ft-match-row").first();
  await expect(row.getByTestId("match-prediction")).toContainText("2-1");
  await expect(row.getByTestId("forebet-hda")).toHaveCount(0);
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
  await expect(row.getByTestId("forebet-goals-25")).toHaveCount(0);
  await expect(row.getByTestId("forebet-corners-95")).toHaveCount(0);
});

test("source-backed FotMob coordinates plot all 22 starters without inventing positions",async({page})=>{
  const fullSlots=["1:3","2:1","2:2","2:4","2:5","3:2","3:4","4:1","4:3","4:5","5:3"];
  const completeLineup=lineups.map((row,i)=>{
    const p=i%11;
    return {...row,formation_slot:fullSlots[p],formation:"4-2-3-1",
      position_x:p===0?0.5:((p%5)+0.5)/5, position_y:p===0?0.1:(p<5?0.3:p<7?0.5:p<10?0.7:0.9)};
  });
  mockEndpoints(page,{deep:{...detail,humanFactors:{...detail.humanFactors,lineup:completeLineup}}});
  await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
  const pitch=page.getByTestId("official-xi-pitch");
  await expect(pitch).toBeVisible();
  await expect(pitch.locator(".ft-xi-marker")).toHaveCount(22);
  await expect(pitch.getByRole("button",{name:/View player profile/})).toHaveCount(22);
  await expect(pitch).toContainText("Formation 4-2-3-1");
  await expect(pitch).not.toContainText("Player positions not supplied");
  await expect(pitch.locator(".ft-xi-roster-player")).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

test("malformed coordinates do not invent player pitch positions",async({page})=>{
  const invalid=lineups.map((row,i)=>({...row,formation_slot:null,position_x:i===0?4:null,position_y:0.5}));
  mockEndpoints(page,{deep:{...detail,humanFactors:{...detail.humanFactors,lineup:invalid}}});
  await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
  const pitch=page.getByTestId("official-xi-pitch");
  await expect(pitch.locator(".ft-xi-marker")).toHaveCount(0);
  await expect(pitch.locator(".ft-xi-roster-player")).toHaveCount(22);
  await pitch.getByRole("button",{name:"View player profile: Player 1",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"Player 1"})).toBeVisible();
  await page.getByRole("button",{name:"Close player profile"}).click();
});

test("FotMob player insights never join by name or mislabel Flashscore identities",async({page})=>{
  const nonFotmob=lineups.map(x=>({...x,source_name:"FLASHSCORE_OFFICIAL",fotmob_profile:null}));
  mockEndpoints(page,{deep:{...detail,humanFactors:{...detail.humanFactors,lineup:nonFotmob}}});
  await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
  await expect(page.getByTestId("official-xi")).toBeVisible();
  await page.getByRole("button",{name:"View player profile: Player 0"}).click();
  const drawer=page.getByTestId("player-profile-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId("fotmob-profile-unavailable")).toBeVisible();
  await expect(drawer.getByRole("link",{name:/FotMob/})).toHaveCount(0);
});
test("FotMob player insights reject mismatched profile identifiers",async({page})=>{
  const corrupt=lineups.map(x=>({...x,fotmob_profile:{...x.fotmob_profile,fotmobId:"9999"}}));
  mockEndpoints(page,{deep:{...detail,humanFactors:{...detail.humanFactors,lineup:corrupt}}});
  await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
  await page.getByRole("button",{name:"View player profile: Player 0"}).click();
  const drawer=page.getByTestId("player-profile-drawer");
  await expect(drawer.getByTestId("fotmob-profile-unavailable")).toBeVisible();
  await expect(drawer.getByRole("link",{name:/FotMob/})).toHaveCount(0);
});


for (const sourceName of ["FOTMOB_OFFICIAL","FLASHSCORE_OFFICIAL"]) {
  for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
    test(sourceName+" left/right pitch orientation is anatomically correct on "+viewport.width,async({page})=>{
      await page.setViewportSize(viewport);
      const positions={0:"Keeper",1:"Right Back",4:"Left Back",7:"Right Winger",9:"Left Winger"};
      const layout = lineups.map((player,i)=>{
        const side=i<11?"Home":"Away", slot=i%11, position=positions[slot];
        const sourceSlot=slot===0?"1:3":slot===1?"2:1":slot===4?"2:5":slot===7?"4:1":slot===9?"4:5":null;
        const sourceX=slot===0?0.5:slot===1?0.125:slot===4?0.875:slot===7?0.162:slot===9?0.837:null;
        return {...player,player_name:side+" "+(position||"Player "+slot),
          source_name:sourceName,formation_slot:sourceSlot,
          position_x:sourceName==="FOTMOB_OFFICIAL"?sourceX:null,
          position_y:sourceName==="FOTMOB_OFFICIAL" && sourceX!==null?(slot<5?0.3:0.7):null};
      });
      mockEndpoints(page,{deep:{...detail,humanFactors:{...detail.humanFactors,lineup:layout}}});
      await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
      const pitch=page.getByTestId("official-xi-pitch");
      for (const team of ["Home","Away"]) {
        const side=pitch.locator(team==="Home"?".ft-xi-side-home":".ft-xi-side-away");
        const horizontal=async name=>{
          const marker=side.getByRole("button",{name:"View player profile: "+team+" "+name,exact:true});
          await expect(marker).toBeVisible();
          return Number.parseFloat(await marker.evaluate(el=>el.style.left));
        };
        const keeper=await horizontal("Keeper");
        const rb=await horizontal("Right Back");
        const lb=await horizontal("Left Back");
        const rw=await horizontal("Right Winger");
        const lw=await horizontal("Left Winger");
        expect(keeper).toBe(50);
        expect(rb).toBeGreaterThan(keeper);
        expect(rw).toBeGreaterThan(keeper);
        expect(lb).toBeLessThan(keeper);
        expect(lw).toBeLessThan(keeper);
        // Must preserve the source-specific geometry, not swap player names/IDs.
        expect(rb).toBe(sourceName==="FOTMOB_OFFICIAL"?83:90);
        expect(lb).toBe(sourceName==="FOTMOB_OFFICIAL"?17:10);
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    });
  }
}

test("saved exact-ID fixture kickoffs render British summer/winter times without guesswork",async({page})=>{
  const supplied={...summary,fixtureKickoffs:[
    {id:"FS:event9",kickoff:"2026-10-11T20:15:00+00:00"},
    {id:"FS:event10",kickoff:"2026-11-10T20:15:00+00:00"}]};
  const raw={...snapshot,discovered:snapshot.discovered.map(r=>r.provider_event_id==="event10"
    ?{...r,fixture_date:"2026-11-10"}:r)};
  mockEndpoints(page,{source:supplied,raw});
  await page.goto("http://127.0.0.1:4173/");
  const row9=page.getByTestId("fixture-row").filter({hasText:"Home 9"}).first();
  const row10=page.getByTestId("fixture-row").filter({hasText:"Home 10"}).first();
  await expect(row9.getByTestId("uk-kickoff")).toHaveText("21:15");
  await expect(row10.getByTestId("uk-kickoff")).toHaveText("20:15");
  await expect(row9).toContainText("BST");
  await expect(row10).toContainText("GMT");
  await expect(page.getByTestId("fixture-row").filter({hasText:"Home 11"}).first().getByTestId("uk-kickoff")).toHaveText("—:—");
});
test("remove Standings and source navigation text; group major leagues above lesser leagues",async({page})=>{
  const raw={...snapshot,discovered:[
    {provider_event_id:"event0",home:"London FC",away:"Liverpool",competition:"Premier LeagueENGLAND: Live Standings",fixture_date:"2026-10-13",time_text:null},
    {provider_event_id:"event1",home:"Madrid FC",away:"Barcelona",competition:"LaLigaSPAIN: Standings",fixture_date:"2026-10-13",time_text:"20:00"},
    {provider_event_id:"event2",home:"Bremen",away:"Stuttgart",competition:"BundesligaGERMANY: Live Standings",fixture_date:"2026-10-13",time_text:null},
    {provider_event_id:"event3",home:"Paris FC",away:"Lyon",competition:"Ligue 1FRANCE: Live Standings",fixture_date:"2026-10-13",time_text:null},
    {provider_event_id:"event4",home:"Some Team",away:"Another Team",competition:"Premier LeagueJAMAICA: Live Standings",fixture_date:"2026-10-13",time_text:null},
    {provider_event_id:"event5",home:"Bragantino",away:"Cruzeiro",competition:"Serie ABRAZIL: Live Standings",fixture_date:"2026-10-13",time_text:null},
    {provider_event_id:"event6",home:"Team A",away:"Team B",competition:"Ligue 1ALGERIA",fixture_date:"2026-10-13",time_text:null},
    {provider_event_id:"event7",home:"Team C",away:"Team D",competition:"Premier LeagueKAZAKHSTAN: Standings",fixture_date:"2026-10-13",time_text:null},
    {provider_event_id:"event8",home:"Team E",away:"Team F",competition:"Super League 2GREECE",fixture_date:"2026-10-13",time_text:null},
    {provider_event_id:"event9",home:"Team G",away:"Team H",competition:"Vysshaya LigaBELARUS",fixture_date:"2026-10-13",time_text:null},
    {provider_event_id:"event10",home:"Team I",away:"Team J",competition:"Friendly International WomenWORLD:",fixture_date:"2026-10-13",time_text:null}
  ],fixtures:[]};
  mockEndpoints(page,{raw,source:null});
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.getByTestId("fixture-row")).toHaveCount(4);
  await expect(page.getByTestId("scope-featured")).toHaveAttribute("aria-pressed","true");
  const names=await page.locator(".ft-league-heading h2").allTextContents();
  expect(names[0]).toContain("Premier League · England");
  expect(names[1]).toContain("La Liga · Spain");
  expect(names[2]).toContain("Bundesliga · Germany");
  expect(names.join(" ")).not.toMatch(/Standings|: Draw/);
  await expect(page.getByTestId("fixture-list")).not.toContainText("Flashscore event");
  await page.getByTestId("scope-other").click();
  await expect(page.getByTestId("fixture-row")).toHaveCount(7);
  const otherNames=await page.locator(".ft-league-heading h2").allTextContents();
  expect(otherNames.some(n=>n.includes("Jamaica"))).toBeTruthy();
  expect(otherNames.some(n=>n.includes("Brazil"))).toBeTruthy();
  for(const name of ["Ligue 1 · Algeria","Premier League · Kazakhstan","Super League 2 · Greece","Vysshaya Liga · Belarus","Friendly International Women · World"]) expect(otherNames.join(" ")).toContain(name);
  expect(otherNames.join(" ")).not.toMatch(/ALGERIA|KAZAKHSTAN|GREECE|BELARUS|WORLD:|Standings/);
  await page.getByTestId("scope-all").click();
  await expect(page.getByTestId("fixture-row")).toHaveCount(11);
});
test("status and insights filters distinguish completed from elapsed but unverified fixtures",async({page})=>{
  const source={...summary,matches:[{...summary.matches[0],status:"SCHEDULED"},
    {...summary.matches[1],status:"FINISHED"}]};
  mockEndpoints(page,{source});
  await page.goto("http://127.0.0.1:4173/");
  await page.getByTestId("status-live").click();
  await expect(page.getByTestId("fixture-row")).toHaveCount(0);
  await page.getByTestId("status-finished").click();
  await expect(page.getByTestId("fixture-row")).toHaveCount(1);
  await page.getByTestId("status-all").click();
  await page.getByTestId("overview-predictions").click();
  await expect(page.getByTestId("fixture-row")).toHaveCount(2);
  await page.getByTestId("scope-other").click();
  await expect(page.getByTestId("fixture-row")).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

test("Featured and Other form an exhaustive partition with deterministic live, priority, kickoff, coverage, and ID order",async({page})=>{
  const start=Date.now();
  const events=[
    {id:"FS:event0",home:"Priority later",away:"Away 0",competition:"Premier LeagueENGLAND",kickoff:new Date(start+6*3600000).toISOString()},
    {id:"FS:event1",home:"Priority soon",away:"Away 1",competition:"Premier LeagueENGLAND",kickoff:new Date(start+2*3600000).toISOString()},
    {id:"FS:event2",home:"Coverage rich",away:"Away 2",competition:"Premier LeagueENGLAND",kickoff:new Date(start+2*3600000).toISOString()},
    {id:"FS:event3",home:"European priority",away:"Away 3",competition:"Champions League - League phaseEUROPE",kickoff:new Date(start+1*3600000).toISOString()},
    {id:"FS:event4",home:"Other live",away:"Away 4",competition:"Serie ABRAZIL",kickoff:new Date(start-20*60000).toISOString(),status:"LIVE",liveNow:true},
    {id:"FS:event5",home:"Ambiguous Jamaica",away:"Away 5",competition:"Premier LeagueJAMAICA",kickoff:new Date(start+90*60000).toISOString()},
    {id:"FS:event6",home:"Stable ID tie",away:"Away 6",competition:"Premier LeagueENGLAND",kickoff:new Date(start+2*3600000).toISOString()}
  ];
  const raw={...snapshot,captured_at:new Date().toISOString(),discovered:events.map((x,i)=>({
    provider_event_id:x.id.slice(3),home:x.home,away:x.away,competition:x.competition,
    fixture_date:new Date(x.kickoff).toISOString().slice(0,10),time_text:"15:30"}))};
  const matches=events.map((x,i)=>({id:x.id,home:x.home,away:x.away,league:x.competition,
    kickoff:x.kickoff,status:x.status||"SCHEDULED",liveNow:x.liveNow===true,
    scoreHome:i===4?1:null,scoreAway:i===4?0:null,scoreSource:i===4?"FLASHSCORE":null,
    ...(i===2?{forebet:{home:0.5,draw:0.25,away:0.25}}:{})}));
  mockEndpoints(page,{raw,source:{...summary,matches}});
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.getByTestId("scope-featured")).toHaveAttribute("aria-pressed","true");
  await expect(page.getByTestId("fixture-row")).toHaveCount(5);
  const featured=await page.locator(".ft-fixture-card").evaluateAll(nodes=>nodes.map(x=>x.dataset.fixtureId));
  expect(featured).toEqual(["FS:event2","FS:event1","FS:event6","FS:event0","FS:event3"]);
  await page.getByTestId("scope-other").click();
  await expect(page.getByTestId("fixture-row")).toHaveCount(2);
  const other=await page.locator(".ft-fixture-card").evaluateAll(nodes=>nodes.map(x=>x.dataset.fixtureId));
  expect(other).toEqual(["FS:event4","FS:event5"]);
  await page.getByLabel("Search",{exact:true}).fill("Jamaica");
  await expect(page.getByTestId("fixture-row")).toHaveCount(1);
  await page.getByLabel("Search",{exact:true}).fill("");
  await page.getByTestId("status-live").click();
  await expect(page.getByTestId("fixture-row")).toHaveCount(1);
  await page.getByTestId("scope-all").click();
  await page.getByTestId("status-all").click();
  await expect(page.getByTestId("fixture-row")).toHaveCount(events.length);
  const all=await page.locator(".ft-fixture-card").evaluateAll(nodes=>nodes.map(x=>x.dataset.fixtureId));
  expect(new Set(all).size).toBe(events.length);
});

test("historical form is exact-ID, one-sided, source-labeled, and rejects target-day or future samples",async({page})=>{
  const source={...summary,matches:[
    summary.matches[0],
    {...summary.matches[1],historicalForm:{home:{...summary.matches[0].historicalForm.home,throughDate:"2026-10-30"},away:null}}
  ]};
  mockEndpoints(page,{source});
  await page.goto("http://127.0.0.1:4173/");
  const homeRow=page.getByTestId("fixture-row").filter({hasText:"Home 0"}).first();
  await expect(homeRow.getByTestId("historical-form")).toContainText("H DLDLD · A —");
  const disclosure=page.locator('[data-fixture-id="FS:event0"]').getByTestId("historical-form-disclosure");
  await expect(disclosure).toBeVisible();
  await disclosure.locator("summary").click();
  await expect(disclosure.getByTestId("historical-form-home")).toContainText("Last 5 completed matches");
  await expect(disclosure.getByTestId("historical-form-home")).toContainText("BTTS 3/5 (60%)");
  await expect(disclosure.getByTestId("historical-form-home")).toContainText("O/U 9.5 2/3");
  await expect(disclosure.getByTestId("historical-form-away")).toContainText("No qualifying history");
  await expect(disclosure).toContainText("football-data.co.uk");
  const futureRow=page.locator('[data-fixture-id="FS:event1"]');
  await expect(futureRow).toBeVisible();
  await expect(futureRow.getByTestId("historical-form")).toHaveCount(0);
  await expect(futureRow.getByTestId("historical-form-disclosure")).toHaveCount(0);
});
test("historical W-D-L totals must match the recorded sequence",async({page})=>{
  const bad={...summary,matches:[{...summary.matches[0],historicalForm:{
    home:{...summary.matches[0].historicalForm.home,wins:5},away:null}}]};
  const raw={...snapshot,discovered:snapshot.discovered.filter(f=>f.provider_event_id==="event0")};
  mockEndpoints(page,{raw,source:bad});
  await page.goto("http://127.0.0.1:4173/");
  const row=page.getByTestId("fixture-row").filter({hasText:"Home 0"});
  await expect(row).toBeVisible();
  await expect(row.getByTestId("historical-form")).toHaveCount(0);
});


for(const width of [1440,390]) {
 test("visual overview cards show honest counts and useful shortcuts "+width,async({page})=>{
   await page.setViewportSize({width,height:900});
   mockEndpoints(page);
   await page.goto("http://127.0.0.1:4173/");
   await expect(page.getByTestId("fixture-row")).toHaveCount(40);
   await expect(page.getByTestId("scope-featured")).toHaveAttribute("aria-pressed","true");
   await expect(page.locator(".ft-clear-filters")).toHaveCount(0);
   const overview=page.getByTestId("match-overview");
   await expect(overview.getByRole("button")).toHaveCount(6);
   await expect(page.getByTestId("overview-feed-status")).toContainText("Matches ready");
   await expect(page.getByTestId("overview-insight-status")).toContainText("Stats ready");
   await expect(page.getByTestId("overview-live")).toContainText("0");
   await expect(page.getByTestId("overview-predictions")).toContainText("2");
   await page.getByTestId("overview-predictions").click();
   await expect(page.getByTestId("fixture-row")).toHaveCount(2);
   await expect(page.getByTestId("overview-predictions")).toHaveAttribute("aria-pressed","true");
   await page.getByTestId("overview-lineups").click();
   await expect(page.getByTestId("fixture-row")).toHaveCount(1);
   await page.getByTestId("overview-details").click();
   await expect(page.getByTestId("fixture-row")).toHaveCount(2);
   await page.getByTestId("overview-live").click();
   await expect(page.getByTestId("fixture-row")).toHaveCount(0);
   await expect(page.getByTestId("overview-live")).toHaveAttribute("aria-pressed","true");
   await page.getByTestId("overview-matches").click();
   await expect(page.getByTestId("fixture-row")).toHaveCount(40);
   await expect(page.getByTestId("overview-matches")).toHaveAttribute("aria-pressed","true");
   const size=await page.evaluate(()=>({
     gridCols:getComputedStyle(document.querySelector(".ft-overview-grid")).gridTemplateColumns.split(" ").length,
     overflow:document.documentElement.scrollWidth>innerWidth
   }));
   expect(size.overflow).toBe(false);
   expect(size.gridCols).toBe(width<=650?2:6);
   await page.screenshot({path:"test-results/visual-overview-"+width+".png",fullPage:false});
 });
}
test("visible dashboard polling stays bounded at five minutes raw and four minutes compact",async({page})=>{
  await page.clock.install({time:new Date()});
  let rawRequests=0,compactRequests=0;
  page.route("**/snapshot",r=>{rawRequests++;return r.fulfill({json:{...snapshot,captured_at:new Date().toISOString()},headers:cors});});
  page.route("**/functions/v1/app-phase1-feed**",r=>{compactRequests++;return r.fulfill({json:{...summary,generatedAt:new Date().toISOString()},headers:cors});});
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.locator(".ft-match-row")).not.toHaveCount(0);
  expect(rawRequests).toBe(1);
  expect(compactRequests).toBe(1);
  for(let minute=1;minute<=20;minute++){
    await page.clock.runFor(60*1000);
    await expect.poll(()=>rawRequests).toBe(1+Math.floor(minute/5));
    await expect.poll(()=>compactRequests).toBe(1+Math.floor(minute/4));
  }
});
for(const width of [1440,390]){
 test("keyboard reaches search and competition filters with a visible focus indicator "+width,async({page})=>{
  await page.setViewportSize({width,height:900});
  mockEndpoints(page);
  await page.goto("http://127.0.0.1:4173/");
  const search=page.getByLabel("Search",{exact:true});
  const competition=page.getByLabel("Competition",{exact:true});
  for(let i=0;i<20&&!(await search.evaluate(el=>el===document.activeElement));i++)
    await page.keyboard.press("Tab");
  await expect(search).toBeFocused();
  const searchFocus=await search.evaluate(el=>getComputedStyle(el.closest("label")).boxShadow);
  expect(searchFocus).not.toBe("none");
  await page.keyboard.press("Tab");
  await expect(competition).toBeFocused();
  const competitionFocus=await competition.evaluate(el=>getComputedStyle(el.closest("label")).boxShadow);
  expect(competitionFocus).not.toBe("none");
  await page.screenshot({path:"test-results/keyboard-filter-focus-"+width+".png"});
 });
}
test("overview shows unavailable rather than zero when neither source can answer",async({page})=>{
  mockEndpoints(page,{raw:null,source:null,deep:null});
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.getByTestId("overview-feed-status")).toContainText("Matches unavailable");
  await expect(page.getByTestId("overview-insight-status")).toContainText("Stats limited");
  await expect(page.getByTestId("overview-matches")).toContainText("—");
  await expect(page.getByTestId("overview-details")).toContainText("—");
  await expect(page.getByTestId("overview-live")).toContainText("—");
  await expect(page.getByTestId("overview-odds")).toContainText("—");
});


test("match detail keeps home coach LEFT and away coach RIGHT regardless provider order",async({page})=>{
  const input={...detail,humanFactors:{...detail.humanFactors,
    managers:[{team_side:"A",manager_name:"Away Manager",source_name:"FOTMOB"},
      {team_side:"H",manager_name:"Home Manager",source_name:"FLASHSCORE"}]}};
  mockEndpoints(page,{deep:input});
  await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
  const coaches=page.getByTestId("match-coaches");
  await expect(coaches.locator(".ft-coach-card")).toHaveCount(2);
  await expect(coaches.locator(".ft-coach-card").first()).toContainText("Home Manager");
  await expect(coaches.locator(".ft-coach-card").last()).toContainText("Away Manager");
  const home=await coaches.locator(".ft-coach-home").boundingBox();
  const away=await coaches.locator(".ft-coach-away").boundingBox();
  expect(home.x).toBeLessThan(away.x);
  await expect(coaches).not.toContainText("FOTMOB");
});
test("match detail shows exact-match H2H and player availability with recorded identity status",async({page})=>{
  const deep={...detail,h2h:{status:"OK",source:"VERIFIED_RESULTS_HISTORY",h2h_games:4,
    home_wins:2,draws:1,away_wins:1,home_goals:5,away_goals:2,avg_total_goals:1.75,last5:"WDWL"},
    humanFactors:{...detail.humanFactors,playerStatus:[
      {evidence_key:"status:1",player_name:"Home Player",team_side:"H",status_type:"INJURY",
        status_value:"Hamstring",fact_status:"CONFIRMED",confirmed:true},
      {evidence_key:"status:2",player_name:"Away Player",team_side:"A",status_type:"SUSPENSION",
        status_value:"One match",fact_status:"SOURCE_CONFIRMED_IDENTITY_UNRESOLVED",confirmed:true}
    ]}};
  mockEndpoints(page,{deep,raw:{...snapshot,fixtures:[]}});
  await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
  await expect(page.getByTestId("verified-h2h")).toContainText("4 meetings");
  await expect(page.getByTestId("verified-h2h")).toContainText("Home 0 wins 2 · Draws 1 · Away 0 wins 1");
  await expect(page.getByTestId("verified-h2h")).toContainText("Recent results, newest first: W · D · W · L");
  const claims=page.getByTestId("player-status-evidence");
  await expect(claims).toContainText("INJURY: Hamstring · Confirmed and canonically matched");
  await expect(claims).toContainText("SUSPENSION: One match · Source-confirmed · identity unresolved");
});
test("partial H2H history keeps missing metrics unavailable instead of zero",async({page})=>{
  const deep={...detail,h2h:{status:"OK",h2h_games:3,home_wins:null,draws:null,away_wins:null,
    home_goals:null,away_goals:null,avg_total_goals:null,last5:null}};
  mockEndpoints(page,{deep,raw:{...snapshot,fixtures:[]}});
  await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
  const panel=page.getByTestId("verified-h2h");
  await expect(panel).toContainText("3 meetings");
  await expect(panel.getByText(/wins|Goals:|Average total goals|Recent results/)).toHaveCount(0);
});
test("missing forecasts show one simple note, without developer warnings or raw JSON",async({page})=>{
  const noPred={...detail,models:{forebet:null,internal:{quality:"NOT_VERIFIED"}}};
  mockEndpoints(page,{deep:noPred});
  await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
  await expect(page.getByTestId("prediction-unavailable")).toHaveText("No prediction for this match yet.");
  await expect(page.locator(".ft-raw-detail")).not.toContainText("canonical event");
  await expect(page.locator(".ft-raw-detail")).not.toContainText("Internal model not verified");
  await expect(page.locator(".ft-raw-detail")).not.toContainText("Unknown values remain unknown");
  await expect(page.locator(".ft-raw-detail")).not.toContainText("Original Flashscore source fields");
  await expect(page.locator(".ft-raw-detail pre")).toHaveCount(0);
});
test("previous captured odds display honestly, including opening comparison, not as live",async({page})=>{
  const at=new Date().toISOString();
  const raw={...snapshot,captured_at:at,
    fixtures:[{provider_event_id:"event0",bookmaker:"bet365",captured_at:at,
      hda:{home:4.33,draw:3.8,away:1.76,
        opening_home:3.5,opening_draw:3.3,opening_away:2.01}}]};
  mockEndpoints(page,{raw});
  await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
  const panel=page.getByTestId("match-odds");
  await expect(panel).toContainText("Previous odds");
  await expect(panel).toContainText("Bet365-labelled snapshot");
  for(const value of ["4.33","3.80","1.76","Opened 3.50","Opened 3.30","Opened 2.01"])
    await expect(panel).toContainText(value);
  await expect(panel).toContainText("not live");
  await expect(panel).toContainText("UK");
  await expect(panel).not.toContainText("null");
});
test("strict prematch gate keeps invalid or stale odds out of current-price panel",async({page})=>{
  const at=new Date(Date.now()-48*3600_000).toISOString();
  const raw={...snapshot,captured_at:at,
    fixtures:[{provider_event_id:"event0",captured_at:at,
      hda:{home:2.5,draw:3.1,away:2.9}}]};
  mockEndpoints(page,{raw});
  await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
  await expect(page.getByTestId("match-odds")).toContainText("Previous odds");
  await expect(page.getByTestId("match-odds")).not.toContainText("Recent prematch odds");
});


test("exact-ID compact prices are visible even when raw provider quote is absent",async({page})=>{
  const at=new Date().toISOString();
  const kickoff=new Date(Date.now()+5*3600000).toISOString();
  const source={...summary,fixtureKickoffs:[{id:"FS:event0",kickoff}],
    matches:[{...summary.matches[0],kickoff,odds:{home:2.15,draw:3.36,away:4.6},
      oddsCapturedAt:at,oddsLabel:"Bookmaker reference"}]};
  const raw={...snapshot,fixtures:[]};
  mockEndpoints(page,{source,raw});
  await page.goto("http://127.0.0.1:4173/");
  await page.getByLabel("Search",{exact:true}).fill("Home 0");
  const row=page.getByTestId("fixture-row").filter({hasText:"Home 0"}).first();
  await expect(row.locator(".ft-odds-mini")).toContainText("2.15");
  await expect(row.locator(".ft-odds-mini")).toContainText("3.36");
  await expect(row.locator(".ft-odds-mini")).toContainText("4.60");
  await expect(row.getByTestId("match-odds-status")).toContainText("Bookmaker reference");
  await expect(row.getByTestId("match-odds-status")).toContainText("Recent");
  await expect(page.getByTestId("overview-odds")).toContainText("1");
  await page.getByRole("button",{name:/Recent/}).last().click();
  await expect(page.getByTestId("fixture-row")).toHaveCount(1);
});
test("previous exact-ID collector quote remains visible with a clear age label",async({page})=>{
  const previous=new Date(Date.now()-35*60000).toISOString();
  const kickoff=new Date(Date.now()+5*3600000).toISOString();
  const raw={...snapshot,captured_at:new Date().toISOString(),
    discovered:snapshot.discovered.filter(f=>f.provider_event_id==="event1"),fixtures:[{provider_event_id:"event1",captured_at:previous,
    hda:{home:3.65,draw:3.25,away:2.01}}]};
  const source={...summary,fixtureKickoffs:[{id:"FS:event1",kickoff}]};
  mockEndpoints(page,{source,raw});
  await page.goto("http://127.0.0.1:4173/");
  await page.getByLabel("Search",{exact:true}).fill("Home 1");
  const row=page.getByTestId("fixture-row").first();
  await expect(row.locator(".ft-odds-mini")).toContainText("3.65");
  await expect(row.getByTestId("match-odds-status")).toContainText("Earlier");
  await expect(row.getByTestId("match-odds-status")).toContainText("Bet365-labelled");
  await expect(row.getByTestId("match-odds-status")).not.toContainText("Live");
  await page.getByRole("button",{name:/Recent/}).last().click();
  await expect(page.getByTestId("fixture-row")).toHaveCount(0);
  await page.getByTestId("overview-odds").click();
  await expect(page.getByTestId("fixture-row")).toHaveCount(1);
});
test("no bogus current prices with past kickoff, wrong event ID, or invalid triplets",async({page})=>{
  const at=new Date().toISOString();
  const past=new Date(Date.now()-5*60*1000).toISOString();
  const future=new Date(Date.now()+2*3600000).toISOString();
  const source={...summary,fixtureKickoffs:[{id:"FS:event0",kickoff:past},{id:"FS:event1",kickoff:future}],
    matches:[{...summary.matches[0],kickoff:past,
      odds:{home:2.2,draw:3.2,away:3.3},oddsCapturedAt:at},
      {...summary.matches[1],kickoff:future,
      odds:{home:2.2,draw:null,away:3.3},oddsCapturedAt:at}]};
  const raw={...snapshot,fixtures:[{provider_event_id:"other1",captured_at:at,
    hda:{home:2.5,draw:3.5,away:2.9}}]};
  mockEndpoints(page,{raw,source});
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.getByTestId("overview-odds")).toContainText("0");
  await expect(page.getByTestId("fixture-list").locator(".ft-odds-mini")).toHaveCount(0);
});
test("distinct China 500 odds provenance remains clear",async({page})=>{
  const at=new Date().toISOString(),kickoff=new Date(Date.now()+3600000).toISOString();
  mockEndpoints(page,{source:{...summary,
    fixtureKickoffs:[{id:"FS:event0",kickoff}],
    matches:[{...summary.matches[0],kickoff,
      odds:{home:2.6,draw:3.1,away:2.95},oddsCapturedAt:at,
      oddsLabel:"China 500 reference"}]},raw:{...snapshot,fixtures:[]}});
  await page.goto("http://127.0.0.1:4173/");
  await page.getByLabel("Search",{exact:true}).fill("Home 0");
  await expect(page.getByTestId("match-odds-status")).toContainText("China 500 reference");
  await expect(page.getByTestId("match-odds-status")).not.toContainText("Bet365");
});

test("match detail uses qualified canonical bookmaker prices even without raw quote",async({page})=>{
  const now=new Date().toISOString();
  const kickoff=new Date(Date.now()+3*3600000).toISOString();
  const deep={...detail,fixture:{...detail.fixture,kickoff_hkt:kickoff,
    bookmaker_source:"FLASHSCORE_BET365",odds_updated_at:now,
    had_home:1.92,had_draw:3.42,had_away:4.81}};
  mockEndpoints(page,{deep,raw:{...snapshot,fixtures:[]}});
  await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
  const odds=page.getByTestId("match-odds");
  await expect(odds).toContainText("Recent prematch odds");
  await expect(odds).toContainText("1.92");
  await expect(odds).toContainText("3.42");
  await expect(odds).toContainText("4.81");
  await expect(odds).not.toContainText("Previous odds");
  await expect(odds).not.toContainText("live");
});
test("unverified canonical source cannot be mislabelled as Bet365 odds on match detail",async({page})=>{
  const now=new Date().toISOString(),kickoff=new Date(Date.now()+3600000).toISOString();
  const deep={...detail,fixture:{...detail.fixture,kickoff_hkt:kickoff,
    bookmaker_source:null,odds_updated_at:now,
    had_home:2.05,had_draw:3.3,had_away:3.77}};
  mockEndpoints(page,{deep,raw:{...snapshot,fixtures:[]}});
  await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
  await expect(page.getByTestId("match-odds")).toContainText("No recorded odds");
});

test("bounded collector selection and honest bookmaker gap diagnostics pass offline tests",async()=>{
  // This is a pure Python test suite; no network, browser captures or production writes.
  const run=spawnSync("python3",["-m","unittest","discover",
    "-s","services/flashscore-odds-collector","-p","test_*.py"],{
    encoding:"utf8",timeout:10000
  });
  expect(run.status,run.stderr||run.stdout||String(run.error)).toBe(0);
});

test("odds publish timing stays at twelve cron reads per hour, never creates a second job",async()=>{
  const name="ft_odds_phase2_cadence_20261013";
  const existing=fs.readdirSync("supabase/migrations").filter(x=>x.includes(name));
  const file=existing.length===1?"supabase/migrations/"+existing[0]:
    "docs/ft-odds-phase2-cadence-review-20261013.sql";
  const sql=fs.readFileSync(file,"utf8");
  const matched=sql.match(/schedule\s*:=\s*'(\d+(?:,\d+)*\s+\*\s+\*\s+\*\s+\*)'/);
  expect(matched,"expected pg_cron schedule update").not.toBeNull();
  const minutes=matched[1].split(" ")[0].split(",").map(Number);
  expect(minutes).toHaveLength(12);
  expect(minutes.every((v,i)=>v>=0&&v<60&&(i===0||v-minutes[i-1]===5))).toBe(true);
  expect(sql).toContain("jobid=38");
  expect(sql).toContain("private.ft_flashscore_direct_publication_cycle()");
  expect(sql).toContain("odds_publish_job_38_schedule_or_command_drift");
  expect(sql).toContain("cron.alter_job(");
  expect(sql).not.toContain("cron.schedule(");
  expect(sql).not.toContain("net.http_get(");
});

test("home and away names have identical visual emphasis, not implicit advice",async({page})=>{
  mockEndpoints(page);
  await page.goto("http://127.0.0.1:4173/");
  const first=page.getByTestId("fixture-row").first();
  const home=first.getByTestId("home-team-name");
  const away=first.getByTestId("away-team-name");
  await expect(home).toBeVisible();
  await expect(away).toBeVisible();
  const homeWeight=await home.evaluate(e=>getComputedStyle(e).fontWeight);
  const awayWeight=await away.evaluate(e=>getComputedStyle(e).fontWeight);
  expect(homeWeight).toBe(awayWeight);
  expect(first.locator(".ft-fixture-teams > strong")).toHaveCount(0);
  await expect(page.getByTestId("advisor-coverage")).toContainText("BetClan");
  await expect(page.getByTestId("advisor-coverage")).toContainText("SportyTrader");
  await expect(page.getByTestId("advisor-coverage")).toContainText("0 verified forecasts");
});
test("match advisor panel differentiates archived forecast from verified live model",async({page})=>{
  mockEndpoints(page);
  await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
  await expect(page.getByTestId("advisor-forebet")).toContainText("Saved forecast · not current");
  await expect(page.getByTestId("advisor-dc")).toContainText("No current qualified model");
  await expect(page.getByTestId("advisor-form")).toContainText("Legacy model inactive");
  await expect(page.getByTestId("advisor-betclan")).toContainText("No current matched forecast");
  await expect(page.getByTestId("advisor-sportytrader")).toContainText("No current matched forecast");
  await expect(page.getByTestId("verified-match-analysis")).toContainText("Saved Forebet record");
  await expect(page.getByTestId("verified-match-analysis")).not.toContainText("Qualified internal model");
});
test("verified prematch DC advisor is shown only with fresh complete source-backed probabilities",async({page})=>{
  const now=new Date().toISOString();
  const kickoff=new Date(Date.now()+4*3600000).toISOString();
  const d={...detail,
    fixture:{...detail.fixture,kickoff_hkt:kickoff,status:"SCHEDULED"},
    models:{forebet:null,internal:{
      quality:"MODELED",model_source:"VERIFIED_RESULTS_HISTORY",fetched_at:now,
      dc_prob_home:0.46,dc_prob_draw:0.30,dc_prob_away:0.24
    }}
  };
  mockEndpoints(page,{deep:d});
  await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
  await expect(page.getByTestId("advisor-dc")).toContainText("Verified model");
  await expect(page.getByTestId("verified-match-analysis")).toContainText("Qualified internal model (DC)");
  await expect(page.getByTestId("advisor-forebet")).toContainText("No matched forecast");
});
test("expired, malformed and legacy-source model never appears as current advice",async({page})=>{
  const kickoff=new Date(Date.now()+5*3600000).toISOString();
  const stale=new Date(Date.now()-9*86400000).toISOString();
  for(const internal of [
    {quality:"MODELED",model_source:"VERIFIED_RESULTS_HISTORY",fetched_at:stale,dc_prob_home:0.4,dc_prob_draw:0.3,dc_prob_away:0.3},
    {quality:"MODELED",model_source:"VERIFIED_RESULTS_HISTORY",fetched_at:new Date().toISOString(),dc_prob_home:0.4,dc_prob_draw:null,dc_prob_away:0.6},
    {quality:"MODELED",model_source:"HKJC historical",fetched_at:new Date().toISOString(),dc_prob_home:0.4,dc_prob_draw:0.3,dc_prob_away:0.3}
  ]){
    mockEndpoints(page,{deep:{...detail,fixture:{...detail.fixture,kickoff_hkt:kickoff},
      models:{forebet:null,internal}}});
    await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
    await expect(page.getByTestId("advisor-dc")).toContainText("No current qualified model");
    await expect(page.getByTestId("prediction-unavailable")).toHaveText("No prediction for this match yet.");
  }
});

test("compact advisors show verified DC and PI when fixture and source are current, but not retired Form",async({page})=>{
  const future=new Date(Date.now()+6*3600000).toISOString(),captured=new Date().toISOString();
  const source={...summary,matches:[{
    ...summary.matches[0],kickoff:future,forebet:null,forebetDetail:{},
    advisors:{
      dc:{home:0.49,draw:0.27,away:0.24},
      pi:{home:0.45,draw:0.28,away:0.27},
      form:{home:0.5,draw:0.3,away:0.2},
      dcMeta:{quality:"MODELED",source:"football-data.co.uk main / penaltyblog 1.12.2",fetchedAt:captured,trainingMatches:90},
      formMeta:{quality:"FORM_MODELED",source:"OLD_RETIRED_HISTORY",fetchedAt:captured}
    }
  }]};
  mockEndpoints(page,{source,deep:null});
  await page.goto("http://127.0.0.1:4173/");
  const row=page.getByTestId("fixture-row").filter({hasText:"Home 0"}).first();
  await expect(row.getByTestId("advisor-dc-hda")).toContainText("49/27/24%");
  await expect(row.getByTestId("advisor-pi-hda")).toContainText("45/28/27%");
  await expect(row.getByTestId("advisor-form-hda")).toHaveCount(0);
  await expect(page.getByTestId("advisor-dc-summary")).toContainText("1 verified forecasts");
  await expect(page.getByTestId("advisor-pi-summary")).toContainText("1 (same model source)");
  await expect(page.getByTestId("advisor-forebet-summary")).toContainText("0 saved forecasts");
});
test("the compact advisor feed never turns stale or malformed model values into picks",async({page})=>{
  const future=new Date(Date.now()+4*3600000).toISOString(),
    expired=new Date(Date.now()-8*86400000).toISOString();
  const source={...summary,matches:[{...summary.matches[0],kickoff:future,forebet:null,forebetDetail:{},
    advisors:{dc:{home:0.6,draw:0.25,away:0.15},pi:{home:0.4,draw:0.3,away:0.3},
      dcMeta:{quality:"MODELED",source:"football-data.co.uk main / penaltyblog 1.12.2",fetchedAt:expired}}}]};
  mockEndpoints(page,{source,deep:null});
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.getByTestId("advisor-dc-summary")).toContainText("0 verified forecasts");
  const row=page.getByTestId("fixture-row").filter({hasText:"Home 0"}).first();
  await expect(row.getByTestId("advisor-dc-hda")).toHaveCount(0);
  await expect(row.getByTestId("advisor-pi-hda")).toHaveCount(0);
});
test("canonical fallback admits only fresh individually exact-identity verified fixtures",async({page})=>{
  const source={source:"supabase-lightweight-enrichment-recovery",
    recoveryMode:"LIGHTWEIGHT_CANONICAL_EVIDENCE",
    generatedAt:new Date().toISOString(),
    matches:[
      {...summary.matches[0],sourceContext:{
        ...summary.matches[0].sourceContext,identityStatus:"EXACT_CANONICAL_PROVIDER_FIXTURE"}},
      {...summary.matches[1],sourceContext:{
        ...summary.matches[1].sourceContext,identityStatus:"SOURCE_NAME_ONLY"}}
    ]};
  mockEndpoints(page,{source,deep:null});
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.getByTestId("overview-details")).toContainText("1");
  const bad={...source,generatedAt:new Date(Date.now()-3600000).toISOString()};
  mockEndpoints(page,{source:bad,deep:null});
  await page.reload();
  await expect(page.getByTestId("overview-insight-status")).toContainText("Stats limited");
});

test("a new verified result-backed Form forecast can appear without reviving legacy-source records",async({page})=>{
  const future=new Date(Date.now()+5*3600000).toISOString();
  const captured=new Date().toISOString();
  const source={...summary,matches:[{...summary.matches[0],kickoff:future,
    forebet:null,forebetDetail:{},
    advisors:{form:{home:0.48,draw:0.30,away:0.22},
      formMeta:{quality:"FORM_MODELED",source:"VERIFIED_RESULTS_HISTORY",fetchedAt:captured}}
  }]};
  mockEndpoints(page,{source,deep:null});
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.getByTestId("advisor-form-summary")).toContainText("1 verified forecasts");
  await expect(page.getByTestId("fixture-row").filter({hasText:"Home 0"}).first()
    .getByTestId("advisor-form-hda")).toContainText("48/30/22%");
});

for(const width of [1440,390]) test('verified BetClan source values survive compact feed '+width,async({page})=>{
 await page.setViewportSize({width,height:900});
 const kickoff=new Date(Date.now()+24*3600000).toISOString();
 const a={provider:'BETCLAN',id:'FS:event1',eventId:'1513647',identityStatus:'VERIFIED',
   sourceUrl:'https://www.betclan.com/predictionsdetails/football/1513647/paide-v-tammeka-prediction/',
   capturedAt:new Date().toISOString(),kickoff,hda:{home:.6,draw:.2,away:.2},predictedScore:'3-1',over25:.63,bttsYes:.61};
 const raw={...snapshot,discovered:snapshot.discovered.map(x=>({...x,fixture_date:kickoff.slice(0,10)}))};
 const source={...summary,matches:summary.matches.map(x=>({...x,kickoff,externalAdvisers:x.id==='FS:event1'?[a]:[]}))};
 mockEndpoints(page,{raw,source});
 await page.goto('http://127.0.0.1:4173/');await page.getByTestId('scope-all').click();
 const row=page.locator('[data-fixture-id="FS:event1"] [data-testid="fixture-row"]');
 await expect(row.getByTestId('betclan-hda')).toContainText('60/20/20%');
 await expect(row.getByTestId('betclan-score')).toContainText('3-1');
 await expect(row.getByTestId('betclan-over25')).toContainText('63%');
 await expect(row.getByTestId('betclan-btts')).toContainText('61%');
 await page.screenshot({path:'test-results/betclan-'+width+'.png',fullPage:true});
});

test('verified external adviser remains visible on match detail with source link',async({page})=>{
 const kickoff=new Date(Date.now()+24*3600000).toISOString();
 const a={provider:'BETCLAN',id:'FS:event0',eventId:'1513647',identityStatus:'VERIFIED',
 sourceUrl:'https://www.betclan.com/predictionsdetails/football/1513647/paide-v-tammeka-prediction/',
 capturedAt:new Date().toISOString(),kickoff,hda:{home:.6,draw:.2,away:.2},predictedScore:'3-1',over25:.63,bttsYes:.61};
 const sporty={...a,provider:'SPORTYTRADER',eventId:'379501',sourceUrl:'https://www.sportytrader.com/en/betting-tips/aberdeen-st-mirren-379501/',hda:{home:.4895,draw:.1537,away:.3568},predictedScore:null,over25:null,bttsYes:null,tip:'Under 2.5 goals'};
 mockEndpoints(page,{deep:{...detail,fixture:{...detail.fixture,kickoff_hkt:kickoff},externalAdvisers:[a,sporty]}});
 await page.goto('http://127.0.0.1:4173/details?id=FS%3Aevent0');
 const card=page.getByTestId('advisor-betclan');
 await expect(card).toContainText('Verified forecast');await expect(card).toContainText('60% / 20% / 20%');
 await expect(card.getByRole('link',{name:'Source prediction'})).toHaveAttribute('href',a.sourceUrl);
 await expect(page.getByTestId('advisor-sportytrader')).toContainText('48.95% / 15.37% / 35.68%');
 await expect(page.getByTestId('advisor-sportytrader')).toContainText('Source tip: Under 2.5 goals');
 await card.screenshot({path:'test-results/betclan-detail.png'});
});

test("open match detail refreshes its verified fixture once a minute",async({page})=>{
 await page.clock.install({time:new Date("2026-10-11T00:59:00Z")});
 mockEndpoints(page);
 let detailReads=0;
 page.route("**/functions/v1/app-match-detail**",route=>{
  detailReads++;
  const response=detailReads===1?detail:{...detail,fixture:{...detail.fixture,score_home:2,score_away:1}};
  return route.fulfill({json:response,headers:cors});
 });
 await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
 await expect(page.locator(".ft-match-when")).toContainText("Final score 1–0");
 await expect(page.getByRole("status")).toContainText("refreshes every minute");
 await page.clock.fastForward(60_000);
 await expect(page.locator(".ft-match-when")).toContainText("Final score 2–1");
 expect(detailReads).toBeGreaterThan(1);
});
