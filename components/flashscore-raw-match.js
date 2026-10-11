"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FLASHSCORE_SNAPSHOT_URL, toFlashscoreRawFeed } from "@/lib/flashscore-raw-feed";

export default function FlashscoreRawMatch() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || "";
  const [state, setState] = useState({ status: "loading", match: null });

  useEffect(() => {
    let cancelled = false;
    fetch(FLASHSCORE_SNAPSHOT_URL, { cache: "no-store", signal: AbortSignal.timeout(6500) })
      .then((response) => {
        if (!response.ok) throw new Error("snapshot_unavailable");
        return response.json();
      })
      .then((snapshot) => {
        const feed = toFlashscoreRawFeed(snapshot);
        if (!feed) throw new Error("snapshot_shape_invalid");
        const match = feed.matches.find((row) => row.id === id) || null;
        if (!cancelled) setState({ status: match ? "ready" : "missing", match });
      })
      .catch(() => { if (!cancelled) setState({ status: "error", match: null }); });
    return () => { cancelled = true; };
  }, [id]);

  const match = state.match;
  if (state.status === "loading") return <main className="ft-home"><p>Loading raw Flashscore fixture…</p></main>;
  if (state.status !== "ready") return <main className="ft-home"><h1>Raw fixture unavailable</h1><p>{state.status === "error" ? "The Flashscore snapshot could not be read." : "This event is not in the current Flashscore collector snapshot."}</p><a href="/">Back to fixtures</a></main>;


  return (
    <main className="ft-home ft-raw-detail">
      <a href="/">← All fixtures</a>
      <p>{match.league} · Flashscore raw fixture</p>
      <h1>{match.home} vs {match.away}</h1>
      <p>Source date: {match.sourceDate} · Source time: {match.sourceTime || "not supplied"} · Timezone: unverified</p>
      <h2>Bet365 H / D / A</h2>
      <p>Raw prices: {match.odds.home ?? "—"} / {match.odds.draw ?? "—"} / {match.odds.away ?? "—"}</p>
      {match.oddsCapturedAt && <p>Captured: {match.oddsCapturedAt}</p>}
      <p>Goals, corners, live scores and predictions are not supplied by this raw feed.</p>
      <details><summary>Original source fields</summary><pre>{JSON.stringify({ fixture: match.raw, quote: match.rawQuote }, null, 2)}</pre></details>
    </main>
  );
}
