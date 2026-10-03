"use client";

import { useEffect, useState } from "react";
import ModelEdgeChart from "@/components/model-edge-chart";
import ModelScoreboard from "@/components/model-scoreboard";
import EvidenceArticle from "@/components/evidence-article";
import {
  divergence,
  fairMarket,
  formatKickoff,
  formatOdds,
  formatUpdated,
  freshness,
  lineComparisonStatus,
  leagueDisplayName,
  modelAgreement,
  modelCoverageCount,
  modelLabel,
  reviewPriority,
  sanitizeFallbackMatch,
  sideName,
} from "@/lib/fast-tracker";

const UI_BUILD = "ENGLISH-EVIDENCE-ARTICLE-20261003-1";
const FEED_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-phase1-feed?hours=48";
const LIVE_FEED_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-live-feed";
const DETAIL_FEED_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-match-detail";
const ANALYSIS_FEED_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-match-analysis";
const STORY_FEED_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-match-story";

const CORE_MODEL_DEFS = [
  { key: "HKJC", label: "HKJC no-vig" },
  { key: "FOREBET", label: "Forebet" },
  { key: "DC", label: "Dixon-Coles" },
  { key: "PI", label: "Pi Rating" },
  { key: "FORM", label: "Team-Form" },
  { key: "MULTI", label: "Multi-source" },
];

const MULTISOURCE_MODEL_DEFS = ["FRB", "ACC", "BCL", "FST", "PRE", "STA"];

function normalizedSide(value) {
  const side = String(value || "").trim().toUpperCase();
  if (side === "H" || side === "HOME") return "H";
  if (side === "A" || side === "AWAY") return "A";
  return null;
}

function probabilityAvailable(values) {
  return ["home", "draw", "away"].every((key) => {
    const raw = values?.[key];
    if (raw === null || raw === undefined || raw === "") return false;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 1;
  });
}

function coreModelValues(match, key, market) {
  if (key === "HKJC") return market;
  if (key === "FOREBET") return match.forebet;
  if (key === "DC") return match.dc;
  if (key === "PI") return match.pi;
  if (key === "FORM") return match.form;
  if (key === "MULTI") return match.multi;
  return null;
}

function pairText(pair, digits = 0, suffix = "") {
  if (!pair || pair.home == null || pair.away == null) return "—";
  const h = Number(pair.home);
  const a = Number(pair.away);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return "—";
  return `${h.toFixed(digits)}${suffix}-${a.toFixed(digits)}${suffix}`;
}

function pairShare(pair) {
  if (!pair || pair.home == null || pair.away == null) return null;
  const home = Number(pair.home);
  const away = Number(pair.away);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  const total = Math.max(0, home) + Math.max(0, away);
  if (total <= 0) return { home, away, homePct: 50, awayPct: 50 };
  return {
    home,
    away,
    homePct: Math.round(Math.max(0, home) / total * 100),
    awayPct: Math.round(Math.max(0, away) / total * 100),
  };
}

function visualControlSide(stats) {
  if (!stats) return null;
  const signals = [
    [stats.xg, 3],
    [stats.shotsOnTarget, 2],
    [stats.bigChances, 2],
    [stats.boxTouches, 1],
    [stats.corners, 1],
    [stats.possession, 0.5],
  ];
  let score = 0;
  let used = 0;
  for (const [pair, weight] of signals) {
    const share = pairShare(pair);
    if (!share) continue;
    const total = Math.abs(share.home) + Math.abs(share.away);
    if (total <= 0) continue;
    score += ((share.home - share.away) / total) * weight;
    used += weight;
  }
  if (!used) return null;
  const normalized = score / used;
  if (Math.abs(normalized) < 0.08) return "BALANCED";
  return normalized > 0 ? "H" : "A";
}

function liveAgeSeconds(value) {
  if (!value) return Infinity;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return Infinity;
  return Math.max(0, Math.round((Date.now() - ms) / 1000));
}

function liveAgeLabel(seconds) {
  if (!Number.isFinite(seconds)) return "Waiting";
  if (seconds < 60) return seconds + "s";
  if (seconds < 3600) return Math.round(seconds / 60) + "m";
  return Math.round(seconds / 3600) + "h";
}

function liveLaneStatus(value, warnSeconds, staleSeconds) {
  const age = liveAgeSeconds(value);
  const state = !Number.isFinite(age) ? "missing" : age > staleSeconds ? "stale" : age > warnSeconds ? "warn" : "fresh";
  return { age, state, label: liveAgeLabel(age) };
}

function controlSideLabel(match, side) {
  if (side === "H") return match.home || match.homeEn || match.homeZh || "Home";
  if (side === "A") return match.away || match.awayEn || match.awayZh || "Away";
  if (side === "BALANCED") return "Balanced";
  return "—";
}


function formatFormDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    month: "numeric",
    day: "numeric",
  }).format(d);
}

function formQualityLabel(value) {
  const text = String(value || "");
  if (!text) return "HISTORY ONLY";
  if (text.includes("INSUFFICIENT")) return "INSUFFICIENT SAMPLE";
  return text.replaceAll("_", " ");
}

function h2hQualityLabel(value, games = 0) {
  const text = String(value || "").toUpperCase();
  if (text === "H2H_OK") return `${games} verified meetings`;
  if (text === "NO_PREVIOUS_H2H_IN_AVAILABLE_HISTORY") return "No verified previous meeting";
  if (text === "HISTORY_PARTIAL") return "History coverage partial";
  return "H2H sync pending";
}

function pct(value, digits = 0) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const p = Math.abs(n) <= 1 ? n * 100 : n;
  return p.toFixed(digits) + "%";
}

function numText(value, digits = 2) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function hdaText(values) {
  if (!probabilityAvailable(values)) return null;
  return [
    { key: "H", value: values.home },
    { key: "D", value: values.draw },
    { key: "A", value: values.away },
  ];
}

function modelStateLabel(available, reason) {
  if (available) return "AVAILABLE";
  const r = String(reason || "").toUpperCase();
  if (r.includes("SPARSE")) return "INSUFFICIENT HISTORY";
  if (r.includes("INSUFFICIENT")) return "INSUFFICIENT RECENT SAMPLE";
  if (r.includes("UNSUPPORTED")) return "LEAGUE HISTORY UNSUPPORTED";
  if (r.includes("FIXTURE_ONLY")) return "FIXTURE ONLY";
  if (r.includes("SOURCE_ABSENT")) return "SOURCE HAS NO MATCH";
  return reason ? String(reason).replaceAll("_", " ") : "NO DATA";
}

function ModelIntelCard({ code, title, values, state, stateReason, metrics = [], chips = [], source }) {
  const probs = hdaText(values);
  const available = Boolean(probs);
  return (
    <article className={"model-intel-card " + (available ? "model-intel-ready" : "model-intel-missing")}>
      <div className="model-intel-head">
        <div>
          <span>{code}</span>
          <h3>{title}</h3>
        </div>
        <b>{available ? (state || "AVAILABLE") : ""}</b>
      </div>
      {probs ? (
        <div className="model-hda-strip" style={{ display:"grid", gap:5 }}>
          <div style={{ display:"flex", height:11, overflow:"hidden", borderRadius:999, background:"#e9eeeb" }}>
            {[
              ["H", values.home, "#2f80ed"],
              ["D", values.draw, "#f2b134"],
              ["A", values.away, "#e05a5a"],
            ].map(([key, value, color]) => (
              <span
                key={key}
                title={key + " " + pct(value, 1)}
                style={{ width:(Math.max(0, Number(value) || 0) * 100) + "%", background:color }}
              />
            ))}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:5 }}>
            {[
              ["H", values.home, "#2f80ed"],
              ["D", values.draw, "#f2b134"],
              ["A", values.away, "#e05a5a"],
            ].map(([key, value, color], index) => (
              <div key={key} style={{ display:"flex", alignItems:"center", gap:4, justifyContent:index===0?"flex-start":index===2?"flex-end":"center" }}>
                <i style={{ width:7, height:7, borderRadius:2, background:color }} />
                <span>{key}</span><strong>{pct(value, 1)}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="model-empty-reason model-empty-slot"
          aria-label={modelStateLabel(false, stateReason)}
          style={{
            minHeight:72,
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            gap:4,
            padding:"10px 12px",
            borderRadius:10,
            background:"#f7f8f7",
            border:"1px dashed #dbe3de",
          }}
        >
          <strong style={{ color:"#66776e", fontSize:10 }}>{modelStateLabel(false, stateReason)}</strong>
          <small style={{ color:"#96a29b", fontSize:8.5, lineHeight:1.35 }}>
            No usable probability is available · unknown stays unknown
          </small>
        </div>
      )}
      {metrics.length ? (
        <div className="model-metric-grid">
          {metrics.map((m) => (
            <div key={m.label}><span>{m.label}</span><b>{m.value ?? "—"}</b></div>
          ))}
        </div>
      ) : null}
      {chips.length ? (
        <div className="model-source-chips">
          {chips.map((chip) => <span key={chip}>{chip}</span>)}
        </div>
      ) : null}
      {source ? <p className="model-source-note">{source}</p> : null}
    </article>
  );
}

function TeamFormCard({ title, name, detail }) {
  const recent = Array.isArray(detail?.recent) ? detail.recent.slice(0, 5) : [];
  const modelGames = Number(detail?.modelGames || 0);
  const venueGames = Number(detail?.venueGames || 0);
  const ppg = Number(detail?.ppg);
  const xg = Number(detail?.expectedGoals);
  const wins = Number(detail?.wins || 0);
  const draws = Number(detail?.draws || 0);
  const losses = Number(detail?.losses || 0);
  const gf = Number(detail?.goalsFor || 0);
  const ga = Number(detail?.goalsAgainst || 0);
  const points = recent.reduce((sum, row) => sum + (row.result === "W" ? 3 : row.result === "D" ? 1 : 0), 0);
  const momentum = recent.length ? Math.round((points / (recent.length * 3)) * 100) : null;
  const momentumLabel = momentum == null ? "NO HISTORY" : momentum >= 67 ? "HOT" : momentum >= 40 ? "STEADY" : "WEAK";
  const goalDiff = gf - ga;

  return (
    <div className="team-form-row">
      <div className="team-form-identity">
        <small>{title}</small>
        <strong>{name}</strong>
        <span className={"form-signal-label " + (momentum == null ? "" : momentum >= 67 ? "is-hot" : momentum >= 40 ? "is-steady" : "is-weak")}>{momentumLabel}</span>
      </div>

      <div className="team-form-sequence">
        {recent.length ? recent.map((row, index) => (
          <span
            className={"form-chip form-" + String(row.result || "D").toLowerCase()}
            key={String(row.kickoff || index) + "-" + index}
            title={(row.opponent || "Opponent") + " " + (row.gf ?? "—") + "-" + (row.ga ?? "—")}
          >
            {row.result || "—"}
          </span>
        )) : <small>NO HISTORY</small>}
      </div>

      <div className="team-form-metrics">
        <div><span>Form</span><b>{momentum == null ? "—" : momentum + "%"}</b></div>
        <div><span>W-D-L</span><b>{wins}-{draws}-{losses}</b></div>
        <div><span>PPG</span><b>{Number.isFinite(ppg) ? ppg.toFixed(2) : "—"}</b></div>
        <div><span>GF-GA</span><b>{gf}-{ga}</b></div>
        <div><span>xG</span><b>{Number.isFinite(xg) ? xg.toFixed(2) : "—"}</b></div>
        <div className={goalDiff > 0 ? "positive" : goalDiff < 0 ? "negative" : ""}><span>GD</span><b>{goalDiff > 0 ? "+" : ""}{goalDiff}</b></div>
      </div>

      <div className="team-form-sample">
        <span>MODEL {modelGames}</span>
        <span>VENUE {venueGames}</span>
      </div>

      {recent.length ? (
        <details className="form-match-details">
          <summary>Recent matches</summary>
          <div className="form-recent-list">
            {recent.map((row, index) => (
              <div className="form-recent-row" key={"recent-" + String(row.kickoff || index) + "-" + index}>
                <span className={"form-mini-result form-" + String(row.result || "D").toLowerCase()}>{row.result || "—"}</span>
                <span className="form-date">{formatFormDate(row.kickoff)}</span>
                <span className="form-venue">{row.venue === "H" ? "H" : row.venue === "A" ? "A" : "—"}</span>
                <b className="form-opponent">{row.opponent || "—"}</b>
                <strong>{row.gf ?? "—"}-{row.ga ?? "—"}</strong>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function readCachedMatch(id) {
  if (!id) return null;
  try {
    const raw = window.localStorage.getItem(`ft-match-${id}`) || window.sessionStorage.getItem(`ft-match-${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const sourceTime = parsed.liveNow
      ? (parsed.live?.fetchedAt || parsed.live?.score?.capturedAt || parsed.health?.hkjcFetchedAt)
      : parsed.health?.hkjcFetchedAt;
    const ageMinutes = sourceTime ? (Date.now() - new Date(sourceTime).getTime()) / 60000 : Infinity;
    const maxAge = parsed.liveNow ? 2 : 10;
    return Number.isFinite(ageMinutes) && ageMinutes <= maxAge ? parsed : null;
  } catch {
    return null;
  }
}

function matchFromDetailPayload(payload, matchId) {
  const fixture = payload?.fixture;
  if (!fixture) return null;
  const n = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const x = Number(value);
    return Number.isFinite(x) ? x : null;
  };
  const fixtureFetchedAt = fixture.fetched_at || fixture.updated_at || null;
  const priceObservedAt = fixture.odds_updated_at || fixtureFetchedAt || null;
  const fixtureAgeMinutes = fixtureFetchedAt ? (Date.now() - new Date(fixtureFetchedAt).getTime()) / 60000 : Infinity;
  const priceAgeMinutes = priceObservedAt ? (Date.now() - new Date(priceObservedAt).getTime()) / 60000 : Infinity;
  const kickoffMs = fixture.kickoff_hkt ? new Date(fixture.kickoff_hkt).getTime() : NaN;
  const kickoffStarted = Number.isFinite(kickoffMs) && kickoffMs <= Date.now() + 2 * 60 * 1000;
  const terminalStatus = ["FULLTIME","FINISHED","FT","ENDED","MATCHENDED","INPLAYMATCHENDED","AET","PEN","CANCELLED","CANCELED","VOID","ABANDONED"]
    .includes(String(fixture.status || "").toUpperCase().replace(/[\s_-]+/g, ""));
  const fixtureFreshness =
    terminalStatus || kickoffStarted || !Number.isFinite(priceAgeMinutes) || priceAgeMinutes > 360
      ? "STALE"
      : Number.isFinite(fixtureAgeMinutes) && fixtureAgeMinutes <= 90
        ? "FRESH"
        : Number.isFinite(fixtureAgeMinutes) && fixtureAgeMinutes <= 360
          ? "AGING"
          : "STALE";
  const allowCurrentPrice = fixtureFreshness === "FRESH";
  return {
    id: String(fixture.hkjc_event_id || matchId),
    kickoff: fixture.kickoff_hkt || null,
    status: fixture.status || null,
    oddsUpdatedAt: priceObservedAt,
    league: fixture.tournament || "",
    home: fixture.home_en || fixture.home_zh || "",
    away: fixture.away_en || fixture.away_zh || "",
    homeEn: fixture.home_en || null,
    awayEn: fixture.away_en || null,
    homeZh: fixture.home_zh || null,
    awayZh: fixture.away_zh || null,
    liveEligible: Boolean(fixture.live_eligible),
    selling: Boolean(fixture.selling),
    odds: {
      home: allowCurrentPrice ? n(fixture.had_home) : null,
      draw: allowCurrentPrice ? n(fixture.had_draw) : null,
      away: allowCurrentPrice ? n(fixture.had_away) : null,
    },
    goals: {
      line: fixture.hil_line || null,
      over: allowCurrentPrice ? n(fixture.hil_over) : null,
      under: allowCurrentPrice ? n(fixture.hil_under) : null,
    },
    corners: {
      line: fixture.chl_line || null,
      over: allowCurrentPrice ? n(fixture.chl_over) : null,
      under: allowCurrentPrice ? n(fixture.chl_under) : null,
    },
    handicap: {
      line: fixture.hdc_line || null,
      home: allowCurrentPrice ? n(fixture.hdc_home) : null,
      away: allowCurrentPrice ? n(fixture.hdc_away) : null,
    },
    health: {
      status: fixtureFreshness === "FRESH" ? "DETAIL_FALLBACK" : "DETAIL_FALLBACK_STALE",
      hkjcFreshness: fixtureFreshness,
      hkjcFetchedAt: fixtureFetchedAt,
      hkjcPriceChangedAt: priceObservedAt,
      hkjcPriceAgeMinutes: Number.isFinite(priceAgeMinutes) ? priceAgeMinutes : null,
      evidenceChannelCount: 0,
      unifiedCoverageStatus: "HKJC_ONLY",
    },
    updatedAt: fixtureFetchedAt,
  };
}

function mergeLiveMatch(base, payload, matchId) {
  if (!Array.isArray(payload?.matches)) return base;
  const live = payload.matches.find((row) => String(row.id) === String(matchId));

  if (live && !base) {
    return {
      ...live,
      odds: { home: null, draw: null, away: null },
      market: null,
      goals: { line: null, over: null, under: null },
      corners: { line: null, over: null, under: null },
      health: { hkjcFreshness: "LIVE", unifiedCoverageStatus: "HKJC_ONLY" },
      updatedAt: live.live?.fetchedAt || payload.generatedAt || null,
    };
  }

  if (!base) return base;

  if (live) {
    return {
      ...base,
      liveNow: true,
      inPlay: true,
      liveEligible: true,
      live: live.live,
      updatedAt: live.live?.fetchedAt || base.updatedAt,
    };
  }
  if (base.liveNow) {
    return { ...base, liveNow: false, inPlay: false, liveEligible: false, live: null };
  }
  return base;
}

export default function MatchDetailClient() {
  const [id, setId] = useState("");
  const [match, setMatch] = useState(null);
  const [source, setSource] = useState("LOADING");
  const [ready, setReady] = useState(false);
  const [deep, setDeep] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [story, setStory] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    const matchId = new URLSearchParams(window.location.search).get("id") || "";
    setId(matchId);
    setAnalysis(null);
    setStory(null);
    setDeep(null);

    if (!matchId) {
      setReady(true);
      return;
    }

    const cached = readCachedMatch(matchId);

    if (cached) {
      setMatch(cached);
      setSource("CACHE · loading latest");
      setReady(true);
    }

    let cancelled = false;
    let resolvedFresh = false;

    async function refreshMatch() {
      try {
        const res = await fetch(FEED_URL, { cache: "default" });
        if (!res.ok) return;
        const feed = await res.json();
        if (cancelled) return;
        const live = (feed.matches || []).find((m) => String(m.id) === String(matchId));
        if (live) {
          resolvedFresh = true;
          setMatch(live);
          setSource("SUPABASE · fresh");
          try {
            window.localStorage.setItem(`ft-match-${matchId}`, JSON.stringify(live));
            window.sessionStorage.setItem(`ft-match-${matchId}`, JSON.stringify(live));
          } catch {}
        }
      } catch {}
    }

    async function refreshDetail() {
      try {
        const res = await fetch(DETAIL_FEED_URL + "?id=" + encodeURIComponent(matchId), { cache: "default" });
        if (!res.ok) return;
        const payload = await res.json();
        if (cancelled || payload?.error) return;
        setDeep(payload);
        const fixtureFallback = matchFromDetailPayload(payload, matchId);
        if (fixtureFallback) {
          setMatch((previous) => {
            const fallbackStale = fixtureFallback?.health?.hkjcFreshness === "STALE";
            const previousKickoff = previous?.kickoff ? new Date(previous.kickoff).getTime() : NaN;
            const previousStarted = Number.isFinite(previousKickoff) && previousKickoff <= Date.now() + 2 * 60 * 1000;
            // A stale/terminal authoritative detail snapshot must be allowed to
            // replace a cached prematch card so historical odds cannot survive
            // merely because local storage had an older "fresh" representation.
            if (fallbackStale || previousStarted) return fixtureFallback;
            return previous || fixtureFallback;
          });
          if (!resolvedFresh) setSource("SUPABASE DETAIL · fixture fallback");
          resolvedFresh = true;
        }
      } catch {}
    }

    async function refreshAnalysis() {
      try {
        const res = await fetch(ANALYSIS_FEED_URL + "?id=" + encodeURIComponent(matchId), { cache: "default" });
        if (!res.ok) return;
        const payload = await res.json();
        if (cancelled || payload?.error) return;
        setAnalysis(payload);
      } catch {}
    }

    async function refreshStory() {
      try {
        const res = await fetch(
          STORY_FEED_URL + "?id=" + encodeURIComponent(matchId) + "&lang=en&style=professional",
          { cache: "default" }
        );
        if (!res.ok) return;
        const payload = await res.json();
        if (cancelled || payload?.error) return;
        setStory(payload);
      } catch {}
    }

    async function refreshLive() {
      try {
        const res = await fetch(LIVE_FEED_URL + "?_=" + Date.now(), { cache: "no-store" });
        if (!res.ok) return;
        const payload = await res.json();
        if (cancelled || !Array.isArray(payload?.matches)) return;
        const hasLive = payload.matches.some((row) => String(row.id) === String(matchId));
        if (hasLive) resolvedFresh = true;
        setMatch((previous) => {
          const merged = mergeLiveMatch(previous, payload, matchId);
          if (merged !== previous && merged) {
            try {
              window.localStorage.setItem(`ft-match-${matchId}`, JSON.stringify(merged));
              window.sessionStorage.setItem(`ft-match-${matchId}`, JSON.stringify(merged));
            } catch {}
          }
          return merged;
        });
        if (hasLive) setSource("SUPABASE LIVE · ≤1m source");
      } catch {}
    }

    Promise.allSettled([refreshMatch(), refreshLive(), refreshDetail()]).then(() => {
      if (cancelled) return;
      if (!resolvedFresh && cached) {
        setMatch(cached);
        setSource("FALLBACK CACHE");
      }
      setReady(true);
    });

    const deferredNarrative = window.setTimeout(() => {
      if (!cancelled && document.visibilityState === "visible") {
        refreshAnalysis();
        refreshStory();
      }
    }, 600);

    const fullTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshMatch();
        refreshDetail();
      }
    }, 60000);
    const narrativeTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshAnalysis();
        refreshStory();
      }
    }, 300000);
    const liveTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshLive();
    }, 10000);

    const refreshVisible = () => {
      if (document.visibilityState === "visible") {
        refreshLive();
        refreshMatch();
        refreshDetail();
      }
    };
    const refreshPageShow = () => {
      refreshLive();
      refreshMatch();
      refreshDetail();
    };
    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("pageshow", refreshPageShow);

    return () => {
      cancelled = true;
      window.clearTimeout(deferredNarrative);
      window.clearInterval(fullTimer);
      window.clearInterval(narrativeTimer);
      window.clearInterval(liveTimer);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("pageshow", refreshPageShow);
    };
  }, [refreshNonce]);

  if (!id && ready) {
    return (
      <main className="shell detail-shell">
        <div className="detail-top"><a href="/" className="back">← Back to matches</a></div>
        <section className="panel"><h2>No match selected</h2><p className="fineprint">Open a fixture from the match board.</p></section>
      </main>
    );
  }

  if (!match && !ready) {
    return (
      <main className="shell detail-shell">
        <div className="detail-top"><a href="/" className="back">← Back to matches</a><span>{id}</span></div>
        <section className="panel"><p className="fineprint">Loading match data…</p></section>
      </main>
    );
  }

  if (!match) {
    return (
      <main className="shell detail-shell">
        <div className="detail-top"><a href="/" className="back">← Back to matches</a><span>{id}</span></div>
        <section className="panel">
          <div className="panel-title"><div><p>MATCH</p><h2>Match data is currently unavailable</h2></div></div>
          <p className="fineprint">This route is available, but the current data source has not supplied this match. Return to the match list to choose another fixture.</p>
        </section>
      </main>
    );
  }

  const market = match.market || fairMarket(match.odds);
  const gap = divergence(match);
  const zhTitle = match.homeZh && match.awayZh ? `${match.homeZh} vs ${match.awayZh}` : null;
  const fresh = freshness(match);
  const evidenceCount = match.health?.evidenceChannelCount ?? modelCoverageCount(match);
  const detailAgreement = modelAgreement(match);
  const detailPriority = reviewPriority(match);
  const missingReason = match.health?.primaryMissingReason || match.health?.forebetReason || null;
  const sourceContext = match.sourceContext || null;
  const sourceContextConfidence = Number(sourceContext?.matchConfidence);
  const sourceContextVerified = sourceContext && Number.isFinite(sourceContextConfidence) && sourceContextConfidence >= 0.94;
  const predictedScore = match.forebetDetail?.predictedScore || match.forebet?.predictedScore || null;
  const movement = match.oddsMovement || null;
  const movementPct = Number(movement?.rawOddsChangePct);
  const hasMovement = movement && Number.isFinite(movementPct);
  const movementMagnitude = hasMovement ? Math.min(100, Math.max(6, Math.abs(movementPct) * 5)) : 0;
  const movementDirection = !hasMovement ? "FLAT" : movementPct < 0 ? "SHORTENING" : movementPct > 0 ? "DRIFTING" : "FLAT";
  const movementDirectionZh = movementDirection === "SHORTENING" ? "Shortening" : movementDirection === "DRIFTING" ? "Drifting" : "Stable";
  const liveScore = match.live?.score || {};
  const liveScoreText = liveScore.text || (
    Number.isFinite(Number(liveScore.home)) && Number.isFinite(Number(liveScore.away))
      ? `${liveScore.home}-${liveScore.away}`
      : "—"
  );
  const liveMinute = Number.isFinite(Number(liveScore.minute)) ? `${liveScore.minute}'` : (liveScore.status || match.live?.status || "LIVE");
  const liveCornerTotal = Number(liveScore.totalCorners);
  const liveCornerLine = Number(match.live?.corners?.line);
  const liveCornerProgress = Number.isFinite(liveCornerTotal) && Number.isFinite(liveCornerLine)
    ? (() => {
        const target = Math.floor(liveCornerLine) + 1;
        const need = Math.max(0, target - liveCornerTotal);
        return need === 0 ? `${liveCornerTotal}/${liveCornerLine} · over line reached` : `${liveCornerTotal}/${liveCornerLine} · ${need} needed`;
      })()
    : "—";
  const liveStats = match.live?.stats || null;
  const shadow = match.live?.shadow || null;
  const liveControlSide = shadow?.actualSide || visualControlSide(liveStats);
  const liveControlLabel = controlSideLabel(match, liveControlSide);
  const liveSignalRows = liveStats ? [
    { key: "xg", label: "xG", pair: liveStats.xg, digits: 2 },
    { key: "sot", label: "Shots on target", pair: liveStats.shotsOnTarget, digits: 0 },
    { key: "shots", label: "Shots", pair: liveStats.shots, digits: 0 },
    { key: "box", label: "Box touches", pair: liveStats.boxTouches, digits: 0 },
    { key: "possession", label: "Possession", pair: liveStats.possession, digits: 0, suffix: "%" },
    { key: "corners", label: "Corners", pair: liveStats.corners, digits: 0 },
  ].map((row) => ({ ...row, share: pairShare(row.pair) })).filter((row) => row.share) : [];
  const liveLanes = match.live ? (() => {
    const statsLane = liveLaneStatus(liveStats?.capturedAt, 180, 600);
    const detailStatus = String(match.live?.detail?.detailStatus || liveStats?.detailStatus || "").toUpperCase();
    if (!Number.isFinite(statsLane.age)) {
      if (detailStatus === "NOT_APPLICABLE" || (!detailStatus && liveScore.source === "HKJC_RUNNING_RESULT")) {
        Object.assign(statsLane, { state: "unavailable", label: "score-only" });
      }
      else if (detailStatus === "DEFERRED_RATE_GUARD") Object.assign(statsLane, { state: "warn", label: "rate-limit" });
      else if (detailStatus === "DETAIL_EMPTY") Object.assign(statsLane, { state: "warn", label: "empty" });
    } else if (detailStatus === "DEFERRED_RATE_GUARD" && statsLane.state === "fresh") {
      Object.assign(statsLane, { state: "warn", label: statsLane.label + " · guard" });
    }
    return {
      odds: liveLaneStatus(match.live.fetchedAt || match.live.oddsUpdatedAt, 90, 180),
      score: liveLaneStatus(liveScore.capturedAt || liveScore.sourceUpdatedAt, 90, 180),
      stats: statsLane,
      shadow: liveLaneStatus(shadow?.capturedAt, 180, 600),
    };
  })() : null;
  const liveBottleneck = liveLanes
    ? Object.entries(liveLanes)
        .filter(([, lane]) => Number.isFinite(lane.age))
        .sort((a, b) => b[1].age - a[1].age)[0] || null
    : null;
  const goalsCompare = lineComparisonStatus(match, "goals");
  const cornersCompare = lineComparisonStatus(match, "corners");
  const goalsLineModel = match.forebetDetail?.goalsCurrentLine || null;
  const cornersLineModel = match.forebetDetail?.cornersCurrentLine || null;
  const totalsAdvice = story?.marketAdvice || analysis?.marketAdvice || {};
  const directHandicapAdvice = match.handicapAdvice || null;
  const handicapAdvice = totalsAdvice.handicap || (directHandicapAdvice ? {
    selection: directHandicapAdvice.selection,
    selectionLabel: directHandicapAdvice.selection === "HOME"
      ? (match.home || match.homeEn || match.homeZh || "Home") + " " + (match.handicap?.line || "")
      : directHandicapAdvice.selection === "AWAY"
        ? (match.away || match.awayEn || match.awayZh || "Away") + " " + (match.handicap?.line || "")
        : "—",
    currentOdds: directHandicapAdvice.odds,
    expectedValuePct: directHandicapAdvice.edgePct,
    action: directHandicapAdvice.status,
    method: directHandicapAdvice.method,
    explanation: directHandicapAdvice.explanation,
  } : null);
  const goalsAdvice = totalsAdvice.goals || null;
  const cornersAdvice = totalsAdvice.corners || null;
  const totalAdviceTone = (row) => {
    const action = String(row?.action || "").toUpperCase();
    if (action === "PASS" || action === "NO_BET") return "pass";
    if (String(row?.candidateClass || "").toUpperCase().includes("VALUE")) return "value";
    return "watch";
  };
  const totalAdviceEdge = (row) => row?.expectedValuePct != null && Number.isFinite(Number(row.expectedValuePct))
    ? `EV ${Number(row.expectedValuePct) >= 0 ? "+" : ""}${Number(row.expectedValuePct).toFixed(1)}%`
    : row?.candidateEdgePp == null
      ? "EV —"
      : `Probability gap ${Number(row.candidateEdgePp) >= 0 ? "+" : ""}${Number(row.candidateEdgePp).toFixed(1)}pp`;
  const totalAdviceLabel = (row) => {
    if (!row) return "ANALYSING";
    if (String(row.action || "").toUpperCase() === "NO_BET") return "NO BET";
    if (String(row.action || "").toUpperCase() === "PASS") return row.candidateClass === "NO_MODEL" ? "NO MODEL · PASS" : "PASS";
    return row.selectionLabel || "WATCH";
  };

  const coreModelRows = CORE_MODEL_DEFS.map((model) => {
    const values = coreModelValues(match, model.key, market);
    return { ...model, values, hasData: probabilityAvailable(values) };
  });
  const coreModelDataCount = coreModelRows.filter((row) => row.hasData).length;
  const multisourceNames = new Set(
    (match.multi?.sourceNames || []).map((name) => String(name).trim().toUpperCase()).filter(Boolean)
  );
  const multisourceRows = MULTISOURCE_MODEL_DEFS.map((key) => ({
    key,
    hasData: multisourceNames.has(key),
  }));
  const multisourceDataCount = multisourceRows.filter((row) => row.hasData).length;

  const h2h = deep?.h2h || deep?.headToHead || null;
  const h2hMeetings = Array.isArray(h2h?.meetings) ? h2h.meetings.slice(0, 5) : [];
  const h2hGames = Number(h2h?.h2h_games || 0);
  const h2hHomeWins = Number(h2h?.home_wins || 0);
  const h2hDraws = Number(h2h?.draws || 0);
  const h2hAwayWins = Number(h2h?.away_wins || 0);
  const h2hHomeGoals = Number(h2h?.home_goals || 0);
  const h2hAwayGoals = Number(h2h?.away_goals || 0);
  const h2hAvgGoals = h2h?.avg_total_goals == null ? null : Number(h2h.avg_total_goals);
  const h2hQuality = String(h2h?.quality || "");
  const deepModels = deep?.models || {};
  const internalDeep = deepModels.internal || {};
  const forebetDeep = deepModels.forebet || {};
  const formDeep = deepModels.form || {};
  const optaDeep = deepModels.opta || match.power || {};
  const multiDeep = deepModels.multisource || {};
  const dcDetail = match.dcDetail || {
    quality: internalDeep.quality,
    source: internalDeep.model_source,
    league: internalDeep.model_league,
    trainingMatches: internalDeep.training_matches,
    teamMatchQuality: internalDeep.team_match_quality,
    probabilities: {
      home: internalDeep.dc_prob_home,
      draw: internalDeep.dc_prob_draw,
      away: internalDeep.dc_prob_away,
    },
    expectedGoals: { home: internalDeep.dc_xg_home, away: internalDeep.dc_xg_away },
    over25: internalDeep.dc_prob_over25,
    available: internalDeep.quality === "MODELED" && internalDeep.dc_prob_home != null,
    missingReason: internalDeep.quality,
  };
  const piDetail = match.piDetail || {
    quality: internalDeep.quality,
    source: internalDeep.model_source,
    league: internalDeep.model_league,
    trainingMatches: internalDeep.training_matches,
    teamMatchQuality: internalDeep.team_match_quality,
    probabilities: {
      home: internalDeep.pi_prob_home,
      draw: internalDeep.pi_prob_draw,
      away: internalDeep.pi_prob_away,
    },
    ratings: {
      home: internalDeep.pi_home_rating,
      away: internalDeep.pi_away_rating,
      difference: internalDeep.pi_diff,
    },
    available: internalDeep.quality === "MODELED" && internalDeep.pi_prob_home != null,
    missingReason: internalDeep.quality,
  };
  const humanSummary = deep?.humanFactors?.summary || null;
  const eventMap = deep?.humanFactors?.eventMap || null;
  const playerStatusEvidence = Array.isArray(deep?.humanFactors?.playerStatus) ? deep.humanFactors.playerStatus : [];
  const lineupEvidence = Array.isArray(deep?.humanFactors?.lineup) ? deep.humanFactors.lineup : [];
  const managerEvidence = Array.isArray(deep?.humanFactors?.managers) ? deep.humanFactors.managers : [];
  const scenarioRows = Array.isArray(deep?.scenario) ? deep.scenario : [];
  const confirmedPlayerStatusEvidence = playerStatusEvidence.filter((r) => r.fact_status === "CONFIRMED");
  const unresolvedPlayerStatusEvidence = playerStatusEvidence.filter((r) => r.fact_status !== "CONFIRMED");
  const confirmedLineupEvidence = lineupEvidence.filter((r) => r.fact_status === "CONFIRMED");
  const unresolvedLineupIdentity = lineupEvidence.filter((r) => r.fact_status === "SOURCE_CONFIRMED_IDENTITY_UNRESOLVED");
  const homeStarters = confirmedLineupEvidence.filter((r) => normalizedSide(r.team_side) === "H" && r.starter).map((r) => r.player_name).filter(Boolean);
  const awayStarters = confirmedLineupEvidence.filter((r) => normalizedSide(r.team_side) === "A" && r.starter).map((r) => r.player_name).filter(Boolean);
  const humanQuality = humanSummary?.quality || (eventMap ? "MAPPED" : "NO DATA");
  const injuriesHome = confirmedPlayerStatusEvidence.length
    ? confirmedPlayerStatusEvidence.filter((r) => normalizedSide(r.team_side) === "H").length
    : null;
  const injuriesAway = confirmedPlayerStatusEvidence.length
    ? confirmedPlayerStatusEvidence.filter((r) => normalizedSide(r.team_side) === "A").length
    : null;
  const sourceLineupConfirmed = Boolean(eventMap?.lineup_confirmed_at);
  const lineupConfirmed = sourceLineupConfirmed && confirmedLineupEvidence.length > 0 && unresolvedLineupIdentity.length === 0;
  const lineupState = lineupConfirmed ? "CONFIRMED"
    : sourceLineupConfirmed ? "IDENTITY_PARTIAL"
      : eventMap ? "PENDING" : "UNMAPPED";
  const injuryMax = Math.max(Number(injuriesHome) || 0, Number(injuriesAway) || 0, 1);
  const injuryGap = (Number(injuriesHome) || 0) - (Number(injuriesAway) || 0);
  const injurySignal = injuriesHome == null && injuriesAway == null
    ? "Identity must resolve before injury evidence is counted"
    : injuryGap === 0
      ? "Confirmed absences are balanced"
      : injuryGap > 0
        ? `Home has ${Math.abs(injuryGap)} more confirmed absence record${Math.abs(injuryGap) === 1 ? "" : "s"}`
         : `Away has ${Math.abs(injuryGap)} more confirmed absence record${Math.abs(injuryGap) === 1 ? "" : "s"}`;
  const multiSources = match.multi?.sourceNames || multiDeep.sources_consensus || multiDeep.sources_total || [];
  const modelCardsAvailable = [match.forebet, match.dc, match.pi, match.form, match.multi].filter(probabilityAvailable).length;
  const optaData = optaDeep && Object.keys(optaDeep).length ? optaDeep : (match.power || {});
  const optaHasAny = optaData.home_rating != null || optaData.away_rating != null || optaData.home != null || optaData.away != null;
  const optaHomeRating = optaData.home_rating ?? optaData.home;
  const optaAwayRating = optaData.away_rating ?? optaData.away;
  const optaHomeRank = optaData.home_rank ?? optaData.homeRank;
  const optaAwayRank = optaData.away_rank ?? optaData.awayRank;
  const optaCoverage = optaData.coverage || (optaHasAny ? "PARTIAL" : "NONE");

  const analysisDecision = analysis?.decision || null;
  const primarySide = analysisDecision?.selection || gap?.key || null;
  const primaryEdgePp = analysisDecision?.candidateEdgePp != null
    ? Number(analysisDecision.candidateEdgePp)
    : gap?.value != null ? Number(gap.value) * 100 : null;
  const primaryExpectedValuePct = analysisDecision?.expectedValuePct != null
    ? Number(analysisDecision.expectedValuePct)
    : null;
  const analysisSourceMode = String(
    story?.governance?.sourceMode
      || analysis?.governance?.sourceMode
      || analysis?.evidence?.phase1Health?.sourceMode
      || "UNKNOWN"
  ).toUpperCase();
  const oddsStatus = String(
    story?.bettingAdvice?.oddsStatus
      || analysisDecision?.oddsStatus
      || (analysisSourceMode.includes("FALLBACK") ? "REFERENCE_STALE" : "CURRENT")
  ).toUpperCase();
  const referencePriceOnly = oddsStatus === "REFERENCE_STALE" || analysisSourceMode.includes("FALLBACK");
  const referenceOddsRaw = story?.bettingAdvice?.referenceOdds ?? analysisDecision?.referenceOdds ?? null;
  const referenceOdds = referenceOddsRaw == null ? null : Number(referenceOddsRaw);
  const primaryOdds = referencePriceOnly
    ? null
    : analysisDecision?.currentOdds != null
      ? Number(analysisDecision.currentOdds)
      : primarySide === "H" ? Number(match.odds?.home)
        : primarySide === "D" ? Number(match.odds?.draw)
          : primarySide === "A" ? Number(match.odds?.away)
            : null;
  const primaryModelSource = match.multi || match.forebet || match.dc || match.pi || match.form || null;
  const primaryModelProbability = analysisDecision?.analystConsensusProbability != null
    ? Number(analysisDecision.analystConsensusProbability)
    : primarySide === "H" ? Number(primaryModelSource?.home)
      : primarySide === "D" ? Number(primaryModelSource?.draw)
        : primarySide === "A" ? Number(primaryModelSource?.away)
          : null;
  const primaryMarketProbability = analysisDecision?.marketFairProbability != null
    ? Number(analysisDecision.marketFairProbability)
    : primarySide === "H" ? Number(market?.home)
      : primarySide === "D" ? Number(market?.draw)
        : primarySide === "A" ? Number(market?.away)
          : null;
  const primarySelectionLabel = analysisDecision?.selectionLabel
    || (primarySide ? sideName(match, primarySide) : "No clear market position");
  const rawAction = String(analysisDecision?.action || (primaryEdgePp != null && primaryEdgePp >= 2.5 ? "WATCH" : "PASS")).toUpperCase();
  const actionLabel = rawAction === "NO_BET" ? "NO BET"
    : rawAction === "PASS" ? "PASS"
      : rawAction.includes("STRONG") ? "Strong edge candidate"
        : rawAction.includes("VALUE") ? "Value candidate"
          : rawAction.includes("LEAN") ? "Lean"
            : "Watch";
  const actionTone = rawAction === "NO_BET" || rawAction === "PASS" ? "pass"
    : rawAction.includes("STRONG") || rawAction.includes("VALUE") ? "value"
      : "watch";
  const decisionCleared = !["NO_BET", "PASS"].includes(rawAction);
  // Keep the original recommendation visible even when governance/data gates
  // downgrade execution. A gate is a warning, not a reason to erase the pick.
  const pickLabel = "PRIMARY MARKET";
  const gapLabel = referencePriceOnly ? "REFERENCE GAP" : Number.isFinite(primaryExpectedValuePct) ? "Current EV" : "MODEL EDGE";
  const gateLabel = rawAction === "NO_BET" ? "Decision gate blocked"
    : rawAction === "PASS" ? "No current bet required"
      : rawAction.includes("WATCH") ? "Watch"
        : "Candidate formed";
  const gateDetail = story?.invalidators?.length
    ? story.invalidators.slice(0, 3).join(" · ")
    : analysis?.invalidators?.length
      ? analysis.invalidators.slice(0, 3).join(" · ")
      : decisionCleared ? "No major data-risk flag is active" : "Waiting for more verifiable evidence";
  const rawBlockers = Array.isArray(story?.invalidators) && story.invalidators.length
    ? story.invalidators
    : Array.isArray(analysis?.invalidators) ? analysis.invalidators : [];
  const blockerTags = rawBlockers.slice(0, 5).map((item) => {
    const t = String(item || "");
    if (/fallback/i.test(t)) return "Non-canonical feed";
    if (/不新鮮|stale|freshness/i.test(t)) return "Market price not fresh enough";
    if (/evidence family|獨立 evidence/i.test(t)) return "Insufficient independent model evidence";
    if (/XI|lineup/i.test(t)) return "Lineup not confirmed";
    if (/Phase 5|calibration/i.test(t)) return "Calibration gate not passed";
    if (/health/i.test(t)) return "Data-health gate not passed";
    return t.length > 18 ? t.slice(0, 18) + "…" : t;
  });
  const fallbackAdvice = primarySide && (primaryExpectedValuePct != null || primaryEdgePp != null)
    ? `${primarySelectionLabel} @ ${Number.isFinite(primaryOdds) ? primaryOdds.toFixed(2) : "—"} · ${Number.isFinite(primaryExpectedValuePct) ? "EV " + (primaryExpectedValuePct >= 0 ? "+" : "") + primaryExpectedValuePct.toFixed(1) + "%" : "Probability gap " + (primaryEdgePp >= 0 ? "+" : "") + primaryEdgePp.toFixed(1) + "pp"}`
    : "There is not enough verified evidence for a clear market position.";
  const bettingAdvice = story?.bettingAdvice?.thesis || analysis?.story?.advice || fallbackAdvice;
  const storyMode = story?.engine?.mode || null;
  const storyContent = story?.story || null;
  const matchScript = story?.matchScript || null;
  const commentaryRows = Array.isArray(story?.commentary) ? story.commentary.slice(0, 4) : [];
  const editorialAlignment = story?.editorialAlignment || null;
  const editorialAlignmentRows = Array.isArray(editorialAlignment?.rows) ? editorialAlignment.rows : [];
  const commentaryUiRows = commentaryRows.map((row) => ({
    ...row,
    alignments: editorialAlignmentRows.filter((signal) => signal.source === row.source),
  }));
  const editorialSignalLabel = (signal) => {
    const market = signal.market === "GOALS_OU" ? "Goals" : signal.market === "CORNERS_OU" ? "Corners" : "HDA";
    const selection = signal.editorialSelection === "OVER" ? "Over"
      : signal.editorialSelection === "UNDER" ? "Under"
        : signal.editorialSelection === "H" ? "Home"
          : signal.editorialSelection === "D" ? "Draw"
            : signal.editorialSelection === "A" ? "Away"
              : signal.editorialSelection || "—";
    const line = signal.editorialLine == null ? "" : " " + signal.editorialLine;
    return market + " " + selection + line;
  };
  const editorialStatusLabel = (status) => status === "SUPPORT" ? "Supports model"
    : status === "CONTRADICT" ? "Contradicts model"
      : status === "DIFFERENT_LINE" ? "Different line"
        : "Context";
  const storyEvidence = story?.evidenceSummary || {};
  const storyEvidenceTags = [
    storyEvidence.forebet ? "Forebet" : null,
    storyEvidence.internalModels ? "Internal" : null,
    storyEvidence.teamForm ? "Team Form" : null,
    storyEvidence.optaStrength ? "Opta" : null,
    Number(storyEvidence.humanFactorRows || 0) > 0 ? "Human Factors" : null,
    Number(storyEvidence.scenarioRows || 0) > 0 ? "Scenario" : null,
    Number(storyEvidence.commentaryRows || 0) > 0 ? "Commentary" : null,
  ].filter(Boolean);
  const sourceModeLabel = analysisSourceMode.includes("FALLBACK") ? "DB FALLBACK" : analysisSourceMode.includes("CANONICAL") ? "CANONICAL FEED" : "SOURCE CHECK";
  const priceStatusLabel = referencePriceOnly ? "REFERENCE ONLY" : "CURRENT";
  const sideRows = [
    { key: "H", label: match.home || match.homeEn || match.homeZh || "Home", odds: referencePriceOnly ? null : match.odds?.home, fair: market?.home },
    { key: "D", label: "Draw", odds: referencePriceOnly ? null : match.odds?.draw, fair: market?.draw },
    { key: "A", label: match.away || match.awayEn || match.awayZh || "Away", odds: referencePriceOnly ? null : match.odds?.away, fair: market?.away },
  ];

  const recommendationRows = [
    {
      key: "HDA",
      market: "HDA",
      selection: primarySelectionLabel,
      odds: Number.isFinite(primaryOdds) ? primaryOdds : null,
      edgePp: Number.isFinite(primaryEdgePp) ? primaryEdgePp : null,
      expectedValuePct: Number.isFinite(primaryExpectedValuePct) ? primaryExpectedValuePct : null,
      action: rawAction,
      note: referencePriceOnly ? "REFERENCE PRICE" : "Primary HDA",
      available: Boolean(primarySide),
    },
    {
      key: "HANDICAP",
      market: "Asian handicap",
      selection: handicapAdvice?.selectionLabel || "—",
      odds: handicapAdvice?.currentOdds == null ? null : Number(handicapAdvice.currentOdds),
      edgePp: null,
      expectedValuePct: handicapAdvice?.expectedValuePct == null ? null : Number(handicapAdvice.expectedValuePct),
      action: String(handicapAdvice?.action || "WATCH").toUpperCase(),
      note: handicapAdvice?.method === "MODEL_DERIVED_SCORE_DISTRIBUTION" ? "Model-derived EV" : "Handicap",
      available: Boolean(handicapAdvice?.selection),
    },
    {
      key: "GOALS",
      market: "Goals O/U",
      selection: totalAdviceLabel(goalsAdvice),
      odds: goalsAdvice?.currentOdds == null ? null : Number(goalsAdvice.currentOdds),
      edgePp: goalsAdvice?.candidateEdgePp == null ? null : Number(goalsAdvice.candidateEdgePp),
      expectedValuePct: goalsAdvice?.expectedValuePct == null ? null : Number(goalsAdvice.expectedValuePct),
      action: String(goalsAdvice?.action || "WATCH").toUpperCase(),
      note: goalsAdvice?.oddsStatus === "REFERENCE_STALE" ? "MODEL / REF" : "Secondary",
      available: Boolean(goalsAdvice?.selection),
    },
    {
      key: "CORNERS",
      market: "Corners O/U",
      selection: totalAdviceLabel(cornersAdvice),
      odds: cornersAdvice?.currentOdds == null ? null : Number(cornersAdvice.currentOdds),
      edgePp: cornersAdvice?.candidateEdgePp == null ? null : Number(cornersAdvice.candidateEdgePp),
      expectedValuePct: cornersAdvice?.expectedValuePct == null ? null : Number(cornersAdvice.expectedValuePct),
      action: String(cornersAdvice?.action || "WATCH").toUpperCase(),
      note: cornersAdvice?.oddsStatus === "REFERENCE_STALE" ? "MODEL / REF" : "Alternative",
      available: Boolean(cornersAdvice?.selection),
    },
  ].filter((row) => row.available);

  const marketIntel = deep?.marketIntelligence || {};
  const phase4Values = Array.isArray(marketIntel.value) ? marketIntel.value : [];
  const phase4Arbs = Array.isArray(marketIntel.arbitrage) ? marketIntel.arbitrage : [];
  const bestValue = marketIntel.bestValue || phase4Values[0] || null;
  const phase4SelectionLabel = (selection) => {
    if (selection === "HOME") return match.home || match.homeEn || match.homeZh || "Home";
    if (selection === "DRAW") return "Draw";
    if (selection === "AWAY") return match.away || match.awayEn || match.awayZh || "Away";
    return selection || "—";
  };
  const phase4Sources = Number(bestValue?.model_source_count || 0);
  const phase4Coverage = phase4Sources >= 3 ? "MULTI-SOURCE"
    : phase4Sources === 2 ? "2 SOURCES"
      : phase4Sources === 1 ? "LOW COVERAGE · 1 SOURCE"
        : "NO MODEL";
  const phase4Ev = Number(bestValue?.expected_roi_pct);
  const phase4Edge = Number(bestValue?.probability_edge_pct);
  const phase4QuoteAge = Number(bestValue?.quote_age_seconds);
  const phase4BackendStatus = String(bestValue?.status || "").toUpperCase();
  const phase4Fresh = bestValue ? phase4BackendStatus !== "STALE" : false;
  const phase4Status = bestValue
    ? (!phase4Fresh ? "STALE QUOTE" : phase4Sources < 2 ? "WATCH · LOW COVERAGE" : phase4BackendStatus || "WATCH")
    : "NO VALUE SIGNAL";
  const nearArb = marketIntel.nearArbitrage || null;
  const nearArbInverse = Number(nearArb?.inverse_sum);
  const nearArbGross = Number(nearArb?.gross_roi_pct);
  const nearArbDistance = Number(nearArb?.distance_to_arb_pct);
  const nearArbStatus = String(nearArb?.status || "NO WATCH").replaceAll("_", " ");
  const nearArbBestLegs = [
    nearArb?.best_home_provider ? `${nearArb.best_home_provider} H @ ${formatOdds(nearArb.best_home_odds)}` : null,
    nearArb?.best_draw_provider ? `${nearArb.best_draw_provider} D @ ${formatOdds(nearArb.best_draw_odds)}` : null,
    nearArb?.best_away_provider ? `${nearArb.best_away_provider} A @ ${formatOdds(nearArb.best_away_odds)}` : null,
  ].filter(Boolean);

  return (
    <main className="shell detail-shell">
      <div className="detail-top">
        <a href="/" className="back">← Back to matches</a>
        <span className="detail-top-updated">Updated {formatUpdated(match.updatedAt)}</span>
        <button type="button" className="back" onClick={() => {
          setReady(false);
          setSource("REFRESHING");
          setRefreshNonce((n) => n + 1);
        }}>↻ Refresh</button>
      </div>

      <section className="detail-board-hero">
        <div className="detail-board-meta">
          <span>{formatKickoff(match.kickoff)}</span>
          <b>{leagueDisplayName(match.leagueZh || match.league)}</b>
          <small>{match.id}</small>
          <span className={"detail-board-fresh detail-board-fresh-" + fresh.key}>{fresh.label}</span>
        </div>

        <div className="detail-board-fixture">
          <div className="detail-board-team">
            <strong>{match.homeZh || match.home}</strong>
            {match.homeEn && match.homeZh ? <small>{match.homeEn}</small> : null}
          </div>
          <span className="detail-board-vs">VS</span>
          <div className="detail-board-team away">
            <strong>{match.awayZh || match.away}</strong>
            {match.awayEn && match.awayZh ? <small>{match.awayEn}</small> : null}
          </div>
          {predictedScore ? <div className="detail-board-score"><span>FOREBET</span><b>{predictedScore}</b></div> : null}
        </div>

        <div className="detail-board-status">
          {detailAgreement.key !== "limited" ? <span className={"detail-status-chip detail-status-" + detailAgreement.key}>{detailAgreement.label}</span> : null}
          <span className={"detail-status-chip detail-review-" + detailPriority.band}>R {detailPriority.score}</span>
          <span className="detail-status-chip">{evidenceCount} inputs</span>
          <span className="detail-status-source">{source}</span>
        </div>
      </section>

      {(sourceContextVerified || evidenceCount === 0) ? (
        <section
          className="panel"
          style={{
            marginTop:10,
            padding:"12px 14px",
            borderColor:sourceContextVerified ? "#d7e4ed" : "#eadfca",
            background:sourceContextVerified ? "#f7fafc" : "#fffaf2",
          }}
        >
          <div className="panel-title" style={{ marginBottom:6 }}>
            <div>
              <p>{sourceContextVerified ? "EXTERNAL CONTEXT" : "DATA GAP"}</p>
              <h2 style={{ fontSize:15 }}>
                {sourceContextVerified
                  ? `${sourceContext.source || "External"} verified this fixture`
                   : "Fixture link is valid, but usable model evidence is not currently available"}
              </h2>
            </div>
            <span>
              {sourceContextVerified ? Math.round(sourceContextConfidence * 100) + "% MATCH" : "NO MODEL"}
            </span>
          </div>
          {sourceContextVerified ? (
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", fontSize:9, fontWeight:850, color:"#587080" }}>
              <span>{sourceContext.identityStatus || "MATCHED"}</span>
              {sourceContext.detailAvailable ? <b>DETAIL ✓</b> : <span>DETAIL —</span>}
              {sourceContext.lineupAvailable ? <b>LINEUP ✓</b> : <span>LINEUP —</span>}
              {sourceContext.statsAvailable ? <b>STATS ✓</b> : <span>STATS —</span>}
              {sourceContext.xgAvailable ? <b>xG ✓</b> : <span>xG —</span>}
            </div>
          ) : null}
          <p className="fineprint" style={{ margin:"7px 0 0" }}>
            {sourceContextVerified
              ? "This layer confirms fixture, lineup and context coverage only; it does not alter model probabilities, HKJC fair probability or edge."
               : "The route is healthy but data coverage is incomplete; missing model evidence is not filled with invented values."}
          </p>
        </section>
      ) : null}

      <section className={`detail-decision-board betting-command-${actionTone}`}>
        <div className="detail-decision-head">
          <div>
            <span>QUANT BETTING VIEW</span>
            <h2>Market decision · {actionLabel}</h2>
          </div>
          <b>{storyMode === "AI_GROUNDED" || storyMode === "AI_GROUNDED_RETRY" ? "AI GROUNDED" : story ? "STORY READY" : analysis ? "INTERPRETER READY" : "PHASE 1"}</b>
        </div>

        <div className="detail-decision-grid">
          <div className="detail-decision-pick">
            <span>{pickLabel}</span>
            <strong>{primarySelectionLabel}</strong>
            <small>{referencePriceOnly ? (Number.isFinite(referenceOdds) ? "Historical @" + referenceOdds.toFixed(2) + " · reference only" : "CURRENT PRICE —") : Number.isFinite(primaryOdds) ? "@" + primaryOdds.toFixed(2) : "—"}</small>
          </div>

          <div className="detail-decision-edge">
            <span>{gapLabel}</span>
            <strong>{Number.isFinite(primaryExpectedValuePct)
              ? (primaryExpectedValuePct >= 0 ? "+" : "") + primaryExpectedValuePct.toFixed(1) + "%"
              : primaryEdgePp == null || !Number.isFinite(primaryEdgePp)
                ? "—"
                : (primaryEdgePp >= 0 ? "+" : "") + primaryEdgePp.toFixed(1) + "pp"}</strong>
            <small style={{ display:"block", marginTop:4, color:"#6f8177", fontSize:8, fontWeight:850 }}>
              {Number.isFinite(primaryModelProbability) && Number.isFinite(primaryMarketProbability)
                ? `Model ${(primaryModelProbability * 100).toFixed(1)}% · HKJC fair ${(primaryMarketProbability * 100).toFixed(1)}%${Number.isFinite(primaryEdgePp) ? " · Probability gap " + (primaryEdgePp >= 0 ? "+" : "") + primaryEdgePp.toFixed(1) + "pp" : ""}`
                : "Comparable probabilities unavailable"}
            </small>
          </div>

          <div className="detail-decision-prob">
            <div><span>Model</span><b>{Number.isFinite(primaryModelProbability) ? (primaryModelProbability * 100).toFixed(1) + "%" : "—"}</b></div>
            <div><span>Market</span><b>{Number.isFinite(primaryMarketProbability) ? (primaryMarketProbability * 100).toFixed(1) + "%" : "—"}</b></div>
          </div>

          <div className="detail-decision-market">
            {sideRows.map((row) => (
              <div className={primarySide === row.key ? "is-selected" : ""} key={row.key}>
                <span>{row.key}</span>
                <b>{formatOdds(row.odds)}</b>
                <small>{row.fair == null ? "—" : (Number(row.fair) * 100).toFixed(1) + "% fair"}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="detail-advice-line">
          <span>Decision</span>
          <p>{bettingAdvice}</p>
        </div>

        {recommendationRows.length > 1 ? (
          <div className="detail-extra-recommendations">
            <span>Other market ideas</span>
            <div>
              {recommendationRows.slice(1, 4).map((row, index) => (
                <div className="detail-extra-recommendation" key={row.key}>
                  <b>#{index + 2}</b>
                  <strong>{row.market} · {row.selection}</strong>
                  <em>{row.odds == null || !Number.isFinite(row.odds) ? "MODEL ONLY" : "@" + row.odds.toFixed(2)}</em>
                  <small>{
                    row.expectedValuePct != null && Number.isFinite(row.expectedValuePct)
                      ? "EV " + (row.expectedValuePct >= 0 ? "+" : "") + row.expectedValuePct.toFixed(1) + "% · " + row.note
                      : row.edgePp == null || !Number.isFinite(row.edgePp)
                        ? row.note
                        : (row.edgePp >= 0 ? "+" : "") + row.edgePp.toFixed(1) + "pp · " + row.note
                  }</small>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div style={{ marginTop:6, color:"#7a8981", fontSize:8.5, fontWeight:750 }}>
          HDA, goals and corners edges use probability points (pp). Asian handicap uses model-derived EV% because push and half-win/half-loss outcomes make the measures non-equivalent.
        </div>

        {!decisionCleared && blockerTags.length ? (
          <div className="detail-blocker-line">
            <span>Blocked by</span>
            <div>{blockerTags.map((tag, index) => <b key={tag + index}>{tag}</b>)}</div>
          </div>
        ) : null}
      </section>

      <EvidenceArticle match={match} deep={deep} analysis={analysis} story={story} />

      <nav className="detail-section-nav" aria-label="Match detail sections">
        <a href="#model-consensus">Models</a>
        <a href="#market-totals">Goals & corners</a>
        <a href="#team-form">Form</a>
        <a href="#head-to-head">H2H</a>
        <a href="#team-news">Team news</a>
        <a href="#analysis">Article</a>
      </nav>

      {false && storyContent ? (
        <section className="panel match-story-panel analyst-brief-panel">
          <div className="panel-title">
            <div>
              <p>ANALYST BRIEF</p>
              <h2>{storyContent.headline || "賽事綜合解讀"}</h2>
            </div>
            <span>{storyMode === "AI_GROUNDED" || storyMode === "AI_GROUNDED_RETRY" ? "AI · GROUNDED" : "RULES · GROUNDED"}</span>
          </div>

          <div className={"story-provenance " + (referencePriceOnly ? "is-fallback" : "")}>
            <span><b>SOURCE</b>{sourceModeLabel}</span>
            <span><b>PRICE</b>{priceStatusLabel}</span>
            <span><b>ENGINE</b>{story?.engine?.name || "—"}</span>
            <span><b>UPDATED</b>{story?.generatedAt ? formatUpdated(story.generatedAt) : "—"}</span>
          </div>

          <div className={"story-decision-gate " + (decisionCleared ? "is-cleared" : "is-blocked")}>
            <div>
              <span>DECISION GATE</span>
              <strong>{gateLabel}</strong>
            </div>
            <p>{gateDetail}</p>
          </div>

          {storyEvidenceTags.length ? (
            <div className="story-evidence-tags">
              <span>Evidence</span>
              {storyEvidenceTags.map((tag) => <b key={tag}>{tag}</b>)}
            </div>
          ) : null}

          {storyContent.executiveSummary ? <p className="match-story-lead">{storyContent.executiveSummary}</p> : null}

          <div className="story-thesis-grid">
            <div className="story-thesis-positive">
              <span>主要論點</span>
              <strong>{story?.bettingAdvice?.selectionLabel || primarySelectionLabel}</strong>
              <p>{storyContent.thesis || bettingAdvice}</p>
            </div>
            <div className="story-thesis-negative">
              <span>最大反方</span>
              <strong>What can go wrong</strong>
              <p>{storyContent.counterCase || "暫未有額外反方 evidence。"}</p>
            </div>
          </div>

          {Array.isArray(storyContent.watchNext) && storyContent.watchNext.length ? (
            <div className="story-watch-box">
              <span>NEXT CHECK</span>
              <div>{storyContent.watchNext.slice(0,4).map((item, index) => <b key={String(item) + index}>{item}</b>)}</div>
            </div>
          ) : null}

          <details className="story-deep-dive">
            <summary>完整分析 / Phase interpretation</summary>
            <div className="story-signal-row">
              <div><span>MARKET</span><p>{storyContent.marketInterpretation || "—"}</p></div>
              <div><span>MODELS</span><p>{storyContent.modelConsensusInterpretation || "—"}</p></div>
              <div><span>HUMAN</span><p>{storyContent.humanFactorsInterpretation || "—"}</p></div>
            </div>
            {storyContent.matchStory ? <p className="match-story-body">{storyContent.matchStory}</p> : null}
            <div className="story-intel-grid">
              <div><span>Live / Match State</span><p>{storyContent.liveInterpretation || "—"}</p></div>
              <div><span>Odds Movement</span><p>{storyContent.movementInterpretation || "—"}</p></div>
              <div><span>信心點樣理解</span><p>{storyContent.confidenceExplanation || "—"}</p></div>
            </div>
            {Array.isArray(storyContent.phaseNarratives) && storyContent.phaseNarratives.length ? (
              <div className="story-phase-grid">
                {storyContent.phaseNarratives.map((row) => (
                  <div key={"story-phase-" + row.phase}>
                    <span>PHASE {row.phase}</span>
                    <b>{row.status}</b>
                    <p>{row.interpretation}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </details>
        </section>
      ) : null}

      {matchScript ? (
        <section className="panel match-script-panel">
          <div className="panel-title">
            <div><p>MATCH SCRIPT</p><h2>{matchScript.headline || "賽事走勢推演"}</h2></div>
            <span>{matchScript.predictedScore ? "Forebet " + matchScript.predictedScore : matchScript.shapeKey || "Phase 1"}</span>
          </div>
          <div className="match-script-grid">
            <div>
              <span>開局</span>
              <p>{matchScript.opening || "—"}</p>
            </div>
            <div>
              <span>中段走勢</span>
              <p>{matchScript.middle || "—"}</p>
            </div>
            <div>
              <span>入球環境 / VALUE</span>
              <p>{matchScript.goalEnvironment || "—"}</p>
            </div>
            <div>
              <span>角球環境</span>
              <p>{matchScript.cornerEnvironment || "—"}</p>
            </div>
          </div>
          {Array.isArray(matchScript.turningPoints) && matchScript.turningPoints.length ? (
            <div className="match-script-turning">
              <span>關鍵轉折 / 失效位</span>
              <div>{matchScript.turningPoints.slice(0, 6).map((item, index) => <b key={String(item) + index}>{item}</b>)}</div>
            </div>
          ) : null}
          <p className="fineprint">Match Script 係 Phase 1 賽前推演；「最可能走勢」同「現價最有 value 嘅投注方向」會分開顯示。</p>
        </section>
      ) : null}

      {commentaryUiRows.length ? (
        <section className="panel commentary-panel">
          <div className="panel-title">
            <div><p>EDITORIAL EVIDENCE</p><h2>外部球評 / Match Preview</h2></div>
            <span>
              {editorialAlignment?.totalSignals
                ? `${editorialAlignment.support || 0} 同向 · ${editorialAlignment.contradict || 0} 反向`
                : `${commentaryUiRows.length} sources · context only`}
            </span>
          </div>
          {editorialAlignment?.totalSignals ? (
            <div className="editorial-alignment-summary">
              <span>球評 × 模型</span>
              <b className="support">{editorialAlignment.support || 0} 一致</b>
              <b className="contradict">{editorialAlignment.contradict || 0} 相反</b>
              {editorialAlignment.differentLine ? <b className="different">{editorialAlignment.differentLine} 不同盤</b> : null}
              <small>只作解讀，不改 Edge</small>
            </div>
          ) : null}
          <div className="commentary-board">
            {commentaryUiRows.map((row, index) => {
              const RowTag = row.sourceUrl ? "a" : "div";
              const linkProps = row.sourceUrl
                ? { href: row.sourceUrl, target: "_blank", rel: "noreferrer" }
                : {};
              return (
                <RowTag
                  className={"commentary-row" + (row.sourceUrl ? "" : " is-static")}
                  {...linkProps}
                  key={(row.source || "source") + (row.headline || index)}
                >
                  <span>{row.source || "外部來源"}</span>
                  <div className="commentary-main">
                    <strong>{row.headline || row.summary || "Preview"}</strong>
                    {row.alignments?.length ? (
                      <div className="commentary-signals">
                        {row.alignments.map((signal, signalIndex) => (
                          <b className={"editorial-signal editorial-" + String(signal.status || "context").toLowerCase()} key={String(signal.market) + signalIndex}>
                            {editorialSignalLabel(signal)} · {editorialStatusLabel(signal.status)}
                          </b>
                        ))}
                      </div>
                    ) : row.topics?.length ? (
                      <div className="commentary-signals">
                        {row.topics.filter((topic) => !["PREMATCH", "EDITORIAL"].includes(topic)).slice(0, 3).map((topic) => (
                          <b className="editorial-topic" key={topic}>{topic}</b>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <small>{row.publishedAt ? formatUpdated(row.publishedAt) : "時間未提供"}</small>
                </RowTag>
              );
            })}
          </div>
          <p className="fineprint">球評 signal 只用嚟檢查模型論點有冇外部支持或反方；唔會直接改 probability、Edge 或 betting gate。</p>
        </section>
      ) : null}

      <section className="panel model-visual-panel" id="model-consensus">
        <div className="panel-title">
          <div><p>MODEL CONSENSUS</p><h2>Which models support the current position?</h2></div>
          <span>{primarySide || "—"} · {Number.isFinite(primaryMarketProbability) ? (primaryMarketProbability * 100).toFixed(1) + "% fair" : "market pending"}</span>
        </div>
        <ModelEdgeChart
          rows={coreModelRows}
          side={primarySide}
          marketProbability={primaryMarketProbability}
        />
      </section>

      {!storyContent && analysis ? (
        <section className="panel analyst-panel analyst-detail-panel">
          <div className="panel-title">
            <div><p>WHY THIS BET</p><h2>點解個 Edge 喺呢度</h2></div>
            <span>{analysis.decision?.candidateClass || analysis.decision?.action || "WATCH"}</span>
          </div>
          {analysis.story?.summary ? <p className="analysis-lead">{analysis.story.summary}</p> : null}
          <div className="evidence-rows">
            {analysis.story?.supportRead ? <div className="evidence-positive"><span>支持 Edge</span><b>{analysis.story.supportRead}</b></div> : null}
            {analysis.story?.counterRead ? <div className="evidence-negative"><span>反方 / 風險</span><b>{analysis.story.counterRead}</b></div> : null}
            <div><span>Market</span><b>{analysis.story?.marketRead || ""}</b></div>
            <div><span>Model</span><b>{analysis.story?.modelRead || ""}</b></div>
            <div><span>人為因素</span><b>{analysis.story?.humanRead || ""}</b></div>
            <div><span>Live</span><b>{analysis.story?.liveRead || ""}</b></div>
            <div><span>賠率走勢</span><b>{analysis.story?.movementRead || ""}</b></div>
          </div>
          {Array.isArray(analysis.invalidators) && analysis.invalidators.length ? (
            <div className="betting-risk-box"><span>風險 / 失效條件</span><p>{analysis.invalidators.join(" · ")}</p></div>
          ) : null}
        </section>
      ) : !storyContent ? (
        <section className="panel analyst-panel analyst-detail-panel analyst-loading">
          <div className="panel-title"><div><p>WHY THIS BET</p><h2>分析資料載入中</h2></div></div>
          <div className="analysis-placeholder-grid"><span></span><span></span><span></span></div>
        </section>
      ) : null}

      {match.liveNow && match.live && (
        <section className="panel live-detail-panel live-trading-panel">
          <div className="panel-title">
            <div><p>LIVE TRADING VIEW</p><h2>即場比賽訊號</h2></div>
            <span>{match.live.status || "LIVE"}</span>
          </div>

          <div className="live-scoreboard-hero">
            <div className="live-team-block home">
              <span>HOME</span>
              <strong>{match.homeZh || match.home}</strong>
            </div>
            <div className="live-score-centre">
              <small>{liveMinute}</small>
              <b>{liveScoreText}</b>
              <em>{liveStats ? "FULL LIVE DATA" : liveScore.source ? "SCORE FEED" : "HKJC LIVE"}</em>
            </div>
            <div className="live-team-block away">
              <span>AWAY</span>
              <strong>{match.awayZh || match.away}</strong>
            </div>
          </div>

          {liveLanes ? (
            <div className="live-lane-bar">
              <span className={"lane-" + liveLanes.odds.state}>ODDS <b>{liveLanes.odds.label}</b></span>
              <span className={"lane-" + liveLanes.score.state}>SCORE <b>{liveLanes.score.label}</b></span>
              <span className={"lane-" + liveLanes.stats.state}>STATS <b>{liveLanes.stats.label}</b></span>
              <span className={"lane-" + liveLanes.shadow.state}>MODEL <b>{liveLanes.shadow.label}</b></span>
              {liveBottleneck && liveBottleneck[1].state !== "fresh"
                ? <strong>最慢：{liveBottleneck[0]} {liveBottleneck[1].label}</strong>
                : <strong className="fresh">同步正常</strong>}
            </div>
          ) : null}

          <div className="live-command-row">
            <div className="live-control-card">
              <span>LIVE CONTROL</span>
              <strong>{liveControlLabel}</strong>
              <small>{shadow?.actualSide ? "Expected-vs-Actual engine" : liveStats ? "visual stats signal" : "等待 detail stats"}</small>
            </div>
            <div>
              <span>角球進度</span>
              <strong>{liveCornerProgress}</strong>
              <small>{Number.isFinite(liveCornerTotal) ? "目前 " + liveCornerTotal + " 個" : "等待 running result"}</small>
            </div>
            <div>
              <span>Expected control</span>
              <strong>{shadow ? controlSideLabel(match, shadow.expectedSide) : "—"}</strong>
              <small>{shadow?.segment || "model segment pending"}</small>
            </div>
            <div className={shadow?.status === "ALIGNED" ? "is-positive" : shadow?.status && shadow.status !== "WAIT" ? "is-warning" : ""}>
              <span>Expected vs Actual</span>
              <strong>{shadow?.status || "WAIT"}</strong>
              <small>{shadow?.metricCount ? shadow.metricCount + " live metrics" : "等待 evidence"}</small>
            </div>
          </div>

          {analysisDecision ? (
            <div style={{
              margin:"10px 0 12px",
              padding:"12px 14px",
              border:"1px solid " + (actionTone === "value" ? "#bfe0ca" : actionTone === "watch" ? "#ead9a6" : "#e2d6d1"),
              borderRadius:13,
              background:actionTone === "value" ? "#f0faf3" : actionTone === "watch" ? "#fffaf0" : "#fbf7f5",
            }}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
                <span style={{fontSize:9,fontWeight:950,letterSpacing:".06em",color:"#6b7b72"}}>
                  即場建議 · {analysisDecision.liveAdjusted ? "比分＋分鐘重估" : "模型觀察"}
                </span>
                {analysisDecision.liveMarketAgeSeconds != null ? (
                  <small style={{fontSize:9,color:"#7d8982",fontWeight:800}}>
                    live price {Math.round(Number(analysisDecision.liveMarketAgeSeconds))}s
                  </small>
                ) : null}
              </div>
              <strong style={{display:"block",marginTop:5,fontSize:17,color:actionTone === "value" ? "#17633f" : "#5f5541"}}>
                {actionLabel} · {primarySelectionLabel}
              </strong>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:6,fontSize:10,fontWeight:850,color:"#53685c"}}>
                <span>模型 {Number.isFinite(primaryModelProbability) ? (primaryModelProbability * 100).toFixed(1) + "%" : "—"}</span>
                <span>HKJC fair {Number.isFinite(primaryMarketProbability) ? (primaryMarketProbability * 100).toFixed(1) + "%" : "—"}</span>
                <span>Edge {Number.isFinite(primaryEdgePp) ? (primaryEdgePp >= 0 ? "+" : "") + primaryEdgePp.toFixed(1) + "pp" : "—"}</span>
                {analysisDecision.confidenceLabel ? <span>信心 {analysisDecision.confidenceLabel} · {analysisDecision.confidenceScore ?? "—"}/100</span> : null}
                <span>{analysisDecision.liveScore || liveScoreText} · {analysisDecision.liveMinute ?? liveMinute}</span>
              </div>
              <p style={{margin:"7px 0 0",fontSize:11,lineHeight:1.55,color:"#495b51",fontWeight:700}}>
                {analysisDecision.explanation || bettingAdvice}
              </p>
              {Array.isArray(analysisDecision.recommendationReasons) && analysisDecision.recommendationReasons.length ? (
                <small style={{display:"block",marginTop:5,color:"#748178",fontWeight:750}}>
                  判斷依據：{analysisDecision.recommendationReasons.slice(0, 4).join(" · ")}
                </small>
              ) : null}
              {!analysisDecision.autoStakeAllowed ? (
                <small style={{display:"block",marginTop:6,color:"#8a7661",fontWeight:800}}>
                  Calibration 只限制自動注碼；有 Edge 嘅方向仍會照常顯示
                </small>
              ) : null}
            </div>
          ) : null}

          {liveSignalRows.length ? (
            <div className="live-pressure-board">
              {liveSignalRows.map((row) => (
                <div className="live-pressure-row" key={row.key}>
                  <span>{row.label}</span>
                  <b>{row.pair?.home == null ? "—" : Number(row.pair.home).toFixed(row.digits)}{row.suffix || ""}</b>
                  <div className="live-pressure-track">
                    <i className="home" style={{ width: row.share.homePct + "%" }}></i>
                    <i className="away" style={{ width: row.share.awayPct + "%" }}></i>
                  </div>
                  <b>{row.pair?.away == null ? "—" : Number(row.pair.away).toFixed(row.digits)}{row.suffix || ""}</b>
                </div>
              ))}
            </div>
          ) : (
            <div className="live-score-only-state">
              <strong>{liveScore.source === "HKJC_RUNNING_RESULT" ? "HKJC running result 已連接" : "目前只有市場 / 比分層"}</strong>
              <p>未有可靠 xG、射門或控球 detail 時，畫面唔會用空值製造假訊號；有 stats 先自動展開 pressure board。</p>
            </div>
          )}

          <div className="live-market-board">
            <div className="live-1x2-market">
              <span>HKJC LIVE 1X2</span>
              <div>
                <b>主 <strong>{formatOdds(match.live.odds?.home)}</strong></b>
                <b>和 <strong>{formatOdds(match.live.odds?.draw)}</strong></b>
                <b>客 <strong>{formatOdds(match.live.odds?.away)}</strong></b>
              </div>
            </div>
            <div className="live-ou-market">
              <span>入球 O/U · {match.live.goals?.line || "—"}</span>
              <div><b>大 {formatOdds(match.live.goals?.over)}</b><b>細 {formatOdds(match.live.goals?.under)}</b></div>
            </div>
            <div className="live-ou-market">
              <span>角球 O/U · {match.live.corners?.line || "—"}</span>
              <div><b>大 {formatOdds(match.live.corners?.over)}</b><b>細 {formatOdds(match.live.corners?.under)}</b></div>
            </div>
          </div>

          {(liveStats || shadow) ? (
            <details className="live-raw-details">
              <summary>完整 Live evidence</summary>
              {liveStats ? (
                <div className="live-stats-detail-grid">
                  <div><span>xG</span><b>{pairText(liveStats.xg, 2)}</b></div>
                  <div><span>xGOT</span><b>{pairText(liveStats.xgot, 2)}</b></div>
                  <div><span>射門</span><b>{pairText(liveStats.shots)}</b></div>
                  <div><span>中框</span><b>{pairText(liveStats.shotsOnTarget)}</b></div>
                  <div><span>控球</span><b>{pairText(liveStats.possession, 0, "%")}</b></div>
                  <div><span>Big Chance</span><b>{pairText(liveStats.bigChances)}</b></div>
                  <div><span>禁區觸球</span><b>{pairText(liveStats.boxTouches)}</b></div>
                  <div><span>角球</span><b>{pairText(liveStats.corners)}</b></div>
                </div>
              ) : null}
              {shadow ? <p className="fineprint">{shadow.reason || "WAIT"} · control score {shadow.controlScore == null ? "—" : Number(shadow.controlScore).toFixed(0)}{shadow.controlBasis ? ` · expected basis ${shadow.controlBasis}` : ""}</p> : null}
            </details>
          ) : null}

          <p className="fineprint">
            Live market：HKJC freshness gate · Score source：{liveScore.source || "—"}
            {liveScore.confidence == null ? "" : ` · match confidence ${Number(liveScore.confidence).toFixed(2)}`}
            {liveStats?.source ? ` · Stats source：${liveStats.source}` : ""}
          </p>
        </section>
      )}

      <section className="panel totals-board-panel" id="market-totals">
        <div className="panel-title"><div><p>HKJC MARKETS</p><h2>Goals and corners</h2></div></div>
        <div className="totals-board">
          <div className="totals-row">
            <div className="totals-name"><span>Goals O/U</span><b>Line {match.goals?.line || "—"}</b></div>
            <div className="totals-prices"><b>Over {match.goals?.line || "—"} · {formatOdds(match.goals?.over)}</b><b>Under {match.goals?.line || "—"} · {formatOdds(match.goals?.under)}</b></div>
            <div className="totals-model-note">
              <div className={"totals-suggestion " + totalAdviceTone(goalsAdvice)}>
                <span>Signal</span>
                <strong>{totalAdviceLabel(goalsAdvice)}</strong>
                {goalsAdvice?.currentOdds != null ? <em>@ {formatOdds(goalsAdvice.currentOdds)}</em> : null}
                <b>{totalAdviceEdge(goalsAdvice)}</b>
                {goalsAdvice?.evidenceFamilyCount != null ? <small>{goalsAdvice.evidenceFamilyCount} families · {goalsAdvice.sourceSignalCount ?? goalsAdvice.evidenceFamilyCount} signals</small> : null}
              </div>
              {goalsLineModel?.over != null
                ? <small className={goalsLineModel.derived ? "line-derived" : ""}>
                    {goalsLineModel.derived ? "MODEL-DERIVED" : "FOREBET"} · Over {(goalsLineModel.over * 100).toFixed(0)}% · Under {(goalsLineModel.under * 100).toFixed(0)}% · Avg {goalsLineModel.avg ?? "—"}
                  </small>
                : <small className={goalsCompare.comparable ? "" : "line-warning"}>{goalsCompare.label || "Same-line model unavailable"}</small>}
            </div>
          </div>

          <div className="totals-row">
            <div className="totals-name"><span>Corners O/U</span><b>Line {match.corners?.line || "—"}</b></div>
            <div className="totals-prices"><b>Over {match.corners?.line || "—"} · {formatOdds(match.corners?.over)}</b><b>Under {match.corners?.line || "—"} · {formatOdds(match.corners?.under)}</b></div>
            <div className="totals-model-note">
              <div className={"totals-suggestion " + totalAdviceTone(cornersAdvice)}>
                <span>Signal</span>
                <strong>{totalAdviceLabel(cornersAdvice)}</strong>
                {cornersAdvice?.currentOdds != null ? <em>@ {formatOdds(cornersAdvice.currentOdds)}</em> : null}
                <b>{totalAdviceEdge(cornersAdvice)}</b>
                {cornersAdvice?.evidenceFamilyCount != null ? <small>{cornersAdvice.evidenceFamilyCount} families · {cornersAdvice.sourceSignalCount ?? cornersAdvice.evidenceFamilyCount} signals</small> : null}
              </div>
              {cornersLineModel?.over != null
                ? <small className={cornersLineModel.derived ? "line-derived" : ""}>
                    {cornersLineModel.derived ? "MODEL-DERIVED" : "FOREBET"} · Over {(cornersLineModel.over * 100).toFixed(0)}% · Under {(cornersLineModel.under * 100).toFixed(0)}% · Avg {cornersLineModel.avg == null ? "—" : Number(cornersLineModel.avg).toFixed(1)}
                  </small>
                : <small className={cornersCompare.comparable ? "" : "line-warning"}>{cornersCompare.label || "Same-line model unavailable"}</small>}
            </div>
          </div>
        </div>
      </section>


      <section className="panel model-intelligence-panel phase4-board-panel">
        <div className="panel-title">
          <div><p>MARKET COMPARISON</p><h2>Value and price comparison</h2></div>
          <span>{String(marketIntel.mode || "DETECT_ONLY").replaceAll("_", " ")}</span>
        </div>

        <div className="phase4-board">
          <div className="phase4-value-cell">
            <span>TOP SIGNAL</span>
            <strong>{bestValue ? phase4SelectionLabel(bestValue.selection_key) : "—"}</strong>
            <small>{bestValue ? (bestValue.provider_id || "—") + " @" + formatOdds(bestValue.odds_decimal)  : "No comparable value signal"}</small>
          </div>

          <div className="phase4-metric-cell">
            <span>EV</span>
            <strong>{Number.isFinite(phase4Ev) ? (phase4Ev >= 0 ? "+" : "") + phase4Ev.toFixed(1) + "%" : "—"}</strong>
            <small>{phase4Status}</small>
          </div>

          <div className="phase4-metric-cell">
            <span>MODEL / MARKET</span>
            <strong>{bestValue ? pct(bestValue.model_prob, 1) + " / " + pct(bestValue.market_prob_devig, 1) : "—"}</strong>
            <small>{Number.isFinite(phase4Edge) ? "Edge " + (phase4Edge >= 0 ? "+" : "") + phase4Edge.toFixed(1) + "%" : "Probability edge —"}</small>
          </div>

          <div className="phase4-metric-cell">
            <span>COVERAGE</span>
            <strong>{bestValue ? phase4Coverage : "NO MODEL"}</strong>
            <small>{Number.isFinite(phase4QuoteAge) ? Math.round(phase4QuoteAge) + "s quote" : "quote age —"}</small>
          </div>

          <div className="phase4-metric-cell">
            <span>ARBITRAGE</span>
            <strong>{phase4Arbs.length ? phase4Arbs.length + " FOUND" : "0"}</strong>
            <small>{phase4Arbs.length ? "compatibility gate passed" : "no inverse sum < 1"}</small>
          </div>

          <div className="phase4-metric-cell">
            <span>NEAR-ARB</span>
            <strong>{Number.isFinite(nearArbDistance) ? nearArbDistance.toFixed(2) + "%" : "—"}</strong>
            <small>{nearArbStatus}</small>
          </div>
        </div>

        {nearArbBestLegs.length ? <div className="phase4-leg-line"><span>Best legs</span><b>{nearArbBestLegs.join(" · ")}</b></div> : null}

        {(phase4Values.length || phase4Arbs.length) ? (
          <details className="model-deep-dive phase4-deep-dive">
            <summary>Market comparison details</summary>
            {phase4Values.length ? (
              <div className="evidence-rows">
                {phase4Values.slice(0, 6).map((row, index) => (
                  <div key={(row.provider_id || "provider") + "-" + (row.selection_key || index)}>
                    <span>{row.provider_id || "—"} · {phase4SelectionLabel(row.selection_key)}</span>
                    <b>@ {formatOdds(row.odds_decimal)} · EV {Number(row.expected_roi_pct) >= 0 ? "+" : ""}{numText(row.expected_roi_pct, 1)}%</b>
                    <small>Model {pct(row.model_prob, 1)} · Market {pct(row.market_prob_devig, 1)} · Edge {Number(row.probability_edge_pct) >= 0 ? "+" : ""}{numText(row.probability_edge_pct, 1)}% · {row.model_source_count || 0} source</small>
                  </div>
                ))}
              </div>
            ) : null}
            {phase4Arbs.length ? (
              <div className="evidence-rows">
                {phase4Arbs.slice(0, 5).map((arb) => (
                  <div key={arb.opportunity_key}>
                    <span>{arb.market_key} · {arb.settlement_key}</span>
                    <b>NET +{numText(arb.net_roi_pct, 2)}%</b>
                    <small>{arb.leg_count} legs · inverse sum {numText(arb.inverse_sum, 4)} · {arb.status}</small>
                  </div>
                ))}
              </div>
            ) : null}
          </details>
        ) : null}

        <p className="fineprint">Value signals depend on model probabilities. Arbitrage requires simultaneously available, settlement-compatible prices across distinct providers. Automatic execution remains off and fail-closed.</p>
      </section>


      <section className="panel team-form-panel" id="team-form">
        <div className="panel-title">
          <div><p>TEAM FORM</p><h2>Recent form comparison</h2></div>
          <span>{formQualityLabel(match.formDetail?.quality)}</span>
        </div>
        <div className="team-form-grid">
          <TeamFormCard
            title="HOME"
            name={match.homeZh || match.home}
            detail={match.formDetail?.home}
          />
          <TeamFormCard
            title="AWAY"
            name={match.awayZh || match.away}
            detail={match.formDetail?.away}
          />
        </div>
        <p className="fineprint">
          Recent results use confirmed HKJC match results only. W = win, D = draw, L = loss. Model sample shows the Team-Form modelling sample and is not the same as the five recent matches displayed above.
          {match.formDetail?.source ? " · Source: " + match.formDetail.source : ""}
        </p>
      </section>

      <section className="panel h2h-panel" id="head-to-head">
        <div className="panel-title">
          <div><p>HEAD TO HEAD</p><h2>Previous meetings</h2></div>
          <span>{h2hQualityLabel(h2hQuality, h2hGames)}</span>
        </div>

        {h2hGames > 0 ? (
          <>
            <div className="h2h-scoreboard">
              <div>
                <span>{match.homeZh || match.home}</span>
                <strong>{h2hHomeWins}</strong>
                <small>Wins</small>
              </div>
              <div className="h2h-draw">
                <span>Draws</span>
                <strong>{h2hDraws}</strong>
                <small>{h2hGames} matches</small>
              </div>
              <div>
                <span>{match.awayZh || match.away}</span>
                <strong>{h2hAwayWins}</strong>
                <small>Wins</small>
              </div>
            </div>

            <div className="h2h-metrics">
              <div><span>H2H goals</span><b>{h2hHomeGoals} - {h2hAwayGoals}</b></div>
              <div><span>Avg total goals</span><b>{Number.isFinite(h2hAvgGoals) ? h2hAvgGoals.toFixed(2) : "—"}</b></div>
              <div><span>Recent sequence</span><b>{h2h.last5 || "—"}</b></div>
            </div>

            <div className="h2h-list">
              {h2hMeetings.map((row, index) => (
                <div className="h2h-row" key={(row.match_id || row.hkjc_event_id || "h2h") + "-" + index}>
                  <span className={"h2h-result h2h-" + String(row.result || "D").toLowerCase()}>{row.result || "—"}</span>
                  <span className="h2h-date">{formatFormDate(row.kickoff_hkt)}</span>
                  <b>{row.home || "—"} <strong>{row.home_goals ?? "—"}-{row.away_goals ?? "—"}</strong> {row.away || "—"}</b>
                  <small>{row.tournament || "—"}</small>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="h2h-empty">
            <strong>
              {h2hQuality === "HISTORY_PARTIAL"
                ? "HKJC history coverage is still partial"
                : h2hQuality === "NO_PREVIOUS_H2H_IN_AVAILABLE_HISTORY"
                  ? "No direct meeting found in the available HKJC history"
                   : "H2H data is pending"}
            </strong>
            <span>
              {h2hQuality === "HISTORY_PARTIAL"
                ? "Missing H2H is not treated as negative evidence while historical coverage is incomplete."
                 : "No verified meeting does not imply a negative signal. The model remains neutral rather than inventing history."}
            </span>
          </div>
        )}

        <p className="fineprint">
          Only confirmed results joined through stable HKJC team IDs are used. H / D / A is expressed from the current home team perspective. Up to five recent direct meetings are shown.
          {h2h?.source ? " · Source: " + h2h.source : ""}
        </p>
      </section>

      <section className="panel model-intelligence-panel">
        <div className="panel-title">
          <div><p>MODEL INTELLIGENCE</p><h2>Model detail</h2></div>
          <span>{modelCardsAvailable}/5 H/D/A models available</span>
        </div>
        <p className="panel-intro">Start with consensus, then expand model detail only when needed. H / D / A and edge remain aligned for quick comparison.</p>
        <ModelScoreboard rows={coreModelRows} targetSide={primarySide} market={market} />
        <details className="model-deep-dive">
          <summary>Open model details</summary>
          <div className="model-intel-grid">
          <ModelIntelCard
            code="FOREBET"
            title="Forebet prediction"
            values={match.forebet}
            state={probabilityAvailable(match.forebet) ? "MODEL" : null}
            stateReason={match.health?.forebetCoverageStatus || match.health?.forebetState}
            metrics={[
              { label: "Predicted score", value: forebetDeep.predicted_score || match.forebetDetail?.predictedScore || "—" },
              { label: "Average goals", value: forebetDeep.avg_goals == null ? "—" : numText(forebetDeep.avg_goals, 2) },
              { label: "O2.5 / U2.5", value: `${pct(forebetDeep.prob_over25 ?? match.forebetDetail?.ou25?.over, 0)} / ${pct(forebetDeep.prob_under25 ?? match.forebetDetail?.ou25?.under, 0)}` },
              { label: "Corner prediction", value: forebetDeep.corner_predicted_score || forebetDeep.corner_prediction || "—" },
              { label: "O9.5 / U9.5", value: `${pct(forebetDeep.corner_prob_over95 ?? match.forebetDetail?.corners95?.over, 0)} / ${pct(forebetDeep.corner_prob_under95 ?? match.forebetDetail?.corners95?.under, 0)}` },
              { label: "Average corners", value: forebetDeep.avg_corners == null ? "—" : numText(forebetDeep.avg_corners, 2) },
            ]}
            source={forebetDeep.forebet_detail_url ? "Forebet detail · " + (forebetDeep.forebet_league_short || "") : null}
          />

          <ModelIntelCard
            code="DC"
            title="Dixon-Coles goals model"
            values={match.dc || dcDetail?.probabilities}
            state={dcDetail?.available ? "MODELED" : null}
            stateReason={dcDetail?.missingReason || dcDetail?.quality}
            metrics={[
              { label: "xG H / A", value: `${numText(dcDetail?.expectedGoals?.home, 2)} / ${numText(dcDetail?.expectedGoals?.away, 2)}` },
              { label: "Over 2.5", value: pct(dcDetail?.over25, 1) },
              { label: "Training", value: dcDetail?.trainingMatches ? `${dcDetail.trainingMatches} matches` : "—" },
              { label: "League", value: dcDetail?.league || "—" },
              { label: "Match quality", value: dcDetail?.teamMatchQuality == null ? "—" : numText(dcDetail.teamMatchQuality, 2) },
              { label: "Quality gate", value: dcDetail?.quality || "—" },
            ]}
            source={dcDetail?.source}
          />

          <ModelIntelCard
            code="PI"
            title="Pi strength rating"
            values={match.pi || piDetail?.probabilities}
            state={piDetail?.available ? "MODELED" : null}
            stateReason={piDetail?.missingReason || piDetail?.quality}
            metrics={[
              { label: "Rating H / A", value: `${numText(piDetail?.ratings?.home, 3)} / ${numText(piDetail?.ratings?.away, 3)}` },
              { label: "Rating diff", value: numText(piDetail?.ratings?.difference, 3) },
              { label: "Training", value: piDetail?.trainingMatches ? `${piDetail.trainingMatches} matches` : "—" },
              { label: "League", value: piDetail?.league || "—" },
              { label: "Match quality", value: piDetail?.teamMatchQuality == null ? "—" : numText(piDetail.teamMatchQuality, 2) },
              { label: "Quality gate", value: piDetail?.quality || "—" },
            ]}
            source={piDetail?.source}
          />

          <ModelIntelCard
            code="FORM"
            title="Recent team-form Poisson"
            values={match.form}
            state={probabilityAvailable(match.form) ? "MODELED" : null}
            stateReason={formDeep.quality || match.formDetail?.quality}
            metrics={[
              { label: "Form xG H / A", value: `${numText(formDeep.form_xg_home ?? match.formDetail?.home?.expectedGoals, 2)} / ${numText(formDeep.form_xg_away ?? match.formDetail?.away?.expectedGoals, 2)}` },
              { label: "Effective sample H / A", value: `${formDeep.home_games ?? match.formDetail?.home?.modelGames ?? 0} / ${formDeep.away_games ?? match.formDetail?.away?.modelGames ?? 0}` },
              { label: "Venue sample H / A", value: `${formDeep.home_venue_games ?? match.formDetail?.home?.venueGames ?? 0} / ${formDeep.away_venue_games ?? match.formDetail?.away?.venueGames ?? 0}` },
              { label: "Quality", value: formDeep.quality || match.formDetail?.quality || "—" },
            ]}
            source={formDeep.model_source || match.formDetail?.source}
          />

          <ModelIntelCard
            code="MULTI"
            title="Multi-source consensus"
            values={match.multi}
            state={probabilityAvailable(match.multi) ? `${multiSources.length || match.multi?.sources || 0} SOURCES` : null}
            stateReason={match.health?.multisourceCoverageStatus}
            metrics={[
              { label: "O2.5 / U2.5", value: `${pct(match.multisourceDetail?.ou25?.over ?? multiDeep.consensus_over25, 0)} / ${pct(match.multisourceDetail?.ou25?.under ?? multiDeep.consensus_under25, 0)}` },
              { label: "BTTS Yes / No", value: `${pct(match.multisourceDetail?.btts?.yes ?? multiDeep.consensus_btts_yes, 0)} / ${pct(match.multisourceDetail?.btts?.no ?? multiDeep.consensus_btts_no, 0)}` },
              { label: "Matched sources", value: String(multiSources.length || match.multi?.sources || 0) },
              { label: "Match status", value: multiDeep.match_status || match.health?.multisourceMatchStatus || "—" },
            ]}
            chips={multiSources}
            source={multiSources.length ? "Consensus built from the source set shown above; individual source probabilities are not yet persisted in the canonical table." : null}
          />

          <ModelIntelCard
            code="OPTA"
            title="Opta Power strength"
            values={null}
            state={optaCoverage}
            stateReason={optaHasAny ? optaCoverage : "SOURCE_ABSENT"}
            metrics={[
              { label: "Power H / A", value: `${numText(optaHomeRating, 1)} / ${numText(optaAwayRating, 1)}` },
              { label: "Rank H / A", value: `${optaHomeRank == null ? "—" : "#" + optaHomeRank} / ${optaAwayRank == null ? "—" : "#" + optaAwayRank}` },
              { label: "Coverage", value: optaCoverage },
              { label: "Match confidence", value: `${numText(optaData.home_match_confidence ?? optaData.homeConfidence, 2)} / ${numText(optaData.away_match_confidence ?? optaData.awayConfidence, 2)}` },
            ]}
            source={(optaData.source || "Opta Power Rankings") + " · strength evidence only; not a direct H/D/A probability model."}
          />
          </div>
        </details>
      </section>

      {hasMovement && (
        <section className="panel odds-signal-panel">
          <div className="panel-title">
            <div><p>ODDS MOVEMENT</p><h2>HKJC price signal</h2></div>
            <span>{movement.signal || "COLLECTING"}</span>
          </div>

          <div className={"odds-signal-hero " + (movementPct < 0 ? "is-shortening" : movementPct > 0 ? "is-drifting" : "is-flat")}>
            <div className="odds-signal-side">
              <span>Market side</span>
              <strong>{sideName(match, movement.side)}</strong>
              <small>{movementDirectionZh}</small>
            </div>

            <div className="odds-signal-arrow" aria-label={movementDirection}>
              <span>{formatOdds(movement.baselineOdds)}</span>
              <div className="odds-signal-track"><i style={{ width: movementMagnitude + "%" }}></i></div>
              <b>{movementPct < 0 ? "↓" : movementPct > 0 ? "↑" : "→"}</b>
              <span>{formatOdds(movement.nowOdds)}</span>
            </div>

            <div className="odds-signal-change">
              <span>PRICE MOVE</span>
              <strong className={Math.abs(movementPct) >= 10 ? "movement-alert-text" : ""}>
                {movementPct > 0 ? "+" : ""}{movementPct.toFixed(1)}%
              </strong>
              <small>{Math.abs(movementPct) >= 10 ? "Large move" : "Normal move"}</small>
            </div>
          </div>

          <div className="odds-context-strip">
            <div><span>Implied probability</span><b>{movement.move24hPp == null ? "—" : Number(movement.move24hPp).toFixed(1) + "%"}</b></div>
            <div><span>Model alignment</span><b>{movement.modelAlignment || "—"}</b></div>
            <div><span>Baseline</span><b>{movement.baselineWindow || "Base"}</b></div>
          </div>
        </section>
      )}

      <section className="panel human-factor-panel" id="team-news">
        <div className="panel-title">
          <div><p>TEAM NEWS</p><h2>Human factors and lineups</h2></div>
          <span>{humanQuality}</span>
        </div>

        <div className="human-signal-strip">
          <div className="human-signal-card">
            <span>Confirmed absences</span>
            <strong>{injurySignal}</strong>
            <div className="injury-pressure">
              <div>
                <small>Home {injuriesHome ?? "?"}</small>
                <i><b style={{ width: ((Number(injuriesHome) || 0) / injuryMax * 100) + "%" }}></b></i>
              </div>
              <div>
                <small>Away {injuriesAway ?? "?"}</small>
                <i><b style={{ width: ((Number(injuriesAway) || 0) / injuryMax * 100) + "%" }}></b></i>
              </div>
            </div>
          </div>

          <div className={"human-signal-card lineup-signal " + (lineupConfirmed ? "is-confirmed" : "is-pending")}>
            <span>Official XI</span>
            <strong>{lineupConfirmed ? "Confirmed · identities resolved" : lineupState === "IDENTITY_PARTIAL" ? "Official source · identity reconciliation incomplete" : lineupState === "PENDING" ? "Awaiting official lineup" : "Not matched"}</strong>
            <small>{lineupEvidence.length ? `${confirmedLineupEvidence.length} resolved · ${unresolvedLineupIdentity.length} identity unresolved`  : "No confirmed lineup rows"}</small>
          </div>

          <div className="human-signal-card">
            <span>Evidence quality</span>
            <strong>{humanQuality}</strong>
            <small>{eventMap ? `fixture match ${numText(eventMap.match_quality, 3)}` : "fixture not matched"}</small>
          </div>
        </div>

        <div className="human-summary-grid compact-human-grid">
          <div><span>Referee</span><b>{humanSummary?.referee || "—"}</b><small>{humanSummary?.source || "API_FOOTBALL"}</small></div>
          <div><span>Coach rotation</span><b>{humanSummary?.coach_rotation || "—"}</b><small>reported context</small></div>
          <div><span>Player evidence</span><b>{confirmedPlayerStatusEvidence.length}</b><small>{unresolvedPlayerStatusEvidence.length} unresolved / provisional rows excluded</small></div>
          <div><span>Manager evidence</span><b>{managerEvidence.length}</b><small>coach rows</small></div>
        </div>

        {(homeStarters.length || awayStarters.length) ? (
          <details className="human-deep-dive" open={lineupConfirmed}>
            <summary>Official lineup</summary>
            <div className="lineup-columns">
              <div>
                <span>HOME XI</span>
                <b>{match.homeZh || match.home}</b>
                <p>{homeStarters.join(" · ") || "—"}</p>
              </div>
              <div>
                <span>AWAY XI</span>
                <b>{match.awayZh || match.away}</b>
                <p>{awayStarters.join(" · ") || "—"}</p>
              </div>
            </div>
          </details>
        ) : (
          <div className="human-wait-state">{sourceLineupConfirmed && unresolvedLineupIdentity.length ? "Official lineup source is confirmed, but player identity reconciliation is incomplete; these rows are not treated as confirmed player facts." : "Official lineup is not yet available; only identity-resolved confirmed evidence is shown, and projected XI rows are never presented as confirmed starters."}</div>
        )}

        {(managerEvidence.length || playerStatusEvidence.length) ? (
          <details className="human-deep-dive">
            <summary>Player and manager evidence</summary>
            {managerEvidence.length ? (
              <div className="evidence-rows">
                {managerEvidence.map((row) => (
                  <div key={row.id}><span>{row.team_side} COACH</span><b>{row.evidence_value || row.manager_key || "—"}</b><small>{row.confirmed ? "confirmed" : "reported"} · {row.source_name}</small></div>
                ))}
              </div>
            ) : null}

            {playerStatusEvidence.length ? (
              <div className="evidence-rows">
                {playerStatusEvidence.map((row) => (
                  <div key={row.evidence_key || row.id}>
                    <span>{normalizedSide(row.team_side) || "?"} · {row.status_type}</span>
                    <b>{row.raw?.player?.name || row.raw?.player_name || row.player_key}</b>
                    <small>{row.status_value || "—"} · {row.source_name} · {row.fact_status === "CONFIRMED" ? "canonical identity confirmed" : row.fact_status === "SOURCE_CONFIRMED_IDENTITY_UNRESOLVED" ? "source-confirmed / identity unresolved" : "unconfirmed / identity unresolved"}</small>
                    <small>{row.evidence_key || "evidence key unavailable"}{row.source_url ? " · source link available" : ""}</small>
                  </div>
                ))}
              </div>
            ) : null}
          </details>
        ) : null}
      </section>

      {scenarioRows.length ? (
        <section className="panel scenario-panel scenario-board-panel">
          <div className="panel-title">
            <div><p>MATCH SCENARIO</p><h2>Expected match phases</h2></div>
            <span>{scenarioRows[0]?.segment_prediction_status || "CALIBRATING"}</span>
          </div>

          <div className="scenario-board-head" aria-hidden="true">
            <span>Period</span>
            <span>Expected control</span>
            <span>Home goals</span>
            <span>Away goals</span>
            <span>Corners H / A</span>
          </div>

          <div className="scenario-board">
            {scenarioRows.map((row) => (
              <div className="scenario-board-row" key={row.segment}>
                <b>{row.segment}</b>
                <strong>{controlSideLabel(match, row.macro_control_side)}</strong>
                <span>{pct(row.p_home_goal_segment, 0)}</span>
                <span>{pct(row.p_away_goal_segment, 0)}</span>
                <span>{numText(row.expected_home_corners_segment, 1)} / {numText(row.expected_away_corners_segment, 1)}</span>
              </div>
            ))}
          </div>

          <div className="scenario-board-footer">
            <span>Control basis · {scenarioRows[0]?.control_basis || "—"}</span>
            <b>Context {scenarioRows[0]?.context_coverage_score == null ? "—" : numText(scenarioRows[0].context_coverage_score, 0) + "%"}</b>
          </div>
        </section>
      ) : null}


      <details className="panel technical-health-panel">
        <summary>
          <span>TECHNICAL</span>
          <strong>Data health / diagnostics</strong>
          <b>{match.health?.status || "UNKNOWN"}</b>
        </summary>
        <div className="technical-health-body">
        <div className="technical-build-line">
          <span>{match.id}</span>
          <b>{UI_BUILD}</b>
          <small>{source}</small>
        </div>
        <div className="health-list">
          <div><span>HKJC freshness</span><b>{match.health?.hkjcFreshness || fresh.label}</b></div>
          <div><span>HKJC fetched</span><b>{formatUpdated(match.health?.hkjcFetchedAt)}</b></div>
          <div><span>Forebet</span><b>{match.health?.forebetState || "NO DATA"}</b></div>
          <div><span>Forebet checked</span><b>{formatUpdated(match.health?.forebetCheckedAt)}</b></div>
          <div><span>Internal model</span><b>{match.health?.internalModelQuality || "NO DATA"}</b></div>
          <div><span>Internal source</span><b>{match.health?.internalModelSource || "NO DATA"}</b></div>
          <div><span>Fallback source</span><b>{match.health?.fallbackSource || "NO DATA"}</b></div>
          <div><span>Fallback status</span><b>{match.health?.fallbackStatus || "NO DATA"}</b></div>
          <div><span>Home alias</span><b>{match.health?.homeAliasPresent ? "OK" : "MISSING"}</b></div>
          <div><span>Away alias</span><b>{match.health?.awayAliasPresent ? "OK" : "MISSING"}</b></div>
          <div><span>Evidence channels</span><b>{evidenceCount}</b></div>
          <div><span>Multi-source members</span><b>{match.health?.multisourceMemberCount ?? match.multi?.sources ?? 0}</b></div>
          <div><span>Decision</span><b>{match.decision || "NO DATA"}</b></div>
          <div><span>Decision engine</span><b>{match.engineVersion || "NO DATA"}</b></div>
        </div>
        {match.health?.diagnostics?.length
          ? <p className="fineprint">Diagnostics：{match.health.diagnostics.join(" · ")}</p>
          : null}
        {match.health?.forebetReason ? <p className="fineprint">Forebet：{match.health.forebetReason}</p> : null}
        {match.health?.fallbackRecommendation ? <p className="fineprint">Fallback：{match.health.fallbackRecommendation}</p> : null}
        {missingReason ? <p className="fineprint">Missing-data reason: {missingReason}</p> : <p className="fineprint">Canonical evidence channels: {evidenceCount}</p>}
        </div>
      </details>

    </main>
  );
}
