"use client";

import Link from "next/link";
import {
  formatKickoff,
  formatOdds,
  freshness,
  modelCoverageCount,
  coverageStatusMeta,
  preferredModel,
  sideName,
  valueEdge,
} from "@/lib/fast-tracker";

const UI_BUILD = "FOREBET-ROW-20260922-1";

function pct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) + "%" : "—";
}

function modelLabel(match) {
  if (match.multi) return "Multi";
  if (match.forebet) return "Forebet";
  if (match.dc) return "Dixon-Coles";
  if (match.pi) return "Pi Rating";
  if (match.form) return "Team-Form";
  return "NO MODEL";
}

function edgeOdds(match, key) {
  if (key === "H") return match.odds?.home;
  if (key === "D") return match.odds?.draw;
  if (key === "A") return match.odds?.away;
  return null;
}

function selectedClass(edge, key) {
  return "ft5-prob" + (edge?.key === key ? " selected" : "");
}

export default function MatchCard({ match, nowMs, changeType = null }) {
  const edge = valueEdge(match);
  const model = preferredModel(match);
  const fresh = freshness(match, nowMs);
  const coverage = modelCoverageCount(match);
  const coverageMeta = coverageStatusMeta(match);
  const home = match.homeZh || match.home;
  const away = match.awayZh || match.away;
  const rawMove = Number(match.oddsMovement?.rawOddsChangePct);
  const hasMove = Number.isFinite(rawMove) && Math.abs(rawMove) >= 10;
  const edgeText = edge ? (edge.value >= 0 ? "+" : "") + (edge.value * 100).toFixed(1) + "%" : "—";
  const pick = edge ? sideName(match, edge.key) : "—";
  const selectedOdds = edge ? edgeOdds(match, edge.key) : null;

  function cacheMatch() {
    try {
      window.localStorage.setItem("ft-match-" + match.id, JSON.stringify(match));
      window.sessionStorage.setItem("ft-match-" + match.id, JSON.stringify(match));
    } catch {}
  }

  return (
    <Link
      className={"ft5-match-card ft5-forebet-row" + (changeType ? " ft5-flash-" + changeType : "")}
      prefetch={false}
      href={"/details/?id=" + encodeURIComponent(match.id) + "&ui=" + UI_BUILD}
      onClick={cacheMatch}
    >
      <div className="ft5-row-grid">
        <div className="ft5-cell ft5-fixture-cell">
          <div className="ft5-match-meta">
            <strong className="ft5-kickoff">{formatKickoff(match.kickoff)}</strong>
            <span className="ft5-league">{match.league}</span>
            <span className="ft5-fresh">{fresh.label}</span>
          </div>
          <div className="ft5-teams">
            <b>{home}</b>
            <span>vs</span>
            <b>{away}</b>
          </div>
        </div>

        <div className="ft5-cell ft5-model-cell">
          <div className="ft5-cell-label">
            <span>MODEL</span>
            <b>{modelLabel(match)}</b>
          </div>
          <div className="ft5-probs" aria-label="HDA model probability">
            <div className={selectedClass(edge, "H")}><span>H</span><b>{pct(model?.home)}</b></div>
            <div className={selectedClass(edge, "D")}><span>D</span><b>{pct(model?.draw)}</b></div>
            <div className={selectedClass(edge, "A")}><span>A</span><b>{pct(model?.away)}</b></div>
          </div>
        </div>

        <div className="ft5-cell ft5-pick-cell">
          <div className="ft5-pick-main">
            <span>MODEL PICK</span>
            <b>{pick}</b>
            <small>{selectedOdds ? "Odds " + formatOdds(selectedOdds) : "未有可比較賠率"}</small>
          </div>
          <div className={"ft5-edge-chip" + (edge?.value >= 0.05 ? " positive" : "")}>
            <span>EDGE</span>
            <b>{edgeText}</b>
          </div>
        </div>

        <div className="ft5-cell ft5-market-cell">
          <div className="ft5-odds ft5-row-odds">
            <div className="ft5-odd"><span>主</span><b>{formatOdds(match.odds?.home)}</b></div>
            <div className="ft5-odd"><span>和</span><b>{formatOdds(match.odds?.draw)}</b></div>
            <div className="ft5-odd"><span>客</span><b>{formatOdds(match.odds?.away)}</b></div>
            <div className="ft5-odd"><span>入球</span><b>{match.goals?.line ?? "—"}</b></div>
            <div className="ft5-odd"><span>角球</span><b>{match.corners?.line ?? "—"}</b></div>
          </div>
        </div>

        <div className="ft5-cell ft5-status-cell">
          <div className="ft5-tags">
            <span className={"ft5-tag health-" + coverageMeta.tone}>{coverageMeta.label}</span>
            <span className="ft5-tag">{coverage ? coverage + " models" : "NO MODEL"}</span>
            {edge?.value >= 0.05 ? <span className="ft5-tag blue">VALUE</span> : null}
            {hasMove ? <span className="ft5-tag alert">{rawMove > 0 ? "+" : ""}{rawMove.toFixed(1)}%</span> : null}
          </div>
          <span className="ft5-details">分析 →</span>
        </div>
      </div>
    </Link>
  );
}
