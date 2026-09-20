"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MatchCard from "@/components/match-card";
import {
  binaryOdds,
  binarySideName,
  cornersValueEdge,
  dataAgeMinutes,
  formatKickoff,
  formatOdds,
  freshness,
  goalsValueEdge,
  modelCoverageCount,
  reviewScore,
  sideName,
  valueEdge,
} from "@/lib/fast-tracker";

const filters = [
  ["focus", "焦點"],
  ["live", "Live"],
  ["all", "全部"],
  ["gaps", "Edge"],
  ["odds", "賠率"],
  ["missing", "缺資料"],
  ["stale", "過時"],
];

function hdaOdds(match, key) {
  if (key === "H") return match.odds?.home;
  if (key === "D") return match.odds?.draw;
  if (key === "A") return match.odds?.away;
  return null;
}

function cacheMatch(match) {
  try {
    window.localStorage.setItem(`ft-match-${match.id}`, JSON.stringify(match));
    window.sessionStorage.setItem(`ft-match-${match.id}`, JSON.stringify(match));
  } catch {}
}

function MarketPickRow({ match, edge, type }) {
  let selection = "—";
  let odds = null;
  let market = type;

  if (type === "HDA") {
    selection = sideName(match, edge.key);
    odds = hdaOdds(match, edge.key);
  } else if (type === "入球") {
    selection = `${binarySideName(edge.key)} 2.5`;
    odds = binaryOdds(match.goals, edge.key);
  } else {
    selection = `${binarySideName(edge.key)} 9.5`;
    odds = binaryOdds(match.corners, edge.key);
  }

  return (
    <Link
      className="market-pick-row"
      href={`/match/?id=${encodeURIComponent(match.id)}`}
      onClick={() => cacheMatch(match)}
    >
      <div className="market-pick-match">
        <span>{formatKickoff(match.kickoff)}</span>
        <b>{match.homeZh || match.home} vs {match.awayZh || match.away}</b>
      </div>
      <div className="market-pick-selection">
        <span>{market}</span>
        <b>{selection}</b>
      </div>
      <div className="market-pick-number">
        <span>Odds</span>
        <b>{formatOdds(odds)}</b>
      </div>
      <div className="market-pick-number edge-number">
        <span>Edge</span>
        <b>+{(edge.value * 100).toFixed(1)}pp</b>
      </div>
    </Link>
  );
}

function ValueSection({ title, subtitle, rows, type }) {
  return (
    <section className="value-section">
      <div className="value-section-head">
        <div>
          <span>{subtitle}</span>
          <h3>{title}</h3>
        </div>
        <b>{rows.length}</b>
      </div>
      <div className="market-pick-list">
        {rows.length ? rows.map(({ match, edge }) => (
          <MarketPickRow key={match.id} match={match} edge={edge} type={type} />
        )) : <div className="market-pick-empty">暫時未有可直接比較嘅 Value</div>}
      </div>
    </section>
  );
}

function LiveMatchRow({ match }) {
  const live = match.live || {};
  return (
    <Link
      className="live-match-row"
      href={`/match/?id=${encodeURIComponent(match.id)}`}
      onClick={() => cacheMatch(match)}
    >
      <div className="live-match-head">
        <span className="live-dot">LIVE</span>
        <b>{live.status || "IN PLAY"}</b>
        <small>{match.league}</small>
      </div>
      <div className="live-teams">
        <b>{match.homeZh || match.home}</b>
        <span>vs</span>
        <b>{match.awayZh || match.away}</b>
      </div>
      <div className="live-markets">
        <div>
          <span>HAD</span>
          <b>{formatOdds(live.odds?.home)} / {formatOdds(live.odds?.draw)} / {formatOdds(live.odds?.away)}</b>
        </div>
        <div>
          <span>入球 {live.goals?.line || "—"}</span>
          <b>{formatOdds(live.goals?.over)} / {formatOdds(live.goals?.under)}</b>
        </div>
        <div>
          <span>角球 {live.corners?.line || "—"}</span>
          <b>{formatOdds(live.corners?.over)} / {formatOdds(live.corners?.under)}</b>
        </div>
      </div>
    </Link>
  );
}

export default function DashboardClient({ feed, nowMs }) {
  const [filter, setFilter] = useState("focus");
  const all = feed.matches || [];
  const liveMatches = all.filter((m) => m.liveNow);
  const prematchAll = all.filter((m) => !m.liveNow);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("filter") || "focus";
    setFilter(filters.some(([key]) => key === requested) ? requested : "focus");
  }, []);

  const byFocus = useMemo(() => [...prematchAll].sort((a, b) => {
    const edgeDelta = (valueEdge(b)?.value || -1) - (valueEdge(a)?.value || -1);
    if (edgeDelta) return edgeDelta;
    const scoreDelta = reviewScore(b, nowMs) - reviewScore(a, nowMs);
    if (scoreDelta) return scoreDelta;
    return new Date(a.kickoff) - new Date(b.kickoff);
  }), [prematchAll, nowMs]);

  const hdaPicks = useMemo(() => prematchAll
    .map((match) => ({ match, edge: valueEdge(match) }))
    .filter((row) => row.edge?.value >= 0.05)
    .sort((a, b) => b.edge.value - a.edge.value)
    .slice(0, 5), [prematchAll]);

  const goalsPicks = useMemo(() => prematchAll
    .map((match) => ({ match, edge: goalsValueEdge(match) }))
    .filter((row) => row.edge?.value >= 0.05)
    .sort((a, b) => b.edge.value - a.edge.value)
    .slice(0, 5), [prematchAll]);

  const cornersPicks = useMemo(() => prematchAll
    .map((match) => ({ match, edge: cornersValueEdge(match) }))
    .filter((row) => row.edge?.value >= 0.05)
    .sort((a, b) => b.edge.value - a.edge.value)
    .slice(0, 5), [prematchAll]);

  let matches = byFocus;
  if (filter === "all") matches = [...prematchAll].sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  if (filter === "gaps") {
    matches = prematchAll.filter((m) => valueEdge(m))
      .sort((a, b) => valueEdge(b).value - valueEdge(a).value);
  }
  if (filter === "odds") {
    matches = prematchAll
      .filter((m) => Number.isFinite(Number(m.oddsMovement?.rawOddsChangePct)) && Math.abs(Number(m.oddsMovement.rawOddsChangePct)) >= 10)
      .sort((a, b) => Math.abs(Number(b.oddsMovement.rawOddsChangePct)) - Math.abs(Number(a.oddsMovement.rawOddsChangePct)));
  }
  if (filter === "missing") {
    matches = prematchAll.filter((m) => modelCoverageCount(m) === 0)
      .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  }
  if (filter === "stale") {
    matches = prematchAll.filter((m) => freshness(m, nowMs).key === "stale")
      .sort((a, b) => dataAgeMinutes(b, nowMs) - dataAgeMinutes(a, nowMs));
  }

  const missing = prematchAll.filter((m) => modelCoverageCount(m) === 0).length;
  const stale = prematchAll.filter((m) => freshness(m, nowMs).key === "stale").length;
  const valueCandidates = hdaPicks.length + goalsPicks.length + cornersPicks.length;
  const oddsAlerts = prematchAll.filter((m) => Number.isFinite(Number(m.oddsMovement?.rawOddsChangePct)) && Math.abs(Number(m.oddsMovement.rawOddsChangePct)) >= 10).length;
  const isLive = feed.source === "supabase-canonical-live";

  const headings = {
    focus: ["NEXT 24H", "先睇 Value，再睇模型細節"],
    live: ["LIVE NOW", "只顯示 HKJC 正在售賣嘅即場市場"],
    all: ["Upcoming 24H", "按開賽時間排序"],
    gaps: ["HDA Edge 候選", "按模型高於 HKJC 市場機率嘅幅度排序"],
    odds: ["賠率大幅變動", `${oddsAlerts} 場達 ±10% · 按變動幅度排序`],
    missing: ["缺資料", "HKJC 有盤但暫時未有外部模型"],
    stale: ["過時資料", "超過 6 小時未更新"],
  };

  function selectFilter(key) {
    setFilter(key);
    const nextUrl = key === "focus" ? "/" : `/?filter=${key}`;
    window.history.replaceState({}, "", nextUrl);
  }

  return (
    <main className="shell">
      <header className="hero compact-hero">
        <div>
          <p className="eyebrow">FAST TRACK 2026</p>
          <h1>Betting Board</h1>
          <p className="subtitle">HKJC · HDA / 入球 / 角球 · Pre-match 同 Live 市場分開</p>
        </div>
        <span className={`preview-badge ${isLive ? "live-badge" : ""}`}>
          {isLive ? "LIVE SQL" : "FALLBACK"}
        </span>
      </header>

      <section className="board-stats">
        <div className={liveMatches.length ? "live-stat" : ""}><span>LIVE</span><b>{liveMatches.length}</b></div>
        <div><span>24H 賽事</span><b>{prematchAll.length}</b></div>
        <div><span>Value Picks</span><b>{valueCandidates}</b></div>
        <div className={missing || stale ? "health-warn" : ""}>
          <span>資料提醒</span><b>{missing + stale}</b>
        </div>
      </section>

      {liveMatches.length > 0 && (
        <section className="live-zone">
          <div className="live-zone-head">
            <div><span>HKJC LIVE</span><h2>LIVE NOW</h2></div>
            <button type="button" onClick={() => selectFilter("live")}>全部 Live →</button>
          </div>
          <div className="live-list">
            {liveMatches.slice(0, 4).map((match) => <LiveMatchRow key={match.id} match={match} />)}
          </div>
        </section>
      )}

      <section className="focus-zone">
        <div className="focus-zone-head">
          <div>
            <span>BEST BETS · VALUE SHORTLIST</span>
            <h2>三個市場分開睇</h2>
          </div>
          <p>只計 HKJC line 同模型 line 可以直接比較嘅 pre-match Edge</p>
        </div>
        <div className="value-columns">
          <ValueSection title="HDA" subtitle="主和客" rows={hdaPicks} type="HDA" />
          <ValueSection title="入球 2.5" subtitle="GOALS" rows={goalsPicks} type="入球" />
          <ValueSection title="角球 9.5" subtitle="CORNERS" rows={cornersPicks} type="角球" />
        </div>
      </section>

      <nav className="filters sticky-filters">
        {filters.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={filter === key ? "active" : ""}
            onClick={() => selectFilter(key)}
          >
            {key === "odds" && oddsAlerts ? `賠率 ${oddsAlerts}` : key === "live" && liveMatches.length ? `Live ${liveMatches.length}` : label}
          </button>
        ))}
      </nav>

      <section className="section-head">
        <div>
          <h2>{headings[filter]?.[0] || headings.focus[0]}</h2>
          <p>{filter === "live" ? liveMatches.length : matches.length} 場 · 香港時間</p>
        </div>
        <span>{headings[filter]?.[1] || headings.focus[1]}</span>
      </section>

      {filter === "live" ? (
        <div className="live-list standalone-live-list">
          {liveMatches.length
            ? liveMatches.map((match) => <LiveMatchRow key={match.id} match={match} />)
            : <div className="market-pick-empty">暫時冇符合 freshness gate 嘅 HKJC Live 賽事</div>}
        </div>
      ) : (
        <div className="match-list">
          {matches.map((match) => <MatchCard key={match.id} match={match} nowMs={nowMs} />)}
        </div>
      )}

      <footer className="bottom-nav">
        <button className={filter === "focus" ? "selected" : ""} type="button" onClick={() => selectFilter("focus")}>焦點</button>
        <button className={filter === "live" ? "selected" : ""} type="button" onClick={() => selectFilter("live")}>Live</button>
        <button className={filter === "gaps" ? "selected" : ""} type="button" onClick={() => selectFilter("gaps")}>Edge</button>
        <a href="/health/">系統</a>
      </footer>
    </main>
  );
}
