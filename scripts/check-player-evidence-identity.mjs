import fs from "node:fs";

const analysis = fs.readFileSync("supabase/functions/app-match-analysis/index.ts", "utf8");
const detailApi = fs.readFileSync("supabase/functions/app-match-detail/index.ts", "utf8");
const article = fs.readFileSync("components/evidence-article.js", "utf8");
const detailUi = fs.readFileSync("components/match-detail-client.js", "utf8");

const required = [
  [detailApi, "phase2_players"],
  [detailApi, "SOURCE_CONFIRMED_IDENTITY_UNRESOLVED"],
  [detailApi, "evidence_key:evidenceKey"],
  [analysis, "uniqueConfirmedClaims"],
  [analysis, "confirmedStatusClaims"],
  [analysis, "record_group:playerClaimFingerprint"],
  [article, "Confirmed source + canonical player identity"],
  [article, "player identity unresolved"],
  [detailUi, 'fact_status === "CONFIRMED"'],
  [detailUi, "unresolvedPlayerStatusEvidence"],
];
for (const [source, token] of required) {
  if (!source.includes(token)) {
    console.error("Missing player-evidence identity contract:", token);
    process.exit(1);
  }
}

const canonical = { confirmed: true, canonical: true };
const sourceOnly = { confirmed: true, canonical: false };
const provisional = { confirmed: false, canonical: false };
const status = (row) => row.confirmed && row.canonical
  ? "CONFIRMED"
  : row.confirmed
    ? "SOURCE_CONFIRMED_IDENTITY_UNRESOLVED"
    : "UNCONFIRMED";

if (status(canonical) !== "CONFIRMED") process.exit(1);
if (status(sourceOnly) === "CONFIRMED") {
  console.error("Source confirmation alone must never become a confirmed player fact");
  process.exit(1);
}
if (status(provisional) === "CONFIRMED") process.exit(1);

const overlapping = [
  { event:"FBX", side:"H", player:"P1", type:"INJURY", value:"OUT", provider:"A" },
  { event:"FBX", side:"H", player:"P1", type:"INJURY", value:"OUT", provider:"B" },
];
const fingerprints = new Set(overlapping.map((r) => [r.event,r.side,r.player,r.type,r.value].join("|")));
if (fingerprints.size !== 1) {
  console.error("Overlapping provider records must collapse to one underlying claim");
  process.exit(1);
}

console.log("Player evidence identity contract passed: canonical confirmation, unresolved fail-closed, overlapping-record collapse");

// Execute both actual API annotation functions; source-token checks alone
// previously missed an omitted canonical identity in the analysis payload.
const {stripTypeScriptTypes}=await import('node:module');
const {default:assert}=await import('node:assert/strict');
export function actualAnnotator(source) {
 const names=['normalizedSide','compactToken','evidenceKey','playerClaimFingerprint','annotatePlayerEvidence'];
 const definitions=names.map(name=>{
  const start=source.indexOf(`function ${name}(`);
  const end=source.indexOf('\n}',start)+2;
  assert.ok(start>=0 && end>start);
  return source.slice(start,end);
 }).join('\n');
 return new Function(stripTypeScriptTypes(definitions)+';return annotatePlayerEvidence;')();
}
const registry=new Map([
 ['APIF:1',{canonicalName:'Shared Name',teamKey:''}],
 ['APIF:2',{canonicalName:'Shared Name',teamKey:''}]
]);
const evidence={id:1,hkjc_event_id:'TEST',team_side:'HOME',player_key:'APIF:1',player_name:'Source name',confirmed:true,status_type:'INJURY',status_value:'OUT'};
const detailAnnotate=actualAnnotator(detailApi), analysisAnnotate=actualAnnotator(analysis);
const a=detailAnnotate(evidence,registry,'phase2_player_status_evidence','TEST');
const b=analysisAnnotate(evidence,registry,'phase2_player_status_evidence','TEST');
assert.deepEqual(b,a,'analysis and detail must emit identical canonical evidence contracts');
assert.equal(a.canonical_player_identity,'phase2_players:APIF:1');
assert.equal(a.fact_status,'CONFIRMED');
assert.ok(a.record_group.includes(a.canonical_player_identity));
assert.equal(a.record_group,detailAnnotate({...evidence,player_name:'Different provider spelling',source_name:'OTHER'},registry,'phase2_player_status_evidence').record_group,'same registry fact collapses despite provider spelling');
assert.notEqual(a.canonical_player_identity,detailAnnotate({...evidence,player_key:'APIF:2'},registry,'phase2_player_status_evidence').canonical_player_identity,'same names without team metadata remain distinct');
assert.equal(a.canonical_player_identity,detailAnnotate(evidence,new Map([['APIF:1',{canonicalName:'Renamed',teamKey:'NEW_TEAM'}]]),'phase2_player_status_evidence').canonical_player_identity,'transfer/name changes do not change identity');
for(const annotate of [detailAnnotate,analysisAnnotate]) {
 const unresolved=annotate({...evidence,player_key:'FOTMOB:1'},registry,'phase2_player_status_evidence','TEST');
 assert.equal(unresolved.canonical_player_identity,null);
 assert.equal(unresolved.fact_status,'SOURCE_CONFIRMED_IDENTITY_UNRESOLVED');
 assert.equal(annotate({...evidence,confirmed:false},registry,'phase2_match_lineup_evidence','TEST').fact_status,'UNCONFIRMED');
}
const {confirmedStartingXI}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(fs.readFileSync('supabase/functions/_shared/lineup-display.ts','utf8'))).toString('base64'));
const xiRegistry=new Map(Array.from({length:22},(_,i)=>['APIF:'+i,{canonicalName:'Same Name',teamKey:''}]));
const xi=Array.from({length:22},(_,i)=>analysisAnnotate({hkjc_event_id:'TEST',team_side:i<11?'H':'A',player_key:'APIF:'+i,confirmed:true,starter:true,display_eligible:true},xiRegistry,'phase2_match_lineup_evidence','TEST'));
assert.equal(confirmedStartingXI(xi),true,'actual analysis output carries the identities required for full XI confirmation');
assert.equal(confirmedStartingXI(xi.map((row,i)=>i===0?{...row,canonical_player_identity:xi[1].canonical_player_identity}:row)),false);
console.log('Actual API player annotation passed: stable registry identity, detail/analysis parity, distinct same-name players and canonical confirmed XI.');
