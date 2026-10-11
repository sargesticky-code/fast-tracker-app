"use client";

import { useEffect, useState } from "react";
import { FLASHSCORE_SNAPSHOT_URL, toFlashscoreRawFeed } from "@/lib/flashscore-raw-feed";

export default function FlashscoreSourceStatus() {
  const [feed, setFeed] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch(FLASHSCORE_SNAPSHOT_URL, { cache: "no-store", signal: AbortSignal.timeout(6500) })
      .then((response) => {
        if (!response.ok) throw new Error("snapshot_unavailable");
        return response.json();
      })
      .then((snapshot) => {
        const normalized = toFlashscoreRawFeed(snapshot);
        if (!normalized) throw new Error("snapshot_shape_invalid");
        if (!cancelled) setFeed(normalized);
      })
      .catch(() => { if (!cancelled) setFeed({ source: "unavailable", generatedAt: null, matches: [] }); });
    return () => { cancelled = true; };
  }, []);
  const matches = Array.isArray(feed?.matches) ? feed.matches : [];
  const quoted = matches.filter((match) => match.bookmaker && [match.odds?.home, match.odds?.draw, match.odds?.away].every((value) => Number.isFinite(value))).length;
  return (
    <main className="ft-home">
      <h1>Flashscore raw feed status</h1>
      <p>Source: {feed?.source || "loading"}</p>
      <p>Snapshot captured: {feed?.generatedAt || "unknown"}</p>
      <p>Fixtures: {feed?.source === "unavailable" ? "unknown" : feed ? matches.length : "loading"}</p>
      <p>Complete Bet365 H / D / A raw quotes: {feed?.source === "unavailable" || !feed ? "unknown" : quoted}</p>
      <p>Goals, corners, predictions and live scores are outside this raw feed.</p>
    </main>
  );
}
