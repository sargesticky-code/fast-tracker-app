import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ADVISER_KEYS,matchAdviserFacet} from "../lib/adviser-visibility.js";
const keys=Object.keys(ADVISER_KEYS);
assert.deepEqual(keys,["adviser-betclan","adviser-sportytrader","adviser-primatips","adviser-statarea"]);
const verified=(provider)=>({provider,identityStatus:"VERIFIED"});
const provisional=(provider)=>({provider,status:"PROVISIONAL_NOT_VERIFIED"});
const match={
 evidence:{externalAdvisers:[verified("BETCLAN"),verified("SPORTYTRADER")]},
 externalProvisional:[provisional("PRIMATIPS"),provisional("STATAREA")]
};
for(const key of keys)assert.equal(matchAdviserFacet(match,key),true,"source must be discoverable: "+key);
assert.equal(matchAdviserFacet(match,"unknown"),false);
assert.equal(matchAdviserFacet({evidence:{externalAdvisers:[{provider:"BETCLAN",identityStatus:"PROVISIONAL_NOT_VERIFIED"}]}},
 "adviser-betclan"),false,"cannot promote provisional to verified");
assert.equal(matchAdviserFacet({externalProvisional:[{provider:"STATAREA",status:"VERIFIED"}]},
 "adviser-statarea"),false,"provisional feed must keep NOT VERIFIED status");
assert.equal(matchAdviserFacet({evidence:{externalAdvisers:[verified("BETCLAN")]}},
 "adviser-sportytrader"),false,"provider isolation");
assert.equal(matchAdviserFacet({}, "adviser-primatips"),false);
const src=readFileSync(new URL("../components/homepage-client.js",import.meta.url),"utf8");
for(const provider of ["betclan","sportytrader","primatips","statarea"]){
 assert.ok(src.includes('testId="filter-adviser-'+provider+'"'),"visible filter "+provider);
 assert.ok(src.includes('selectAdviser("'+provider+'")'),"filter action "+provider);
}
assert.match(src,/setScope\("all"\)/);
assert.match(src,/ADVISER_KEYS\[feature\]/);
assert.match(src,/matchAdviserFacet\(m,feature\)/);
assert.match(src,/adviser-details-link/);
assert.doesNotMatch(src,/SourceTeamComparison/);
console.log("PHASE10_ADVISER_DISCOVERY_NO_PROMOTION_PASSED");
