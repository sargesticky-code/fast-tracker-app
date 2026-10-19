// The database display view owns source/snapshot selection. Never fall back to raw history.
export function eligibleLineupRows(rows: any[] | null, eventId: string) {
  return (rows || []).filter(row => row.hkjc_event_id === eventId
    && row.display_eligible === true && ["H", "A"].includes(String(row.team_side).toUpperCase()));
}

export function confirmedStartingXI(rows: any[]) {
  return ["H", "A"].every(side => {
    const starters = rows.filter(row => String(row.team_side).toUpperCase() === side && row.starter === true);
    return starters.length === 11 && starters.every(row => row.fact_status === "CONFIRMED")
      && starters.every(row => Boolean(row.canonical_player_identity))
      && new Set(starters.map(row => row.canonical_player_identity)).size === 11;
  });
}
