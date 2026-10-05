import fs from 'node:fs';
import assert from 'node:assert/strict';

// Execute the real parser without starting Deno.serve or accessing credentials.
export function ingestionParser() {
  const code=fs.readFileSync('supabase/functions/phase2-fotmob-lineups/index.ts','utf8');
  const names=['keyName','slotFromLayout','roleFromPlayer','parseLineup'];
  const definitions=names.map(name=>{
    const start=code.indexOf(`function ${name}(`);
    const next=code.indexOf('\n}',start)+2;
    assert.ok(start>=0 && next>start);
    return code.slice(start,next);
  }).join('\n');
  return new Function(definitions+'; return parseLineup;')();
}

const parse=ingestionParser();
const capture='2026-10-04T22:00:00.000Z';
const team=side=>({id:side,starters:Array.from({length:11},(_,i)=>({id:`${side}-${i}`,name:`Test ${side} ${i}`})),subs:[{id:`${side}-sub`,name:'Test substitute'}],coach:{id:`${side}-coach`,name:'Test coach'},unavailable:[{id:`${side}-out`,name:'Test absence',unavailability:{type:'injury'}}]});
const detail=kind=>({content:{lineup:{lineupType:kind,homeTeam:team('H'),awayTeam:team('A')}}});
const first=parse(detail('predicted'),'TEST','EXTERNAL',capture);
assert.equal(first.rows.length,24);
for(const row of [...first.rows,...first.managers,...first.injuries]) {
  assert.equal(row.fetched_at,capture,'original acquisition time survives reprocessing');
  assert.equal(row.created_at,capture);
}
assert.ok(first.rows.every(row=>row.source_updated_at===null),'capture time is not a provider update');
assert.ok(first.injuries.every(row=>row.valid_from===capture),'cache must not move absence validity forward');
assert.deepEqual(parse(detail('predicted'),'TEST','EXTERNAL',capture),first,'repeated cache ingestion cannot rejuvenate evidence');
for(const kind of ['unconfirmed','not official','predicted','lastStarting11','actually predicted','']) {
  assert.ok(parse(detail(kind),'TEST','EXTERNAL',capture).rows.every(row=>row.confirmed===false),kind+' must not confirm');
}
for(const kind of ['confirmed','official','actual',' CONFIRMED ']) {
  assert.ok(parse(detail(kind),'TEST','EXTERNAL',capture).rows.every(row=>row.confirmed===true));
}
for(const value of [null,false,'','invalid',42]) {
  assert.equal(parse(detail('confirmed'),'TEST','EXTERNAL',value).rows.length,0,'invalid capture fails closed');
}
const source=fs.readFileSync('supabase/functions/phase2-fotmob-lineups/index.ts','utf8');
assert.ok(source.includes('parseLineup(s.detail_raw,s.matched_hkjc_event_id,s.external_event_id,s.detail_fetched_at)'));
assert.ok(source.includes('detail_fetched_at:capturedAt,detail_raw:d'));
console.log('Lineup ingestion passed: original cache capture, unknown provider update, stable absence timing and explicit official classification.');
