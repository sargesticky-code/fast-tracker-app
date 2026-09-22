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
  modelCoverageCount,
  modelLabel,
  sanitizeFallbackMatch,
  sideName,
} from "@/lib/fast-tracker";

const UI_BUILD = "DETAIL-V2-20260922-1";
const FEED_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-phase1-feed?hours=48";
const LIVE_FEED_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-live-feed";
const DETAIL_FEED_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-match-detail";
const ANALYSIS_FEED_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-match-analysis";

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
  const games = Number(detail?.games || 0);
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
  const momentumLabel = momentum == null ? "NO HISTORY" : momentum >= 67 ? "HOT FORM" : momentum >= 40 ? "STEADY" : "WEAK FORM";
  const goalDiff = gf - ga;

  return (
    <div className="team-form-card form-signal-card">
      <div className="team-form-card-head">
        <div>
          <small>{title}</small>
          <h3>{name}</h3>
        </div>
        <span className={"form-signal-label " + (momentum == null ? "" : momentum >= 67 ? "is-hot" : momentum >= 40 ? "is-steady" : "is-weak")}>{momentumLabel}</span>
      </div>

      {recent.length ? (
        <>
          <div className="form-momentum-row">
            <div className="form-momentum-score">
              <span>FORM MOMENTUM</span>
              <strong>{momentum}%</strong>
            </div>
            <div className="form-momentum-track" aria-label={"Form momentum " + momentum + "%"}>
              <i style={{ width: momentum + "%" }}></i>
            </div>
            <div className={"form-goal-balance " + (goalDiff > 0 ? "positive" : goalDiff < 0 ? "negative" : "")}>
              <span>GOAL DIFF</span>
              <b>{goalDiff > 0 ? "+" : ""}{goalDiff}</b>
            </div>
          </div>

          <div className="form-sequence" aria-label="最近賽果">
            {recent.map((row, index) => (
              <span
                className={"form-chip form-" + String(row.result || "D").toLowerCase()}
                key={String(row.kickoff || index) + "-" + index}
                title={(row.opponent || "Opponent") + " " + (row.gf ?? "—") + "-" + (row.ga ?? "—")}
              >
                {row.result || "—"}
              </span>
            ))}
          </div>

          <div className="form-summary-grid">
            <div><span>戰績</span><b>{wins}W-{draws}D-{losses}L</b></div>
            <div><span>PPG</span><b>{Number.isFinite(ppg) ? ppg.toFixed(2) : "—"}</b></div>
            <div><span>入 / 失</span><b>{gf} / {ga}</b></div>
            <div><span>Form xG</span><b>{Number.isFinite(xg) ? xg.toFixed(2) : "—"}</b></div>
          </div>

          <details className="form-match-details">
            <summary>最近比賽明細</summary>
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
        </>
      ) : (
        <div className="form-no-history">暫時未有已確認近賽結果。</div>
      )}

      <div className="form-sample-line">
        Model sample {modelGames || 0} 場 · venue sample {venueGames || 0} 場
      </div>
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
      home: n(fixture.had_home),
      draw: n(fixture.had_draw),
      away: n(fixture.had_away),
    },
    goals: {
      line: fixture.hil_line || null,
      over: n(fixture.hil_over),
      under: n(fixture.hil_under),
    },
    corners: {
      line: fixture.chl_line || null,
      over: n(fixture.chl_over),
      under: n(fixture.chl_under),
    },
    health: {
      status: "DETAIL_FALLBACK",
      hkjcFreshness: "FRESH",
      hkjcFetchedAt: fixture.fetched_at || fixture.updated_at || null,
      evidenceChannelCount: 0,
      unifiedCoverageStatus: "HKJC_ONLY",
    },
    updatedAt: fixture.fetched_at || fixture.updated_at || null,
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

export default function MatchDetailClient({ snapshotMatches = [] }) {
  const [id, setId] = useState("");
  const [match, setMatch] = useState(null);
  const [source, setSource] = useState("LOADING");
  const [ready, setReady] = useState(false);
  const [deep, setDeep] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    const matchId = new URLSearchParams(window.location.search).get("id") || "";
    setId(matchId);
    setAnalysis(null);
    setDeep(null);

    if (!matchId) {
      setReady(true);
      return;
    }

    const cached = readCachedMatch(matchId);
    const fallback = snapshotMatches.find((m) => String(m.id) === String(matchId)) || null;

    let cancelled = false;
    let resolvedFresh = false;

    async function refreshMatch() {
      try {
        const res = await fetch(FEED_URL + "&_=" + Date.now(), { cache: "no-store" });
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
        const res = await fetch(DETAIL_FEED_URL + "?id=" + encodeURIComponent(matchId) + "&_=" + Date.now(), { cache: "no-store" });
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
        const res = await fetch(ANALYSIS_FEED_URL + "?id=" + encodeURIComponent(matchId) + "&_=" + Date.now(), { cache: "no-store" });
        if (!res.ok) return;
        const payload = await res.json();
        if (cancelled || payload?.error) return;
        setAnalysis(payload);
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

    Promise.allSettled([refreshMatch(), refreshLive(), refreshDetail(), refreshAnalysis()]).then(() => {
      if (cancelled) return;
      if (!resolvedFresh && (cached || fallback)) {
        setMatch(cached || fallback);
        setSource(cached ? "FALLBACK CACHE" : "FALLBACK SNAPSHOT");
      }
      setReady(true);
    });

    const fullTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshMatch();
        refreshDetail();
        refreshAnalysis();
      }
    }, 45000);
    const liveTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshLive();
    }, 10000);

    const refreshVisible = () => {
      if (document.visibilityState === "visible") {
        refreshLive();
        refreshMatch();
        refreshDetail();
        refreshAnalysis();
      }
    };
    const refreshPageShow = () => {
      refreshLive();
      refreshMatch();
      refreshDetail();
      refreshAnalysis();
    };
    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("pageshow", refreshPageShow);

    return () => {
      cancelled = true;
      window.clearInterval(fullTimer);
      window.clearInterval(liveTimer);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("pageshow", refreshPageShow);
    };
  }, [snapshotMatches, refreshNonce]);

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
  const missingReason = match.health?.primaryMissingReason || match.health?.forebetReason || null;
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
  const liveLanes = match.live ? (() => {
    const statsLane = liveLaneStatus(liveStats?.capturedAt, 180, 600);
    const detailStatus = String(match.live?.detail?.detailStatus || liveStats?.detailStatus || "").toUpperCase();
    if (!Number.isFinite(statsLane.age)) {
      if (detailStatus === "NOT_APPLICABLE") Object.assign(statsLane, { state: "unavailable", label: "score-only" });
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
  const primaryOdds = analysisDecision?.currentOdds != null
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
  const fallbackAdvice = primarySide && primaryEdgePp != null
    ? `${primarySelectionLabel} @ ${Number.isFinite(primaryOdds) ? primaryOdds.toFixed(2) : "—"} · Edge ${primaryEdgePp >= 0 ? "+" : ""}${primaryEdgePp.toFixed(1)}%`
    : "現時未有足夠資料形成清晰投注位。";
  const bettingAdvice = analysis?.story?.advice || fallbackAdvice;
  const sideRows = [
    { key: "H", label: match.homeZh || match.home || "主", odds: match.odds?.home, fair: market?.home },
    { key: "D", label: "和", odds: match.odds?.draw, fair: market?.draw },
    { key: "A", label: match.awayZh || match.away || "客", odds: match.odds?.away, fair: market?.away },
  ];

  return (
    <main className="shell detail-shell">
      <div className="detail-top">
        <a href="/" className="back">← 返回</a>
        <span>{match.id} · FORM VIEW {UI_BUILD} · {source} · 更新 {formatUpdated(match.updatedAt)}</span>
        <button type="button" className="back" onClick={() => {
          setReady(false);
          setSource("REFRESHING");
          setRefreshNonce((n) => n + 1);
        }}>↻ 最新</button>
      </div>

      <section className="detail-hero detail-v2-hero">
        <div className="detail-v2-meta">
          <span>{formatKickoff(match.kickoff)}</span>
          <b>{match.league}</b>
          <span>{match.id}</span>
        </div>
        <div className="detail-v2-fixture">
          <div className="detail-v2-team home">
            <small>HOME</small>
            <h1>{match.homeZh || match.home}</h1>
            {match.homeEn && match.homeZh ? <span>{match.homeEn}</span> : null}
          </div>
          <div className="detail-v2-centre">
            <strong>VS</strong>
            {predictedScore ? <span>Forebet <b>{predictedScore}</b></span> : <span>&nbsp;</span>}
          </div>
          <div className="detail-v2-team away">
            <small>AWAY</small>
            <h1>{match.awayZh || match.away}</h1>
            {match.awayEn && match.awayZh ? <span>{match.awayEn}</span> : null}
          </div>
        </div>
        <div className="detail-status-row">
          <span className={`freshness freshness-${fresh.key}`}>{fresh.label}</span>
          <span className="evidence-count">{evidenceCount} evidence inputs</span>
        </div>
      </section>

      <section className={`betting-command betting-command-${actionTone}`}>
        <div className="betting-command-head">
          <div>
            <span>BETTING VIEW</span>
            <h2>{actionLabel}</h2>
          </div>
          <b>{analysis ? "Interpreter ready" : "基於現有 Phase 1 資料"}</b>
        </div>

        <div className="betting-command-grid">
          <div className="betting-primary-pick">
            <span>主要投注位</span>
            <strong>{primarySelectionLabel}</strong>
            <b>{Number.isFinite(primaryOdds) ? "@ " + primaryOdds.toFixed(2) : " "}</b>
          </div>
          <div className="betting-edge-hero">
            <span>EDGE</span>
            <strong>{primaryEdgePp == null || !Number.isFinite(primaryEdgePp) ? "—" : (primaryEdgePp >= 0 ? "+" : "") + primaryEdgePp.toFixed(1) + "%"}</strong>
            <small>Model probability − HKJC fair probability</small>
          </div>
          <div className="betting-prob-compare">
            <div><span>模型</span><b>{Number.isFinite(primaryModelProbability) ? (primaryModelProbability * 100).toFixed(1) + "%" : "—"}</b></div>
            <div><span>市場</span><b>{Number.isFinite(primaryMarketProbability) ? (primaryMarketProbability * 100).toFixed(1) + "%" : "—"}</b></div>
          </div>
        </div>

        <div className="betting-advice-copy">
          <span>BETTING ADVICE</span>
          <p>{bettingAdvice}</p>
        </div>

        <div className="detail-market-strip">
          {sideRows.map((row) => (
            <div className={primarySide === row.key ? "edge-target" : ""} key={row.key}>
              <span>{row.key} · {row.label}</span>
              <b>{formatOdds(row.odds)}</b>
              <small>{row.fair == null ? " " : "Fair " + (Number(row.fair) * 100).toFixed(1) + "%"}</small>
              {primarySide === row.key ? <em>EDGE</em> : null}
            </div>
          ))}
        </div>
      </section>

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

      {analysis ? (
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
      ) : (
        <section className="panel analyst-panel analyst-detail-panel analyst-loading">
          <div className="panel-title"><div><p>WHY THIS BET</p><h2>分析資料載入中</h2></div></div>
          <div className="analysis-placeholder-grid"><span></span><span></span><span></span></div>
        </section>
      )}

      {match.liveNow && match.live && (
        <section className="panel live-detail-panel">
          <div className="panel-title">
            <div><p>HKJC LIVE</p><h2>即場市場</h2></div>
            <span>{match.live.status || "LIVE"}</span>
          </div>
          {liveLanes ? (
            <div className="live-freshness-strip">
              <span className={"lane-" + liveLanes.odds.state}>賠率 <b>{liveLanes.odds.label}</b></span>
              <span className={"lane-" + liveLanes.score.state}>比分 <b>{liveLanes.score.label}</b></span>
              <span className={"lane-" + liveLanes.stats.state}>Stats <b>{liveLanes.stats.label}</b></span>
              <span className={"lane-" + liveLanes.shadow.state}>Shadow <b>{liveLanes.shadow.label}</b></span>
              {liveBottleneck && liveBottleneck[1].state !== "fresh"
                ? <strong>目前最慢：{liveBottleneck[0]} {liveBottleneck[1].label}</strong>
                : <strong className="fresh">四層同步正常</strong>}
            </div>
          ) : null}
          <div className="live-score-summary">
            <div><span>比分</span><b>{liveScoreText}</b></div>
            <div><span>時間</span><b>{liveMinute}</b></div>
            <div><span>角球</span><b>{Number.isFinite(liveCornerTotal) ? liveCornerTotal : "—"}</b></div>
            <div><span>角球進度</span><b>{liveCornerProgress}</b></div>
          </div>
          {!liveStats && String(match.live?.detail?.detailStatus || "").toUpperCase() === "NOT_APPLICABLE" ? (
            <div className="live-detail-source-note">目前比分來源只提供 score / minute；今場未有可用 xG、射門、控球 detail。</div>
          ) : null}
          {!liveStats && String(match.live?.detail?.detailStatus || "").toUpperCase() === "DEFERRED_RATE_GUARD" ? (
            <div className="live-detail-source-note warn">Detail source 正受 rate guard；會保留 last-good stats，下一 cycle 再更新。</div>
          ) : null}
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
          <div className="big-odds">
            <div><span>主</span><b>{formatOdds(match.live.odds?.home)}</b></div>
            <div><span>和</span><b>{formatOdds(match.live.odds?.draw)}</b></div>
            <div><span>客</span><b>{formatOdds(match.live.odds?.away)}</b></div>
          </div>
          <div className="totals-grid live-detail-totals">
            <div className="total-market">
              <span>即場入球 O/U · {match.live.goals?.line || "—"}</span>
              <div><b>大 {formatOdds(match.live.goals?.over)}</b><b>細 {formatOdds(match.live.goals?.under)}</b></div>
            </div>
            <div className="total-market">
              <span>即場角球 O/U · {match.live.corners?.line || "—"}</span>
              <div><b>大 {formatOdds(match.live.corners?.over)}</b><b>細 {formatOdds(match.live.corners?.under)}</b></div>
            </div>
          </div>
          <p className="fineprint">
            Live market：HKJC freshness gate · Score source：{liveScore.source || "—"}
            {liveScore.confidence == null ? "" : ` · match confidence ${Number(liveScore.confidence).toFixed(2)}`}
            {liveStats?.source ? ` · Stats source：${liveStats.source}` : ""}
            {match.live?.detail?.detailStatus ? ` · Detail：${match.live.detail.detailStatus}` : ""}
          </p>
        </section>
      )}

      {match.liveNow && shadow && (
        <section className="panel shadow-detail-panel">
          <div className="panel-title">
            <div><p>PHASE 3 SHADOW</p><h2>Expected vs Actual</h2></div>
            <span className={`shadow-chip shadow-${String(shadow.status || "WAIT").toLowerCase()}`}>{shadow.status || "WAIT"}</span>
          </div>
          <div className="shadow-detail-grid">
            <div><span>Segment</span><b>{shadow.segment || "—"}</b></div>
            <div><span>Expected control</span><b>{controlSideLabel(match, shadow.expectedSide)}</b></div>
            <div><span>Live control</span><b>{controlSideLabel(match, shadow.actualSide)}</b></div>
            <div><span>Evidence</span><b>{shadow.metricCount || 0} metrics</b></div>
          </div>
          <p className="fineprint">
            {shadow.reason || "WAIT"} · control score {shadow.controlScore == null ? "—" : Number(shadow.controlScore).toFixed(0)}
            {shadow.controlBasis ? ` · expected basis ${shadow.controlBasis}` : ""}
          </p>
          <p className="fineprint">Shadow calibration only；暫時唔會由呢個狀態直接產生投注指令。</p>
        </section>
      )}

      <section className="panel">
        <div className="panel-title"><div><p>HKJC TOTALS</p><h2>入球及角球</h2></div></div>
        <div className="totals-grid">
          <div className="total-market">
            <span>HKJC 入球 O/U · {match.goals?.line || "—"}</span>
            <div><b>大 {formatOdds(match.goals?.over)}</b><b>細 {formatOdds(match.goals?.under)}</b></div>
            {goalsLineModel?.over != null
              ? <small className={goalsLineModel.derived ? "line-derived" : ""}>
                  {goalsLineModel.derived ? "MODEL-DERIVED" : "FOREBET"} O{goalsLineModel.line} {(goalsLineModel.over * 100).toFixed(0)}% ·
                  U{goalsLineModel.line} {(goalsLineModel.under * 100).toFixed(0)}% · Avg {goalsLineModel.avg ?? "—"}
                </small>
              : <small className={goalsCompare.comparable ? "" : "line-warning"}>{goalsCompare.label || "同線模型 NO DATA"}</small>}
          </div>
          <div className="total-market">
            <span>HKJC 角球 O/U · {match.corners?.line || "—"}</span>
            <div><b>大 {formatOdds(match.corners?.over)}</b><b>細 {formatOdds(match.corners?.under)}</b></div>
            {cornersLineModel?.over != null
              ? <small className={cornersLineModel.derived ? "line-derived" : ""}>
                  {cornersLineModel.derived ? "MODEL-DERIVED" : "FOREBET"} O{cornersLineModel.line} {(cornersLineModel.over * 100).toFixed(0)}% ·
                  U{cornersLineModel.line} {(cornersLineModel.under * 100).toFixed(0)}% · Avg {cornersLineModel.avg == null ? "—" : Number(cornersLineModel.avg).toFixed(1)}
                </small>
              : <small className={cornersCompare.comparable ? "" : "line-warning"}>{cornersCompare.label || "同線模型 NO DATA"}</small>}
          </div>
        </div>
      </section>


      <section className="panel team-form-panel">
        <div className="panel-title">
          <div><p>TEAM FORM</p><h2>近期表現 · 模型背後實績</h2></div>
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
        <section className="panel">
          <div className="panel-title">
            <div><p>ODDS MOVEMENT</p><h2>HKJC 賠率變動</h2></div>
            <span>{movement.signal || "COLLECTING"}</span>
          </div>
          <div className="movement-detail-grid">
            <div><span>方向</span><b>{sideName(match, movement.side)} · 賠率{movementPct < 0 ? "↓" : "↑"}</b></div>
            <div><span>變動</span><b className={Math.abs(movementPct) >= 10 ? "movement-alert-text" : ""}>{movementPct > 0 ? "+" : ""}{movementPct.toFixed(1)}%</b></div>
            <div><span>Now</span><b>{formatOdds(movement.nowOdds)}</b></div>
            <div><span>{movement.baselineWindow || "Base"}</span><b>{formatOdds(movement.baselineOdds)}</b></div>
          </div>
          <p className="fineprint">
            Implied probability：24H {movement.move24hPp == null ? "—" : Number(movement.move24hPp).toFixed(1) + "%"} ·
            Model alignment：{movement.modelAlignment || "—"}
          </p>
        </section>
      )}

      <section className="panel human-factor-panel">
        <div className="panel-title">
          <div><p>PHASE 2 · HUMAN FACTORS</p><h2>球員 / 正選 / 教練 / 缺陣</h2></div>
          <span>{humanQuality}</span>
        </div>
        <div className="human-summary-grid">
          <div><span>API fixture</span><b>{eventMap?.api_fixture_id || "—"}</b><small>{eventMap ? `match ${numText(eventMap.match_quality, 3)}` : "not mapped"}</small></div>
          <div><span>傷停 主 / 客</span><b>{injuriesHome} / {injuriesAway}</b><small>{playerStatusEvidence.length ? `${playerStatusEvidence.length} evidence rows` : "no active evidence rows"}</small></div>
          <div><span>Official XI</span><b>{lineupState}</b><small>{lineupEvidence.length ? `${lineupEvidence.length} player rows` : "waiting for publication"}</small></div>
          <div><span>Referee</span><b>{humanSummary?.referee || "—"}</b><small>{humanSummary?.source || "API_FOOTBALL"}</small></div>
        </div>

        {(homeStarters.length || awayStarters.length) ? (
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
        ) : (
          <div className="model-empty-reason">Official lineup 尚未發布；系統會在開賽前窗口再抓取，唔會用 projected XI 冒充 confirmed lineup。</div>
        )}

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
        <p className="fineprint">
          {humanSummary?.coach_rotation ? `Coach：${humanSummary.coach_rotation} · ` : ""}
          Phase 2 source：{humanSummary?.source || "API_FOOTBALL"} · quality：{humanSummary?.quality || "PENDING"}
        </p>
      </section>

      {scenarioRows.length ? (
        <section className="panel scenario-panel">
          <div className="panel-title">
            <div><p>PHASE 3 · MATCH SCENARIO</p><h2>分段比賽腳本</h2></div>
            <span>{scenarioRows[0]?.segment_prediction_status || "CALIBRATING"}</span>
          </div>
          <div className="scenario-strip">
            {scenarioRows.map((row) => (
              <div key={row.segment}>
                <span>{row.segment}</span>
                <b>{controlSideLabel(match, row.macro_control_side)}</b>
                <small>
                  Goal H {pct(row.p_home_goal_segment, 0)} · A {pct(row.p_away_goal_segment, 0)}
                  <br/>Corners {numText(row.expected_home_corners_segment, 1)} / {numText(row.expected_away_corners_segment, 1)}
                </small>
              </div>
            ))}
          </div>
          <p className="fineprint">
            Control basis：{scenarioRows[0]?.control_basis || "—"} · context coverage {scenarioRows[0]?.context_coverage_score == null ? "—" : numText(scenarioRows[0].context_coverage_score, 0) + "%"}
            {scenarioRows[0]?.notes ? " · " + scenarioRows[0].notes : ""}
          </p>
        </section>
      ) : null}


      <details className="panel technical-health-panel">
        <summary>
          <span>TECHNICAL</span>
          <strong>Data health / diagnostics</strong>
          <b>{match.health?.status || "UNKNOWN"}</b>
        </summary>
        <div className="technical-health-body">
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
