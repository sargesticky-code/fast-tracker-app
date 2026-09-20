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

function pct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n * 100)}%` : "—";
}

function modelHero(match, sourceCount) {
  const score = predictedScore(match);
  const forebetState = String(match.health?.forebetState || "").toUpperCase();

  if (score !== "—") {
    return {
      label: "FOREBET",
      main: score,
      sub: sourceCount ? `${sourceCount} model channels` : "MODEL",
    };
  }

  const candidates = [
    ["MULTI", match.multi],
    ["FOREBET", match.forebet],
    ["DC", match.dc],
    ["PI", match.pi],
    ["FORM", match.form],
  ];
  const chosen = candidates.find(([, model]) => model && (model.home != null || model.draw != null || model.away != null));
  if (chosen) {
    const [label, model] = chosen;
    const fbNote =
      forebetState === "FIXTURE_ONLY"
        ? "Forebet: fixture only"
        : forebetState === "UNRESOLVED"
          ? "Forebet: unresolved"
          : forebetState
            ? `Forebet: ${forebetState}`
            : "";
    return {
      label: `${label} MODEL`,
      main: `H ${pct(model.home)} · D ${pct(model.draw)} · A ${pct(model.away)}`,
      sub: fbNote || (sourceCount ? `${sourceCount} model channels` : "MODEL"),
    };
  }

  if (match.health?.fallbackRecommendation) {
    return {
      label: String(match.health?.fallbackSource || "FALLBACK"),
      main: String(match.health.fallbackRecommendation),
      sub: String(match.health?.fallbackMarket || "fallback model"),
    };
  }

  return {
    label: "MODEL STATUS",
    main: "NO MODEL",
    sub:
      forebetState === "FIXTURE_ONLY"
        ? "Forebet fixture only"
        : forebetState === "UNRESOLVED"
          ? "Forebet unresolved · internal model unavailable"
          : "No usable model evidence",
  };
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
  const goals = totalSignal(match);
  const corners = cornerSignal(match);
  const hero = modelHero(match, sourceCount);
  const hasValue = edge && edge.value >= 0.05;
  const selectedOdds = edge ? edgeOdds(match, edge.key) : null;
  const edgeText = edge ? `${edge.value >= 0 ? "+" : ""}${(edge.value * 100).toFixed(1)}pp` : "—";
  const pickText = edge ? sideName(match, edge.key) : "未有模型";
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

      <div className="upcoming-card-body">
        <div className="upcoming-score-hero">
          <div className="upcoming-scoreboard">
            <b className="upcoming-home-name">{primaryHome}</b>
            <div className="upcoming-score-main">
              <small>{hero.label}</small>
              <strong>{hero.main}</strong>
              <span>{hero.sub}</span>
            </div>
            <b className="upcoming-away-name">{primaryAway}</b>
          </div>

          <div className="upcoming-context-grid">
            <div className={hasValue ? edgeTone(edge.value) : "edge-soft"}>
              <small>HDA PICK</small>
              <b>{pickText}</b>
            </div>
            <div>
              <small>EDGE</small>
              <b>{edgeText}</b>
            </div>
            <div>
              <small>MODEL</small>
              <b>{hdaSource(match)}</b>
            </div>
          </div>
        </div>

        <div className="upcoming-intel">
          <div className="upcoming-signal-strip">
            <span className={hasValue ? edgeTone(edge.value) : "edge-soft"}>
              <small>HDA</small>
              <b>{pickText}</b>
              <em>{edge ? `${edgeText} · ${formatOdds(selectedOdds)}` : "未有可比模型"}</em>
            </span>
            <span className={goals.status?.key === "mismatch" ? "market-mismatch" : ""}>
              <small>入球 {match.goals?.line ?? "—"}</small>
              <b>{goals.main}</b>
              <em>{goals.sub}</em>
            </span>
            <span className={corners.status?.key === "mismatch" ? "market-mismatch" : ""}>
              <small>角球 {match.corners?.line ?? "—"}</small>
              <b>{corners.main}</b>
              <em>{corners.sub}</em>
            </span>
          </div>

          <div className="upcoming-markets">
            <div>
              <span>HAD</span>
              <b>{formatOdds(match.odds.home)} / {formatOdds(match.odds.draw)} / {formatOdds(match.odds.away)}</b>
            </div>
            <div>
              <span>入球 {match.goals?.line ?? "—"}</span>
              <b>{formatOdds(match.goals?.over)} / {formatOdds(match.goals?.under)}</b>
            </div>
            <div>
              <span>角球 {match.corners?.line ?? "—"}</span>
              <b>{formatOdds(match.corners?.over)} / {formatOdds(match.corners?.under)}</b>
            </div>
          </div>
        </div>
      </div>

      <div className="upcoming-card-footer">
        <span className={`coverage coverage-${coverage(match).replaceAll(" ", "-").toLowerCase()}`}>{coverage(match)}</span>
        <span className="details-link">詳情 →</span>
      </div>
    </Link>
  );
}
