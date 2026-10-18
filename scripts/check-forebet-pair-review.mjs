import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {adviserPairId,readRejectedPairs,readConfirmedPairs,
 setRejectedPair,setConfirmedPair,adviserMismatchReport,adviserVerificationReport} from "../lib/adviser-pair-review.js";
import {normalizeForebetReview} from "../lib/forebet-pair-review.js";

const now=Date.parse("2026-10-18T08:00:00Z");
const fixtureId="FS:rHnJqO2T";
const candidate={
 provider:"FOREBET",identityStatus:"PROVISIONAL",
 sourceHome:"Man United",sourceAway:"Leeds",
 sourceUrl:"https://www.forebet.com/en/football/matches/man-united-leeds-2474125",
 sourceCapturedAt:"2026-10-18T07:45:00Z",predictedScore:"1 - 1",
 probabilities:{home:40,draw:30,away:30},
 evidence:"EXACT_CANONICAL_PROVISIONAL_CANDIDATE"
};
const payload={source:"FOREBET_PAIR_REVIEW",quality:"IDENTITY_REVIEW_ONLY",fixtureId,candidate};
const row=normalizeForebetReview(payload,fixtureId,now);
assert.equal(row.provider,"FOREBET");
assert.equal(row.identityStatus,"PROVISIONAL");
assert.equal(row.hda.home,0.4);
assert.equal(row.predictedScore,"1 - 1");
assert.ok(adviserPairId(fixtureId,row));
assert.equal(normalizeForebetReview({...payload,candidate:null},fixtureId,now),null);
assert.throws(()=>normalizeForebetReview(payload,"FS:DIFFERENT",now),/contract/);
assert.throws(()=>normalizeForebetReview({...payload,candidate:{...candidate,
 sourceUrl:"https://example.com/forged"}},fixtureId,now),/source/);
assert.throws(()=>normalizeForebetReview({...payload,candidate:{...candidate,
 sourceUrl:candidate.sourceUrl+"?other=1"}},fixtureId,now),/source/);
assert.throws(()=>normalizeForebetReview({...payload,candidate:{...candidate,
 probabilities:{home:80,draw:30,away:30},predictedScore:null}},fixtureId,now),/prediction/);
assert.throws(()=>normalizeForebetReview({...payload,candidate:{...candidate,
 sourceCapturedAt:"2026-10-10T00:00:00Z"}},fixtureId,now),/stale/);
assert.equal(normalizeForebetReview({...payload,candidate:{...candidate,
 identityStatus:"VERIFIED",evidence:"EXACT_CANONICAL_SOURCE_RECORD"}},fixtureId,now).identityStatus,"VERIFIED");

const kv=new Map();
const storage={getItem:k=>kv.get(k)??null,setItem:(k,v)=>kv.set(k,v)};
assert.equal(setConfirmedPair(storage,fixtureId,row,true),true);
assert.equal(readConfirmedPairs(storage).has(adviserPairId(fixtureId,row)),true);
assert.equal(setRejectedPair(storage,fixtureId,row,true),true);
assert.equal(readConfirmedPairs(storage).size,0);
assert.equal(readRejectedPairs(storage).has(adviserPairId(fixtureId,row)),true);
assert.equal(setRejectedPair(storage,fixtureId,row,false),false);
assert.equal(readRejectedPairs(storage).size,0);
assert.equal(setConfirmedPair(storage,fixtureId,row,true),true);
assert.equal(setConfirmedPair(storage,fixtureId,row,false),false);
assert.equal(readConfirmedPairs(storage).size,0);

assert.match(adviserMismatchReport(fixtureId,row,"Leeds","Man United","2026-10-18T13:00:00Z"),
 /Provider: FOREBET/);
assert.match(adviserVerificationReport(fixtureId,row,"Leeds","Man United","2026-10-18T13:00:00Z"),
 /Owner review decision: PAIRING_CORRECT/);
const component=readFileSync(new URL("../components/flashscore-raw-match.js",import.meta.url),"utf8");
assert.match(component,/provider="FOREBET"/);
assert.match(component,/fetchForebetPairReview/);
assert.match(component,/adviser-copy-verification-forebet/);
assert.match(component,/onLocalReviewChange=\{setForebetRejected\}/);
assert.match(component,/forebetVisible/);
assert.match(component,/Undo my pairing verification/);
assert.match(component,/Reject this pairing locally/);
assert.match(component,/Copy correction report/);
const edge=readFileSync(new URL("../supabase/functions/forebet-pair-review/index.ts",import.meta.url),"utf8");
assert.match(edge,/req.method!=="GET"/);
assert.match(edge,/forebet_prediction_current/);
assert.match(edge,/forebet_provisional_feed_current/);
assert.match(edge,/canonical_event_id:"eq."\+id/);
assert.match(edge,/rows.length>1/);
assert.doesNotMatch(edge,/\b(?:insert|delete|upsert|update|PATCH)\s*\(/i);
console.log("FOREBET_EXACT_ID_OWNER_REVIEW_AND_NO_PUBLIC_WRITES_PASSED");
