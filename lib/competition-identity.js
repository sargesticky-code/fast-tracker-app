// Use the source-verified Flashscore fixture's competition label when the
// canonical fixture and raw bookmaker snapshot refer to the SAME event ID.
// Never use home/away fuzzy names or a guessed country as an identity link.
export function competitionForMatch(rawRow, canonicalRow) {
  const raw = typeof rawRow?.league === "string" && rawRow.league.trim()
    ? rawRow.league.trim() : "Football";
  const id = rawRow?.id;
  if (typeof id !== "string" || !/^FS:[A-Za-z0-9_-]{5,32}$/.test(id)) return raw;
  if (canonicalRow?.source !== "FLASHSCORE_CANONICAL"
    || canonicalRow?.id !== id || canonicalRow?.providerEventId !== id.slice(3)) return raw;
  const verified = typeof canonicalRow?.league === "string"
    ? canonicalRow.league.trim() : "";
  if (!verified || verified.length > 160 || verified === "Football") return raw;
  return verified;
}
