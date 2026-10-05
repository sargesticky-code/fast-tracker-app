export function movementRowsForFixtures(rows, fixtures, nowMs = Date.now()) {
  const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
  const number = value => value != null && ['string','number'].includes(typeof value) && String(value).trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  const time = value => text(value) ? Date.parse(value) : NaN;
  const name = value => text(value)?.toLowerCase();
  const counts = new Map();
  for (const row of rows) counts.set(row.hkjc_event_id, (counts.get(row.hkjc_event_id) || 0) + 1);
  const result = [];
  for (const row of rows) {
    const id = text(row.hkjc_event_id);
    const matches = fixtures.filter(f => f.hkjc_event_id === id);
    if (!id || counts.get(id) !== 1 || matches.length !== 1) continue;
    const fixture = matches[0], captured = time(row.captured_at_hkt), kickoff = time(row.kickoff_hkt);
    if (!Number.isFinite(captured) || captured > nowMs || nowMs - captured > 6 * 3600000 || !Number.isFinite(kickoff) || kickoff !== time(fixture.kickoff_hkt)) continue;
    if (!name(row.home) || !name(row.away) || name(row.home) !== name(fixture.home_en) || name(row.away) !== name(fixture.away_en)) continue;
    const price = number(row.now_odds), confidence = number(row.match_confidence);
    if (!(price > 1) || !(confidence >= .94 && confidence <= 1) || !['H','D','A'].includes(row.movement_side)) continue;
    const out = { hkjc_event_id:id, captured_at:new Date(captured).toISOString(), kickoff_hkt:new Date(kickoff).toISOString(), home:text(row.home), away:text(row.away), movement_side:row.movement_side, now_odds:price, match_confidence:confidence, raw:row, updated_at:new Date(captured).toISOString() };
    for (const key of ['odds_24h','odds_2h','odds_1h']) { const value=number(row[key]); out[key]=value > 1 ? value : null; }
    for (const key of ['move_24h_pp','move_2h_pp','move_1h_pp','vol_24h_pp','model_prob','alert_score']) out[key]=number(row[key]);
    for (const key of ['signal','model_side','model_alignment']) out[key]=text(row[key]);
    result.push(out);
  }
  return result;
}
