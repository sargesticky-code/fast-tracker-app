"use client";
import { useEffect, useMemo, useState } from "react";
import { fetchFlashscoreRawFeed } from "@/lib/flashscore-raw-feed";

export default function HomepageClient() {
  const [feed, setFeed] = useState(null);
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const [league, setLeague] = useState("");
  useEffect(() => {
    let cancelled = false, inFlight = false;
    const controller = new AbortController();
    async function refresh() {
      if (cancelled || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const next = await fetchFlashscoreRawFeed(controller.signal);
        if (!cancelled) { setFeed(next); setStatus("ready"); }
      } catch { if (!cancelled) setStatus("error"); }
      finally { inFlight = false; }
    }
    refresh();
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { cancelled = true; controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const matches = feed?.matches || [];
  const dates = [...new Set(matches.map(m => m.sourceDate).filter(Boolean))].sort();
  const leagues = [...new Set(matches.map(m => m.league))].sort();
  const visible = useMemo(() => matches.filter(m => (!date || m.sourceDate === date) && (!league || m.league === league) && `${m.home} ${m.away} ${m.league} ${m.providerEventId}`.toLowerCase().includes(query.toLowerCase())), [matches, date, league, query]);
  return <main className="ft-home">
    <header className="ft-top"><div className="ft-brand"><strong>FAST TRACKER <em>2026</em></strong><small>FLASHSCORE RAW FOOTBALL DATA</small></div><a href="/health">Source status</a></header>
    <section className="ft-raw-board">
      <div className="ft-page-heading"><h1>Flashscore raw fixtures</h1><p>Source names, dates and displayed times. Captured Bet365 prices are reference data.</p></div>
      <p>Snapshot captured: {feed?.generatedAt || "unknown"}. Displayed time zone is unverified.</p>
      {status === "loading" && <p role="status">Loading Flashscore snapshot…</p>}
      {status === "error" && <p role="alert">Flashscore snapshot unavailable. {feed ? "Showing the previous snapshot; freshness is unknown." : "Fixture counts are unknown."}</p>}
      <div className="ft-raw-filters">
        <label>Search<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Team, competition or event ID" /></label>
        <label>Competition<select value={league} onChange={e => setLeague(e.target.value)}><option value="">All competitions</option>{leagues.map(l => <option key={l}>{l}</option>)}</select></label>
      </div>
      <nav className="ft-daybar" aria-label="Source dates"><button onClick={() => setDate("")} aria-pressed={!date}>All fixtures · {feed ? matches.length : "—"}</button>{dates.map(d => <button key={d} onClick={() => setDate(d)} aria-pressed={date === d}>{d} · {matches.filter(m => m.sourceDate === d).length}</button>)}</nav>
      <p>{feed ? `${visible.length} fixtures shown` : "Waiting for source data"}</p>
      <div className="ft-table-wrap"><div className="ft-table-head"><div>Fixture</div><div>Flashscore source fields</div><div>Bet365 H / D / A raw odds</div></div>
        {visible.map(m => <a className="ft-match-row" href={`/details?id=${encodeURIComponent(m.id)}`} key={m.id}>
          <div className="ft-team-cell"><div className="ft-team-names"><small>{m.league}</small><strong>{m.home}</strong><span>{m.away}</span><small>Flashscore event {m.providerEventId}</small></div></div>
          <div className="ft-source-cell"><span>{m.sourceDate || "Date not supplied"}</span><small>{m.sourceTime ? `Source time ${m.sourceTime} (zone unverified)` : "Time not supplied"}</small></div>
          <div className="ft-raw-odds"><span><b>H</b>{m.odds.home ?? "—"}</span><span><b>D</b>{m.odds.draw ?? "—"}</span><span><b>A</b>{m.odds.away ?? "—"}</span><small>{m.oddsCapturedAt ? `Captured ${m.oddsCapturedAt}` : "Quote not supplied"}</small></div>
        </a>)}
      </div>
      {feed && !visible.length && <p>No fixtures match these filters.</p>}
      <p>Goals, corners, live scores and predictions are not supplied by this snapshot. Missing values are unknown.</p>
    </section>
  </main>;
}
