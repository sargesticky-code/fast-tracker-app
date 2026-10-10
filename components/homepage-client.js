"use client";

import { useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
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
  ShieldCheck,
} from "lucide-react";
import {
  fairMarket,
  formatKickoff,
  formatOdds,
  leagueDisplayName,
  matchDetailHref,
  preferredModel,
  sanitizeFallbackMatch,
  valueEdge,
} from "@/lib/fast-tracker";

const FEED_URL =
  process.env.NEXT_PUBLIC_FAST_TRACKER_FEED_URL ||
  "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-phase1-feed?hours=24";
const HOMEPAGE_FEED_URL = FEED_URL + (FEED_URL.includes("?") ? "&" : "?") + "view=summary";
const ENRICHMENT_FEED_URL = FEED_URL;
const LIVE_FEED_URL =
  process.env.NEXT_PUBLIC_FAST_TRACKER_LIVE_FEED_URL ||
  "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-live-feed";
const HK_TIME_ZONE = "Asia/Hong_Kong";

const AUTHORITY_KEYS = new Set([
  "id","kickoff","status","league","leagueZh","home","away","homeZh","awayZh",
  "inPlay","liveEligible","liveNow","live","odds","market","handicap","goals","corners","updatedAt"
]);

function mergeLiveOverlay(authorityFeed, liveFeed) {
  const authorityMatches = Array.isArray(authorityFeed?.matches) ? authorityFeed.matches : [];
  const liveMatches = Array.isArray(liveFeed?.matches) ? liveFeed.matches : [];
  if (!liveMatches.length) return authorityFeed;

  const liveById = new Map(liveMatches.filter((m) => m?.id && m?.live).map((m) => [String(m.id), m]));
  const authorityIds = new Set(authorityMatches.map((m) => String(m?.id ?? "")).filter(Boolean));
  const matches = authorityMatches.map((authority) => {
    const liveRow = liveById.get(String(authority.id ?? ""));
    if (!liveRow) return authority;
    return {
      ...authority,
      status: liveRow.status ?? liveRow?.live?.status ?? authority.status,
      inPlay: true,
      liveNow: true,
      liveEligible: true,
      live: liveRow.live,
    };
  });

  // The Phase 1 authority feed is future-only, so a canonical fixture naturally
  // drops out at kickoff. Keep genuinely current live fixtures visible by adding
  // only fresh live-feed rows with exact canonical IDs; missing fields stay null.
  for (const liveRow of liveMatches) {
    const id = String(liveRow?.id ?? "");
    if (!id || !liveRow?.live || authorityIds.has(id)) continue;
    matches.push({
      id,
      kickoff: liveRow.kickoff ?? null,
      status: liveRow.status ?? liveRow?.live?.status ?? null,
      league: liveRow.league ?? null,
      home: liveRow.home ?? null,
      away: liveRow.away ?? null,
      homeZh: liveRow.homeZh ?? liveRow.home ?? null,
      awayZh: liveRow.awayZh ?? liveRow.away ?? null,
      inPlay: true,
      liveNow: true,
      liveEligible: true,
      live: liveRow.live,
    });
  }

  return {
    ...authorityFeed,
    matches,
    count: matches.length,
    liveOverlayGeneratedAt: liveFeed?.generatedAt ?? null,
  };
}
function mergeAuthorityWithEnrichment(authorityFeed, enrichmentFeed) {
  const authorityMatches = Array.isArray(authorityFeed?.matches) ? authorityFeed.matches : [];
  const enrichmentMatches = Array.isArray(enrichmentFeed?.matches) ? enrichmentFeed.matches : [];
  if (!enrichmentMatches.length) return { ...authorityFeed, matches: authorityMatches, count: authorityMatches.length };

  const richById = new Map(enrichmentMatches.filter((m) => m?.id).map((m) => [String(m.id), m]));
  const matches = authorityMatches.map((authority) => {
    const rich = richById.get(String(authority?.id ?? ""));
    if (!rich) return authority;

    const merged = { ...authority };
    for (const [key, value] of Object.entries(rich)) {
      if (AUTHORITY_KEYS.has(key)) continue;
      if (value !== null && value !== undefined) merged[key] = value;
    }
    // The lightweight Flashscore summary is the real source authority for
    // observed match stats. Enrichment may add lineup/model context, but must
    // not relabel Flashscore xG/shots as FotMob (or replace a verified snapshot).
    if (authority?.sourceContext || rich?.sourceContext) {
      const authorityContext = authority?.sourceContext || {};
      const richContext = rich?.sourceContext || {};
      const observed = authorityContext?.observedStats?.source === "FLASHSCORE"
        ? authorityContext.observedStats
        : null;
      merged.sourceContext = {
        ...richContext,
        ...authorityContext,
        lineupCoverage: authorityContext?.lineupCoverage ?? richContext?.lineupCoverage ?? null,
        ...(observed ? {
          source: "FLASHSCORE",
          observedStats: observed,
          statsAvailable: true,
          xgAvailable: Boolean(observed.stats?.xg),
          detailFetchedAt: observed.capturedAt,
        } : {}),
      };
    }
    if (rich.health) merged.health = rich.health;
    return merged;
  });

  return {
    ...authorityFeed,
    matches,
    count: matches.length,
    enrichmentSource: enrichmentFeed?.source ?? null,
    enrichmentGeneratedAt: enrichmentFeed?.generatedAt ?? null,
  };
}

const primaryNav = [
  ["Today", Goal, "today"],
  ["Live", Activity, "live"],
  ["Value", Trophy, "value"],
  ["Tomorrow", CalendarDays, "tomorrow"],
  ["All matches", ShieldCheck, "all"],
];

const marketFilters = [
  ["HDA", "HDA"],
  ["Goals", "GOALS"],
  ["Corners", "CORNERS"],
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

const leagueEnglishMap = {
  "英格蘭超級聯賽":"Premier League","英超":"Premier League","EPL":"Premier League",
  "英格蘭冠軍聯賽":"Championship","英冠":"Championship","ED1":"Championship",
  "英格蘭甲組聯賽":"League One","英甲":"League One","ED2":"League One",
  "英格蘭乙組聯賽":"League Two","英乙":"League Two","ED3":"League Two",
  "德國甲組聯賽":"Bundesliga","德甲":"Bundesliga","GSL":"Bundesliga","DE1":"Bundesliga",
  "德國乙組聯賽":"2. Bundesliga","德乙":"2. Bundesliga",
  "西班牙甲組聯賽":"LaLiga","西甲":"LaLiga","SFL":"LaLiga",
  "西班牙乙組聯賽":"LaLiga 2","西乙":"LaLiga 2","SF2":"LaLiga 2",
  "意大利甲組聯賽":"Serie A","意甲":"Serie A","ISA":"Serie A",
  "意大利乙組聯賽":"Serie B","意乙":"Serie B",
  "法國甲組聯賽":"Ligue 1","法甲":"Ligue 1","FFL":"Ligue 1",
  "法國乙組聯賽":"Ligue 2","法乙":"Ligue 2","FF2":"Ligue 2",
  "荷蘭甲組聯賽":"Eredivisie","荷甲":"Eredivisie","DFL":"Eredivisie","NL1":"Eredivisie",
  "荷蘭乙組聯賽":"Eerste Divisie","荷乙":"Eerste Divisie","DF2":"Eerste Divisie","NL2":"Eerste Divisie",
  "葡萄牙超級聯賽":"Primeira Liga","葡超":"Primeira Liga","PFL":"Primeira Liga",
  "比利時甲組聯賽":"Belgian Pro League","比甲":"Belgian Pro League","BFL":"Belgian Pro League",
  "蘇格蘭超級聯賽":"Scottish Premiership","蘇超":"Scottish Premiership","SPL":"Scottish Premiership",
  "美國職業聯賽":"MLS","美職":"MLS","MLS":"MLS",
  "歐洲聯賽冠軍盃":"UEFA Champions League","歐聯":"UEFA Champions League","UCL":"UEFA Champions League",
  "歐霸盃":"UEFA Europa League","歐霸":"UEFA Europa League","UEL":"UEFA Europa League",
  "歐洲協會聯賽":"UEFA Conference League","歐協聯":"UEFA Conference League","UEC":"UEFA Conference League",
  "歐洲國家聯賽":"UEFA Nations League","歐國聯":"UEFA Nations League","ENL":"UEFA Nations League",
  "國際賽":"International","INT":"International",
  "中北美國家聯賽":"CONCACAF Nations League","中北國聯":"CONCACAF Nations League","CNL":"CONCACAF Nations League",
};

function englishLeagueName(match) {
  const candidates = [
    match?.leagueEn,
    match?.competitionEn,
    match?.league,
    match?.competition,
  ].filter(Boolean);
  for (const value of candidates) {
    const raw = String(value).trim();
    if (!raw) continue;
    if (leagueEnglishMap[raw]) return leagueEnglishMap[raw];
    const upper = raw.toUpperCase();
    if (leagueEnglishMap[upper]) return leagueEnglishMap[upper];
    if (!/[\u3400-\u9fff]/.test(raw)) return raw;
  }
  return "Football";
}

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

function oddsTriplet(match) {
  return [
    ["H", match?.odds?.home],
    ["D", match?.odds?.draw],
    ["A", match?.odds?.away],
  ];
}

function MarketOdds({ match, marketKey = "HDA" }) {
  const currentGoals = match?.liveNow && match?.live?.goals ? match.live.goals : match?.goals;
  const currentCorners = match?.liveNow && match?.live?.corners ? match.live.corners : match?.corners;
  // Live payloads may contain an empty odds object. Do not let that
  // truthy-but-null object erase a real, fresh prematch Flashscore quote.
  // Never label a prematch reference as an in-play market.
  const completeHda = (v) => ["home", "draw", "away"].every((k) => Number(v?.[k]) > 1);
  const verifiedLiveOdds = match?.liveNow &&
    match?.live?.oddsSemantics === "VERIFIED_IN_PLAY_BOOKMAKER_ODDS" &&
    completeHda(match?.live?.odds) ? match.live.odds : null;
  const prematchOdds = completeHda(match?.odds) ? match.odds : null;
  const currentOdds = verifiedLiveOdds || prematchOdds;
  const referenceOnly = Boolean(match?.liveNow && !verifiedLiveOdds && prematchOdds);
  // All-in-One contract: HDA remains visible in every market tab. Goals and
  // corners are additional independent evidence lanes, never HDA replacements.
  // The current collector supplies verified HDA only: do not invent O/U prices.
  const alternate = marketKey === "GOALS" ? { name: "Goals", odds: currentGoals }
    : marketKey === "CORNERS" ? { name: "Corners", odds: currentCorners } : null;
  const currentMatch = { ...match, odds: currentOdds };
  return (
    <div className="ft-market-odds">
      <small>{verifiedLiveOdds
        ? "Flashscore · LIVE Bet365 HDA"
        : referenceOnly
          ? "Flashscore · Bet365 HDA (prematch reference)"
          : "Flashscore · Bet365 HDA"}</small>
      <div>
        {oddsTriplet(currentMatch).map(([label, value]) => (
          <span key={label}><b>{label}</b>{formatOdds(value)}</span>
        ))}
      </div>
      {alternate && (
        <div className="ft-secondary-market" style={{marginTop:3,paddingTop:3,borderTop:"1px solid #dce4ec"}}>
          <small>{alternate.name} {alternate.odds?.line ?? "—"} · {alternate.odds?.over != null && alternate.odds?.under != null ? "source evidence" : "not available"}</small>
          <div style={{display:"flex",gap:8}}>
            <span><b>O</b>{formatOdds(alternate.odds?.over)}</span>
            <span><b>U</b>{formatOdds(alternate.odds?.under)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function dateKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function hkWeekend(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const day = d.toLocaleDateString("en-US", { timeZone: HK_TIME_ZONE, weekday: "short" });
  return day === "Sat" || day === "Sun";
}

function shortTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "TBA";
  return d.toLocaleTimeString("en-GB", { timeZone: HK_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false });
}

function scoreText(match) {
  const live = match?.live || {};
  const pairs = [
    [live?.score?.home, live?.score?.away],
    [live.homeScore, live.awayScore],
    [live.home, live.away],
    [live.scoreHome, live.scoreAway],
    [match.scoreHome, match.scoreAway],
  ];
  for (const [h, a] of pairs) {
    if (Number.isFinite(Number(h)) && Number.isFinite(Number(a))) return `${h} - ${a}`;
  }
  if (typeof live?.score?.text === "string" && live.score.text.trim()) return live.score.text;
  if (typeof live.score === "string" && live.score.trim()) return live.score;
  return "—";
}

function liveLabel(match) {
  if (!match?.liveNow) return "";
  const minute = match?.live?.score?.minute ?? match?.live?.minute ?? match?.minute;
  return Number.isFinite(Number(minute)) ? `${minute}'` : "LIVE";
}

function livePairLabel(pair, digits = 0) {
  if (!pair) return null;
  const h = Number(pair.home), a = Number(pair.away);
  if (!Number.isFinite(h) && !Number.isFinite(a)) return null;
  const fmt = (v) => Number.isFinite(v) ? (digits ? v.toFixed(digits) : String(Math.round(v))) : "—";
  return `${fmt(h)}-${fmt(a)}`;
}

function LiveStatStrip({ match }) {
  const observed = match?.sourceContext?.observedStats;
  const liveVerified = Boolean(match?.liveNow && match?.live?.stats);
  const stats = liveVerified ? match.live.stats : observed?.stats;
  if (!stats) return null;
  const items = [
    ["xG", livePairLabel(stats.xg, 2)],
    ["Shots", livePairLabel(stats.shots)],
    ["SOT", livePairLabel(stats.shotsOnTarget)],
    ["Corners", livePairLabel(stats.corners)],
    ["Poss", livePairLabel(stats.possession)],
  ].filter(([, value]) => value);
  if (!items.length) return null;
  return (
    <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:4}}>
      {observed && !liveVerified ? (
        <span title={observed.semantics} style={{fontSize:8,background:"#eff5fb",padding:"2px 4px",borderRadius:5}}>
          Flashscore snapshot · {shortTime(observed.capturedAt)}
        </span>
      ) : null}
      {items.map(([label,value]) => (
        <span key={label} style={{fontSize:8,padding:"2px 4px",borderRadius:5,background:"#edf3f8",color:"#355773",fontWeight:800,whiteSpace:"nowrap"}}>
          {label} {value}{label === "Poss" ? "%" : ""}
        </span>
      ))}
    </div>
  );
}

function AdvertSlot({ variant = "wide" }) {
  return (
    <div className={`ft-ad-slot ft-ad-${variant}`} aria-label="Advertisement placeholder">
      <div>
        <span>ADVERTISEMENT</span>
        <strong>{variant === "wide" ? "970 × 90" : "300 × 250"}</strong>
        <small>Reserved for future advertising</small>
      </div>
    </div>
  );
}

function Sidebar({ counts, activeMode, onModeChange, activeLeague, onLeagueChange }) {
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
        {sections.map(([label, count], index) => {
          const modes = ["today","live","tomorrow","weekend","all","value"];
          const mode = modes[index];
          return (
            <button className={`ft-side-link ${activeMode === mode ? "active" : ""}`} key={label} onClick={() => onModeChange(mode)}>
              <span>{label}</span>
              <span className="ft-count">{count}</span>
            </button>
          );
        })}
        <button className="ft-side-link"><span>Top Predictions</span><ChevronRight size={15} /></button>
        <button className="ft-side-link"><span>Lists</span><ChevronRight size={15} /></button>
      </section>

      <section className="ft-side-card">
        <div className="ft-side-heading">POPULAR LEAGUES</div>
        <button className={`ft-side-link compact ${activeLeague === "" ? "active" : ""}`} onClick={() => onLeagueChange("")}><span>All leagues</span><ChevronRight size={14} /></button>
        {popularLeagues.map((league) => (
          <button className={`ft-side-link compact ${activeLeague === league ? "active" : ""}`} key={league} onClick={() => onLeagueChange(league)}>
            <span>{league}</span><ChevronRight size={14} />
          </button>
        ))}
      </section>
    </aside>
  );
}

function ProbabilityStrip({ model }) {
  const h = pct(model?.home);
  const d = pct(model?.draw);
  const a = pct(model?.away);
  const hp = Number.isFinite(model?.home) ? Math.max(0, model.home * 100) : 0;
  const dp = Number.isFinite(model?.draw) ? Math.max(0, model.draw * 100) : 0;
  const ap = Number.isFinite(model?.away) ? Math.max(0, model.away * 100) : 0;
  return (
    <div className="ft-prob-visual" title={`Home ${h}% · Draw ${d}% · Away ${a}%`}>
      <div className="ft-prob-numbers"><span>H {h}%</span><span>D {d}%</span><span>A {a}%</span></div>
      <div className="ft-prob-strip" aria-label="H D A probability distribution">
        <i className="home" style={{ width: `${hp}%` }} />
        <i className="draw" style={{ width: `${dp}%` }} />
        <i className="away" style={{ width: `${ap}%` }} />
      </div>
    </div>
  );
}

function PredictionsTable({ matches, title = "", activeMarket = "HDA", feedState = null }) {
  return (
    <section className="ft-table-section">
      {title && <div className="ft-league-section-title">
        <strong>{title}</strong>
        <span>{matches.filter((m) => m.liveNow).length ? `${matches.filter((m) => m.liveNow).length} live · ` : ""}{matches.length} matches</span>
      </div>}
      <div className="ft-table-wrap">
      <div className="ft-table-head">
        <div>Home team<br />Away team</div>
        <div className="ft-prob-head">Prob. %<span><b>1</b><b>X</b><b>2</b></span></div>
        <div>Pred</div>
        <div>Correct<br />score</div>
        <div>Avg.<br />goals</div>
        <div>Edge</div>
        <div>Live<br />score</div>
        <div>Market odds</div>
      </div>

      <div className="ft-table-body">
        {matches.length ? matches.map((match) => {
          const model = normalizedTriplet(match);
          // Real bookmaker-implied probability is useful when no independent
          // model exists; display it as market evidence, never as a prediction.
          const marketImplied = !model && !match.liveNow ? fairMarket(match.odds) : null;
          const displayProb = model;
          const edge = match.liveNow ? null : valueEdge(match);
          const market = match.market || fairMarket(match.odds);
          // Source-specific Forebet columns: never substitute bookmaker/model goals.
          // Null is unknown, not a 0.00 goal forecast.
          const forebetRawAvg = match?.forebetDetail?.ou25?.avgGoals
            ?? match?.forebetDetail?.avgGoals ?? match?.forebet?.avgGoals ?? null;
          const avgGoals = forebetRawAvg === null || forebetRawAvg === "" ? null : Number(forebetRawAvg);
          const predictedScore = match?.forebetDetail?.predictedScore
            || match?.forebet?.score || "—";
          const bestOdds = edge?.key === "H" ? match?.odds?.home : edge?.key === "D" ? match?.odds?.draw : edge?.key === "A" ? match?.odds?.away : null;

          const rowClasses = [
            "ft-match-row",
            match.liveNow ? "is-live" : "",
            Number(edge?.expectedValue) >= 0.04 ? "is-value" : "",
          ].filter(Boolean).join(" ");
          return (
            <a className={rowClasses} href={matchDetailHref(match.id, "homepage-v1")} key={match.id}
              onClick={() => {
                // Carry the exact verified fixture/HDA into its detail route.
                // The detail API may be unavailable during PostgREST pressure;
                // a clicked live match must not become an empty placeholder.
                try {
                  const payload = JSON.stringify(match);
                  window.sessionStorage.setItem(`ft-match-${match.id}`, payload);
                  window.localStorage.setItem(`ft-match-${match.id}`, payload);
                } catch {}
              }}>
              <div className="ft-team-cell">
                <div className="ft-league-tag">{englishLeagueName(match)}</div>
                <div className="ft-team-names">
                  <strong>{match.home || match.homeZh || "Home"}</strong>
                  <span>{match.away || match.awayZh || "Away"}</span>
                  <small>
                    {shortTime(match.kickoff)} · {dateKey(match.kickoff)}
                    {match?.sourceContext?.lineupCoverage?.starters === 22
                      ? (Number(match?.sourceContext?.lineupCoverage?.confirmedStarters) >= 22 ? " · Confirmed XI 22/22" : " · Predicted XI 22/22")
                      : ""}
                    {Number(match?.sourceContext?.lineupCoverage?.profileCount) > 0 ? " · " + match.sourceContext.lineupCoverage.profileCount + " player profiles" : ""}
                    {match?.sourceContext?.statsAvailable ? " · Match stats" : ""}
                    {match?.sourceContext?.xgAvailable ? " · xG" : ""}
                  </small>
                </div>
              </div>
              <div className="ft-probs">
                <ProbabilityStrip model={displayProb} />
                {marketImplied && <small title="Bookmaker prices are shown separately; there is no independent prediction" style={{display:"block",fontSize:10,opacity:0.8}}>No model · see odds</small>}
              </div>
              <div><span className="ft-pred-pill">{sideFromTriplet(model)}</span></div>
              <div>{predictedScore}</div>
              <div className="ft-goal-number">{Number.isFinite(avgGoals) ? avgGoals.toFixed(2) : "—"}</div>
              <div><span className={edge?.expectedValue > 0.04 ? "ft-edge strong" : "ft-edge"}>{Number.isFinite(edge?.expectedValue) ? `${edge.expectedValue >= 0 ? "+" : ""}${(edge.expectedValue * 100).toFixed(1)}%` : "—"}</span></div>
              <div className="ft-score-cell">
                {match.liveNow && <small className="ft-live-tag">{liveLabel(match)}</small>}
                <strong>{scoreText(match)}</strong>
                <LiveStatStrip match={match} />
              </div>
              <MarketOdds match={match} marketKey={activeMarket} />
            </a>
          );
        }) : feedState?.status === "error" ? (
          <div className="ft-empty">
            <strong>Fixture feed temporarily unavailable</strong>
            <small>Fixture counts remain unknown until the next successful source refresh.</small>
          </div>
        ) : feedState?.status === "loading" ? (
          <div className="ft-empty">
            <strong>Loading current fixtures…</strong>
            <small>Waiting for the live fixture feed.</small>
          </div>
        ) : (
          <div className="ft-empty">No fixtures are available in the current feed.</div>
        )}
      </div>
    </div>
    </section>
  );
}

function CalendarPanel({ selectedDate, onSelectDate }) {
  return (
    <section className="ft-right-card ft-calendar">
      <div className="ft-calendar-title"><span>Match calendar</span><small>Choose a date to filter fixtures</small></div>
      <DayPicker
        mode="single"
        selected={selectedDate}
        onSelect={(date) => date && onSelectDate(date)}
        defaultMonth={selectedDate}
        weekStartsOn={1}
        showOutsideDays
      />
    </section>
  );
}

function FeaturedMatch({ match }) {
  if (!match) return null;
  const model = normalizedTriplet(match);
  const marketImplied = !model && !match.liveNow ? fairMarket(match.odds) : null;
  const displayProb = model;
  const edge = valueEdge(match);
  return (
    <section className="ft-right-card">
      <div className="ft-right-head">Featured match</div>
      <a href={matchDetailHref(match.id, "homepage-v1")} className="ft-featured">
        <div className="ft-featured-main">
          <small>{englishLeagueName(match)} · {formatKickoff(match.kickoff)}</small>
          <strong>{match.home || match.homeZh}</strong>
          <span>{match.away || match.awayZh}</span>
          <ProbabilityStrip model={displayProb} />
          {marketImplied && <small title="Bookmaker price is not an independent prediction">No model · see odds</small>}
          <div className="ft-featured-meta">
            <span>Pick <b>{sideFromTriplet(model)}</b></span>
            <span>Edge <b>{Number.isFinite(edge?.expectedValue) ? `${edge.expectedValue >= 0 ? "+" : ""}${(edge.expectedValue * 100).toFixed(1)}%` : "—"}</b></span>
          </div>
        </div>
      </a>
    </section>
  );
}

function ValuePicks({ matches }) {
  const picks = matches
    .map((match) => ({ match, edge: valueEdge(match) }))
    .filter(({ edge }) => Number.isFinite(edge?.expectedValue) && edge.expectedValue > 0)
    .sort((a, b) => b.edge.expectedValue - a.edge.expectedValue)
    .slice(0, 4);

  return (
    <section className="ft-right-card">
      <div className="ft-right-head">Top value picks</div>
      <div className="ft-value-rail">
        {picks.length ? picks.map(({ match, edge }) => (
          <a href={matchDetailHref(match.id, "homepage-v1")} key={match.id}>
            <div>
              <strong>{match.home || match.homeZh}</strong>
              <span>vs {match.away || match.awayZh}</span>
              <small>{englishLeagueName(match)}</small>
            </div>
            <b>{edge.key}</b>
            <em>{(edge.expectedValue * 100).toFixed(1)}%</em>
          </a>
        )) : <div className="ft-rail-empty">No positive value signal right now</div>}
      </div>
    </section>
  );
}

function RightRail({ matches, selectedDate, onSelectDate }) {
  const featured = matches.find((m) => valueEdge(m)?.expectedValue > 0.04) || matches[0];
  return (
    <aside className="ft-rightbar">
      <CalendarPanel selectedDate={selectedDate} onSelectDate={onSelectDate} />
      <FeaturedMatch match={featured} />
      <ValuePicks matches={matches} />
      <section className="ft-right-card">
        <div className="ft-right-head">Reading the board</div>
        <div className="ft-board-guide">
          <div><b>H / D / A</b><span>Combined probability strip</span></div>
          <div><b>EDGE</b><span>Model value versus current market</span></div>
          <div><b>LIVE</b><span>Score and clock only when observed</span></div>
          <div><b>—</b><span>Unknown or unavailable, never assumed zero</span></div>
        </div>
      </section>
      <AdvertSlot variant="box" />
    </aside>
  );
}

export default function HomepageClient({ initialFeed, nowMs }) {
  const [feed, setFeed] = useState(initialFeed || { matches: [] });
  const [feedState, setFeedState] = useState(
    Array.isArray(initialFeed?.matches) && initialFeed.matches.length
      ? { status: "ready", message: null }
      : { status: "loading", message: null }
  );
  const [dayOffset, setDayOffset] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [activeMode, setActiveMode] = useState("today");
  const [activeLeague, setActiveLeague] = useState("");
  const [activeMarket, setActiveMarket] = useState("HDA");
  const [selectedDate, setSelectedDate] = useState(new Date(nowMs || Date.now()));

  useEffect(() => {
    // Keep a modest browser-side copy of already verified Flashscore fixture
    // identities. A gateway schema-cache failure must not erase the entire
    // board when this browser recently loaded the canonical source.
    if (!Array.isArray(initialFeed?.matches) || !initialFeed.matches.length) {
      try {
        const raw = window.localStorage.getItem("ft-verified-homepage-snapshot");
        const previous = raw ? JSON.parse(raw) : null;
        const fetchedMs = Date.parse(String(previous?.generatedAt || ""));
        if (previous && Array.isArray(previous.matches) && previous.matches.length &&
          Number.isFinite(fetchedMs) && Date.now() - fetchedMs < 4 * 3600000) {
          const now = Date.now();
          const safeMatches = previous.matches.map((match) => {
            const capturedAt = Date.parse(String(match?.health?.authorityFetchedAt || match?.oddsUpdatedAt || ""));
            const kickoffAt = Date.parse(String(match?.kickoff || ""));
            return Number.isFinite(capturedAt) && capturedAt <= now + 60000 &&
              now - capturedAt <= 20 * 60000 && kickoffAt > now &&
              ["home","draw","away"].every((k) => Number(match?.odds?.[k]) > 1)
              ? match : sanitizeFallbackMatch(match);
          });
          setFeed({ ...previous, source: "cached-client-verified-fixtures",
            count: safeMatches.length, matches: safeMatches });
          setFeedState({ status: "error", message: "Using last verified Flashscore fixtures while live source is unavailable; expired odds are hidden." });
        }
      } catch {}
    }
    let cancelled = false;
    let refreshInFlight = false;
    let enrichmentInFlight = false;
    let liveInFlight = false;
    let hasAuthority = Array.isArray(initialFeed?.matches) && initialFeed.matches.length > 0;

    async function refreshAuthority() {
      if (cancelled || refreshInFlight || document.visibilityState === "hidden") return;
      refreshInFlight = true;
      try {
        const res = await fetch(HOMEPAGE_FEED_URL, {
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) {
          let message = `HTTP ${res.status}`;
          try {
            const failure = await res.json();
            message = [failure?.error, failure?.message].filter(Boolean).join(" · ") || message;
          } catch {}
          if (!cancelled) setFeedState({ status: "error", message });
          return;
        }
        const next = await res.json();
        if (!Array.isArray(next?.matches)) {
          if (!cancelled) setFeedState({ status: "error", message: "Feed response did not contain a fixture list" });
          return;
        }
        if (!cancelled) {
          hasAuthority = next.matches.length > 0;
          setFeed((current) => mergeAuthorityWithEnrichment(next, current));
          if (next.matches.length && String(next.source || "").includes("flashscore")) {
            try {
              window.localStorage.setItem("ft-verified-homepage-snapshot", JSON.stringify(next));
            } catch {}
          }
          setFeedState({ status: "ready", message: null });
        }
      } catch {
        if (!cancelled) setFeedState({ status: "error", message: "Fixture refresh request failed" });
      } finally {
        refreshInFlight = false;
      }
    }

    async function refreshEnrichment() {
      if (cancelled || enrichmentInFlight || !hasAuthority || document.visibilityState === "hidden") return;
      enrichmentInFlight = true;
      try {
        const res = await fetch(ENRICHMENT_FEED_URL, {
          signal: AbortSignal.timeout(35000),
        });
        if (!res.ok) return;
        const rich = await res.json();
        if (!Array.isArray(rich?.matches) || !rich.matches.length) return;
        if (!cancelled) setFeed((current) => mergeAuthorityWithEnrichment(current, rich));
      } catch {
        // Enrichment is best-effort. Fixture authority must remain visible even
        // when the heavier model/story pipeline is unavailable.
      } finally {
        enrichmentInFlight = false;
      }
    }

    async function refreshLiveOverlay() {
      if (cancelled || liveInFlight || !hasAuthority || document.visibilityState === "hidden") return;
      liveInFlight = true;
      try {
        const res = await fetch(LIVE_FEED_URL + (LIVE_FEED_URL.includes("?") ? "&" : "?") + "_=" + Date.now(), {
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) return;
        const livePayload = await res.json();
        if (!Array.isArray(livePayload?.matches)) return;
        if (!cancelled) setFeed((current) => mergeLiveOverlay(current, livePayload));
      } catch {
        // Live evidence is an overlay only. Authority fixtures remain visible
        // if the live read lane is temporarily unavailable.
      } finally {
        liveInFlight = false;
      }
    }

    // The SSR canonical seed already contains the exact bookmaker rows.
    // Avoid launching 3 duplicate data reads at once on every first paint.
    const seedTime = Date.parse(String(initialFeed?.generatedAt || ""));
    const serverSeedRecent = hasAuthority &&
      String(initialFeed?.source || "").startsWith("flashscore-") &&
      Number.isFinite(seedTime) && Date.now() - seedTime < 10000;
    if (!serverSeedRecent) refreshAuthority();
    const warmLive = setTimeout(refreshLiveOverlay, 5000);
    const warmEnrichment = setTimeout(refreshEnrichment, 12000);
    // Less duplicated polling. Independent prediction evidence does not need
    // a full expensive refresh from every open browser every five minutes.
    const authorityTimer = setInterval(refreshAuthority, 180000);
    const liveTimer = setInterval(refreshLiveOverlay, 60000);
    const enrichmentTimer = setInterval(refreshEnrichment, 1200000);

    return () => {
      cancelled = true;
      clearTimeout(warmLive);
      clearTimeout(warmEnrichment);
      clearInterval(authorityTimer);
      clearInterval(liveTimer);
      clearInterval(enrichmentTimer);
    };
  }, []);

  const matches = Array.isArray(feed?.matches) ? feed.matches : [];
  const now = useMemo(() => new Date(nowMs || Date.now()), [nowMs]);
  const todayKey = dateKey(now);
  const tomorrowKey = dateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  const counts = useMemo(() => ({
    today: matches.filter(m => dateKey(m.kickoff) === todayKey).length,
    live: matches.filter(m => m.liveNow).length,
    tomorrow: matches.filter(m => dateKey(m.kickoff) === tomorrowKey).length,
    weekend: matches.filter(m => hkWeekend(m.kickoff)).length,
    all: matches.length,
    value: matches.filter(m => Number(valueEdge(m)?.expectedValue) >= 0.04).length,
  }), [matches, todayKey, tomorrowKey]);

  const target = new Date(selectedDate || now);
  target.setDate(target.getDate() + dayOffset);
  const targetKey = dateKey(target);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = matches.filter((m) => {
      const league = englishLeagueName(m);
      if (activeLeague && league !== activeLeague) return false;
      if (q) {
        const haystack = [m.home, m.away, m.homeZh, m.awayZh, league].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (activeMode === "live") return Boolean(m.liveNow);
      if (activeMode === "tomorrow") return dateKey(m.kickoff) === tomorrowKey;
      if (activeMode === "weekend") return hkWeekend(m.kickoff);
      if (activeMode === "all") return true;
      if (activeMode === "value") return Number(valueEdge(m)?.expectedValue) >= 0.04;
      return dayOffset === 0 ? (m.liveNow || dateKey(m.kickoff) === targetKey) : dateKey(m.kickoff) === targetKey;
    });

    rows = rows.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    // The All-in-One first screen must not be swallowed by recent fixtures
    // with no current price. Reserve space for real upcoming odds AND
    // independently observed Flashscore stats, without assuming live status.
    if ((activeMode === "today" || activeMode === "all") && !q) {
      const live = rows.filter(m => m.liveNow);
      const priced = rows.filter(m => !m.liveNow &&
        new Date(m.kickoff).getTime() > Date.now() &&
        ["home","draw","away"].every(k => Number(m?.odds?.[k]) > 1));
      const observed = rows.filter(m => m?.sourceContext?.observedStats?.stats);
      const selected = [];
      const seen = new Set();
      const add = (items, limit) => {
        let n = 0;
        for (const m of items) {
          if (n >= limit) break;
          if (seen.has(m.id)) continue;
          selected.push(m); seen.add(m.id); n++;
        }
      };
      add(live, 8);
      add(priced, 20);
      add(observed, 8);
      add(rows, 30 - selected.length);
      return selected.slice(0, 30);
    }
    return rows.slice(0, 30);
  }, [matches, activeLeague, activeMode, query, dayOffset, targetKey, tomorrowKey]);

  const groupedVisible = useMemo(() => {
    const groups = new Map();
    for (const match of visible) {
      const league = englishLeagueName(match);
      if (!groups.has(league)) groups.set(league, []);
      groups.get(league).push(match);
    }
    return [...groups.entries()];
  }, [visible]);

  return (
    <main className="ft-home">
      <header className="ft-top">
        <div className="ft-brand">
          <strong>FAST TRACKER <em>2026</em></strong>
          <small>FOOTBALL DATA · MODELS · VALUE BETS</small>
        </div>
        <label className="ft-search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search team, league or match..." /></label>
        <button className="ft-icon-button"><Star size={22} /></button>
        <button className="ft-icon-button"><MoreHorizontal size={22} /></button>
      </header>

      <nav className="ft-sports" aria-label="Primary match filters">
        {primaryNav.map(([name, Icon, mode]) => (
          <button
            className={activeMode === mode ? "active" : ""}
            key={name}
            onClick={() => { setActiveMode(mode); if (mode === "today") setDayOffset(0); }}
          >
            <Icon size={17} />{name}
          </button>
        ))}
      </nav>

      <div className="ft-layout">
        <Sidebar counts={counts} activeMode={activeMode} onModeChange={setActiveMode} activeLeague={activeLeague} onLeagueChange={setActiveLeague} />

        <section className="ft-center">
          <div className="ft-page-heading">
            <h1>Mathematical Football Predictions and Statistics</h1>
            <p>Data-driven forecasts, odds analysis and live insights</p>
          </div>

          <div className="ft-daybar">
            {[-2,-1,0,1,2].map((offset) => {
              const d = new Date(selectedDate || now);
              d.setDate(d.getDate() + offset);
              const label = offset === 0 ? "Today" : d.toLocaleDateString("en-GB", { weekday: "short" });
              return <button key={offset} className={dayOffset === offset && activeMode === "today" ? "active" : ""} onClick={() => { setDayOffset(offset); setActiveMode("today"); }}>{label}</button>;
            })}
            <label className="ft-form-toggle"><span>Show form</span><input type="checkbox" checked={showForm} onChange={e => setShowForm(e.target.checked)} /><i /></label>
          </div>

          <div className="ft-filterbar">
            <div className="ft-filter-label">Market</div>
            <div className="ft-market-tabs">
              {marketFilters.map(([label, key]) => (
                <button className={activeMarket === key ? "active" : ""} key={key} onClick={() => setActiveMarket(key)}>{label}</button>
              ))}
            </div>
            <div className="ft-result-count">
              <b>{feedState.status === "error" && matches.length === 0 ? "—" : visible.length}</b>
              {feedState.status === "error"
                ? (matches.length ? " cached matches · feed unavailable" : " feed unavailable")
                : " matches shown"}
            </div>
          </div>

          <div role="status" className="ft-form-note" style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:12}}>
            <span>Legacy H/D/A (OddsPortal pending) <strong>{matches.filter((m) => ["home","draw","away"].every((k) => Number(m?.odds?.[k]) > 1)).length}/{matches.length}</strong></span>
            <span>Match-stat evidence <strong>{matches.filter((m) => m?.sourceContext?.statsAvailable || m?.sourceContext?.observedStats || m?.live?.stats).length}/{matches.length}</strong></span>
            <span>Independent model <strong>{matches.filter((m) => normalizedTriplet(m)).length}/{matches.length}</strong></span>
            <span>Unknown values stay blank; H/D/A odds are not model predictions</span>
          </div>

          {feedState.status === "error" && matches.length > 0 ? (
            <section className="ft-form-note" role="status">
              <Activity size={18} />
              <span><strong>Fixture feed temporarily unavailable.</strong> Showing the last successful fixture list; freshness is unknown until refresh recovers.</span>
            </section>
          ) : null}

          {visible.some((m) => m.liveNow) ? (
            <div className="ft-live-ribbon">
              <span className="ft-live-dot" />
              <strong>{visible.filter((m) => m.liveNow).length} live now</strong>
              <span>Live score is shown only when present in the current feed</span>
              <button onClick={() => setActiveMode("live")}>View live</button>
            </div>
          ) : null}

          <div className="ft-grouped-board">
            {groupedVisible.length ? groupedVisible.map(([league, rows], index) => (
              <div key={league}>
                <PredictionsTable matches={rows} title={league} activeMarket={activeMarket} feedState={feedState} />
                {index === 0 && <AdvertSlot variant="wide" />}
              </div>
            )) : <PredictionsTable matches={[]} activeMarket={activeMarket} feedState={feedState} />}
          </div>

          {showForm && (
            <section className="ft-form-note">
              <ChartNoAxesColumnIncreasing size={18} />
              Form layer is enabled. Detailed team-form evidence remains on each match page.
            </section>
          )}
        </section>

        <RightRail matches={visible.length ? visible : matches.slice(0, 10)} selectedDate={selectedDate} onSelectDate={(date) => { setSelectedDate(date); setDayOffset(0); setActiveMode("today"); }} />
      </div>

      <footer className="ft-footer-banner">
        <div><Activity size={21} /><strong>Real-time football intelligence</strong><span>Live data · model comparison · smart alerts</span></div>
        <button>Explore matches <ChevronRight size={16} /></button>
      </footer>
    </main>
  );
}
