"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Star,
  MoreHorizontal,
  Trophy,
  Activity,
  CalendarDays,
  ChevronRight,
  CircleDot,
  Goal,
  ChartNoAxesColumnIncreasing,
  Database,
  ShieldCheck,
} from "lucide-react";
import {
  fairMarket,
  formatKickoff,
  formatOdds,
  leagueDisplayName,
  matchDetailHref,
  preferredModel,
  valueEdge,
} from "@/lib/fast-tracker";

const FEED_URL =
  process.env.NEXT_PUBLIC_FAST_TRACKER_FEED_URL ||
  "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-phase1-feed?hours=24";

const sports = [
  ["Football", Goal],
  ["Basketball", CircleDot],
  ["Tennis", CircleDot],
  ["Hockey", CircleDot],
  ["Baseball", CircleDot],
  ["MMA", CircleDot],
  ["Rugby", CircleDot],
  ["Volleyball", CircleDot],
  ["Handball", CircleDot],
  ["Cricket", CircleDot],
  ["AFL", CircleDot],
  ["Esoccer", CircleDot],
];

const popularLeagues = [
  "UEFA Champions League",
  "UEFA Europa League",
  "UEFA Conference League",
  "Premier League",
  "LaLiga",
  "Bundesliga",
  "Serie A",
  "Ligue 1",
  "MLS",
];

function normalizedTriplet(match) {
  const model = preferredModel(match);
  if (!model) return null;
  const vals = [Number(model.home), Number(model.draw), Number(model.away)];
  if (!vals.every(Number.isFinite)) return null;
  const adjusted = vals.map((v) => (v > 1.5 ? v / 100 : v));
  const total = adjusted.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  return {
    home: adjusted[0] / total,
    draw: adjusted[1] / total,
    away: adjusted[2] / total,
  };
}

function pct(value) {
  return Number.isFinite(value) ? Math.round(value * 100) : "—";
}

function sideFromTriplet(model) {
  if (!model) return "—";
  const rows = [
    ["1", model.home],
    ["X", model.draw],
    ["2", model.away],
  ].sort((a, b) => b[1] - a[1]);
  return rows[0][0];
}

function dateKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shortTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "TBA";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function scoreText(match) {
  const live = match?.live || {};
  const pairs = [
    [live.homeScore, live.awayScore],
    [live.home, live.away],
    [live.scoreHome, live.scoreAway],
    [match.scoreHome, match.scoreAway],
  ];
  for (const [h, a] of pairs) {
    if (Number.isFinite(Number(h)) && Number.isFinite(Number(a))) return `${h} - ${a}`;
  }
  if (typeof live.score === "string" && live.score.trim()) return live.score;
  return "—";
}

function liveLabel(match) {
  if (!match?.liveNow) return "";
  const minute = match?.live?.minute ?? match?.minute;
  return Number.isFinite(Number(minute)) ? `${minute}'` : "LIVE";
}

function AdvertSlot({ variant = "wide" }) {
  return (
    <div className={`ft-ad-slot ft-ad-${variant}`} aria-label="Advertisement placeholder">
      <div>
        <span>ADVERTISEMENT</span>
        <strong>{variant === "wide" ? "970 × 250" : "300 × 250"}</strong>
        <small>Reserved for future advertising</small>
      </div>
    </div>
  );
}

function Sidebar({ counts }) {
  const sections = [
    ["Predictions for TODAY", counts.today],
    ["LIVE predictions", counts.live],
    ["Predictions for TOMORROW", counts.tomorrow],
    ["Weekend Predictions", counts.weekend],
    ["All Predictions", counts.all],
    ["Value Bets", counts.value],
  ];

  return (
    <aside className="ft-leftbar">
      <section className="ft-side-card">
        <div className="ft-side-title">MY LEAGUES <Star size={15} /></div>
        <button className="ft-side-link"><Star size={17} /> Favourites <ChevronRight size={15} /></button>
        <button className="ft-side-link"><CircleDot size={17} /> World <ChevronRight size={15} /></button>
      </section>

      <section className="ft-side-card">
        <div className="ft-side-heading">FOOTBALL</div>
        {sections.map(([label, count]) => (
          <button className="ft-side-link" key={label}>
            <span>{label}</span>
            <span className="ft-count">{count}</span>
          </button>
        ))}
        <button className="ft-side-link"><span>Top Predictions</span><ChevronRight size={15} /></button>
        <button className="ft-side-link"><span>Lists</span><ChevronRight size={15} /></button>
      </section>

      <section className="ft-side-card">
        <div className="ft-side-heading">POPULAR LEAGUES</div>
        {popularLeagues.map((league) => (
          <button className="ft-side-link compact" key={league}>
            <span>{league}</span><ChevronRight size={14} />
          </button>
        ))}
      </section>
    </aside>
  );
}

function PredictionsTable({ matches }) {
  return (
    <div className="ft-table-wrap">
      <div className="ft-table-head">
        <div>Home team<br />Away team</div>
        <div className="ft-prob-head">Prob. %<span><b>1</b><b>X</b><b>2</b></span></div>
        <div>Pred</div>
        <div>Correct<br />score</div>
        <div>Avg.<br />goals</div>
        <div>Weather</div>
        <div>Edge</div>
        <div>Score</div>
        <div>Odds</div>
      </div>

      <div className="ft-table-body">
        {matches.length ? matches.map((match) => {
          const model = normalizedTriplet(match);
          const edge = valueEdge(match);
          const market = match.market || fairMarket(match.odds);
          const avgGoals = Number(match?.forebet?.avgGoals ?? match?.multi?.avgGoals ?? match?.expectedGoals);
          const predictedScore = match?.forebet?.score || match?.predictedScore || "—";
          const bestOdds = edge?.key === "H" ? match?.odds?.home : edge?.key === "D" ? match?.odds?.draw : edge?.key === "A" ? match?.odds?.away : null;

          return (
            <a className="ft-match-row" href={matchDetailHref(match.id, "homepage-v1")} key={match.id}>
              <div className="ft-team-cell">
                <div className="ft-league-tag">{leagueDisplayName(match.league || match.competition || "")}</div>
                <div className="ft-team-names">
                  <strong>{match.home || match.homeZh || "Home"}</strong>
                  <span>{match.away || match.awayZh || "Away"}</span>
                  <small>{shortTime(match.kickoff)} · {dateKey(match.kickoff)}</small>
                </div>
              </div>
              <div className="ft-probs">
                <span>{pct(model?.home)}</span><span>{pct(model?.draw)}</span><span>{pct(model?.away)}</span>
              </div>
              <div><span className="ft-pred-pill">{sideFromTriplet(model)}</span></div>
              <div>{predictedScore}</div>
              <div className="ft-goal-number">{Number.isFinite(avgGoals) ? avgGoals.toFixed(2) : "—"}</div>
              <div className="ft-weather">—</div>
              <div><span className={edge?.expectedValue > 0.04 ? "ft-edge strong" : "ft-edge"}>{Number.isFinite(edge?.expectedValue) ? `${edge.expectedValue >= 0 ? "+" : ""}${(edge.expectedValue * 100).toFixed(1)}%` : "—"}</span></div>
              <div className="ft-score-cell">
                {match.liveNow && <small className="ft-live-tag">{liveLabel(match)}</small>}
                <strong>{scoreText(match)}</strong>
              </div>
              <div>{formatOdds(bestOdds || match?.odds?.home)}</div>
            </a>
          );
        }) : (
          <div className="ft-empty">No fixtures are available in the current feed.</div>
        )}
      </div>
    </div>
  );
}

function CalendarPanel() {
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  return (
    <section className="ft-right-card ft-calendar">
      <div className="ft-calendar-title"><span>September 2026</span><small>Football predictions</small></div>
      <div className="ft-weekdays">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => <b key={d}>{d}</b>)}</div>
      <div className="ft-days">{days.map((d) => <span className={d === 30 ? "active" : ""} key={d}>{String(d).padStart(2,"0")}</span>)}</div>
    </section>
  );
}

function FeaturedMatch({ match }) {
  if (!match) return null;
  const model = normalizedTriplet(match);
  return (
    <section className="ft-right-card">
      <div className="ft-right-head">Featured match</div>
      <a href={matchDetailHref(match.id, "homepage-v1")} className="ft-featured">
        <div>
          <strong>{match.home || match.homeZh}</strong>
          <span>{match.away || match.awayZh}</span>
          <small>{formatKickoff(match.kickoff)}</small>
        </div>
        <b>{sideFromTriplet(model)}</b>
      </a>
    </section>
  );
}

function RightRail({ matches }) {
  const featured = matches.find((m) => valueEdge(m)?.expectedValue > 0.04) || matches[0];
  return (
    <aside className="ft-rightbar">
      <CalendarPanel />
      <FeaturedMatch match={featured} />
      <section className="ft-right-card">
        <div className="ft-right-head">Model coverage</div>
        <div className="ft-mini-list">
          {["Forebet","Dixon-Coles","Pi Rating","Team Form","Multi-source"].map((name, i) => (
            <div key={name}><span>{i + 1}</span><b>{name}</b><small>{["External","Internal","Internal","Internal","Consensus"][i]}</small></div>
          ))}
        </div>
      </section>
      <AdvertSlot variant="box" />
    </aside>
  );
}

function InternalPanel({ feed }) {
  return (
    <section className="ft-internal">
      <div className="ft-internal-title"><Database size={18} /> Internal system information</div>
      <div className="ft-internal-grid">
        <div><span>Feed source</span><b>{feed?.source || "Supabase"}</b></div>
        <div><span>Generated</span><b>{feed?.generatedAt ? new Date(feed.generatedAt).toLocaleString("en-GB") : "—"}</b></div>
        <div><span>Matches</span><b>{feed?.matches?.length ?? 0}</b></div>
        <div><span>Window</span><b>{feed?.windowHours ? `${feed.windowHours}h` : "—"}</b></div>
      </div>
      <details>
        <summary>Show system health JSON</summary>
        <pre>{JSON.stringify(feed?.systemHealth || {}, null, 2)}</pre>
      </details>
    </section>
  );
}

export default function HomepageClient({ initialFeed, nowMs }) {
  const [feed, setFeed] = useState(initialFeed || { matches: [] });
  const [dayOffset, setDayOffset] = useState(0);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch(FEED_URL, { cache: "no-store" });
        if (!res.ok) return;
        const next = await res.json();
        if (!cancelled && Array.isArray(next.matches)) setFeed(next);
      } catch {}
    }
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const matches = Array.isArray(feed?.matches) ? feed.matches : [];
  const now = useMemo(() => new Date(nowMs || Date.now()), [nowMs]);
  const todayKey = dateKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = dateKey(tomorrow);

  const counts = useMemo(() => ({
    today: matches.filter(m => dateKey(m.kickoff) === todayKey).length,
    live: matches.filter(m => m.liveNow).length,
    tomorrow: matches.filter(m => dateKey(m.kickoff) === tomorrowKey).length,
    weekend: matches.filter(m => [0,6].includes(new Date(m.kickoff).getDay())).length,
    all: matches.length,
    value: matches.filter(m => Number(valueEdge(m)?.expectedValue) >= 0.04).length,
  }), [matches, todayKey, tomorrowKey]);

  const target = new Date(now);
  target.setDate(target.getDate() + dayOffset);
  const targetKey = dateKey(target);

  const visible = useMemo(() => {
    const rows = matches
      .filter((m) => dayOffset === 0 ? (m.liveNow || dateKey(m.kickoff) === targetKey) : dateKey(m.kickoff) === targetKey)
      .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    return rows.slice(0, 18);
  }, [matches, dayOffset, targetKey]);

  return (
    <main className="ft-home">
      <header className="ft-top">
        <div className="ft-brand">
          <strong>FAST TRACKER <em>2026</em></strong>
          <small>FOOTBALL DATA · MODELS · VALUE BETS</small>
        </div>
        <label className="ft-search"><Search size={17} /><input placeholder="Search team, league or match..." /></label>
        <button className="ft-icon-button"><Star size={22} /></button>
        <button className="ft-icon-button"><MoreHorizontal size={22} /></button>
      </header>

      <nav className="ft-sports">
        {sports.map(([name, Icon], i) => (
          <button className={i === 0 ? "active" : ""} key={name}><Icon size={17} />{name}</button>
        ))}
      </nav>

      <div className="ft-layout">
        <Sidebar counts={counts} />

        <section className="ft-center">
          <div className="ft-page-heading">
            <h1>Mathematical Football Predictions and Statistics</h1>
            <p>Data-driven forecasts, odds analysis and live insights</p>
          </div>

          <div className="ft-daybar">
            {[-2,-1,0,1,2].map((offset) => {
              const label = offset === 0 ? "Today" : offset === -1 ? "Tue" : offset === -2 ? "Mon" : offset === 1 ? "Thu" : "Fri";
              return <button key={offset} className={dayOffset === offset ? "active" : ""} onClick={() => setDayOffset(offset)}>{label}</button>;
            })}
            <label className="ft-form-toggle"><span>Show form</span><input type="checkbox" checked={showForm} onChange={e => setShowForm(e.target.checked)} /><i /></label>
          </div>

          <PredictionsTable matches={visible} />
          <AdvertSlot variant="wide" />
          <PredictionsTable matches={visible.slice(6)} />

          {showForm && (
            <section className="ft-form-note">
              <ChartNoAxesColumnIncreasing size={18} />
              Form layer is enabled. Detailed team-form evidence remains on each match page.
            </section>
          )}

          <InternalPanel feed={feed} />
        </section>

        <RightRail matches={visible.length ? visible : matches.slice(0, 10)} />
      </div>

      <footer className="ft-footer-banner">
        <div><Activity size={21} /><strong>Real-time football intelligence</strong><span>Live data · model comparison · smart alerts</span></div>
        <button>Explore matches <ChevronRight size={16} /></button>
      </footer>
    </main>
  );
}
