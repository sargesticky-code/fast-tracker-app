// Internal producer state only: source XI coverage is not canonical player confirmation.
function snapshotKey(row) {
  const event = String(row?.hkjc_event_id || "").trim();
  const source = String(row?.source_name || "").trim();
  return event && source ? JSON.stringify([event, source]) : null;
}

function captureTime(row, now) {
  if (typeof row?.fetched_at !== "string" || !row.fetched_at.trim()) return null;
  const time = Date.parse(row.fetched_at);
  return Number.isFinite(time) && time <= now ? time : null;
}

export function latestLineupRows(rows, now = Date.now()) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = snapshotKey(row);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const result = [];
  for (const group of groups.values()) {
    const times = group.map(row => captureTime(row, now));
    // Unknown or future timing cannot safely establish a latest snapshot.
    if (times.some(time => time === null)) continue;
    const latest = Math.max(...times);
    result.push(...group.filter((row, i) => times[i] === latest));
  }
  return result;
}

export function sourceLineupState(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = snapshotKey(row);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const hasOfficial = (rows || []).some(row => row.confirmed === true);
  let full = false, confirmed = false;
  for (const group of groups.values()) {
    if (hasOfficial && !group.some(row => row.confirmed === true)) continue;
    const distinct = new Map();
    let invalid = false;
    for (const row of group) {
      if (!["H", "A"].includes(row.team_side) || !String(row.player_key || "").trim()) { invalid = true; break; }
      const identity = String(row.player_key);
      const previous = distinct.get(identity);
      if (previous && ["team_side", "starter", "confirmed"].some(field => previous[field] !== row[field])) { invalid = true; break; }
      distinct.set(identity, row);
    }
    if (invalid) continue;
    const starters = [...distinct.values()].filter(row => row.starter === true);
    const complete = ["H", "A"].every(side => starters.filter(row => row.team_side === side).length === 11);
    full ||= complete;
    confirmed ||= complete && starters.every(row => row.confirmed === true);
  }
  return {full, confirmed};
}

// Read-snapshot preflight, not an atomic DB compare-and-write or a provider lease.
export function canPromoteLineupCapture(incoming, existing, now = Date.now()) {
  if (!incoming?.length) return false;
  const key = snapshotKey(incoming[0]);
  const time = captureTime(incoming[0], now);
  if (!key || time === null || incoming.some(row => snapshotKey(row) !== key || captureTime(row, now) !== time)) return false;
  const current = (existing || []).filter(row => snapshotKey(row) === key);
  const times = current.map(row => captureTime(row, now));
  return !times.some(value => value === null) && times.every(value => value <= time);
}
