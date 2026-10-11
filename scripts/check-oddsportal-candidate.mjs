import assert from "node:assert/strict";
import { oddsPortalCandidates } from "../lib/oddsportal-candidate.js";

const now=Date.parse("2026-10-10T11:33:00Z");
const sample={
  scraped_date:"2026-10-10 11:32:10 UTC",
  match_date:"2026-10-10 19:30:00 UTC",
  match_link:"https://www.oddsportal.com/football/h2h/arsenal-example/leeds-example/#xQ77QTN0",
  home_team:"Arsenal",away_team:"Leeds",league_name:"Premier League",
  "1x2_market":[
    {"1":"2.10","X":"3.50","2":"3.20",bookmaker_name:"Bookmaker A",period:"FullTime",submarket_name:"1X2"},
    {"1":"2.12","X":"3.45","2":"3.15",bookmaker_name:"Bookmaker B",period:"FullTime",submarket_name:"1X2"},
    {"1":"1.85","X":"2.1",bookmaker_name:"Partial",period:"FullTime",submarket_name:"1X2"},
  ]
};
const good=oddsPortalCandidates([sample],{now});
assert.equal(good.candidates.length,1);
assert.equal(good.candidates[0].providerEventId,"xQ77QTN0");
assert.equal(good.candidates[0].canonicalMatchId,null);
assert.equal(good.candidates[0].identityStatus,"UNVERIFIED");
assert.equal(good.candidates[0].quotes.length,2);
assert.equal(good.candidates[0].quotes[0].draw,3.5);
assert.equal(good.marketAuthorityConfirmed,false);
assert.equal(oddsPortalCandidates([sample],{now:now+3600_000}).rejected[0].reason,"STALE_OR_FUTURE_CAPTURE");
assert.equal(oddsPortalCandidates([{...sample,match_date:"2025-02-21 20:00:00 UTC"}],{now}).rejected[0].reason,"HISTORICAL_OR_STARTED_NOT_PREMATCH");
assert.equal(oddsPortalCandidates([{...sample,match_link:"https://evil.example/football/#xQ77QTN0"}],{now}).candidates.length,0);
assert.equal(oddsPortalCandidates([{...sample,match_date:"2026-10-10 19:30"}],{now}).candidates.length,0);
assert.equal(oddsPortalCandidates([sample,sample],{now}).rejected[0].reason,"DUPLICATE_PROVIDER_EVENT");
assert.equal(oddsPortalCandidates([{...sample,"1x2_market":[{"1":"2.20","X":"3.20","2":"SUSPENDED",bookmaker_name:"B",period:"FullTime",submarket_name:"1X2"}]}],{now}).candidates.length,0);
assert.equal(oddsPortalCandidates([{...sample,scraped_date:"2026-09-02 13:02:39 UTC"}],{now}).candidates.length,0);
console.log("OddsHarvester candidate identity/freshness/nonpublication contract passed");
