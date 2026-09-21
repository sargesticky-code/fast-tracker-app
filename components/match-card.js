"use client";

import Link from "next/link";
import {
  formatKickoff,
  formatOdds,
  freshness,
  modelCoverageCount,
  preferredModel,
  sideName,
  valueEdge,
} from "@/lib/fast-tracker";

const UI_BUILD = "FORM-20260921-2";

function pct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) + "%" : "—";
}

function modelLabel(match) {
  if (match.multi) return "Multi-source";
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
  const home = match.homeZh || match.home;
  const away = match.awayZh || match.away;
  const rawMove = Number(match.oddsMovement?.rawOddsChangePct);
  const hasMove = Number.isFinite(rawMove) && Math.abs(rawMove) >= 10;
  const edgeText = edge ? (edge.value >= 0 ? "+" : "") + (edge.value * 100).toFixed(1) + "%" : "—";
  const pick = edge ? sideName(match, edge.key) : "未有 Edge";
  const selectedOdds = edge ? edgeOdds(match, edge.key) : null;

  function cacheMatch() {
    try {
      window.localStorage.setItem("ft-match-" + match.id, JSON.stringify(match));
      window.sessionStorage.setItem("ft-match-" + match.id, JSON.stringify(match));
    } catch {}
  }

  return (
    <Link
      className={"ft5-match-card" + (changeType ? " ft5-flash-" + changeType : "")}
      prefetch={false}
      href={"/match/?id=" + encodeURIComponent(match.id) + "&ui=" + UI_BUILD}
      onClick={cacheMatch}
    >
      <div className="ft5-match-meta">
        <div className="ft5-match-meta-left">
          <strong className="ft5-kickoff">{formatKickoff(match.kickoff)}</strong>
          <span className="ft5-league">{match.league}</span>
        </div>
        <span className="ft5-fresh">{fresh.label}</span>
      </div>

      <div className="ft5-match-main">
        <div className="ft5-teams">
          <b>{home}</b>
          <span>VS</span>
          <b>{away}</b>
        </div>

        <div className="ft5-probs" aria-label="HDA model probability">
          <div className={selectedClass(edge, "H")}>
            <span>H</span>
            <b>{pct(model?.home)}</b>
          </div>
          <div className={selectedClass(edge, "D")}>
            <span>D</span>
            <b>{pct(model?.draw)}</b>
          </div>
          <div className={selectedClass(edge, "A")}>
            <span>A</span>
            <b>{pct(model?.away)}</b>
          </div>
        </div>

        <div className="ft5-signal">
          <div className="ft5-signal-box">
            <span>AI MODEL</span>
            <b>{modelLabel(match)}</b>
          </div>
          <div className="ft5-signal-box edge">
            <span>EDGE</span>
            <b>{edgeText}</b>
          </div>
          <div className="ft5-signal-box">
            <span>HDA PICK</span>
            <b>{pick}</b>
          </div>
          <div className="ft5-signal-box">
            <span>PICK ODDS</span>
            <b>{formatOdds(selectedOdds)}</b>
          </div>
        </div>
      </div>

      <div className="ft5-odds">
        <div className="ft5-odd"><span>主勝</span><b>{formatOdds(match.odds?.home)}</b></div>
        <div className="ft5-odd"><span>和局</span><b>{formatOdds(match.odds?.draw)}</b></div>
        <div className="ft5-odd"><span>客勝</span><b>{formatOdds(match.odds?.away)}</b></div>
        <div className="ft5-odd"><span>入球 O/U</span><b>{match.goals?.line ?? "—"}</b></div>
        <div className="ft5-odd"><span>角球 O/U</span><b>{match.corners?.line ?? "—"}</b></div>
      </div>

      <div className="ft5-card-footer">
        <div className="ft5-tags">
          <span className="ft5-tag">{coverage ? coverage + " model inputs" : "NO MODEL"}</span>
          {edge?.value >= 0.05 ? <span className="ft5-tag blue">VALUE</span> : null}
          {hasMove ? <span className="ft5-tag alert">賠率 {rawMove > 0 ? "+" : ""}{rawMove.toFixed(1)}%</span> : null}
        </div>
        <span className="ft5-details">查看分析 →</span>
      </div>
    </Link>
  );
}
