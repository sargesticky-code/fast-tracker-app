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
  modelCoverageCount,
  modelLabel,
  sideName,
} from "@/lib/fast-tracker";

const FEED_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-phase1-feed?hours=24";

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
    fetch(FEED_URL, { cache: "no-store" })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then((feed) => {
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
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => { cancelled = true; };
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

      <section className="panel">
        <div className="panel-title"><div><p>HKJC 1X2</p><h2>市場價格</h2></div></div>
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
              ? <small>Forebet O2.5 {(match.forebetDetail.ou25.over * 100).toFixed(0)}% · U2.5 {(match.forebetDetail.ou25.under * 100).toFixed(0)}% · Avg {match.forebetDetail.ou25.avgGoals ?? "—"}</small>
              : <small>Forebet O/U NO DATA</small>}
          </div>
          <div className="total-market">
            <span>HKJC 角球 O/U · {match.corners?.line || "—"}</span>
            <div><b>大 {formatOdds(match.corners?.over)}</b><b>細 {formatOdds(match.corners?.under)}</b></div>
            {match.forebetDetail?.corners95?.avgCorners != null
              ? <small>Forebet Avg corners {Number(match.forebetDetail.corners95.avgCorners).toFixed(1)} · O9.5 {match.forebetDetail.corners95.over == null ? "—" : (match.forebetDetail.corners95.over * 100).toFixed(0) + "%"}</small>
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
