const { test, expect } = require("@playwright/test");
const fs = require("fs");
fs.mkdirSync("test-results",{recursive:true});
const snapshot = {source:"FLASHSCORE_BET365",captured_at:"2026-10-11T01:00:00Z",discovered:Array.from({length:40},(_,i)=>({provider_event_id:`event${i}`,home:`Home ${i}`,away:`Away ${i}`,competition:i%2?"League A":"League B",fixture_date:i<35?"2026-10-11":"2026-10-12",time_text:i?"15:30":null})),fixtures:[{provider_event_id:"event1",hda:{home:2.2,draw:3.3,away:4.4},captured_at:"2026-10-11T00:59:00Z"}]};
for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 test(`raw fixtures and details ${viewport.width}`,async({page})=>{
  await page.setViewportSize(viewport);
  const external=[];
  page.on("request",r=>{if(!r.url().startsWith("http://127.0.0.1:4173"))external.push(r.url());});
  await page.route("**/snapshot",r=>r.fulfill({json:snapshot,headers:{"access-control-allow-origin":"*"}}));
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.locator(".ft-match-row")).toHaveCount(40);
  await expect(page.getByRole("button",{name:"2026-10-11 · 35"})).toBeVisible();
  await expect(page.getByText("Time not supplied")).toBeVisible();
  await page.screenshot({path:`test-results/raw-board-${viewport.width}.png`,fullPage:true});
  await page.getByRole("button",{name:"2026-10-12 · 5"}).click();
  await expect(page.locator(".ft-match-row")).toHaveCount(5);
  await page.getByRole("button",{name:"All fixtures · 40"}).click();
  await page.getByLabel("Search",{exact:true}).fill("Home 1");
  await expect(page.locator(".ft-match-row")).toHaveCount(11);
  await page.getByLabel("Search",{exact:true}).fill("Home 0");
  await page.locator(".ft-match-row").click();
  await expect(page.getByRole("heading",{name:"Home 0 vs Away 0"})).toBeVisible();
  await expect(page.getByText("Raw prices: — / — / —")).toBeVisible();
  await page.getByText("Original source fields").click();
  await expect(page.locator("pre")).toContainText('"time_text": null');
  expect(external.every(url=>url.includes("fast-tracker-dashboard-production.up.railway.app/snapshot"))).toBeTruthy();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({path:`test-results/raw-detail-${viewport.width}.png`,fullPage:true});
 });
}
test("unavailable source does not invent empty counts",async({page})=>{
 await page.route("**/snapshot",r=>r.fulfill({status:503,body:"Unavailable",headers:{"access-control-allow-origin":"*"}}));
 await page.goto("http://127.0.0.1:4173/");
 await expect(page.locator("p[role=alert]")).toContainText("Fixture counts are unknown");
 await expect(page.getByRole("button",{name:"All fixtures · —"})).toBeVisible();
});
