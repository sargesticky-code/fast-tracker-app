"use client";

import { useEffect, useState } from "react";
import ModelEdgeChart from "@/components/model-edge-chart";
import ModelScoreboard from "@/components/model-scoreboard";
import {
  divergence,
  fairMarket,
  formatKickoff,
  formatOdds,
  formatUpdated,
  freshness,
  lineComparisonStatus,
  modelAgreement,
  modelCoverageCount,
  modelLabel,
  reviewPriority,
  sanitizeFallbackMatch,
  sideName,
} from "@/lib/fast-tracker";

const UI_BUILD = "DETAIL-DATA-LINK-CTX-20260924-1";
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
  if (!Number.isFinite(seconds)) return "等待";
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
  if (side === "H") return match.homeZh || match.home || "主";
  if (side === "A") return match.awayZh || match.away || "客";
  if (side === "BALANCED") return "均衡";
  return "—";
}


function formatFormDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "numeric",
    day: "numeric",
  }).format(d);
}

function formQualityLabel(value) {
  const text = String(value || "");
  if (!text) return "HISTORY ONLY";
  if (text.includes("INSUFFICIENT")) return "樣本不足";
  return text.replaceAll("_", " ");
}

function h2hQualityLabel(value, games = 0) {
  const text = String(value || "").toUpperCase();
  if (text === "H2H_OK") return `${games} 場已驗證`;
  if (text === "NO_PREVIOUS_H2H_IN_AVAILABLE_HISTORY") return "未有已驗證交手";
  if (text === "HISTORY_PARTIAL") return "歷史覆蓋中";
  return "等待 H2H 同步";
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
  if (r.includes("SPARSE")) return "歷史樣本不足";
  if (r.includes("INSUFFICIENT")) return "近期樣本不足";
  if (r.includes("UNSUPPORTED")) return "未支援聯賽歷史";
  if (r.includes("FIXTURE_ONLY")) return "只有賽程";
  if (r.includes("SOURCE_ABSENT")) return "來源無此場";
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
        <div className="model-hda-strip">
          {probs.map((row) => (
            <div key={row.key}><span>{row.key}</span><strong>{pct(row.value, 1)}</strong></div>
          ))}
        </div>
      ) : (
        <div className="model-empty-reason model-empty-slot" aria-label={modelStateLabel(false, stateReason)}>&nbsp;</div>
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
          <summary>明細</summary>
          <div className="form-recent-list">
            {recent.map((row, index) => (
              <div className="form-recent-row" key={"recent-" + String(row.kickoff || index) + "-" + index}>
                <span className={"form-mini-result form-" + String(row.result || "D").toLowerCase()}>{row.result || "—"}</span>
                <span className="form-date">{formatFormDate(row.kickoff)}</span>
                <span className="form-venue">{row.venue === "H" ? "主" : row.venue === "A" ? "客" : "—"}</span>
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
  const fixtureAgeMinutes = fixtureFetchedAt ? (Date.now() - new Date(fixtureFetchedAt).getTime()) / 60000 : Infinity;
  const fixtureFreshness = Number.isFinite(fixtureAgeMinutes) && fixtureAgeMinutes <= 90
    ? "FRESH"
    : Number.isFinite(fixtureAgeMinutes) && fixtureAgeMinutes <= 360
      ? "AGING"
      : "STALE";
  const allowCurrentPrice = fixtureFreshness === "FRESH";
  return {
    id: String(fixture.hkjc_event_id || matchId),
    kickoff: fixture.kickoff_hkt || null,
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
    health: {
      status: fixtureFreshness === "FRESH" ? "DETAIL_FALLBACK" : "DETAIL_FALLBACK_STALE",
      hkjcFreshness: fixtureFreshness,
      hkjcFetchedAt: fixtureFetchedAt,
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
          setMatch((previous) => previous || fixtureFallback);
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
          STORY_FEED_URL + "?id=" + encodeURIComponent(matchId) + "&lang=zh-HK&style=professional",
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
        <div className="detail-top"><a href="/" className="back">← 返回賽事</a></div>
        <section className="panel"><h2>未指定賽事</h2><p className="fineprint">請由 Betting Board 撳入一場賽事。</p></section>
      </main>
    );
  }

  if (!match && !ready) {
    return (
      <main className="shell detail-shell">
        <div className="detail-top"><a href="/" className="back">← 返回賽事</a><span>{id}</span></div>
        <section className="panel"><p className="fineprint">載入賽事資料中…</p></section>
      </main>
    );
  }

  if (!match) {
    return (
      <main className="shell detail-shell">
        <div className="detail-top"><a href="/" className="back">← 返回賽事</a><span>{id}</span></div>
        <section className="panel">
          <div className="panel-title"><div><p>MATCH</p><h2>暫時搵唔到賽事資料</h2></div></div>
          <p className="fineprint">呢個連結唔會再去 404。資料源未提供呢場時，可以直接返回賽事列表再開。</p>
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
  const movementDirectionZh = movementDirection === "SHORTENING" ? "賠率下壓" : movementDirection === "DRIFTING" ? "賠率上升" : "價格平穩";
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
        return need === 0 ? `${liveCornerTotal}/${liveCornerLine} · 已過大` : `${liveCornerTotal}/${liveCornerLine} · 差${need}`;
      })()
    : "—";
  const liveStats = match.live?.stats || null;
  const shadow = match.live?.shadow || null;
  const liveControlSide = shadow?.actualSide || visualControlSide(liveStats);
  const liveControlLabel = controlSideLabel(match, liveControlSide);
  const liveSignalRows = liveStats ? [
    { key: "xg", label: "xG", pair: liveStats.xg, digits: 2 },
    { key: "sot", label: "中框", pair: liveStats.shotsOnTarget, digits: 0 },
    { key: "shots", label: "射門", pair: liveStats.shots, digits: 0 },
    { key: "box", label: "禁區觸球", pair: liveStats.boxTouches, digits: 0 },
    { key: "possession", label: "控球", pair: liveStats.possession, digits: 0, suffix: "%" },
    { key: "corners", label: "角球", pair: liveStats.corners, digits: 0 },
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
  const goalsAdvice = totalsAdvice.goals || null;
  const cornersAdvice = totalsAdvice.corners || null;
  const totalAdviceTone = (row) => {
    const action = String(row?.action || "").toUpperCase();
    if (action === "PASS" || action === "NO_BET") return "pass";
    if (String(row?.candidateClass || "").toUpperCase().includes("VALUE")) return "value";
    return "watch";
  };
  const totalAdviceEdge = (row) => row?.candidateEdgePp == null
    ? "Edge —"
    : `Edge ${Number(row.candidateEdgePp) >= 0 ? "+" : ""}${Number(row.candidateEdgePp).toFixed(1)}pp`;
  const totalAdviceLabel = (row) => {
    if (!row) return "分析中";
    if (String(row.action || "").toUpperCase() === "NO_BET") return "暫不下注";
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
  const homeStarters = lineupEvidence.filter((r) => r.team_side === "HOME" && r.starter).map((r) => r.player_name).filter(Boolean);
  const awayStarters = lineupEvidence.filter((r) => r.team_side === "AWAY" && r.starter).map((r) => r.player_name).filter(Boolean);
  const humanQuality = humanSummary?.quality || (eventMap ? "MAPPED" : "NO DATA");
  const injuriesHome = humanSummary?.raw?.injury_count_home ?? playerStatusEvidence.filter((r) => r.team_side === "HOME").length;
  const injuriesAway = humanSummary?.raw?.injury_count_away ?? playerStatusEvidence.filter((r) => r.team_side === "AWAY").length;
  const lineupState = eventMap?.lineup_confirmed_at ? "CONFIRMED" : eventMap ? "PENDING" : "UNMAPPED";
  const injuryMax = Math.max(Number(injuriesHome) || 0, Number(injuriesAway) || 0, 1);
  const injuryGap = (Number(injuriesHome) || 0) - (Number(injuriesAway) || 0);
  const injurySignal = injuryGap === 0
    ? "傷停數量相若"
    : injuryGap > 0
      ? `主隊多 ${Math.abs(injuryGap)} 個缺陣 evidence`
      : `客隊多 ${Math.abs(injuryGap)} 個缺陣 evidence`;
  const lineupConfirmed = lineupState === "CONFIRMED";
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
    || (primarySide ? sideName(match, primarySide) : "暫無明確投注位");
  const rawAction = String(analysisDecision?.action || (primaryEdgePp != null && primaryEdgePp >= 2.5 ? "WATCH" : "PASS")).toUpperCase();
  const actionLabel = rawAction === "NO_BET" ? "暫不下注"
    : rawAction === "PASS" ? "暫時跳過"
      : rawAction.includes("STRONG") ? "強 Edge 候選"
        : rawAction.includes("VALUE") ? "Value 候選"
          : rawAction.includes("LEAN") ? "輕微傾向"
            : "觀察";
  const actionTone = rawAction === "NO_BET" || rawAction === "PASS" ? "pass"
    : rawAction.includes("STRONG") || rawAction.includes("VALUE") ? "value"
      : "watch";
  const decisionCleared = !["NO_BET", "PASS"].includes(rawAction);
  const pickLabel = decisionCleared ? "主要投注位" : "研究方向";
  const gapLabel = referencePriceOnly ? "REFERENCE GAP" : decisionCleared ? "精算 EDGE" : "MODEL GAP";
  const gateLabel = rawAction === "NO_BET" ? "未通過投注 Gate"
    : rawAction === "PASS" ? "目前無投注需要"
      : rawAction.includes("WATCH") ? "觀察中"
        : "候選已形成";
  const gateDetail = story?.invalidators?.length
    ? story.invalidators.slice(0, 3).join(" · ")
    : analysis?.invalidators?.length
      ? analysis.invalidators.slice(0, 3).join(" · ")
      : decisionCleared ? "目前未見主要 data-risk flag" : "等待更多可驗證 evidence";
  const rawBlockers = Array.isArray(story?.invalidators) && story.invalidators.length
    ? story.invalidators
    : Array.isArray(analysis?.invalidators) ? analysis.invalidators : [];
  const blockerTags = rawBlockers.slice(0, 5).map((item) => {
    const t = String(item || "");
    if (/fallback/i.test(t)) return "非 canonical feed";
    if (/不新鮮|stale|freshness/i.test(t)) return "市場價格未夠新";
    if (/evidence family|獨立 evidence/i.test(t)) return "模型來源不足";
    if (/XI|lineup/i.test(t)) return "正選未確認";
    if (/Phase 5|calibration/i.test(t)) return "Calibration 未過";
    if (/health/i.test(t)) return "Data health 未過";
    return t.length > 18 ? t.slice(0, 18) + "…" : t;
  });
  const fallbackAdvice = primarySide && primaryEdgePp != null
    ? `${primarySelectionLabel} @ ${Number.isFinite(primaryOdds) ? primaryOdds.toFixed(2) : "—"} · Edge ${primaryEdgePp >= 0 ? "+" : ""}${primaryEdgePp.toFixed(1)}pp`
    : "現時未有足夠資料形成清晰投注位。";
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
    const market = signal.market === "GOALS_OU" ? "入球" : signal.market === "CORNERS_OU" ? "角球" : "HDA";
    const selection = signal.editorialSelection === "OVER" ? "大"
      : signal.editorialSelection === "UNDER" ? "細"
        : signal.editorialSelection === "H" ? "主"
          : signal.editorialSelection === "D" ? "和"
            : signal.editorialSelection === "A" ? "客"
              : signal.editorialSelection || "—";
    const line = signal.editorialLine == null ? "" : " " + signal.editorialLine;
    return market + " " + selection + line;
  };
  const editorialStatusLabel = (status) => status === "SUPPORT" ? "同模型一致"
    : status === "CONTRADICT" ? "同模型相反"
      : status === "DIFFERENT_LINE" ? "不同盤口"
        : "Context";
  const storyEvidence = story?.evidenceSummary || {};
  const storyEvidenceTags = [
    storyEvidence.forebet ? "Forebet" : null,
    storyEvidence.internalModels ? "Internal" : null,
    storyEvidence.teamForm ? "Team Form" : null,
    storyEvidence.optaStrength ? "Opta" : null,
    Number(storyEvidence.humanFactorRows || 0) > 0 ? "Human Factors" : null,
    Number(storyEvidence.scenarioRows || 0) > 0 ? "Scenario" : null,
    Number(storyEvidence.commentaryRows || 0) > 0 ? "球評" : null,
  ].filter(Boolean);
  const sourceModeLabel = analysisSourceMode.includes("FALLBACK") ? "DB FALLBACK" : analysisSourceMode.includes("CANONICAL") ? "CANONICAL FEED" : "SOURCE CHECK";
  const priceStatusLabel = referencePriceOnly ? "REFERENCE ONLY" : "CURRENT";
  const sideRows = [
    { key: "H", label: match.homeZh || match.home || "主", odds: referencePriceOnly ? null : match.odds?.home, fair: market?.home },
    { key: "D", label: "和", odds: referencePriceOnly ? null : match.odds?.draw, fair: market?.draw },
    { key: "A", label: match.awayZh || match.away || "客", odds: referencePriceOnly ? null : match.odds?.away, fair: market?.away },
  ];

  const marketIntel = deep?.marketIntelligence || {};
  const phase4Values = Array.isArray(marketIntel.value) ? marketIntel.value : [];
  const phase4Arbs = Array.isArray(marketIntel.arbitrage) ? marketIntel.arbitrage : [];
  const bestValue = marketIntel.bestValue || phase4Values[0] || null;
  const phase4SelectionLabel = (selection) => {
    if (selection === "HOME") return match.homeZh || match.home || "主勝";
    if (selection === "DRAW") return "和";
    if (selection === "AWAY") return match.awayZh || match.away || "客勝";
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
        <a href="/" className="back">← 返回</a>
        <span className="detail-top-updated">更新 {formatUpdated(match.updatedAt)}</span>
        <button type="button" className="back" onClick={() => {
          setReady(false);
          setSource("REFRESHING");
          setRefreshNonce((n) => n + 1);
        }}>↻ 最新</button>
      </div>

      <section className="detail-board-hero">
        <div className="detail-board-meta">
          <span>{formatKickoff(match.kickoff)}</span>
          <b>{match.league}</b>
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
                  ? `${sourceContext.source || "External"} 已核實呢場賽事`
                  : "賽事 link 正常，但暫未有可用模型 evidence"}
              </h2>
            </div>
            <span>
              {sourceContextVerified ? Math.round(sourceContextConfidence * 100) + "% MATCH" : "NO MODEL"}
            </span>
          </div>
          {sourceContextVerified ? (
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", fontSize:9, fontWeight:850, color:"#587080" }}>
              <span>{sourceContext.identityStatus || "MATCHED"}</span>
              {sourceContext.detailAvailable ? <b>DETAIL ✓</b> : <span>DETAIL 待補</span>}
              {sourceContext.lineupAvailable ? <b>LINEUP ✓</b> : <span>LINEUP —</span>}
              {sourceContext.statsAvailable ? <b>STATS ✓</b> : <span>STATS —</span>}
              {sourceContext.xgAvailable ? <b>xG ✓</b> : <span>xG —</span>}
            </div>
          ) : null}
          <p className="fineprint" style={{ margin:"7px 0 0" }}>
            {sourceContextVerified
              ? "呢層只用嚟確認 fixture / lineup / context coverage；唔會改模型概率、HKJC fair probability 或精算 Edge。"
              : "系統已分開 route dead 同 data dead；呢場係資料覆蓋缺口，唔會用假 model 補數。"}
          </p>
        </section>
      ) : null}

      <section className={`detail-decision-board betting-command-${actionTone}`}>
        <div className="detail-decision-head">
          <div>
            <span>QUANT BETTING VIEW</span>
            <h2>精算投注 · {actionLabel}</h2>
          </div>
          <b>{storyMode === "AI_GROUNDED" || storyMode === "AI_GROUNDED_RETRY" ? "AI GROUNDED" : story ? "STORY READY" : analysis ? "INTERPRETER READY" : "PHASE 1"}</b>
        </div>

        <div className="detail-decision-grid">
          <div className="detail-decision-pick">
            <span>{pickLabel}</span>
            <strong>{primarySelectionLabel}</strong>
            <small>{referencePriceOnly ? (Number.isFinite(referenceOdds) ? "舊價 @" + referenceOdds.toFixed(2) + " · reference only" : "CURRENT PRICE —") : Number.isFinite(primaryOdds) ? "@" + primaryOdds.toFixed(2) : "—"}</small>
          </div>

          <div className="detail-decision-edge">
            <span>{gapLabel}</span>
            <strong>{primaryEdgePp == null || !Number.isFinite(primaryEdgePp) ? "—" : (primaryEdgePp >= 0 ? "+" : "") + primaryEdgePp.toFixed(1) + "pp"}</strong>
            <small style={{ display:"block", marginTop:4, color:"#6f8177", fontSize:8, fontWeight:850 }}>
              {Number.isFinite(primaryModelProbability) && Number.isFinite(primaryMarketProbability)
                ? `模型 ${(primaryModelProbability * 100).toFixed(1)}% − HKJC fair ${(primaryMarketProbability * 100).toFixed(1)}%`
                : "等待可比較概率"}
            </small>
          </div>

          <div className="detail-decision-prob">
            <div><span>模型</span><b>{Number.isFinite(primaryModelProbability) ? (primaryModelProbability * 100).toFixed(1) + "%" : "—"}</b></div>
            <div><span>市場</span><b>{Number.isFinite(primaryMarketProbability) ? (primaryMarketProbability * 100).toFixed(1) + "%" : "—"}</b></div>
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
          <span>精算結論</span>
          <p>{bettingAdvice}</p>
        </div>
        <div style={{ marginTop:6, color:"#7a8981", fontSize:8.5, fontWeight:750 }}>
          Edge 係「模型概率 − HKJC 去水後公平概率」嘅差距，單位係 percentage points (pp)，唔等於預計回報率。
        </div>

        {!decisionCleared && blockerTags.length ? (
          <div className="detail-blocker-line">
            <span>未通過</span>
            <div>{blockerTags.map((tag, index) => <b key={tag + index}>{tag}</b>)}</div>
          </div>
        ) : null}
      </section>

      {storyContent ? (
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

      <section className="panel model-visual-panel">
        <div className="panel-title">
          <div><p>MODEL CONSENSUS</p><h2>邊個模型支持呢個投注位</h2></div>
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
            <div><span>市場</span><b>{analysis.story?.marketRead || ""}</b></div>
            <div><span>模型</span><b>{analysis.story?.modelRead || ""}</b></div>
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

      <section className="panel totals-board-panel">
        <div className="panel-title"><div><p>HKJC TOTALS</p><h2>入球及角球</h2></div></div>
        <div className="totals-board">
          <div className="totals-row">
            <div className="totals-name"><span>入球大細</span><b>盤口 {match.goals?.line || "—"}</b></div>
            <div className="totals-prices"><b>大 {match.goals?.line || "—"} · {formatOdds(match.goals?.over)}</b><b>細 {match.goals?.line || "—"} · {formatOdds(match.goals?.under)}</b></div>
            <div className="totals-model-note">
              <div className={"totals-suggestion " + totalAdviceTone(goalsAdvice)}>
                <span>建議</span>
                <strong>{totalAdviceLabel(goalsAdvice)}</strong>
                {goalsAdvice?.currentOdds != null ? <em>@ {formatOdds(goalsAdvice.currentOdds)}</em> : null}
                <b>{totalAdviceEdge(goalsAdvice)}</b>
                {goalsAdvice?.evidenceFamilyCount != null ? <small>{goalsAdvice.evidenceFamilyCount} families · {goalsAdvice.sourceSignalCount ?? goalsAdvice.evidenceFamilyCount} signals</small> : null}
              </div>
              {goalsLineModel?.over != null
                ? <small className={goalsLineModel.derived ? "line-derived" : ""}>
                    {goalsLineModel.derived ? "MODEL-DERIVED" : "FOREBET"} · 大 {(goalsLineModel.over * 100).toFixed(0)}% · 細 {(goalsLineModel.under * 100).toFixed(0)}% · Avg {goalsLineModel.avg ?? "—"}
                  </small>
                : <small className={goalsCompare.comparable ? "" : "line-warning"}>{goalsCompare.label || "同線模型 NO DATA"}</small>}
            </div>
          </div>

          <div className="totals-row">
            <div className="totals-name"><span>角球大細</span><b>盤口 {match.corners?.line || "—"}</b></div>
            <div className="totals-prices"><b>大 {match.corners?.line || "—"} · {formatOdds(match.corners?.over)}</b><b>細 {match.corners?.line || "—"} · {formatOdds(match.corners?.under)}</b></div>
            <div className="totals-model-note">
              <div className={"totals-suggestion " + totalAdviceTone(cornersAdvice)}>
                <span>建議</span>
                <strong>{totalAdviceLabel(cornersAdvice)}</strong>
                {cornersAdvice?.currentOdds != null ? <em>@ {formatOdds(cornersAdvice.currentOdds)}</em> : null}
                <b>{totalAdviceEdge(cornersAdvice)}</b>
                {cornersAdvice?.evidenceFamilyCount != null ? <small>{cornersAdvice.evidenceFamilyCount} families · {cornersAdvice.sourceSignalCount ?? cornersAdvice.evidenceFamilyCount} signals</small> : null}
              </div>
              {cornersLineModel?.over != null
                ? <small className={cornersLineModel.derived ? "line-derived" : ""}>
                    {cornersLineModel.derived ? "MODEL-DERIVED" : "FOREBET"} · 大 {(cornersLineModel.over * 100).toFixed(0)}% · 細 {(cornersLineModel.under * 100).toFixed(0)}% · Avg {cornersLineModel.avg == null ? "—" : Number(cornersLineModel.avg).toFixed(1)}
                  </small>
                : <small className={cornersCompare.comparable ? "" : "line-warning"}>{cornersCompare.label || "同線模型 NO DATA"}</small>}
            </div>
          </div>
        </div>
      </section>


      <section className="panel model-intelligence-panel phase4-board-panel">
        <div className="panel-title">
          <div><p>PHASE 4 · MARKET INTELLIGENCE</p><h2>Value / Arbitrage 市場掃描</h2></div>
          <span>{String(marketIntel.mode || "DETECT_ONLY").replaceAll("_", " ")}</span>
        </div>

        <div className="phase4-board">
          <div className="phase4-value-cell">
            <span>TOP SIGNAL</span>
            <strong>{bestValue ? phase4SelectionLabel(bestValue.selection_key) : "—"}</strong>
            <small>{bestValue ? (bestValue.provider_id || "—") + " @" + formatOdds(bestValue.odds_decimal) : "未有可比較 value"}</small>
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
            <summary>完整 Phase 4 signals</summary>
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

        <p className="fineprint">Value 依賴模型機率；Arbitrage 只依賴可同時成交、settlement 相容嘅跨平台價格。Execution 維持 OFF / fail-closed。</p>
      </section>


      <section className="panel team-form-panel">
        <div className="panel-title">
          <div><p>TEAM FORM</p><h2>近期表現比較</h2></div>
          <span>{formQualityLabel(match.formDetail?.quality)}</span>
        </div>
        <div className="team-form-grid">
          <TeamFormCard
            title="主隊 HOME"
            name={match.homeZh || match.home}
            detail={match.formDetail?.home}
          />
          <TeamFormCard
            title="客隊 AWAY"
            name={match.awayZh || match.away}
            detail={match.formDetail?.away}
          />
        </div>
        <p className="fineprint">
          最近賽果只用已確認 HKJC match results；W=勝、D=和、L=負。Model sample 係 Team-Form 模型可用樣本量，唔等同上面只展示嘅最近 5 場。
          {match.formDetail?.source ? " · Source: " + match.formDetail.source : ""}
        </p>
      </section>

      <section className="panel h2h-panel">
        <div className="panel-title">
          <div><p>HEAD TO HEAD</p><h2>對賽成績</h2></div>
          <span>{h2hQualityLabel(h2hQuality, h2hGames)}</span>
        </div>

        {h2hGames > 0 ? (
          <>
            <div className="h2h-scoreboard">
              <div>
                <span>{match.homeZh || match.home}</span>
                <strong>{h2hHomeWins}</strong>
                <small>勝</small>
              </div>
              <div className="h2h-draw">
                <span>和局</span>
                <strong>{h2hDraws}</strong>
                <small>{h2hGames} 場</small>
              </div>
              <div>
                <span>{match.awayZh || match.away}</span>
                <strong>{h2hAwayWins}</strong>
                <small>勝</small>
              </div>
            </div>

            <div className="h2h-metrics">
              <div><span>對賽入球</span><b>{h2hHomeGoals} - {h2hAwayGoals}</b></div>
              <div><span>平均總入球</span><b>{Number.isFinite(h2hAvgGoals) ? h2hAvgGoals.toFixed(2) : "—"}</b></div>
              <div><span>最近方向</span><b>{h2h.last5 || "—"}</b></div>
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
                ? "HKJC 歷史覆蓋仍在補齊"
                : h2hQuality === "NO_PREVIOUS_H2H_IN_AVAILABLE_HISTORY"
                  ? "可用 HKJC 歷史內未找到兩隊直接交手"
                  : "H2H 資料正在同步"}
            </strong>
            <span>
              {h2hQuality === "HISTORY_PARTIAL"
                ? "暫時唔將缺少對賽當成負面訊號，等歷史資料完成後再更新。"
                : "沒有已驗證交手 ≠ FAIL；系統會保持中性，不會用不存在的數據推斷。"}
            </span>
          </div>
        )}

        <p className="fineprint">
          只用 HKJC stable team ID 對應嘅已確認賽果；H / D / A 以今場主隊角度計算。最多顯示最近 5 次直接交手。
          {h2h?.source ? " · Source: " + h2h.source : ""}
        </p>
      </section>

      <section className="panel model-intelligence-panel">
        <div className="panel-title">
          <div><p>MODEL INTELLIGENCE</p><h2>模型實際內容</h2></div>
          <span>{modelCardsAvailable}/5 有可用 H/D/A</span>
        </div>
        <p className="panel-intro">先睇共識，再按需要展開原始模型細節。H / D / A 同 Edge 放埋一行，方便直接比較。</p>
        <ModelScoreboard rows={coreModelRows} targetSide={primarySide} market={market} />
        <details className="model-deep-dive">
          <summary>查看各模型詳細數據</summary>
          <div className="model-intel-grid">
          <ModelIntelCard
            code="FOREBET"
            title="Forebet prediction"
            values={match.forebet}
            state={probabilityAvailable(match.forebet) ? "MODEL" : null}
            stateReason={match.health?.forebetCoverageStatus || match.health?.forebetState}
            metrics={[
              { label: "預測比分", value: forebetDeep.predicted_score || match.forebetDetail?.predictedScore || "—" },
              { label: "平均入球", value: forebetDeep.avg_goals == null ? "—" : numText(forebetDeep.avg_goals, 2) },
              { label: "O2.5 / U2.5", value: `${pct(forebetDeep.prob_over25 ?? match.forebetDetail?.ou25?.over, 0)} / ${pct(forebetDeep.prob_under25 ?? match.forebetDetail?.ou25?.under, 0)}` },
              { label: "角球預測", value: forebetDeep.corner_predicted_score || forebetDeep.corner_prediction || "—" },
              { label: "O9.5 / U9.5", value: `${pct(forebetDeep.corner_prob_over95 ?? match.forebetDetail?.corners95?.over, 0)} / ${pct(forebetDeep.corner_prob_under95 ?? match.forebetDetail?.corners95?.under, 0)}` },
              { label: "平均角球", value: forebetDeep.avg_corners == null ? "—" : numText(forebetDeep.avg_corners, 2) },
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
              { label: "xG 主 / 客", value: `${numText(dcDetail?.expectedGoals?.home, 2)} / ${numText(dcDetail?.expectedGoals?.away, 2)}` },
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
              { label: "Rating 主 / 客", value: `${numText(piDetail?.ratings?.home, 3)} / ${numText(piDetail?.ratings?.away, 3)}` },
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
              { label: "Form xG 主 / 客", value: `${numText(formDeep.form_xg_home ?? match.formDetail?.home?.expectedGoals, 2)} / ${numText(formDeep.form_xg_away ?? match.formDetail?.away?.expectedGoals, 2)}` },
              { label: "有效樣本 主 / 客", value: `${formDeep.home_games ?? match.formDetail?.home?.modelGames ?? 0} / ${formDeep.away_games ?? match.formDetail?.away?.modelGames ?? 0}` },
              { label: "主客場樣本", value: `${formDeep.home_venue_games ?? match.formDetail?.home?.venueGames ?? 0} / ${formDeep.away_venue_games ?? match.formDetail?.away?.venueGames ?? 0}` },
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
              { label: "Power 主 / 客", value: `${numText(optaHomeRating, 1)} / ${numText(optaAwayRating, 1)}` },
              { label: "Rank 主 / 客", value: `${optaHomeRank == null ? "—" : "#" + optaHomeRank} / ${optaAwayRank == null ? "—" : "#" + optaAwayRank}` },
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
            <div><p>ODDS MOVEMENT</p><h2>HKJC 價格訊號</h2></div>
            <span>{movement.signal || "COLLECTING"}</span>
          </div>

          <div className={"odds-signal-hero " + (movementPct < 0 ? "is-shortening" : movementPct > 0 ? "is-drifting" : "is-flat")}>
            <div className="odds-signal-side">
              <span>市場方向</span>
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
              <small>{Math.abs(movementPct) >= 10 ? "重大變動" : "一般變動"}</small>
            </div>
          </div>

          <div className="odds-context-strip">
            <div><span>Implied probability</span><b>{movement.move24hPp == null ? "—" : Number(movement.move24hPp).toFixed(1) + "%"}</b></div>
            <div><span>Model alignment</span><b>{movement.modelAlignment || "—"}</b></div>
            <div><span>Baseline</span><b>{movement.baselineWindow || "Base"}</b></div>
          </div>
        </section>
      )}

      <section className="panel human-factor-panel">
        <div className="panel-title">
          <div><p>PHASE 2 · HUMAN FACTORS</p><h2>人為因素訊號</h2></div>
          <span>{humanQuality}</span>
        </div>

        <div className="human-signal-strip">
          <div className="human-signal-card">
            <span>傷停壓力</span>
            <strong>{injurySignal}</strong>
            <div className="injury-pressure">
              <div>
                <small>主 {injuriesHome}</small>
                <i><b style={{ width: ((Number(injuriesHome) || 0) / injuryMax * 100) + "%" }}></b></i>
              </div>
              <div>
                <small>客 {injuriesAway}</small>
                <i><b style={{ width: ((Number(injuriesAway) || 0) / injuryMax * 100) + "%" }}></b></i>
              </div>
            </div>
          </div>

          <div className={"human-signal-card lineup-signal " + (lineupConfirmed ? "is-confirmed" : "is-pending")}>
            <span>Official XI</span>
            <strong>{lineupConfirmed ? "已確認" : lineupState === "PENDING" ? "等待公布" : "未配對"}</strong>
            <small>{lineupEvidence.length ? `${lineupEvidence.length} player rows` : "未有 confirmed lineup"}</small>
          </div>

          <div className="human-signal-card">
            <span>Evidence quality</span>
            <strong>{humanQuality}</strong>
            <small>{eventMap ? `fixture match ${numText(eventMap.match_quality, 3)}` : "fixture 未配對"}</small>
          </div>
        </div>

        <div className="human-summary-grid compact-human-grid">
          <div><span>Referee</span><b>{humanSummary?.referee || "—"}</b><small>{humanSummary?.source || "API_FOOTBALL"}</small></div>
          <div><span>Coach rotation</span><b>{humanSummary?.coach_rotation || "—"}</b><small>reported context</small></div>
          <div><span>Player evidence</span><b>{playerStatusEvidence.length}</b><small>active status rows</small></div>
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
          <div className="human-wait-state">Official lineup 尚未發布；只顯示 confirmed evidence，唔用 projected XI 冒充正選。</div>
        )}

        {(managerEvidence.length || playerStatusEvidence.length) ? (
          <details className="human-deep-dive">
            <summary>查看球員 / 教練 evidence</summary>
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
                  <div key={row.id}><span>{row.team_side} · {row.status_type}</span><b>{row.raw?.player?.name || row.raw?.player_name || row.player_key}</b><small>{row.status_value || "—"} · {row.source_name}</small></div>
                ))}
              </div>
            ) : null}
          </details>
        ) : null}
      </section>

      {scenarioRows.length ? (
        <section className="panel scenario-panel scenario-board-panel">
          <div className="panel-title">
            <div><p>PHASE 3 · MATCH SCENARIO</p><h2>比賽走勢時間段</h2></div>
            <span>{scenarioRows[0]?.segment_prediction_status || "CALIBRATING"}</span>
          </div>

          <div className="scenario-board-head" aria-hidden="true">
            <span>時段</span>
            <span>預期控制</span>
            <span>主隊入球</span>
            <span>客隊入球</span>
            <span>角球 主 / 客</span>
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
        {missingReason ? <p className="fineprint">缺資料原因：{missingReason}</p> : <p className="fineprint">Canonical evidence channels：{evidenceCount}</p>}
        </div>
      </details>

    </main>
  );
}
