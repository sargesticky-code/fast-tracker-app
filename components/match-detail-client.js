"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ProbabilityRow from "@/components/probability-row";
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
  sideName,
} from "@/lib/fast-tracker";

const FEED_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-phase1-feed?hours=24";

function pairText(pair, digits = 0, suffix = "") {
  if (!pair || pair.home == null || pair.away == null) return "—";
  const h = Number(pair.home);
  const a = Number(pair.away);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return "—";
  return `${h.toFixed(digits)}${suffix}-${a.toFixed(digits)}${suffix}`;
}

function readCachedMatch(id) {
  if (!id) return null;
  try {
    const raw = window.localStorage.getItem(`ft-match-${id}`) || window.sessionStorage.getItem(`ft-match-${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function MatchDetailClient({ snapshotMatches = [] }) {
  const [id, setId] = useState("");
  const [match, setMatch] = useState(null);
  const [source, setSource] = useState("LOADING");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const matchId = new URLSearchParams(window.location.search).get("id") || "";
    setId(matchId);

    if (!matchId) {
      setReady(true);
      return;
    }

    const cached = readCachedMatch(matchId);
    const fallback = snapshotMatches.find((m) => String(m.id) === String(matchId)) || null;
    if (cached || fallback) {
      setMatch(cached || fallback);
      setSource(cached ? "DASHBOARD" : "SNAPSHOT");
    }

    let cancelled = false;

    async function refreshMatch() {
      try {
        const res = await fetch(FEED_URL, { cache: "no-store" });
        if (!res.ok) return;
        const feed = await res.json();
        if (cancelled) return;
        const live = (feed.matches || []).find((m) => String(m.id) === String(matchId));
        if (live) {
          setMatch(live);
          setSource("LIVE SQL");
          try {
            window.localStorage.setItem(`ft-match-${matchId}`, JSON.stringify(live));
            window.sessionStorage.setItem(`ft-match-${matchId}`, JSON.stringify(live));
          } catch {}
        }
      } catch {
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    refreshMatch();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshMatch();
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [snapshotMatches]);

  if (!id && ready) {
    return (
      <main className="shell detail-shell">
        <div className="detail-top"><Link href="/" className="back">← 返回賽事</Link></div>
        <section className="panel"><h2>未指定賽事</h2><p className="fineprint">請由 Betting Board 撳入一場賽事。</p></section>
      </main>
    );
  }

  if (!match && !ready) {
    return (
      <main className="shell detail-shell">
        <div className="detail-top"><Link href="/" className="back">← 返回賽事</Link><span>{id}</span></div>
        <section className="panel"><p className="fineprint">載入賽事資料中…</p></section>
      </main>
    );
  }

  if (!match) {
    return (
      <main className="shell detail-shell">
        <div className="detail-top"><Link href="/" className="back">← 返回賽事</Link><span>{id}</span></div>
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
  const goalsCompare = lineComparisonStatus(match, "goals");
  const cornersCompare = lineComparisonStatus(match, "corners");

  return (
    <main className="shell detail-shell">
      <div className="detail-top">
        <Link href="/" className="back">← 返回</Link>
        <span>{match.id} · {source} · 更新 {formatUpdated(match.updatedAt)}</span>
      </div>

      <section className="detail-hero">
        <div className="detail-meta">{formatKickoff(match.kickoff)} · {match.league}</div>
        {zhTitle && <div className="zh-teams">{zhTitle}</div>}
        <h1>{match.homeZh || match.home}</h1>
        <p>vs</p>
        <h1>{match.awayZh || match.away}</h1>
        {predictedScore ? <div className="predicted-score">Forebet 預測 <b>{predictedScore}</b></div> : null}
        <div className="detail-status-row">
          <span className={`freshness freshness-${fresh.key}`}>{fresh.label}</span>
          <span className="evidence-count">{evidenceCount} evidence inputs</span>
        </div>
      </section>

      {match.liveNow && match.live && (
        <section className="panel live-detail-panel">
          <div className="panel-title">
            <div><p>HKJC LIVE</p><h2>即場市場</h2></div>
            <span>{match.live.status || "LIVE"}</span>
          </div>
          <div className="live-score-summary">
            <div><span>比分</span><b>{liveScoreText}</b></div>
            <div><span>時間</span><b>{liveMinute}</b></div>
            <div><span>角球</span><b>{Number.isFinite(liveCornerTotal) ? liveCornerTotal : "—"}</b></div>
            <div><span>角球進度</span><b>{liveCornerProgress}</b></div>
          </div>
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
          </p>
        </section>
      )}

      <section className="panel">
        <div className="panel-title"><div><p>{match.liveNow ? "PRE-MATCH HKJC 1X2" : "HKJC 1X2"}</p><h2>市場價格</h2></div></div>
        <div className="big-odds">
          <div><span>主</span><b>{formatOdds(match.odds?.home)}</b></div>
          <div><span>和</span><b>{formatOdds(match.odds?.draw)}</b></div>
          <div><span>客</span><b>{formatOdds(match.odds?.away)}</b></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title"><div><p>HKJC TOTALS</p><h2>入球及角球</h2></div></div>
        <div className="totals-grid">
          <div className="total-market">
            <span>HKJC 入球 O/U · {match.goals?.line || "—"}</span>
            <div><b>大 {formatOdds(match.goals?.over)}</b><b>細 {formatOdds(match.goals?.under)}</b></div>
            {match.forebetDetail?.ou25?.over != null
              ? <small className={goalsCompare.key === "mismatch" ? "line-warning" : ""}>
                  Forebet O2.5 {(match.forebetDetail.ou25.over * 100).toFixed(0)}% · U2.5 {(match.forebetDetail.ou25.under * 100).toFixed(0)}% · Avg {match.forebetDetail.ou25.avgGoals ?? "—"}
                  {goalsCompare.key === "mismatch" ? ` · LINE MISMATCH：不可同 HKJC ${goalsCompare.currentLine} 直接計 Edge` : ""}
                </small>
              : <small>Forebet O/U NO DATA</small>}
          </div>
          <div className="total-market">
            <span>HKJC 角球 O/U · {match.corners?.line || "—"}</span>
            <div><b>大 {formatOdds(match.corners?.over)}</b><b>細 {formatOdds(match.corners?.under)}</b></div>
            {match.forebetDetail?.corners95?.avgCorners != null
              ? <small className={cornersCompare.key === "mismatch" ? "line-warning" : ""}>
                  Forebet Avg corners {Number(match.forebetDetail.corners95.avgCorners).toFixed(1)} · O9.5 {match.forebetDetail.corners95.over == null ? "—" : (match.forebetDetail.corners95.over * 100).toFixed(0) + "%"}
                  {cornersCompare.key === "mismatch" ? ` · LINE MISMATCH：不可同 HKJC ${cornersCompare.currentLine} 直接計 Edge` : ""}
                </small>
              : <small>Forebet corners NO DATA</small>}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <div><p>PROBABILITY</p><h2>市場 vs 所有模型</h2></div>
          <span>{modelLabel(match)}</span>
        </div>
        {market && <ProbabilityRow label="HKJC no-vig" values={market} />}
        {match.forebet && <ProbabilityRow label="Forebet" values={match.forebet} />}
        {match.dc && <ProbabilityRow label="DC" values={match.dc} />}
        {match.pi && <ProbabilityRow label="Pi" values={match.pi} />}
        {match.form && <ProbabilityRow label="Form" values={match.form} />}
        {match.multi && <ProbabilityRow label={`Multi-source · ${match.multi.sources || match.multi.sourceCount || "—"}`} values={match.multi} strong />}
      </section>

      {match.power && (match.power.home != null || match.power.away != null) && (
        <section className="panel">
          <div className="panel-title">
            <div><p>OPTA POWER</p><h2>獨立球隊實力</h2></div>
            <span>{match.power.coverage || "—"}</span>
          </div>
          <div className="power-grid">
            <div>
              <span>{match.homeZh || match.home}</span>
              <b>{match.power.home == null ? "—" : Number(match.power.home).toFixed(1)}</b>
              <small>{match.power.homeRank == null ? "" : `Rank #${match.power.homeRank}`}</small>
              <em>{match.power.homeName || ""}</em>
            </div>
            <div>
              <span>{match.awayZh || match.away}</span>
              <b>{match.power.away == null ? "—" : Number(match.power.away).toFixed(1)}</b>
              <small>{match.power.awayRank == null ? "" : `Rank #${match.power.awayRank}`}</small>
              <em>{match.power.awayName || ""}</em>
            </div>
          </div>
          <p className="fineprint">
            Opta Power 只作獨立 strength evidence；未經 calibration 前唔會直接轉成 HDA probability。
          </p>
        </section>
      )}

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
            Implied probability：24H {movement.move24hPp == null ? "—" : Number(movement.move24hPp).toFixed(1) + "pp"} ·
            Model alignment：{movement.modelAlignment || "—"}
          </p>
        </section>
      )}

      {match.multi?.sourceNames?.length > 0 && (
        <section className="panel">
          <div className="panel-title"><div><p>SOURCES</p><h2>Multi-source evidence</h2></div></div>
          <div className="source-chips">{match.multi.sourceNames.map((s) => <span key={s}>{s}</span>)}</div>
        </section>
      )}

      <section className="panel">
        <div className="panel-title"><div><p>DATA HEALTH</p><h2>資料狀態</h2></div><span>{match.health?.status || "UNKNOWN"}</span></div>
        <div className="source-chips">
          <span>HKJC {match.health?.hkjcFreshness || fresh.label}</span>
          <span>Forebet {match.health?.forebetState || "NO DATA"}</span>
          <span>Internal {match.health?.internalModelQuality || "NO DATA"}</span>
        </div>
        {match.health?.forebetState && match.health.forebetState !== "MODEL" ? (
          <p className="fineprint">
            Forebet：{match.health.forebetState}
            {match.health?.forebetReason ? ` · ${match.health.forebetReason}` : ""}
          </p>
        ) : null}
        {missingReason ? <p className="fineprint">缺資料原因：{missingReason}</p> : <p className="fineprint">Canonical evidence channels：{evidenceCount}</p>}
      </section>

      <section className="panel">
        <div className="panel-title"><div><p>DIVERGENCE</p><h2>值得留意嘅差異</h2></div></div>
        {gap ? (
          <div className="gap-feature">
            <span>{gap.key}</span>
            <div><small>{sideName(match, gap.key)}</small><b>{gap.value > 0 ? "+" : ""}{(gap.value * 100).toFixed(1)}pp</b></div>
          </div>
        ) : <p className="empty">未有足夠外部模型資料。</p>}
      </section>
    </main>
  );
}
