"use client";
import { useEffect, useMemo, useState } from "react";
import { fetchFlashscoreRawFeed } from "@/lib/flashscore-raw-feed";
import { fetchVerifiedSummary } from "@/lib/verified-evidence-feed";

function CompactEvidence({ evidence }) {
  if (!evidence) return null;
  return <div className="ft-verified-evidence" data-testid="verified-evidence">
    {evidence.score && <small>Flashscore score <b>{evidence.score.home}–{evidence.score.away}</b></small>}
    {evidence.prediction && <small>Forebet predicted score <b>{evidence.prediction}</b></small>}
    {evidence.forebet && <small>Forebet H/D/A <b>{[evidence.forebet.home,evidence.forebet.draw,evidence.forebet.away].map(p=>(p*100).toFixed(0)+"%").join(" / ")}</b></small>}
    {evidence.confirmedXI && <small>Official source XI <b>22 players available</b></small>}
  </div>;
}

export default function HomepageClient() {
  const [feed, setFeed] = useState(null);
  const [status, setStatus] = useState("loading");
  const [verified, setVerified] = useState(null);
  const [verifiedStatus, setVerifiedStatus] = useState("loading");
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
  useEffect(() => {
    let cancelled=false, inFlight=false;
    const controller=new AbortController();
    async function refreshVerified(){
      if(cancelled||inFlight||document.visibilityState!=="visible")return;
      inFlight=true;
      try {
        const next=await fetchVerifiedSummary(controller.signal);
        if(!cancelled){setVerified(next);setVerifiedStatus("ready");}
      } catch {
        if(!cancelled)setVerifiedStatus("unavailable");
      } finally {inFlight=false;}
    }
    refreshVerified();
    // Verified evidence refreshes less often than raw fixtures to limit Supabase traffic.
    const timer=setInterval(refreshVerified,300000);
    document.addEventListener("visibilitychange",refreshVerified);
    return ()=>{cancelled=true;controller.abort();clearInterval(timer);document.removeEventListener("visibilitychange",refreshVerified);};
  }, []);
  const rawCapturedMs=Date.parse(String(feed?.generatedAt||""));
  const rawAgeMs=Date.now()-rawCapturedMs;
  const rawReady=Number.isFinite(rawCapturedMs)
    && rawAgeMs>=-60000 && rawAgeMs<=30*60000
    && Array.isArray(feed?.matches) && feed.matches.length>0;
  const usingCanonicalFallback=!rawReady && (verified?.fallbackMatches?.length||0)>0;
  const matches=rawReady?feed.matches:(verified?.fallbackMatches||[]);
  const dates = [...new Set(matches.map(m => m.sourceDate).filter(Boolean))].sort();
  const leagues = [...new Set(matches.map(m => m.league))].sort();
  const visible = useMemo(() => matches.filter(m => (!date || m.sourceDate === date) && (!league || m.league === league) && `${m.home} ${m.away} ${m.league} ${m.providerEventId}`.toLowerCase().includes(query.toLowerCase())), [matches, date, league, query]);
  return <main className="ft-home">
    <header className="ft-top"><div className="ft-brand"><strong>FAST TRACKER <em>2026</em></strong><small>FLASHSCORE · VERIFIED WHERE AVAILABLE</small></div><a href="/health">Source status</a></header>
    <section className="ft-raw-board">
      <div className="ft-page-heading"><h1>Flashscore fixtures</h1><p>Raw provider fixtures are preferred. Verified canonical Flashscore fixtures appear during collector restart or stale snapshots.</p></div>
      <p>Snapshot captured: {feed?.generatedAt || "unknown"}. Displayed time zone is unverified.</p>
      <p data-testid="verified-status">
        Verified analysis: {verifiedStatus==="ready"
          ? `${matches.filter(m=>verified?.byId.has(m.id)).length} exact Flashscore IDs linked · bookmaker snapshot ${verified?.bookmakerHealth||"UNKNOWN"}`
          : verifiedStatus==="unavailable" ? "temporarily unavailable — raw fixtures remain visible"
          : "checking available predictions and official XIs"}
      </p>
      {status === "loading" && <p role="status">Loading Flashscore snapshot…</p>}
      {status === "error" && <p role="alert">Flashscore snapshot unavailable. {usingCanonicalFallback ? "Showing verified canonical fixtures instead." : "Fixture counts are unknown."}</p>}
      {usingCanonicalFallback && <p role="status" data-testid="canonical-fallback">Raw collector is initializing or its snapshot is stale. Showing {matches.length} verified Flashscore canonical fixtures (UTC kickoff, no inferred raw odds).</p>}
      <div className="ft-raw-filters">
        <label>Search<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Team, competition or event ID" /></label>
        <label>Competition<select value={league} onChange={e => setLeague(e.target.value)}><option value="">All competitions</option>{leagues.map(l => <option key={l}>{l}</option>)}</select></label>
      </div>
      <nav className="ft-daybar" aria-label="Source dates"><button onClick={() => setDate("")} aria-pressed={!date}>All fixtures · {feed ? matches.length : "—"}</button>{dates.map(d => <button key={d} onClick={() => setDate(d)} aria-pressed={date === d}>{d} · {matches.filter(m => m.sourceDate === d).length}</button>)}</nav>
      <p>{matches.length ? `${visible.length} fixtures shown` : "Waiting for source data"}</p>
      <div className="ft-table-wrap"><div className="ft-table-head"><div>Fixture</div><div>Flashscore source fields</div><div>Bet365 H / D / A raw odds</div></div>
        {visible.map(m => <a className="ft-match-row" href={`/details?id=${encodeURIComponent(m.id)}`} key={m.id}>
          <div className="ft-team-cell"><div className="ft-team-names"><small>{m.league}</small><strong>{m.home}</strong><span>{m.away}</span><small>Flashscore event {m.providerEventId}</small></div></div>
          <div className="ft-source-cell"><span>{m.sourceDate || "Date not supplied"}</span><small>{m.sourceTimeStatus==="VERIFIED_CANONICAL_KICKOFF"
            ? "Canonical kickoff "+m.sourceTime+" UTC"
            : m.sourceTime ? `Source time ${m.sourceTime} (zone unverified)` : "Time not supplied"}</small><CompactEvidence evidence={verified?.byId.get(m.id) || null}/></div>
          <div className="ft-raw-odds"><span><b>H</b>{m.odds.home ?? "—"}</span><span><b>D</b>{m.odds.draw ?? "—"}</span><span><b>A</b>{m.odds.away ?? "—"}</span><small>{m.oddsCapturedAt ? `Captured ${m.oddsCapturedAt}` : "Quote not supplied"}</small></div>
        </a>)}
      </div>
      {feed && !visible.length && <p>No fixtures match these filters.</p>}
      <p>Raw bookmaker observations and verified predictions remain distinct. Canonical fallback is read-only, uses exact provider IDs and never invents raw odds, scores or missing source fields.</p>
    </section>
  </main>;
}
