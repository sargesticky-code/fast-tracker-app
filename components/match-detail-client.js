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
  sanitizeFallbackMatch,
  sideName,
} from "@/lib/fast-tracker";

const UI_BUILD = "FORM-20260921-2";
const FEED_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-phase1-feed?hours=24";

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

  return (
    <div className="team-form-card">
      <div className="team-form-card-head">
        <div>
          <small>{title}</small>
          <h3>{name}</h3>
        </div>
        <span>{games ? games + " recent" : "NO HISTORY"}</span>
      </div>

      {recent.length ? (
        <>
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
      ? (parsed.live?.fetchedAt || parsed.health?.hkjcFetchedAt)
      : parsed.health?.hkjcFetchedAt;
    const ageMinutes = sourceTime ? (Date.now() - new Date(sourceTime).getTime()) / 60000 : Infinity;
    const maxAge = parsed.liveNow ? 12 : 30;
    return Number.isFinite(ageMinutes) && ageMinutes <= maxAge ? parsed : sanitizeFallbackMatch(parsed);
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
  const shadow = match.live?.shadow || null;
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

  return (
    <main className="shell detail-shell">
      <div className="detail-top">
        <Link href="/" className="back">← 返回</Link>
        <span>{match.id} · FORM VIEW {UI_BUILD} · {source} · 更新 {formatUpdated(match.updatedAt)}</span>
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

      <section className="panel">
        <div className="panel-title">
          <div><p>MODEL COVERAGE</p><h2>6 個主要模型／市場來源</h2></div>
          <span>{coreModelDataCount}/6 有資料</span>
        </div>
        <div className="health-list">
          {coreModelRows.map((row) => (
            <div key={row.key}>
              <span>{row.label}</span>
              <b>{row.hasData ? "DATA" : "NO DATA"}</b>
            </div>
          ))}
        </div>
        <p className="fineprint">每場都固定顯示六項，冇資料亦唔會隱藏。</p>
      </section>

      <section className="panel">
        <div className="panel-title">
          <div><p>PROBABILITY</p><h2>市場 vs 所有可用模型</h2></div>
          <span>{modelLabel(match)}</span>
        </div>
        {coreModelRows.map((row) => (
          row.hasData
            ? <ProbabilityRow
                key={row.key}
                label={row.key === "MULTI"
                  ? `${row.label} · ${match.multi?.sources || match.multi?.sourceCount || "—"} source(s)`
                  : row.label}
                values={row.values}
                strong={row.key === "MULTI"}
              />
            : <div className="prob-row" key={row.key}>
                <div className="prob-label">{row.label} · NO DATA</div>
                <div className="prob-values">
                  {["H", "D", "A"].map((side) => (
                    <div className="prob-cell" key={side}><span>{side}</span><b>—</b></div>
                  ))}
                </div>
              </div>
        ))}
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
            Implied probability：24H {movement.move24hPp == null ? "—" : Number(movement.move24hPp).toFixed(1) + "%"} ·
            Model alignment：{movement.modelAlignment || "—"}
          </p>
        </section>
      )}

      <section className="panel">
        <div className="panel-title">
          <div><p>SIX-SOURCE CONSENSUS</p><h2>FRB / ACC / BCL / FST / PRE / STA</h2></div>
          <span>{multisourceDataCount}/6 有資料</span>
        </div>
        <div className="health-list">
          {multisourceRows.map((row) => (
            <div key={row.key}>
              <span>{row.key}</span>
              <b>{row.hasData ? "DATA" : "NO DATA"}</b>
            </div>
          ))}
        </div>
        <div className="source-chips">
          <span>Consensus count {match.multi?.sources ?? match.health?.multisourceMemberCount ?? 0}</span>
          <span>Evidence channels {evidenceCount}</span>
        </div>
        {match.multi?.sourceNames?.length > 0
          ? <p className="fineprint">Current consensus inputs：{match.multi.sourceNames.join(" · ")}</p>
          : <p className="fineprint">Current consensus inputs：NO DATA</p>}
      </section>

      <section className="panel">
        <div className="panel-title"><div><p>DATA HEALTH</p><h2>完整資料狀態</h2></div><span>{match.health?.status || "UNKNOWN"}</span></div>
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
