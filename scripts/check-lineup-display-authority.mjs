import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = fs.readFileSync('supabase/functions/_shared/lineup-display.ts', 'utf8');
const { eligibleLineupRows, confirmedStartingXI } = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const starter = (side, i, overrides = {}) => ({ hkjc_event_id:'TEST', team_side:side, starter:true, confirmed:true, display_eligible:true, fact_status:'CONFIRMED', canonical_player_identity:`${side}:${i}`, ...overrides });
const xi = ['H','A'].flatMap(side => Array.from({length:11}, (_,i) => starter(side,i)));
assert.equal(confirmedStartingXI(xi), true);
assert.equal(confirmedStartingXI(xi.slice(1)), false, 'partial official XI is not confirmed 11v11');
assert.equal(confirmedStartingXI([...xi, starter('H',12,{starter:false})]), true, 'bench does not alter XI confirmation');
assert.equal(confirmedStartingXI([...xi, starter('H',12)]), false, 'overfull XI fails closed');
assert.equal(confirmedStartingXI(xi.map((r,i)=>i===0?{...r,canonical_player_identity:'H:1'}:r)), false, 'duplicate identity fails closed');
assert.equal(confirmedStartingXI(xi.map((r,i)=>i===0?{...r,fact_status:'SOURCE_CONFIRMED_IDENTITY_UNRESOLVED'}:r)), false);
assert.equal(confirmedStartingXI(xi.map(r=>({...r,confirmed:false,fact_status:'UNCONFIRMED'}))), false, 'predictions never confirm');
assert.deepEqual(eligibleLineupRows([starter('H',0),starter('H',1,{display_eligible:false}),starter('H',2,{hkjc_event_id:'OTHER'}),starter('?',3),starter('H',4,{display_eligible:undefined})],'TEST'),[starter('H',0)]);
assert.deepEqual(eligibleLineupRows(null,'TEST'),[]);
for (const name of ['app-match-detail','app-match-analysis']) {
 const api=fs.readFileSync(`supabase/functions/${name}/index.ts`,'utf8');
 assert.ok(api.includes('manyWith(optionalDb,"phase2_lineup_display_current")'));
 assert.ok(!api.includes('manyWith(optionalDb,"phase2_match_lineup_evidence")'), 'no raw history fallback');
 assert.ok(api.includes('eligibleLineupRows(lineups.data,id)'));
 assert.ok(api.includes('confirmedStartingXI('));
 assert.ok(api.includes('"phase2_match_lineup_evidence"'), 'retain underlying durable row provenance');
}
const sql=fs.readFileSync('docs/phase2-lineup-authority-review.sql','utf8');
assert.ok(sql.includes('ORDER BY (stats.confirmed_rows > 0) DESC,'));
console.log('Lineup authority passed: current display eligibility, fixture isolation, exact distinct canonical XIs, unknown fail-closed, durable provenance, confirmed-first SQL.');
