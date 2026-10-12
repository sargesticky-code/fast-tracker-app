"use client";
import { useEffect, useMemo, useState } from "react";
import { fetchFlashscoreRawFeed } from "@/lib/flashscore-raw-feed";
import { fetchVerifiedSummary } from "@/lib/verified-evidence-feed";
import { TeamNameWithLogo } from "@/components/team-logo";

function CompetitionName({ name }) {
  return String(name || "Football")
    .replace(/\s*:\s*Standings\s*$/i, "")
    .replace(/([a-z])([A-Z]{3,})$/, "$1 · $2");
}

function MatchInsight({ evidence }) {
  if (!evidence) return null;
  const hasNumber = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  const probability = evidence.forebet && [evidence.forebet.home, evidence.forebet.draw, evidence.forebet.away]
    .every(hasNumber)
    ? [evidence.forebet.home, evidence.forebet.draw, evidence.forebet.away].map(value => `${(Number(value) * 100).toFixed(0)}%`).join(" · ")
    : null;
  const goals = evidence.forebetOU25 && [evidence.forebetOU25.over, evidence.forebetOU25.under]
    .every(hasNumber)
    ? `Goals 2.5 · O ${(Number(evidence.forebetOU25.over) * 100).toFixed(0)}% / U ${(Number(evidence.forebetOU25.under) * 100).toFixed(0)}%`
    : null;
  const corners = evidence.forebetCorners95 && [evidence.forebetCorners95.over, evidence.forebetCorners95.under]
    .every(hasNumber)
    ? `Corners 9.5 · O ${(Number(evidence.forebetCorners95.over) * 100).toFixed(0)}% / U ${(Number(evidence.forebetCorners95.under) * 100).toFixed(0)}%`
    : null;
  if (!evidence.prediction && !probability && !goals && !corners) return null;
  return <div className="ft-match-insight" data-testid="verified-evidence">
    {evidence.prediction && <span>Score <b>{evidence.prediction}</b></span>}
    {probability && <span>1X2 <b>{probability}</b></span>}
    {goals && <span>{goals}</span>}
    {corners && <span>{corners}</span>}
  </div>;
}

function Odds({ match }) {
  const odds = match.odds || {};
  const usable = match.quoteStatus !== "STALE" && match.quoteStatus !== "INVALID";
  const state = match.quoteStatus === "STALE" ? "Stale" : match.quoteStatus === "INVALID" ? "Unavailable" : null;
  return <div className="ft-odds-wrap" aria-label="Bet365 odds">
    <div className="ft-raw-odds">
      {[ ["1", odds.home], ["X", odds.draw], ["2", odds.away] ].map(([label, value]) =>
        <span key={label}><small>{label}</small><b>{usable && value != null ? value : "–"}</b></span>)}
    </div>
    {state && <small className="ft-odds-state">{state}</small>}
  </div>;
}

function FixtureTime({ match }) {
  const value = match.sourceTime;
  if (!value) return <span className="ft-kickoff-placeholder" aria-hidden="true">—</span>;
  return <time className="ft-kickoff">{value}</time>;
}

export default function HomepageClient() {
  const [feed, setFeed] = useState(null);
  const [status, setStatus] = useState("loading");
  const [verified, setVerified] = useState(null);
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const [dateInitialized, setDateInitialized] = useState(false);
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
    // Prematch/reference raw collector refreshes every ~15 min; avoid 1 min client polling.
    const timer = setInterval(refresh, 120000);
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
        if(!cancelled)setVerified(next);
      } catch {} finally {inFlight=false;}
    }
    refreshVerified();
    // Compact summary is a secondary prematch enrichment. Halve+ Supabase invokes.
    const timer=setInterval(refreshVerified,240000);
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
  useEffect(() => {
    if (dateInitialized || dates.length === 0) return;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const datePart = key => parts.find(part => part.type === key)?.value || "";
    const today = `${datePart("year")}-${datePart("month")}-${datePart("day")}`;
    setDate(dates.includes(today) ? today : dates.find(value => value >= today) || dates[0]);
    setDateInitialized(true);
  }, [dates.join(","), dateInitialized]);
  const visible = useMemo(() => matches.filter(m => (!date || m.sourceDate === date) && (!league || m.league === league) && `${m.home} ${m.away} ${m.league}`.toLowerCase().includes(query.trim().toLowerCase())), [matches, date, league, query]);
  const grouped = useMemo(() => {
    const groups = new Map();
    for (const match of visible) {
      const key = match.league || "Football";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(match);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);
  const dateLabel = value => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(parsed);
  };
  return <main className="ft-home">
    <header className="ft-top"><a className="ft-brand" href="/"><strong>FAST TRACKER <em>2026</em></strong></a><a className="ft-status-link" href="/health">Status</a></header>
    <section className="ft-raw-board">
      <div className="ft-page-heading"><div><p className="ft-eyebrow">FOOTBALL</p><h1>Fixtures</h1></div><span className="ft-match-count">{visible.length} matches</span></div>
      {status === "loading" && <p className="ft-inline-state" role="status">Loading fixtures…</p>}
      {status === "error" && !usingCanonicalFallback && <p className="ft-inline-state" role="alert">Fixtures temporarily unavailable.</p>}
      {usingCanonicalFallback && <p className="ft-inline-state" role="status" data-testid="canonical-fallback">Showing {matches.length} available fixtures</p>}
      <div className="ft-raw-filters">
        <label className="ft-search"><span aria-hidden="true">⌕</span><input aria-label="Search fixtures" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search teams or leagues" /></label>
        <label className="ft-competition"><span className="ft-sr-only">Competition</span><select aria-label="Competition" value={league} onChange={e => setLeague(e.target.value)}><option value="">All competitions</option>{leagues.map(l => <option key={l}>{l}</option>)}</select></label>
      </div>
      <nav className="ft-daybar" aria-label="Match dates"><button onClick={() => setDate("")} aria-pressed={!date}>All</button>{dates.map(d => <button key={d} onClick={() => setDate(d)} aria-pressed={date === d}>{dateLabel(d)}</button>)}</nav>
      <div className="ft-board-legend"><span>Fixture</span><span>1</span><span>X</span><span>2</span></div>
      <div className="ft-fixture-groups">
        {grouped.map(([competition, fixtures]) => <section className="ft-competition-group" key={competition}>
          <h2><span>{CompetitionName({ name: competition })}</span><small>{fixtures.length}</small></h2>
          {fixtures.map(m => <a className="ft-match-row" href={`/details?id=${encodeURIComponent(m.id)}`} key={m.id}>
            <FixtureTime match={m}/>
            <div className="ft-match-teams"><span><TeamNameWithLogo team={m.home} logoTeam={m.home} context={m.league} size={22} /></span><span><TeamNameWithLogo team={m.away} logoTeam={m.away} context={m.league} size={22} /></span><MatchInsight evidence={verified?.byId.get(m.id) || null}/></div>
            <Odds match={m}/>
          </a>)}
        </section>)}
      </div>
      {feed && !visible.length && <p className="ft-empty">No fixtures match these filters.</p>}
    </section>
  </main>;
}
