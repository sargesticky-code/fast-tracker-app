export function lineupSide(row) {
  const value = String(row?.team_side || row?.side || "").trim().toUpperCase();
  if (["H", "HOME", "1"].includes(value)) return "H";
  if (["A", "AWAY", "2"].includes(value)) return "A";
  return null;
}

export function lineupNumber(value) {
  if (!["number", "string"].includes(typeof value) || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Predicted names may be reported without promoting an unresolved identity.
// Only the authoritative current display response can introduce predictions.
export function lineupDisplayRows(sourceRows, payload, eventId) {
  const fixture = payload?.fixture || payload?.match;
  if (!fixture || payload?.fixtureSource === "MISSING") return [];
  const fixtureId = String(fixture.hkjc_event_id || fixture.id || "");
  if (!eventId || fixtureId !== eventId || (payload?.id && payload.id !== eventId)) return [];
  const authority = payload?.humanFactors?.lineupAuthority;
  const current = authority?.source === "phase2_lineup_display_current"
    && authority?.rawFallback === false && authority?.status === "AVAILABLE";
  const rows = (Array.isArray(sourceRows) ? sourceRows : []).filter(row =>
    lineupSide(row) && (!row.hkjc_event_id || row.hkjc_event_id === eventId));
  const officialSides = new Set(rows.filter(row => row.confirmed === true).map(lineupSide));
  const selected = rows.filter(row => {
    if (row.fact_status === "CONFIRMED" && row.confirmed === true) return !current
      || (row.hkjc_event_id === eventId && row.display_eligible === true);
    return current && row.hkjc_event_id === eventId && row.display_eligible === true
      && row.confirmed === false && !officialSides.has(lineupSide(row))
      && Boolean(String(row.player_key || "").trim()) && Boolean(String(row.player_name || "").trim());
  });
  const unique = new Map();
  const conflicting = new Set();
  for (const row of selected) {
    const key = [lineupSide(row), row.canonical_player_identity || row.player_key || row.id].join("|");
    if (conflicting.has(key)) continue;
    const previous = unique.get(key);
    if (previous && ["starter", "confirmed", "fact_status", "identity_status"].some(field => previous[field] !== row[field])) {
      unique.delete(key);
      conflicting.add(key);
      continue;
    }
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
}

export function completeConfirmedLineup(rows) {
  return ["H", "A"].every(side => {
    const starters = rows.filter(row => lineupSide(row) === side && row.starter === true);
    const identities = starters.map(row => row.canonical_player_identity || row.player_key);
    return starters.length === 11 && starters.every(row => row.fact_status === "CONFIRMED" && row.confirmed === true)
      && identities.every(Boolean) && new Set(identities).size === 11;
  });
}

export function lineupStrengthSummary(rows, side) {
  const starters = rows.filter(row => lineupSide(row) === side && row.starter === true);
  // No validated importance-weighted strength producer exists yet. In
  // particular V1_COMPLETENESS_INDEX is not a football-strength percentage.
  return {
    strengthPct: null,
    reportedStarters: starters.length || null,
    predicted: starters.some(row => row.confirmed === false),
    identityUnresolved: starters.some(row => row.identity_status !== "CANONICAL"),
    reason: "Player importance and a verified full-strength baseline are not available.",
  };
}
