function token(value) {
  return typeof value === "string" && value && value.trim() === value ? value : null;
}
function capture(row, now) {
  const value = token(row?.fetched_at);
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) && time <= now ? time : null;
}
function identity(row) {
  const fields = [row?.hkjc_event_id, row?.source_name, row?.player_key, row?.status_type].map(token);
  return fields.every(Boolean) && ["H", "A"].includes(row?.team_side)
    ? JSON.stringify([...fields, row.team_side]) : null;
}
function playerGroup(row) {
  return JSON.stringify([row?.hkjc_event_id, row?.source_name, row?.player_key]);
}

// Plan only explicit source reports. Absence from a capture is not recovery.
// Updates retain durable record identity and original validity/creation dates.
export function planPlayerStatusRefresh(incoming, existing, now = Date.now()) {
  const inserts = [], updates = [];
  let skipped = 0;
  const groups = new Map();
  for (const row of incoming || []) {
    const key = identity(row);
    if (!key || capture(row, now) === null) { skipped++; continue; }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const [key, rows] of groups) {
    // Conflicting duplicate incoming observations cannot establish a revision.
    if (rows.some(row => JSON.stringify(row) !== JSON.stringify(rows[0]))) { skipped += rows.length; continue; }
    const row = rows[0];
    const related = [...(existing || []), ...(incoming || [])].filter(other => playerGroup(other) === playerGroup(row));
    if (related.some(other => other.team_side !== row.team_side)) { skipped += rows.length; continue; }
    const current = (existing || []).filter(other => identity(other) === key);
    const {id: ignoredId, ...newRow} = row;
    if (!current.length) { inserts.push(newRow); continue; }
    if (current.length !== 1 || !current[0].id || capture(current[0], now) === null
      || capture(row, now) <= capture(current[0], now)) { skipped += rows.length; continue; }
    const previous = current[0];
    const {created_at: ignoredCreation, ...patch} = newRow;
    patch.valid_from = previous.valid_from ?? null;
    patch.valid_until = previous.valid_until ?? null;
    updates.push({previous, patch});
  }
  return {inserts, updates, skipped};
}
