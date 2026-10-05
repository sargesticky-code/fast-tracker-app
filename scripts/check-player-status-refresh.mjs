import fs from 'node:fs';
import assert from 'node:assert/strict';
const code=fs.readFileSync('supabase/functions/_shared/player-status-refresh.ts','utf8');
export const {planPlayerStatusRefresh}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const now=Date.parse('2026-10-05T10:00:00Z');
const old={id:1,hkjc_event_id:'TEST',team_side:'H',player_key:'123',status_type:'INJURY',status_value:'Doubtful',source_name:'FOTMOB',fetched_at:'2026-10-05T06:00:00Z',created_at:'2026-10-04T00:00:00Z',valid_from:'2026-10-04T00:00:00Z',valid_until:null};
const fresh={...old,id:undefined,status_value:'About a week',fetched_at:'2026-10-05T07:00:00Z',created_at:'2026-10-05T07:00:00Z',valid_from:'2026-10-05T07:00:00Z'};
const plan=planPlayerStatusRefresh([fresh],[old],now);
assert.equal(plan.updates.length,1);
assert.equal(plan.updates[0].patch.status_value,'About a week');
assert.equal(plan.updates[0].patch.valid_from,old.valid_from);
assert.ok(!('id' in plan.updates[0].patch) && !('created_at' in plan.updates[0].patch));
assert.equal(planPlayerStatusRefresh([{...fresh,status_value:old.status_value}],[old],now).updates.length,1,'real newer capture refreshes unchanged source text');
for(const fetched_at of [old.fetched_at,'2026-10-05T05:00:00Z','2026-10-06T00:00:00Z',null,'bad']) {
 assert.equal(planPlayerStatusRefresh([{...fresh,fetched_at}],[old],now).updates.length,0,'equal/older/invalid/future capture cannot refresh');
}
assert.equal(planPlayerStatusRefresh([fresh],[{...old,fetched_at:null}],now).updates.length,0);
assert.equal(planPlayerStatusRefresh([fresh],[old,{...old,id:2}],now).updates.length,0,'ambiguous existing duplicates fail closed');
assert.equal(planPlayerStatusRefresh([fresh,{...fresh,status_value:'Out'}],[old],now).updates.length,0,'conflicting incoming duplicate fails closed');
assert.equal(planPlayerStatusRefresh([fresh,fresh],[],now).inserts.length,1);
assert.equal(planPlayerStatusRefresh([fresh],[{...old,team_side:'A'}],now).inserts.length,0,'same fixture/player side reversal is not a new fact');
assert.equal(planPlayerStatusRefresh([{...fresh,team_side:'?'}],[],now).inserts.length,0);
assert.equal(planPlayerStatusRefresh([{...fresh,hkjc_event_id:' TEST '}],[],now).inserts.length,0,'do not silently normalize fixture identity');
assert.equal(planPlayerStatusRefresh([fresh],[{...old,valid_until:'2026-10-07T00:00:00Z'}],now).updates[0].patch.valid_until,'2026-10-07T00:00:00Z');
assert.equal(planPlayerStatusRefresh([fresh],[{...old,hkjc_event_id:'OTHER'}],now).inserts.length,1,'different fixture stays separate');
assert.equal(planPlayerStatusRefresh([fresh],[{...old,source_name:'OTHER'}],now).inserts.length,1,'different source stays separate');
assert.deepEqual(planPlayerStatusRefresh([], [old], now),{inserts:[],updates:[],skipped:0},'missing player is not recovery/deletion');

// Exercise the actual producer writer, including its conditional database gate.
const producer=fs.readFileSync('supabase/functions/phase2-fotmob-lineups/index.ts','utf8');
const start=producer.indexOf('async function refreshPlayerStatusEvidence(');
const end=producer.indexOf('\n}',start)+2;
export const refreshPlayerStatusEvidence=new Function('planPlayerStatusRefresh',producer.slice(start,end)+';return refreshPlayerStatusEvidence;')(planPlayerStatusRefresh);
function mockDb(seed,{race=false,readError=false}={}) {
 const records=structuredClone(seed), writes=[];
 return {records,writes,from(table){
  assert.equal(table,'phase2_player_status_evidence');
  let mode='read',patch=null,filters={},eventIds=null;
  const query={
   select(){return query;},in(field,values){assert.equal(field,'hkjc_event_id');eventIds=values;return query;},
   eq(field,value){filters[field]=value;return query;},
   update(value){mode='update';patch=value;return query;},insert(value){mode='insert';patch=value;return query;},
   then(resolve,reject){return Promise.resolve().then(()=>{
    if(mode==='read' && readError)return {data:null,error:{message:'test read unavailable'}};
    if(mode==='update' && race)records[0].fetched_at='2026-10-05T08:00:00Z';
    if(mode==='insert'){records.push(...patch);writes.push({mode,patch});return {data:null,error:null};}
    const matches=records.filter(row=>(!eventIds||eventIds.includes(row.hkjc_event_id))&&Object.entries(filters).every(([k,v])=>row[k]===v));
    if(mode==='update'){for(const row of matches)Object.assign(row,patch);if(matches.length)writes.push({mode,patch,filters});}
    return {data:structuredClone(matches),error:null};
   }).then(resolve,reject);}
  };return query;
 }};
}
const db=mockDb([old]);
assert.deepEqual(await refreshPlayerStatusEvidence(db,[fresh]),{inserted:0,updated:1,skipped:0});
assert.equal(db.records[0].id,old.id);
assert.equal(db.records[0].created_at,old.created_at);
assert.equal(db.writes[0].filters.fetched_at,old.fetched_at);
const raced=mockDb([old],{race:true});
assert.deepEqual(await refreshPlayerStatusEvidence(raced,[fresh]),{inserted:0,updated:0,skipped:1});
assert.equal(raced.writes.length,0,'concurrent newer capture is not overwritten');
const unavailable=mockDb([],{readError:true});
await assert.rejects(()=>refreshPlayerStatusEvidence(unavailable,[fresh]));
assert.equal(unavailable.writes.length,0,'failed read cannot become an empty-table insertion');
assert.deepEqual(await refreshPlayerStatusEvidence(mockDb([]),[fresh]),{inserted:1,updated:0,skipped:0});
await assert.rejects(()=>refreshPlayerStatusEvidence(mockDb([]),[{...fresh,source_name:'OTHER'}]));
assert.ok(producer.includes('refreshPlayerStatusEvidence(db,cachedInjuries)') && producer.includes('refreshPlayerStatusEvidence(db,parsed.injuries)'));
console.log('Player status refresh passed: real capture revisions, durable IDs/validity, strict sides/sources, failed-read rejection and concurrent-update protection.');
