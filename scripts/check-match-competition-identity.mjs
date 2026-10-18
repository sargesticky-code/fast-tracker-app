import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {competitionForMatch} from "../lib/competition-identity.js";

const england={id:"FS:hAOr0qmA",source:"FLASHSCORE_CANONICAL",providerEventId:"hAOr0qmA",league:"Premier League"};
const russia={id:"FS:0MQmqoxp",source:"FLASHSCORE_CANONICAL",providerEventId:"0MQmqoxp",league:"Premier League [FS 2NIMUGw9]"};
const raw={id:"FS:0MQmqoxp",league:"Premier League",home:"Spartak Moscow",away:"Rubin Kazan"};

assert.equal(competitionForMatch(raw,russia),"Premier League [FS 2NIMUGw9]");
assert.equal(competitionForMatch({id:england.id,league:"Premier League"},england),"Premier League");
assert.equal(competitionForMatch(raw,england),"Premier League","never join a different event");
assert.equal(competitionForMatch(raw,{...russia,providerEventId:"falsified"}),"Premier League");
assert.equal(competitionForMatch(raw,{...russia,source:"OTHER"}),"Premier League");
assert.equal(competitionForMatch(raw,null),"Premier League","verified feed absent means raw fallback");
assert.equal(competitionForMatch(raw,{...russia,league:""}),"Premier League","unknown != fabricated identity");
assert.equal(competitionForMatch({id:"OTHER:0MQmqoxp",league:"Premier League"},russia),"Premier League");
assert.equal(raw.league,"Premier League","raw input remains immutable");

const sqlFile="supabase/future_migrations/20261018151016_phase54_disambiguate_premier_league_competitions.sql";
const sql=readFileSync(sqlFile,"utf8");
assert.equal(createHash("md5").update(sql).digest("hex"),"55b15c2e65e324512f6bd7d5d6084ba3",
  "Original production-applied SQL must never be changed");
for (const s of [
 "SY30SsKF","source_competition_id","competition_identity_status",
 "OTHER_PREMIER_LEAGUE_SOURCE_ID","f.league <> 'Premier League'",
 "public.ft_historical_form_by_team"
]) assert.ok(sql.includes(s),"Missing verified competition or historical-form safety: "+s);
assert.doesNotMatch(sql,/\bDELETE FROM\b|\bTRUNCATE\b|\bcron\.schedule\b/i);
const component=readFileSync("components/homepage-client.js","utf8");
assert.match(component,/competitionForMatch\(row,evidence\?\.canonicalRow\)/);
assert.match(component,/return \{\.\.\.row,league,sourceLeague:row\.league,info,/);
console.log("COMPETITION_ID_MATCH_GROUPING_GUARDS_PASSED");
