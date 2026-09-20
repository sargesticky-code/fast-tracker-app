"use client";

import Link from "next/link";
import {
  coverage,
  formatKickoff,
  formatOdds,
  freshness,
  lineComparisonStatus,
  modelCoverageCount,
  sideName,
  valueEdge,
} from "@/lib/fast-tracker";

function edgeTone(value) {
  if (value >= 0.6) return "edge-check";
  if (value >= 0.2) return "edge-strong";
  if (value >= 0.1) return "edge-good";
  if (value >= 0.05) return "edge-watch";
  return "edge-soft";
}

function edgeOdds(match, key) {
  if (key === "H") return match.odds?.home;
  if (key === "D") return match.odds?.draw;
  if (key === "A") return match.odds?.away;
  return null;
}

function hdaSource(match) {
  if (match.multi) return "MULTI";
  if (match.forebet) return "FB";
  if (match.dc) return "DC";
  if (match.pi) return "PI";
  if (match.form) return "FORM";
  return "—";
}

function predictedScore(match) {
  return match.forebetDetail?.predictedScore || match.forebet?.predictedScore || "—";
}

function totalSignal(match) {
  const row = match.forebetDetail?.goalsCurrentLine;
  const status = lineComparisonStatus(match, "goals");
  if (!row || row.over == null || row.under == null) {
    return { main: "—", sub: status.label || "NO DATA", status };
  }
  const overN = Number(row.over);
  const underN = Number(row.under);
  const isOver = overN >= underN;
  const p = Math.max(overN, underN);
  return {
    main: `${isOver ? "大" : "細"} ${Number.isFinite(p) ? `${(p * 100).toFixed(0)}%` : ""}`.trim(),
    sub: `${row.derived ? "DERIVED" : "FOREBET"}${row.avg == null ? "" : ` · Avg ${Number(row.avg).toFixed(2)}`}`,
    status,
  };
}

function cornerSignal(match) {
  const row = match.forebetDetail?.cornersCurrentLine;
  const status = lineComparisonStatus(match, "corners");
  if (!row || row.over == null || row.under == null) {
    return { main: "—", sub: status.label || "NO DATA", status };
  }
  const overN = Number(row.over);
  const underN = Number(row.under);
  const isOver = overN >= underN;
  const p = Math.max(overN, underN);
  return {
    main: `${isOver ? "大" : "細"} ${Number.isFinite(p) ? `${(p * 100).toFixed(0)}%` : ""}`.trim(),
    sub: `${row.derived ? "DERIVED" : "FOREBET"}${row.avg == null ? "" : ` · Avg ${Number(row.avg).toFixed(1)}`}`,
    status,
  };
}

export default function MatchCard({ match, nowMs, focusRank = null }) {
  const edge = valueEdge(match);
  const fresh = freshness(match, nowMs);
  const sourceCount = modelCoverageCount(match);
  const primaryHome = match.homeZh || match.home;
  const primaryAway = match.awayZh || match.away;
  const secondaryHome = match.homeZh ? match.home : null;
  const secondaryAway = match.awayZh ? match.away : null;
  const goals = totalSignal(match);
  const corners = cornerSignal(match);
  const score = predictedScore(match);
  const forebetState = String(match.health?.forebetState || "").toUpperCase();
  const forebetHasModel = score !== "—";
  const forebetMain = forebetHasModel ? score : (forebetState === "FIXTURE_ONLY" ? "FIXTURE" : "NO MODEL");
  const forebetSub = forebetHasModel
    ? (sourceCount ? `${sourceCount} sources` : "MODEL")
    : (forebetState || "NO DATA");
  const hasValue = edge && edge.value >= 0.05;
  const selectedOdds = edge ? edgeOdds(match, edge.key) : null;
  const oddsMove = match.oddsMovement;
  const rawMove = Number(oddsMove?.rawOddsChangePct);
  const hasBigOddsMove = Number.isFinite(rawMove) && Math.abs(rawMove) >= 10;
  const moveSide = oddsMove?.side ? sideName(match, oddsMove.side) : "";
  const moveArrow = rawMove < 0 ? "↓" : "↑";

  function cacheMatch() {
    try {
      window.localStorage.setItem(`ft-match-${match.id}`, JSON.stringify(match));
      window.sessionStorage.setItem(`ft-match-${match.id}`, JSON.stringify(match));
    } catch {}
  }

  return (
    <Link
      className={`match-card upcoming-command-card ${focusRank ? "focus-card" : ""}`}
      href={`/match/?id=${encodeURIComponent(match.id)}`}
      onClick={cacheMatch}
    >
      <div className="match-topline">
        <div className="upcoming-meta-left">
          {focusRank ? <span className="focus-rank">#{focusRank}</span> : null}
          <strong className="upcoming-kickoff">{formatKickoff(match.kickoff)}</strong>
          <span className="league">{match.league}</span>
        </div>
        <div className="upcoming-meta-right">
          {hasBigOddsMove ? (
            <span className={`odds-move-badge ${rawMove < 0 ? "odds-steam" : "odds-drift"}`}>
              賠率{moveArrow} {rawMove > 0 ? "+" : ""}{rawMove.toFixed(1)}% {moveSide}
            </span>
          ) : null}
          <span className={`freshness freshness-${fresh.key}`}>{fresh.label}</span>
        </div>
      </div>

      <div className="upcoming-score-hero">
        <div className="upcoming-team upcoming-home-team">
          <small>主隊</small>
          <b>{primaryHome}</b>
          {secondaryHome ? <em>{secondaryHome}</em> : null}
        </div>

        <div className="upcoming-forecast">
          <small>FOREBET</small>
          <strong>{forebetMain}</strong>
          <span>{forebetSub}</span>
        </div>

        <div className="upcoming-team upcoming-away-team">
          <small>客隊</small>
          <b>{primaryAway}</b>
          {secondaryAway ? <em>{secondaryAway}</em> : null}
        </div>
      </div>

      <div className="upcoming-intel-grid">
        <div className={`upcoming-value-card ${hasValue ? edgeTone(edge.value) : "edge-soft"}`}>
          <small>HDA VALUE · {hdaSource(match)}</small>
          <div className="upcoming-value-main">
            <b>{edge ? sideName(match, edge.key) : "未有模型"}</b>
            <strong>{edge ? `${edge.value >= 0 ? "+" : ""}${(edge.value * 100).toFixed(1)}pp` : "—"}</strong>
          </div>
          <span>HKJC {formatOdds(selectedOdds)}</span>
        </div>

        <div className={`upcoming-market-card ${goals.status?.key === "mismatch" ? "market-mismatch" : ""}`}>
          <small>入球 · HKJC {match.goals?.line ?? "—"}</small>
          <b>{goals.main}</b>
          <span>{goals.sub}</span>
        </div>

        <div className={`upcoming-market-card ${corners.status?.key === "mismatch" ? "market-mismatch" : ""}`}>
          <small>角球 · HKJC {match.corners?.line ?? "—"}</small>
          <b>{corners.main}</b>
          <span>{corners.sub}</span>
        </div>
      </div>

      <div className="upcoming-bottom-row">
        <div className="upcoming-had">
          <span>主 <b>{formatOdds(match.odds.home)}</b></span>
          <span>和 <b>{formatOdds(match.odds.draw)}</b></span>
          <span>客 <b>{formatOdds(match.odds.away)}</b></span>
        </div>
        <div className="upcoming-card-status">
          <span className={`coverage coverage-${coverage(match).replaceAll(" ", "-").toLowerCase()}`}>{coverage(match)}</span>
          <span className="details-link">詳情 →</span>
        </div>
      </div>
    </Link>
  );
}
