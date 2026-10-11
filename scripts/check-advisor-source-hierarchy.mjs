// Provider-selection gate: no web data, no chance of accidental legacy HKJC promotion.
import assert from "node:assert/strict";
import { preferredModel, modelLabel, valueEdge } from "../lib/fast-tracker.js";

const now = new Date().toISOString();
const triplet = (home,draw,away,rest={}) =>
  ({ home,draw,away,status:"CURRENT",identityStatus:"VERIFIED",
     sourceFetchedAt:now,...rest });
const forebet={home:.47,draw:.28,away:.25};
const bcl=triplet(.64,.2,.16,{predictedScore:"2-0"});
const sporty=triplet(.41,.27,.32);
const base={forebet,advisorPredictions:{BETCLAN:bcl,SPORTYTRADER:sporty},
  odds:{home:2.4,draw:3.2,away:3.0}};
assert.equal(preferredModel(base),bcl,"BetClan must be first when independently verified");
assert.equal(modelLabel(base),"BetClan");
assert.ok(valueEdge(base),"Independent full-triplet source must feed existing edge calculation");
assert.equal(preferredModel({...base,advisorPredictions:{BETCLAN:{...bcl,status:"UNVERIFIED"},SPORTYTRADER:sporty}}),forebet,
  "Unverified BetClan may never replace genuine Forebet");
assert.equal(preferredModel({...base,advisorPredictions:{BETCLAN:{...bcl,identityStatus:"AMBIGUOUS"}}}),forebet);
assert.equal(preferredModel({...base,advisorPredictions:{BETCLAN:{...bcl,sourceFetchedAt:"2025-01-01T00:00:00Z"}}}),forebet,
  "Stale predictions may never override verified models");
assert.equal(preferredModel({...base,forebet:null,advisorPredictions:{SPORTYTRADER:sporty}}),sporty,
  "Third advisor may be selected only with independently verified full 1X2");
assert.equal(preferredModel({...base,forebet:null,advisorPredictions:{SPORTYTRADER:{...sporty,away:null}}}),null,
  "Single SportyTrader pick without full triplet cannot make a model");
assert.equal(valueEdge({...base,forebet:null,advisorPredictions:{BETCLAN:{...bcl,identityStatus:"UNVERIFIED"}}}),null,
  "Do not calculate edge from unverified advisor data");
console.log("ADVISOR_INDEPENDENCE_AND_PRIORITY_PASS");
