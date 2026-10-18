import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const home=readFileSync(new URL("../components/homepage-client.js",import.meta.url),"utf8");
const atlas=JSON.parse(readFileSync(new URL("../data/team-logo-aliases.json",import.meta.url)));
const expected=["Premier League","La Liga","Bundesliga","Serie A","Ligue 1","Champions League"];
const positions=expected.map(x=>home.indexOf('{label:"'+x+'"'));
assert.ok(positions.every(x=>x>=0),"every big-five / UEFA league must be prioritized");
assert.deepEqual([...positions].sort((a,b)=>a-b),positions,"big five first in expected order");
assert.match(home,/parseLeague\(a\)\.priority-parseLeague\(b\)\.priority/);
for(const [label,country] of [
 ["Eredivisie","NETHERLANDS"],["Primeira Liga","PORTUGAL"],
 ["Liga MX","MEXICO"],["A-League","AUSTRALIA"],["MLS","USA"],
 ["USL Championship","USA"],["J1 League","JAPAN"],["J2 League","JAPAN"],
 ["K League 1","SOUTH KOREA"],["K League 2","SOUTH KOREA"]
]){
 assert.ok(home.includes('label:"'+label+'",country:"'+country+'"'),"country-specific priority: "+label);
}
const expectedLogos={
 "melbourne victory":"melbourne victory fc","wellington phoenix":"wellington phoenix fc",
 "alkmaar":"az alkmaar","cambuur":"sc cambuur","g a eagles":"go ahead eagles",
 "groningen":"fc groningen","nijmegen":"n e c nijmegen","sittard":"fortuna sittard",
 "zwolle":"pec zwolle","kobe":"vissel kobe","iwaki":"iwaki fc","anyang":"fc anyang",
 "daejeon":"daejeon hana citizen","gangwon":"gangwon fc",
 "gimcheon sangmu":"gimcheon sangmu fc","gwangju":"gwangju fc",
 "incheon":"incheon united","pohang":"pohang steelers","seoul":"fc seoul",
 "busan":"busan ipark","gimhae":"gimhae fc 2008","hwaseong":"hwaseong fc",
 "jeonnam":"jeonnam dragons","seoul e land":"seoul e land fc",
 "suwon bluewings":"suwon samsung bluewings",
 "atl san luis":"atletico de san luis","juarez":"fc juarez",
 "leon":"club leon","braga":"sc braga"
};
for(const [key,target] of Object.entries(expectedLogos))
 assert.equal(atlas.aliases[key],target,"use actual single-asset atlas key for "+key);
const logo=readFileSync(new URL("../components/team-logo.js",import.meta.url),"utf8");
assert.match(logo,/return Array\.isArray\(logo\) && logo\.length === 1/,"do not use ambiguous badges");
assert.match(logo,/if \(scopedTargets\.length > 1\) return null/,"no ambiguous scoped country");
console.log("PHASE15_LEAGUE_PRIORITY_AND_ATLAS_ALIASES_PASSED");
