// Homepage-only fixture lifecycle gate. Do not change the raw feed or match-detail history.
// An observed final/inactive state is authoritative; a score by itself is NOT final.
const CLOSED_STATUSES = new Set([
  "FT", "FULL TIME", "FULLTIME", "FINISHED", "FINAL", "AET",
  "AFTER EXTRA TIME", "AFTER PENALTIES", "PEN", "PENS", "PENALTIES",
  "CANCELLED", "CANCELED", "POSTPONED", "ABANDONED", "AWARDED", "WALKOVER"
]);
const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isInactiveFixtureStatus(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return CLOSED_STATUSES.has(normalized);
}

export function showFixtureOnDashboard(fixture, verified = null, nowMs = Date.now()) {
  if (!fixture || !Number.isFinite(nowMs)) return false;
  const raw = fixture.raw || {};
  // Only explicit provider/canonical terminal classifications suppress immediately.
  // In particular, score 1-0 and clock 90+4 do not prove that a match is final.
  const statuses = [
    fixture.status, verified?.status, raw.status, raw.match_status,
    raw.fixture_status, raw.status_text, raw.time_text
  ];
  if (statuses.some(isInactiveFixtureStatus)) return false;

  // Verified canonical kickoff is an instant, unlike raw sourceTime's unverified timezone.
  const kickoff = verified?.kickoff || verified?.canonicalRow?.kickoff || fixture.kickoff;
  const kickoffMs = Date.parse(typeof kickoff === "string" ? kickoff : "");
  if (Number.isFinite(kickoffMs)) {
    return kickoffMs > nowMs - FIVE_HOURS_MS;
  }

  // If the source exposes neither an actual finished state nor a verified instant,
  // discard aged calendar days, retaining yesterday for cross-timezone live games.
  // Never derive an absolute kickoff from the unverified raw time_text.
  const sourceDate = fixture.sourceDate;
  if (typeof sourceDate === "string" && ISO_DAY.test(sourceDate)) {
    const yesterdayUtc = new Date(nowMs);
    yesterdayUtc.setUTCHours(0, 0, 0, 0);
    yesterdayUtc.setUTCDate(yesterdayUtc.getUTCDate() - 1);
    if (sourceDate < yesterdayUtc.toISOString().slice(0, 10)) return false;
  }
  return true;
}
