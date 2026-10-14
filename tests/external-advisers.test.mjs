import test from 'node:test';
import assert from 'node:assert/strict';
import {currentExternalAdvisers} from '../lib/verified-evidence-feed.js';
const now=Date.parse('2026-10-14T13:30:00Z');
const row={id:'FS:hUFd2eIq',kickoff:'2026-10-14T16:00:00Z',externalAdvisers:[{
 id:'FS:hUFd2eIq',provider:'BETCLAN',identityStatus:'VERIFIED',eventId:'1513647',
 sourceUrl:'https://www.betclan.com/predictionsdetails/football/1513647/paide-v-tammeka-prediction/',
 capturedAt:'2026-10-14T13:00:00Z',kickoff:'2026-10-14T17:00:00+01:00',
 hda:{home:.6,draw:.2,away:.2},predictedScore:'3-1',over25:.63,bttsYes:.61}]};
test('retains genuine values and exact fixture identity',()=>assert.equal(currentExternalAdvisers(row,now)[0].hda.home,.6));
test('rejects stale, started, provisional, wrong identity and foreign source',()=>{
 for(const change of [{capturedAt:'2026-10-01T00:00:00Z'},{kickoff:'2026-10-14T12:00:00Z'},
 {identityStatus:'PROVISIONAL'},{id:'FS:other123'},{sourceUrl:'https://evil.test/'}])
 assert.deepEqual(currentExternalAdvisers({...row,externalAdvisers:[{...row.externalAdvisers[0],...change}]},now),[]);
});
test('suppresses duplicate provider votes',()=>assert.deepEqual(currentExternalAdvisers({...row,externalAdvisers:[...row.externalAdvisers,...row.externalAdvisers]},now),[]));
test('unknown markets stay null and text never becomes probabilities',()=>{
 const a=currentExternalAdvisers({...row,externalAdvisers:[{...row.externalAdvisers[0],hda:null,predictedScore:null,over25:null,bttsYes:null,tip:'Under 2.5 goals'}]},now)[0];
 assert.equal(a.hda,null);assert.equal(a.over25,null);assert.equal(a.tip,'Under 2.5 goals');
});
