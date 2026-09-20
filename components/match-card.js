import Link from "next/link";
import {
  coverage,
  formatKickoff,
  formatOdds,
  freshness,
  modelCoverageCount,
  sideName,
  valueEdge,
} from "@/lib/fast-tracker";

function edgeTone(value) {
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

function predictedScore(match) {
  return match.forebetDetail?.predictedScore || match.forebet?.predictedScore || "—";
}

function totalSignal(match) {
  const row = match.forebetDetail?.ou25 || {};
  const over = row.over ?? match.multi?.over25;
  const under = row.under ?? match.multi?.under25;
  const avg = row.avgGoals ?? match.forebetDetail?.avgGoals;
  if (over == null && under == null && avg == null) return { main: "—", sub: "NO DATA" };
  if (over != null || under != null) {
    const overN = Number(over ?? -1);
    const underN = Number(under ?? -1);
    const isOver = overN >= underN;
    const p = Math.max(overN, underN);
    return {
      main: `${isOver ? "大" : "細"} ${Number.isFinite(p) && p >= 0 ? `${(p * 100).toFixed(0)}%` : ""}`.trim(),
      sub: avg == null ? "O/U 2.5" : `Avg ${Number(avg).toFixed(2)}`,
    };
  }
  return { main: "Avg", sub: Number(avg).toFixed(2) };
}

function cornerSignal(match) {
  const row = match.forebetDetail?.corners95 || {};
  const over = row.over;
  const under = row.under;
  const avg = row.avgCorners ?? match.forebetDetail?.avgCorners;
  if (over == null && under == null && avg == null) return { main: "—", sub: "NO DATA" };
  if (over != null || under != null) {
    const overN = Number(over ?? -1);
    const underN = Number(under ?? -1);
    const isOver = overN >= underN;
    const p = Math.max(overN, underN);
    return {
      main: `${isOver ? "大" : "細"} ${Number.isFinite(p) && p >= 0 ? `${(p * 100).toFixed(0)}%` : ""}`.trim(),
      sub: avg == null ? "O/U 9.5" : `Avg ${Number(avg).toFixed(1)}`,
    };
  }
  return { main: "Avg", sub: Number(avg).toFixed(1) };
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
  const hasValue = edge && edge.value >= 0.05;
  const selectedOdds = edge ? edgeOdds(match, edge.key) : null;

  return (
    <Link className={`match-card ${focusRank ? "focus-card" : ""}`} href={`/match/${match.id}`}>
      <div className="match-topline">
        {focusRank ? <span className="focus-rank">#{focusRank}</span> : null}
        <span>{formatKickoff(match.kickoff)}</span>
        <span className="league">{match.league}</span>
        <span className={`freshness freshness-${fresh.key}`}>{fresh.label}</span>
      </div>

      <div className="teams">
        <div>
          <b>{primaryHome}</b>
          {secondaryHome && <em>{secondaryHome}</em>}
          <small>主</small>
        </div>
        <span>vs</span>
        <div>
          <b>{primaryAway}</b>
          {secondaryAway && <em>{secondaryAway}</em>}
          <small>客</small>
        </div>
      </div>

      <div className={`value-strip ${hasValue ? edgeTone(edge.value) : "edge-soft"}`}>
        <div>
          <span>最佳 Value</span>
          <b>{edge ? sideName(match, edge.key) : "未有模型"}</b>
        </div>
        <div>
          <span>Edge</span>
          <strong>{edge ? `${edge.value >= 0 ? "+" : ""}${(edge.value * 100).toFixed(1)}pp` : "—"}</strong>
        </div>
        <div>
          <span>HKJC Odds</span>
          <b>{formatOdds(selectedOdds)}</b>
        </div>
      </div>

      <div className="market-grid">
        <div>
          <span>Forebet 預測</span>
          <b>{score}</b>
          <small>{sourceCount ? `${sourceCount} evidence` : "HKJC only"}</small>
        </div>
        <div>
          <span>入球</span>
          <b>{goals.main}</b>
          <small>{goals.sub}</small>
        </div>
        <div>
          <span>角球</span>
          <b>{corners.main}</b>
          <small>{corners.sub}</small>
        </div>
      </div>

      <div className="odds-strip compact-odds">
        <div><span>主</span><b>{formatOdds(match.odds.home)}</b></div>
        <div><span>和</span><b>{formatOdds(match.odds.draw)}</b></div>
        <div><span>客</span><b>{formatOdds(match.odds.away)}</b></div>
      </div>

      <div className="card-footer">
        <span className={`coverage coverage-${coverage(match).replaceAll(" ", "-").toLowerCase()}`}>{coverage(match)}</span>
        <span className="details-link">詳情 →</span>
      </div>
    </Link>
  );
}
