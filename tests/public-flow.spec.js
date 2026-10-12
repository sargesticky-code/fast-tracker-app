const { test, expect } = require("@playwright/test");
const fs = require("fs");
fs.mkdirSync("test-results",{recursive:true});
// All baseline fixtures are future-relative; separate lifecycle tests exercise finished rows.
const utcDay = offset => { const d = new Date(); d.setUTCDate(d.getUTCDate()+offset); return d.toISOString().slice(0,10); };
const DAY1 = utcDay(2), DAY2 = utcDay(3);
const snapshot = {
  source:"FLASHSCORE_BET365",captured_at:new Date().toISOString(),
  discovered:Array.from({length:40},(_,i)=>({
    provider_event_id:"event"+i,home:"Home "+i,away:"Away "+i,
    competition:i%2?"League A":"League B",fixture_date:i<35?DAY1:DAY2,
    time_text:i?"15:30":null
  })),
  fixtures:[{provider_event_id:"event1",hda:{home:2.2,draw:3.3,away:4.4},captured_at:"2026-10-11T00:59:00Z"}]
};
const summary = {
  source:"flashscore-single-rpc-canonical",generatedAt:"2026-10-11T01:00:00Z",
  count:2,
  matches:[
    {id:"FS:event0",home:"Home 0",away:"Away 0",league:"League B",kickoff:DAY1+"T15:30:00Z",forebet:{home:0.45,draw:0.25,away:0.30},
      forebetDetail:{predictedScore:"2-1",ou25:{over:0.62,under:0.38,pick:"Over",avgGoals:3.08},corners95:{over:0.44,under:0.56,pick:"Under",predictedScore:"5-3",avgCorners:8.75}},
      scoreHome:1,scoreAway:0,scoreSource:"FLASHSCORE",
      sourceContext:{source:"FLASHSCORE",lineupAvailable:true,
        lineupCoverage:{homeStarters:11,awayStarters:11,updatedAt:"2026-10-11T00:50:00Z"},
        observedStats:{source:"FLASHSCORE",capturedAt:"2026-10-11T00:55:00Z",
          stats:{shots:{home:3,away:2},corners:{home:1,away:0},xg:{home:0.33,away:0.12}}}}},
    {id:"FS:event1",home:"Home 1",away:"Away 1",league:"League A",kickoff:DAY1+"T16:00:00Z",forebetDetail:{predictedScore:"0-2"},
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
  await expect(page.getByRole("button",{name:DAY1+" · 35"})).toBeVisible();
  await expect(page.getByText("Time not supplied")).toBeVisible();
  await expect(page.getByText("Forebet predicted score", {exact:false}).first()).toBeVisible();
  await expect(page.getByText("Forebet Goals 2.5", {exact:false}).first()).toBeVisible();
  await expect(page.getByText("Forebet Corners 9.5", {exact:false}).first()).toBeVisible();
  await expect(page.getByTestId("historical-match-stats").first()).toContainText("Not final/live totals");
  await page.screenshot({path:"test-results/enriched-board-"+viewport.width+".png",fullPage:true});

  await page.getByRole("button",{name:DAY2+" · 5"}).click();
  await expect(page.locator(".ft-match-row")).toHaveCount(5);
  await page.getByRole("button",{name:"Active fixtures · 40"}).click();
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
  await expect(page.getByRole("button",{name:"Active fixtures · —"})).toBeVisible();
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
  await expect(page.getByTestId("canonical-fallback")).toContainText("2 active verified Flashscore canonical fixtures");
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
  await expect(row.locator(".ft-raw-odds")).toContainText("Odds unavailable");
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
  await expect(row.locator(".ft-raw-odds")).not.toContainText("captured");
  await expect(row.locator(".ft-raw-odds")).not.toContainText("live");
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


test("homepage excludes terminal, verified-finished and old-date fixtures without deleting match details", async({page})=>{
  const raw={...snapshot,discovered:snapshot.discovered.map(f=>{
    if(f.provider_event_id==="event2")return {...f,status:"FT"};
    if(f.provider_event_id==="event3")return {...f,match_status:"CANCELLED"};
    if(f.provider_event_id==="event4")return {...f,fixture_date:"2026-01-01"};
    return f;
  })};
  const source={...summary,matches:summary.matches.map(m=>m.id==="FS:event0"?{...m,status:"FINISHED"}:m)};
  mockEndpoints(page,{raw,source});
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.locator(".ft-match-row")).toHaveCount(36);
  await expect(page.getByRole("button",{name:"Active fixtures · 36"})).toBeVisible();
  await expect(page.locator('.ft-match-row[href="/details?id=FS%3Aevent0"]')).toHaveCount(0);
  await expect(page.locator('.ft-match-row[href="/details?id=FS%3Aevent1"]')).toHaveCount(1);
  // Historical direct links must keep functioning after homepage suppression.
  await page.goto("http://127.0.0.1:4173/details?id=FS%3Aevent0");
  await expect(page.getByRole("heading",{name:"Home 0 vs Away 0"})).toBeVisible();
});
