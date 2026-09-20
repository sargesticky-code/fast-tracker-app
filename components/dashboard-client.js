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
  ["all", "全部"],
  ["gaps", "Edge"],
  ["missing", "缺資料"],
  ["stale", "過時"],
];

function hdaOdds(match, key) {
  if (key === "H") return match.odds?.home;
  if (key === "D") return match.odds?.draw;
  if (key === "A") return match.odds?.away;
  return null;
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

  function cacheMatch() {
    try {
      window.localStorage.setItem(`ft-match-${match.id}`, JSON.stringify(match));
      window.sessionStorage.setItem(`ft-match-${match.id}`, JSON.stringify(match));
    } catch {}
  }

  return (
    <Link className="market-pick-row" href={`/match/?id=${encodeURIComponent(match.id)}`} onClick={cacheMatch}>
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

export default function DashboardClient({ feed, nowMs }) {
  const [filter, setFilter] = useState("focus");
  const all = feed.matches || [];

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("filter") || "focus";
    setFilter(filters.some(([key]) => key === requested) ? requested : "focus");
  }, []);

  const byFocus = useMemo(() => [...all].sort((a, b) => {
    const edgeDelta = (valueEdge(b)?.value || -1) - (valueEdge(a)?.value || -1);
    if (edgeDelta) return edgeDelta;
    const scoreDelta = reviewScore(b, nowMs) - reviewScore(a, nowMs);
    if (scoreDelta) return scoreDelta;
    return new Date(a.kickoff) - new Date(b.kickoff);
  }), [all, nowMs]);

  const hdaPicks = useMemo(() => all
    .map((match) => ({ match, edge: valueEdge(match) }))
    .filter((row) => row.edge?.value >= 0.05)
    .sort((a, b) => b.edge.value - a.edge.value)
    .slice(0, 5), [all]);

  const goalsPicks = useMemo(() => all
    .map((match) => ({ match, edge: goalsValueEdge(match) }))
    .filter((row) => row.edge?.value >= 0.05)
    .sort((a, b) => b.edge.value - a.edge.value)
    .slice(0, 5), [all]);

  const cornersPicks = useMemo(() => all
    .map((match) => ({ match, edge: cornersValueEdge(match) }))
    .filter((row) => row.edge?.value >= 0.05)
    .sort((a, b) => b.edge.value - a.edge.value)
    .slice(0, 5), [all]);

  let matches = byFocus;
  if (filter === "all") matches = [...all].sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  if (filter === "gaps") {
    matches = all.filter((m) => valueEdge(m))
      .sort((a, b) => valueEdge(b).value - valueEdge(a).value);
  }
  if (filter === "missing") {
    matches = all.filter((m) => modelCoverageCount(m) === 0)
      .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  }
  if (filter === "stale") {
    matches = all.filter((m) => freshness(m, nowMs).key === "stale")
      .sort((a, b) => dataAgeMinutes(b, nowMs) - dataAgeMinutes(a, nowMs));
  }

  const modeled = all.filter((m) => modelCoverageCount(m) > 0).length;
  const missing = all.filter((m) => modelCoverageCount(m) === 0).length;
  const stale = all.filter((m) => freshness(m, nowMs).key === "stale").length;
  const valueCandidates = hdaPicks.length + goalsPicks.length + cornersPicks.length;
  const isLive = feed.source === "supabase-canonical-live";

  const headings = {
    focus: ["LIVE + NEXT 24H", "先睇 Value，再睇模型細節"],
    all: ["Upcoming 24H", "按開賽時間排序"],
    gaps: ["HDA Edge 候選", "按模型高於 HKJC 市場機率嘅幅度排序"],
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
          <p className="subtitle">HKJC 24H · HDA / 入球 / 角球 · 先睇 Edge，再睇 evidence</p>
        </div>
        <span className={`preview-badge ${isLive ? "live-badge" : ""}`}>
          {isLive ? "LIVE SQL" : "FALLBACK"}
        </span>
      </header>

      <section className="board-stats">
        <div><span>24H 賽事</span><b>{all.length}</b></div>
        <div><span>Value Picks</span><b>{valueCandidates}</b></div>
        <div><span>有模型</span><b>{modeled}</b></div>
        <div className={missing || stale ? "health-warn" : ""}>
          <span>資料提醒</span><b>{missing + stale}</b>
        </div>
      </section>

      <section className="focus-zone">
        <div className="focus-zone-head">
          <div>
            <span>BEST BETS · VALUE SHORTLIST</span>
            <h2>三個市場分開睇</h2>
          </div>
          <p>只計 HKJC line 同模型 line 可以直接比較嘅 Edge</p>
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
            {label}
          </button>
        ))}
      </nav>

      <section className="section-head">
        <div>
          <h2>{headings[filter]?.[0] || headings.focus[0]}</h2>
          <p>{matches.length} 場 · 香港時間</p>
        </div>
        <span>{headings[filter]?.[1] || headings.focus[1]}</span>
      </section>

      <div className="match-list">
        {matches.map((match) => <MatchCard key={match.id} match={match} nowMs={nowMs} />)}
      </div>

      <footer className="bottom-nav">
        <button className={filter === "focus" ? "selected" : ""} type="button" onClick={() => selectFilter("focus")}>焦點</button>
        <button className={filter === "all" ? "selected" : ""} type="button" onClick={() => selectFilter("all")}>全部</button>
        <button className={filter === "gaps" ? "selected" : ""} type="button" onClick={() => selectFilter("gaps")}>Edge</button>
        <a href="/health/">系統</a>
      </footer>
    </main>
  );
}
