import assert from "node:assert/strict";
import fs from "node:fs";
import { valueEdge, sanitizeFallbackMatch } from "../lib/fast-tracker.js";

const model={home:0.70,draw:0.20,away:0.10};
const odds={home:2.02,draw:3.50,away:2.87};
const baseline={id:"FB6342",home:"Arsenal",away:"Leeds",odds,forebet:model,dc:null,pi:null,form:null,multi:null};
const bookmaker=valueEdge({...baseline,sourceContext:{marketAuthority:"FLASHSCORE_BET365"}});
assert.ok(bookmaker && Number.isFinite(bookmaker.expectedValue),"genuine bookmaker quote with independent model retains ordinary EV calculation");
const china={
  ...baseline,
  sourceContext:{marketAuthority:"CHINA_500_SPF",quoteSemantics:"PREMATCH_REFERENCE_ONLY",
    capturedAt:"2026-10-10T12:34:02Z",sourceUpdatedAt:"2026-10-10T12:12:08Z"},
  health:{unifiedCoverageStatus:"CHINA_500_SPF_REFERENCE",authorityFreshness:"REFERENCE_ONLY"},
};
assert.equal(valueEdge(china),null,"dated China SPF reference can never create EV with a Forebet model");
assert.equal(valueEdge({...china,health:null}),null,"provenance survives stripped health");
assert.equal(valueEdge({...china,sourceContext:null}),null,"defensive health guard survives missing sourceContext");
assert.equal(valueEdge({...china,sourceContext:{},health:{authorityFreshness:"REFERENCE_ONLY"}}),null,"reference freshness still rejects EV");
const expired=sanitizeFallbackMatch(china);
assert.deepEqual(expired.odds,{home:null,draw:null,away:null},"expired SPF odds are removed");
assert.equal(expired.sourceContext.marketAuthority,null,"expired quote cannot keep source-current label");
assert.equal(valueEdge(expired),null,"expired quote cannot create EV");
const ui=fs.readFileSync("components/homepage-client.js","utf8");
assert.ok(ui.includes('authority?.sourceContext?.marketAuthority === "CHINA_500_SPF"'),"reference authority is held across enrichment");
assert.ok(ui.includes("merged.decision = null;")&&ui.includes("merged.decisionEdge = null;")&&ui.includes("merged.oddsMovement = null;"),"rich betting advice is removed on 500 reference");
assert.ok(ui.includes("...(authority.health || {})"),"canonical source health outranks enriched health");
assert.ok(ui.includes('className="ft-spf-implied"') && ui.includes('not a prediction') && ui.includes('china500Implied = china500Reference && prematchOdds && !verifiedLiveOdds ? fairMarket(prematchOdds) : null'),"SPF implied percentages remain clearly separate from Forebet/model");
console.log("FT500_REFERENCE_ONLY_EV_GATES_OK 9 assertions");
