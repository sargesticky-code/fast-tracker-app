"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MatchCard from "@/components/match-card";
import {
  binaryOdds,
  binarySideName,
  cornersValueEdge,
  dataActionQueue,
  dataAgeMinutes,
  dataCompleteness,
  dataCoverageMatrix,
  dataCoverageSummary,
  dataGapActionSummary,
  dataGapReasonSummary,
  formatKickoff,
  formatOdds,
  freshness,
  goalsValueEdge,
  handicapValueEdge,
  leagueDisplayName,
  modelCoverageCount,
  modelAgreement,
  matchDetailHref,
  matchGapActions,
  reviewPriority,
  reviewScore,
  sideName,
  valueEdge,
} from "@/lib/fast-tracker";

const filters = [
  ["focus", "重點"],
  ["live", "即場"],
  ["all", "全部"],
  ["gaps", "價值精選"],
  ["odds", "賠率變動"],
];

function hdaOdds(match, key) {
  if (key === "H") return match.odds?.home;
  if (key === "D") return match.odds?.draw;
  if (key === "A") return match.odds?.away;
  return null;
}

function hasHardCoverageAlert(match) {
  const status = String(match?.health?.unifiedCoverageStatus || "");
  const coverage = modelCoverageCount(match);

  if (status === "BET365_STALE_OR_MISSING") return true;
  if (status === "IDENTITY_BLOCK") return true;

  if (coverage === 0) {
    return ["PIPELINE_COVERAGE_GAP", "SOURCE_COVERAGE_GAP", "FLASHSCORE_BET365", ""].includes(status);
  }

  return false;
}

function hasActionableDataAlert(match, nowMs) {
  const fresh = freshness(match, nowMs).key;
  return fresh === "stale" || fresh === "missing" || hasHardCoverageAlert(match);
}

function bestMarketEdge(match) {
  return [valueEdge(match), handicapValueEdge(match), goalsValueEdge(match), cornersValueEdge(match)]
    .filter((edge) => edge && Number.isFinite(Number(edge.expectedValue)) && Number(edge.expectedValue) > 0)
    .sort((a, b) => Number(b.expectedValue) - Number(a.expectedValue))[0] || null;
}

function valueBandRank(edge) {
  if (edge?.band === "STRONG_VALUE") return 4;
  if (edge?.band === "VALUE") return 3;
  if (edge?.band === "LEAN") return 2;
  if (edge?.band === "WATCH") return 1;
  return 0;
}

function isValueCandidate(edge) {
  return edge?.band === "STRONG_VALUE" || edge?.band === "VALUE";
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
  let modelProbability = null;

  if (type === "HDA") {
    selection = sideName(match, edge.key);
    odds = hdaOdds(match, edge.key);
    modelProbability = hdaProbability(match, edge.key);
  } else if (type === "入球") {
    selection = `${binarySideName(edge.key)} ${match.goals?.line ?? "—"}`;
    odds = binaryOdds(match.goals, edge.key);
    modelProbability = edge.key === "O" ? Number(edge.model?.over) : Number(edge.model?.under);
  } else {
    selection = `${binarySideName(edge.key)} ${match.corners?.line ?? "—"}`;
    odds = binaryOdds(match.corners, edge.key);
    modelProbability = edge.key === "O" ? Number(edge.model?.over) : Number(edge.model?.under);
  }
  modelProbability = Number.isFinite(Number(edge?.modelProbability)) ? Number(edge.modelProbability) : modelProbability;
  const fairProbability = Number.isFinite(Number(edge?.marketProbability))
    ? Number(edge.marketProbability)
    : Number.isFinite(modelProbability)
      ? modelProbability - Number(edge.value || 0)
      : null;
  const evPct = Number.isFinite(Number(edge?.expectedValue)) ? Number(edge.expectedValue) * 100 : null;
  const modelPct = Number.isFinite(modelProbability) ? (modelProbability * 100).toFixed(1) + "%" : "—";
  const fairPct = Number.isFinite(fairProbability) ? (fairProbability * 100).toFixed(1) + "%" : "—";
  const gapPp = Number.isFinite(Number(edge?.value)) ? Number(edge.value) * 100 : null;
  const formula = Number.isFinite(modelProbability) && Number.isFinite(fairProbability)
    ? `模型 ${(modelProbability * 100).toFixed(1)}% · 市場約 ${(fairProbability * 100).toFixed(1)}% · 差距 ${gapPp == null ? "—" : (gapPp >= 0 ? "+" : "") + gapPp.toFixed(1) + "百分點"}`
    : "模型預測 vs 市場概率";

  return (
    <a
      className="market-pick-row"
      href={matchDetailHref(match.id, UI_BUILD)}
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
        <span>賠率</span>
        <b>{formatOdds(odds)}</b>
      </div>
      <div className="market-pick-number edge-number">
        <span>價值</span>
        <b>{evPct == null ? "—" : (evPct >= 0 ? "+" : "") + evPct.toFixed(1) + "%"}</b>
        <small>{evPct == null ? "未有足夠資料" : `模型估值 ${modelPct ?? "—"} · 市場約 ${fairPct ?? "—"}`}</small>
      </div>
    </a>
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

function groupLineCandidates(rows, marketKey, perLine = 2) {
  const groups = new Map();
  for (const row of rows) {
    const line = Number(row.match?.[marketKey]?.line);
    if (!Number.isFinite(line)) continue;
    const key = line.toFixed(1);
    if (!groups.has(key)) groups.set(key, []);
    if (groups.get(key).length < perLine) groups.get(key).push(row);
  }
  return [...groups.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([line, items]) => ({ line, rows: items }));
}

function LineValueSection({ title, subtitle, groups, type }) {
  const count = groups.reduce((sum, group) => sum + group.rows.length, 0);
  return (
    <section className="value-section">
      <div className="value-section-head">
        <div>
          <span>{subtitle}</span>
          <h3>{title}</h3>
        </div>
        <b>{count}</b>
      </div>
      {groups.length ? (
        <div className="line-value-groups">
          {groups.map((group) => (
            <div className="line-value-group" key={group.line}>
              <div className="line-value-label">{type} {group.line}</div>
              <div className="market-pick-list">
                {group.rows.map(({ match, edge }) => (
                  <MarketPickRow key={match.id} match={match} edge={edge} type={type} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : <div className="market-pick-empty">暫時未有同線 Value</div>}
    </section>
  );
}

function cleanLiveToken(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || /^(null|undefined|nan)$/i.test(text)) return null;
  return text;
}

function liveIdentityKey(match) {
  const id = cleanLiveToken(match?.id);
  if (id) return "id:" + id;
  const kickoff = cleanLiveToken(match?.kickoff) || "";
  const home = cleanLiveToken(match?.homeZh) || cleanLiveToken(match?.home) || "";
  const away = cleanLiveToken(match?.awayZh) || cleanLiveToken(match?.away) || "";
  return "fixture:" + [kickoff, home, away].join("|").toLowerCase();
}

function liveFreshnessStamp(match) {
  const candidates = [
    match?.live?.fetchedAt,
    match?.live?.score?.capturedAt,
    match?.live?.stats?.capturedAt,
    match?.updatedAt,
  ];
  for (const value of candidates) {
    const ms = value ? new Date(value).getTime() : NaN;
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

function dedupeLiveMatches(matches) {
  const unique = new Map();
  for (const match of matches || []) {
    if (!match?.liveNow) continue;
    const key = liveIdentityKey(match);
    const existing = unique.get(key);
    if (!existing || liveFreshnessStamp(match) >= liveFreshnessStamp(existing)) {
      unique.set(key, match);
    }
  }
  return [...unique.values()].sort((a, b) => {
    const aKickoff = new Date(a.kickoff).getTime();
    const bKickoff = new Date(b.kickoff).getTime();
    if (Number.isFinite(aKickoff) && Number.isFinite(bKickoff) && aKickoff !== bKickoff) return aKickoff - bKickoff;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

function liveScoreText(score) {
  const explicit = cleanLiveToken(score?.text);
  if (explicit && !/(^|[-:\s])null($|[-:\s])/i.test(explicit) && !/undefined/i.test(explicit)) {
    return explicit;
  }
  const homeRaw = cleanLiveToken(score?.home);
  const awayRaw = cleanLiveToken(score?.away);
  if (homeRaw == null || awayRaw == null) return "—";
  const home = Number(homeRaw);
  const away = Number(awayRaw);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return "—";
  return `${Math.trunc(home)}-${Math.trunc(away)}`;
}

function liveMinuteText(score, live) {
  const rawMinute = cleanLiveToken(score?.minute);
  if (rawMinute != null) {
    const minute = Number(rawMinute);
    if (Number.isFinite(minute) && minute >= 0) return `${Math.trunc(minute)}'`;
  }
  const rawStatus = cleanLiveToken(score?.status) || cleanLiveToken(live?.status);
  const status = rawStatus ? rawStatus.toUpperCase().replaceAll("_", "").replaceAll(" ", "") : "";
  if (status.includes("FIRSTHALFCOMPLETED") || status === "HT") return "HT";
  if (status.includes("SECONDHALF")) return "2H";
  if (status.includes("FIRSTHALF")) return "1H";
  return "LIVE";
}

function liveCornerProgress(live) {
  const totalRaw = cleanLiveToken(live?.score?.totalCorners);
  const lineRaw = cleanLiveToken(live?.corners?.line);
  if (totalRaw == null || lineRaw == null) return "—";
  const total = Number(totalRaw);
  const line = Number(lineRaw);
  if (!Number.isFinite(total) || !Number.isFinite(line) || line <= 0) return "—";
  const target = Math.floor(line) + 1;
  const need = Math.max(0, target - total);
  return need === 0 ? `${total}/${line} · 已過大` : `${total}/${line} · 差${need}`;
}

function statPairText(pair, digits = 0, suffix = "") {
  if (!pair || pair.home == null || pair.away == null) return "—";
  const h = Number(pair.home);
  const a = Number(pair.away);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return "—";
  return `${h.toFixed(digits)}${suffix}-${a.toFixed(digits)}${suffix}`;
}

function splitPair(pair) {
  if (!pair) return null;
  const home = Number(pair.home);
  const away = Number(pair.away);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  const total = Math.max(0, home) + Math.max(0, away);
  if (total <= 0) return { home: 50, away: 50 };
  return {
    home: (Math.max(0, home) / total) * 100,
    away: (Math.max(0, away) / total) * 100,
  };
}

function LiveSplitMetric({ label, pair, digits = 0, suffix = "" }) {
  const split = splitPair(pair);
  return (
    <div className="ft5-live-visual-metric">
      <span>{label}</span>
      <b>{statPairText(pair, digits, suffix)}</b>
      <i className="ft5-live-splitbar" aria-hidden="true">
        <em style={{ width: (split?.home ?? 50) + "%" }} />
        <em style={{ width: (split?.away ?? 50) + "%" }} />
      </i>
    </div>
  );
}

function livePairAvailable(pair) {
  return Boolean(pair) &&
    Number.isFinite(Number(pair.home)) &&
    Number.isFinite(Number(pair.away));
}

function LiveTelemetryCell({ label, pair, digits = 0, suffix = "" }) {
  const available = livePairAvailable(pair);
  const split = available ? splitPair(pair) : null;
  return (
    <div className={"ft5-telemetry-cell" + (available ? "" : " is-missing")}>
      <span>{label}</span>
      <b>{available ? statPairText(pair, digits, suffix) : "—"}</b>
      <i className="ft5-telemetry-bar" aria-hidden="true">
        <em style={{ width: (split?.home ?? 0) + "%" }} />
        <em style={{ width: (split?.away ?? 0) + "%" }} />
      </i>
    </div>
  );
}

function liveAlignment(shadow) {
  if (!shadow) return { key: "missing", label: "—" };
  const expected = cleanLiveToken(shadow.expectedSide);
  const actual = cleanLiveToken(shadow.actualSide);
  if (!expected || !actual) return { key: "missing", label: "—" };
  if (expected === actual) return { key: "agree", label: "同向" };
  if (actual === "BALANCED") return { key: "balanced", label: "均衡" };
  if (expected === "BALANCED") return { key: "shift", label: "偏移" };
  return { key: "flip", label: "反轉" };
}

function hasReadableLiveStats(stats) {
  if (!stats) return false;
  return [stats.xg, stats.shots, stats.shotsOnTarget, stats.possession].some((pair) => (
    pair && Number.isFinite(Number(pair.home)) && Number.isFinite(Number(pair.away))
  ));
}

function sourceAgeSeconds(value, nowMs = Date.now()) {
  if (!value) return Infinity;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return Infinity;
  return Math.max(0, Math.round((nowMs - ms) / 1000));
}

function sourceAgeLabel(seconds) {
  if (!Number.isFinite(seconds)) return "等待";
  if (seconds < 60) return seconds + "s";
  if (seconds < 3600) return Math.round(seconds / 60) + "m";
  return Math.round(seconds / 3600) + "h";
}

function liveLane(value, nowMs, warnSeconds, staleSeconds) {
  const age = sourceAgeSeconds(value, nowMs);
  const state = !Number.isFinite(age) ? "missing" : age > staleSeconds ? "stale" : age > warnSeconds ? "warn" : "fresh";
  return { age, state, label: sourceAgeLabel(age) };
}

function liveFreshnessDiagnostics(live, nowMs = Date.now()) {
  const statsLane = liveLane(live?.stats?.capturedAt, nowMs, 180, 600);
  const detailStatus = String(live?.detail?.detailStatus || live?.stats?.detailStatus || "").toUpperCase();

  if (!Number.isFinite(statsLane.age)) {
    if (detailStatus === "NOT_APPLICABLE") {
      Object.assign(statsLane, { state: "unavailable", label: "score-only" });
    } else if (detailStatus === "DEFERRED_RATE_GUARD") {
      Object.assign(statsLane, { state: "warn", label: "rate-limit" });
    } else if (detailStatus === "DETAIL_EMPTY") {
      Object.assign(statsLane, { state: "warn", label: "empty" });
    }
  } else if (detailStatus === "DEFERRED_RATE_GUARD" && statsLane.state === "fresh") {
    Object.assign(statsLane, { state: "warn", label: statsLane.label + " · guard" });
  }

  const lanes = {
    odds: liveLane(live?.fetchedAt || live?.oddsUpdatedAt, nowMs, 90, 180),
    score: liveLane(live?.score?.capturedAt || live?.score?.sourceUpdatedAt, nowMs, 90, 180),
    stats: statsLane,
    shadow: liveLane(live?.shadow?.capturedAt, nowMs, 180, 600),
  };
  const ranked = Object.entries(lanes)
    .filter(([, lane]) => Number.isFinite(lane.age))
    .sort((a, b) => b[1].age - a[1].age);
  const bottleneck = ranked[0] || null;
  const hasLag = Object.values(lanes).some((lane) => lane.state === "stale");
  return { lanes, bottleneck, hasLag, detailStatus };
}

function shadowSideLabel(match, side) {
  if (side === "H") return match.homeZh || match.home || "主";
  if (side === "A") return match.awayZh || match.away || "客";
  if (side === "BALANCED") return "均衡";
  return "—";
}

function liveRecommendationMeta(analysis) {
  const decision = analysis?.decision || null;
  const action = String(decision?.action || "").toUpperCase();
  const selection = decision?.selectionLabel || "—";
  const optionalNumber = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const odds = optionalNumber(decision?.currentOdds);
  const ev = optionalNumber(decision?.expectedValuePct);
  const edge = optionalNumber(decision?.candidateEdgePp);
  const confidence = optionalNumber(decision?.confidenceScore);
  const explanation = String(decision?.explanation || analysis?.story?.advice || "").trim();

  let label = "分析中";
  let tone = "pending";
  if (action === "NO_BET") { label = "暫不下注"; tone = "pass"; }
  else if (action === "PASS") { label = "暫時跳過"; tone = "pass"; }
  else if (action.includes("STRONG")) { label = "🔥 重點"; tone = "strong"; }
  else if (action.includes("VALUE")) { label = "✓ 可考慮"; tone = "value"; }
  else if (action.includes("LEAN")) { label = "✓ 可考慮"; tone = "lean"; }
  else if (action === "WATCH") { label = "👀 觀望"; tone = "watch"; }

  return {
    label,
    tone,
    selection,
    odds,
    ev,
    edge,
    confidence,
    explanation: explanation || (action ? "Recommendation 已計算，入 detail 可睇完整理由" : "即場 recommendation 計算中"),
  };
}

function LiveMatchRow({ match, analysis = null, changeType = null, nowMs = Date.now() }) {
  const live = match.live || {};
  const freshnessDiag = liveFreshnessDiagnostics(live, nowMs);
  const score = live.score || {};
  const scoreText = liveScoreText(score);
  const minuteText = liveMinuteText(score, live);
  const cornerProgress = liveCornerProgress(live);
  const stats = live.stats || null;
  const shadow = live.shadow || null;
  const showStats = hasReadableLiveStats(stats);
  const league = leagueDisplayName(cleanLiveToken(match.leagueZh) || cleanLiveToken(match.league)) || "LIVE";
  const homeName = cleanLiveToken(match.homeZh) || cleanLiveToken(match.home) || "主隊";
  const awayName = cleanLiveToken(match.awayZh) || cleanLiveToken(match.away) || "客隊";
  const goalsLine = cleanLiveToken(live.goals?.line) || "—";
  const cornersLine = cleanLiveToken(live.corners?.line) || "—";
  const healthNote = freshnessDiag.detailStatus === "NOT_APPLICABLE"
    ? "score-only"
    : freshnessDiag.detailStatus === "DEFERRED_RATE_GUARD"
      ? "detail rate-limit"
      : freshnessDiag.bottleneck && freshnessDiag.bottleneck[1].state !== "fresh"
        ? `慢 ${freshnessDiag.bottleneck[0]} ${freshnessDiag.bottleneck[1].label}`
        : null;
  const alignment = liveAlignment(shadow);
  const controlScore = Number(shadow?.controlScore);
  const contextCoverage = Number(shadow?.contextCoverage);
  const telemetry = {
    xg: stats?.xg || null,
    xgot: stats?.xgot || null,
    shots: stats?.shots || null,
    sot: stats?.shotsOnTarget || null,
    big: stats?.bigChances || null,
    box: stats?.boxTouches || null,
    corners: stats?.corners || null,
    possession: stats?.possession || null,
  };
  const recommendation = liveRecommendationMeta(analysis);
  const preMatchBand = String(match?.valueEdge?.band || match?.edge?.band || "").toUpperCase();
  const preMatchSide = String(match?.valueEdge?.key || match?.edge?.key || "");
  const liveSide = String(analysis?.decision?.selectionKey || analysis?.decision?.side || "");
  const regime = analysis?.fhre?.regime || analysis?.regime?.state || shadow?.regime || null;
  const regimeStable = Boolean(analysis?.fhre?.stable ?? analysis?.regime?.stable ?? shadow?.regimeStable);
  const preMatchStrong = ["STRONG_VALUE", "VALUE"].includes(preMatchBand);
  const sameDirection = preMatchSide && liveSide && preMatchSide === liveSide;
  const holisticLiveReasons = [
    preMatchStrong ? "賽前有價值" : null,
    sameDirection ? "賽前即場同向" : preMatchSide && liveSide ? "⚠ 賽前即場轉向" : null,
    regime ? (regimeStable ? "FHRE 穩定 " : "FHRE ") + String(regime).replaceAll("_", " ") : null,
    alignment?.key && alignment.key !== "balanced" ? "走勢 " + alignment.label : null,
    freshnessDiag.hasLag ? "⚠ 即場資料延遲" : "即場資料正常",
  ].filter(Boolean).slice(0, 3);

  return (
    <a
      className={"live-match-row ft5-live-row" + (freshnessDiag.hasLag ? " ft5-live-row-lag" : "") + (changeType ? " ft5-flash-" + changeType : "")}
      href={matchDetailHref(match.id, UI_BUILD)}
      onClick={() => cacheMatch(match)}
    >
      <div className="ft5-live-grid">
        <div className="ft5-live-fixture">
          <div className="ft5-live-meta">
            <span className="live-dot">即場</span>
            <b>{minuteText}</b>
            <small>{league}</small>
            
            
          </div>
          <div className="ft5-live-scoreline">
            <b>{homeName}</b>
            <strong className="live-score-main">{scoreText}</strong>
            <b>{awayName}</b>
          </div>
        </div>

        <div className="ft5-live-readout">
          <div className="ft5-live-control-board ft5-live-control-simple">
            <div className={"ft5-live-alignment is-" + alignment.key}><span>即場走勢</span><b>{alignment.label}</b></div>
          </div>
          {!showStats ? (
            <small className="ft5-live-data-note">
              {freshnessDiag.detailStatus === "NOT_APPLICABLE"
                ? "此 source 只提供比分"
                : freshnessDiag.detailStatus === "DEFERRED_RATE_GUARD"
                  ? "Stats 等下一個 detail cycle"
                  : freshnessDiag.detailStatus === "DETAIL_EMPTY"
                    ? "Detail 暫未有 stats"
                    : "Stats 等待更新"}
            </small>
          ) : null}
        </div>

        <div className="ft5-live-market-grid">
          <div>
            <span>HAD</span>
            <b>{formatOdds(live.odds?.home)} / {formatOdds(live.odds?.draw)} / {formatOdds(live.odds?.away)}</b>
          </div>
          <div>
            <span>入球 {goalsLine}</span>
            <b>{formatOdds(live.goals?.over)} / {formatOdds(live.goals?.under)}</b>
          </div>
          <div>
            <span>角球 {cornersLine}</span>
            <b>{formatOdds(live.corners?.over)} / {formatOdds(live.corners?.under)}</b>
            {cornerProgress !== "—" ? <small>{cornerProgress}</small> : null}
          </div>
        </div>

        <div className="ft5-live-telemetry">
          <LiveTelemetryCell label="xG" pair={telemetry.xg} digits={2} />
          <LiveTelemetryCell label="xGOT" pair={telemetry.xgot} digits={2} />
          <LiveTelemetryCell label="射門" pair={telemetry.shots} />
          <LiveTelemetryCell label="中框" pair={telemetry.sot} />
          <LiveTelemetryCell label="Big Chances" pair={telemetry.big} />
          <LiveTelemetryCell label="Box Touches" pair={telemetry.box} />
          <LiveTelemetryCell label="角球" pair={telemetry.corners} />
          <LiveTelemetryCell label="控球" pair={telemetry.possession} suffix="%" />
          <div className="ft5-telemetry-freshness">
            {Object.entries(freshnessDiag.lanes).map(([key, lane]) => (
              <span className={"is-" + lane.state} key={key}><small>{key.toUpperCase()}</small><b>{lane.label}</b></span>
            ))}
            <em className="ft5-telemetry-source">
              <small>{cleanLiveToken(stats?.source) || "NO STATS SOURCE"}</small>
              <b>{Number.isFinite(Number(stats?.confidence)) ? Math.round(Number(stats.confidence) * 100) + "% match" : "confidence —"}</b>
            </em>
          </div>
        </div>

        <div className={"ft5-live-recommendation is-" + recommendation.tone}>
          <div className="ft5-live-reco-copy">
            <span>即場建議 · {recommendation.label}</span>
            <b>{recommendation.selection}{recommendation.odds != null ? " @" + recommendation.odds.toFixed(2) : ""}</b>
            <small>{recommendation.explanation}</small>
            {holisticLiveReasons.length ? (
              <em style={{display:"block",marginTop:4,fontSize:7,fontStyle:"normal",fontWeight:900,color:holisticLiveReasons.some((r) => r.startsWith("⚠")) ? "#995247" : "#35684d"}}>
                {holisticLiveReasons.join("｜")}
              </em>
            ) : null}
          </div>
          <div className="ft5-live-reco-metrics">
            <span><small>現價值</small><b>{recommendation.ev == null ? "—" : (recommendation.ev >= 0 ? "+" : "") + recommendation.ev.toFixed(1) + "%"}</b></span>
            <span><small>市場低估</small><b>{recommendation.edge == null ? "—" : (recommendation.edge >= 0 ? "+" : "") + recommendation.edge.toFixed(1) + "百分點"}</b></span>
            <span><small>信心</small><b>{recommendation.confidence == null ? recommendation.label : Math.round(recommendation.confidence) + "%"}</b></span>
          </div>
        </div>
      </div>
    </a>
  );
}

function LiveTableHead() {
  return (
    <div className="ft5-live-table-head" aria-hidden="true">
      <span>即場賽事 / 比分</span>
      <span>比賽走勢 / 數據</span>
      <span>即場賠率</span>
    </div>
  );
}



function modelSourceLabel(match) {
  if (match.multi) return "綜合預測";
  if (match.forebet) return "比分預測";
  if (match.dc) return "入球模型";
  if (match.pi) return "實力評分";
  if (match.form) return "近期狀態";
  return "未有預測";
}

function hdaProbability(match, key) {
  const model = match.multi || match.forebet || match.dc || match.pi || match.form;
  if (!model) return null;
  if (key === "H") return Number(model.home);
  if (key === "D") return Number(model.draw);
  if (key === "A") return Number(model.away);
  return null;
}

function formatDashboardUpdate(value) {
  if (!value) return "—";
  const t = new Date(value);
  if (!Number.isFinite(t.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(t);
}

function TopBetsHead() {
  return (
    <div className="ft5-topbets-head" aria-hidden="true">
      <span>#</span>
      <span>賽事 / 預測</span>
      <span>精選投注 / 賠率</span>
      <span>價值 / 理由</span>
    </div>
  );
}

function topHdaLabel(key) {
  if (key === "H") return "主";
  if (key === "D") return "和";
  if (key === "A") return "客";
  return "—";
}

function TopBetCard({ row, index = 0, changeType = null }) {
  const { match, edge, type } = row;
  let pick = "—";
  let odds = null;
  let probability = null;

  if (type === "HDA") {
    pick = topHdaLabel(edge.key);
    odds = hdaOdds(match, edge.key);
    probability = hdaProbability(match, edge.key);
  } else if (type === "讓球") {
    pick = edge.selectionLabel || "—";
    odds = edge.odds;
    probability = null;
  } else if (type === "入球") {
    pick = binarySideName(edge.key) + " " + (match.goals?.line ?? "—");
    odds = binaryOdds(match.goals, edge.key);
    probability = edge.key === "O" ? Number(edge.model?.over) : Number(edge.model?.under);
  } else {
    pick = binarySideName(edge.key) + " " + (match.corners?.line ?? "—");
    odds = binaryOdds(match.corners, edge.key);
    probability = edge.key === "O" ? Number(edge.model?.over) : Number(edge.model?.under);
  }

  const modelProbability = Number.isFinite(Number(edge?.modelProbability))
    ? Number(edge.modelProbability)
    : Number.isFinite(probability) ? probability : null;
  const marketFairProbability = Number.isFinite(Number(edge?.marketProbability))
    ? Number(edge.marketProbability)
    : modelProbability == null ? null : modelProbability - Number(edge.value || 0);
  const modelPct = modelProbability == null ? "—" : (modelProbability * 100).toFixed(1) + "%";
  const fairPct = marketFairProbability == null ? "—" : (marketFairProbability * 100).toFixed(1) + "%";
  const edgePp = Number.isFinite(Number(edge.value)) ? Number(edge.value) * 100 : null;
  const evPct = Number(edge.expectedValue || 0) * 100;
  const supportText = type === "讓球"
    ? `${Number(edge.supportCount || 0)}/${Number(edge.familyCount || 0)} family${Number.isFinite(Number(edge.dispersion)) ? " · 分歧 " + (Number(edge.dispersion) * 100).toFixed(1) + "百分點" : ""}`
    : `差距 ${edgePp == null ? "—" : (edgePp >= 0 ? "+" : "") + edgePp.toFixed(1) + "百分點"} · 模型 ${modelPct} / 市場約 ${fairPct}`;
  const quantBand = edge.band === "STRONG_VALUE" ? "強價值"
    : edge.band === "VALUE" ? "有價值"
      : edge.band === "LEAN" ? "輕微價值"
        : edge.band === "WATCH" ? "觀望" : "暫不選";
  const agreement = modelAgreement(match);
  const storyScript = match.storySummary?.matchScript || null;
  const storyAlignment = match.storySummary?.editorialAlignment || null;
  const avgGoals = Number(match.forebetDetail?.ou25?.avgGoals);
  const shapeKey = storyScript?.shapeKey
    || (Number.isFinite(avgGoals) ? (avgGoals >= 3 ? "OPEN" : avgGoals <= 2.2 ? "CONTROLLED" : "BALANCED") : null);
  const shapeLabel = shapeKey === "OPEN" ? "偏開放" : shapeKey === "CONTROLLED" ? "偏受控" : shapeKey === "BALANCED" ? "均衡" : null;
  const scriptScore = storyScript?.predictedScore || match.forebetDetail?.predictedScore || null;
  const contradictCount = Number(storyAlignment?.contradict || 0);
  const supportCount = Number(storyAlignment?.support || 0);
  const scriptBits = [
    shapeLabel,
    scriptScore,
    contradictCount ? "球評反向 " + contradictCount : supportCount ? "球評同向 " + supportCount : null,
  ].filter(Boolean);

  return (
    <a
      className={"ft5-topbet ft5-topbet-row ft5-enter" + (changeType ? " ft5-flash-" + changeType : "")}
      style={{ animationDelay: Math.min(index, 2) * 70 + "ms" }}
      href={matchDetailHref(match.id, UI_BUILD)}
      onClick={() => cacheMatch(match)}
    >
      <div className="ft5-topbet-grid">
        <div className="ft5-topbet-rank">#{index + 1}</div>
        <div className="ft5-topbet-fixture">
          <div>
            <span>{formatKickoff(match.kickoff)}</span>
            <small>{leagueDisplayName(match.leagueZh || match.league)}</small>
            
            <small className={"ft5-consensus ft5-consensus-" + agreement.key}>{agreement.label}</small>
            {scriptBits.length ? (
              <small
                style={{
                  display:"inline-block",
                  marginTop:3,
                  padding:"3px 6px",
                  borderRadius:999,
                  background:"#f4f8f5",
                  color:contradictCount ? "#915048" : "#476658",
                  fontWeight:900,
                }}
              >
                賽事走勢 · {scriptBits.join(" · ")}
              </small>
            ) : null}
          </div>
          <b>{match.homeZh || match.home} <em>vs</em> {match.awayZh || match.away}</b>
        </div>
        <div className="ft5-topbet-choice">
          <span className="ft5-topbet-type">{type}</span>
          <b>{pick}</b>
          <small>模型 {modelPct}</small>
          <strong>@{formatOdds(odds)}</strong>
        </div>
        <div className="ft5-topbet-edge">
          <span>價值</span>
          <b>{evPct >= 0 ? "+" : ""}{evPct.toFixed(1)}%</b>
          <small style={{ display:"block", marginTop:3, fontSize:8, fontWeight:850 }}>
            {supportText}
          </small>
          <em style={{ display:"inline-block", marginTop:5, borderRadius:999, padding:"2px 6px", background:"#f7fbf8", fontSize:8, fontStyle:"normal", fontWeight:950 }}>
            {quantBand}
          </em>
        </div>
      </div>
    </a>
  );
}

function mergeLivePayload(feed, payload) {
  if (!feed || !Array.isArray(feed.matches) || !Array.isArray(payload?.matches)) return feed;
  const liveMap = new Map(payload.matches.map((row) => [String(row.id), row]));
  const seen = new Set();
  const matches = feed.matches.map((match) => {
    const id = String(match.id);
    const fresh = liveMap.get(id);
    if (fresh) {
      seen.add(id);
      return {
        ...match,
        liveNow: true,
        inPlay: true,
        liveEligible: true,
        live: fresh.live,
        updatedAt: fresh.live?.fetchedAt || match.updatedAt,
      };
    }

    // If a fixture was previously live but disappears from the fresh <=3m
    // live authority, never recycle it into the prematch list. The next full
    // feed refresh may confirm the terminal state, but stale live data must
    // disappear immediately.
    if (match.liveNow) return null;
    return match;
  }).filter(Boolean);

  for (const row of payload.matches) {
    const id = String(row.id);
    if (seen.has(id) || matches.some((m) => String(m.id) === id)) continue;
    matches.push({
      ...row,
      odds: { home: null, draw: null, away: null },
      market: null,
      goals: { line: null, over: null, under: null },
      corners: { line: null, over: null, under: null },
      health: { authorityFreshness: "FRESH", unifiedCoverageStatus: "FLASHSCORE_BET365" },
    });
  }

  const liveHealth = Object.fromEntries(
    (payload.systemHealth || []).map((row) => [
      row.source,
      {
        status: row.status ?? null,
        observedAt: row.observed_at ?? row.observedAt ?? null,
      },
    ])
  );

  return {
    ...feed,
    generatedAt: payload.generatedAt || feed.generatedAt,
    systemHealth: { ...(feed.systemHealth || {}), ...liveHealth },
    matches,
  };
}

function feedMotionSnapshot(matches) {
  const out = new Map();
  for (const match of matches || []) {
    const edge = valueEdge(match)?.value;
    const score = liveScoreText(match.live?.score || {});
    const oddsKey = JSON.stringify([
      match.odds?.home, match.odds?.draw, match.odds?.away,
      match.goals?.line, match.goals?.over, match.goals?.under,
      match.corners?.line, match.corners?.over, match.corners?.under,
      match.live?.odds?.home, match.live?.odds?.draw, match.live?.odds?.away,
    ]);
    out.set(String(match.id), {
      edge: Number.isFinite(Number(edge)) ? Number(edge) : null,
      oddsKey,
      score,
    });
  }
  return out;
}

function detectFeedMotion(previous, next) {
  const changed = {};
  for (const [id, current] of next.entries()) {
    const before = previous.get(id);
    if (!before) {
      changed[id] = "new";
      continue;
    }
    if (current.score !== "—" && before.score !== "—" && current.score !== before.score) {
      changed[id] = "score";
      continue;
    }
    if (
      current.edge != null &&
      before.edge != null &&
      Math.abs(current.edge - before.edge) >= 0.001
    ) {
      changed[id] = "edge";
      continue;
    }
    if (current.oddsKey !== before.oddsKey) changed[id] = "odds";
  }
  return changed;
}

function heartbeatAgeMinutes(feed, key, nowMs) {
  const t = feed?.systemHealth?.[key]?.observedAt;
  if (!t) return Infinity;
  const ms = new Date(t).getTime();
  if (!Number.isFinite(ms)) return Infinity;
  return Math.max(0, (nowMs - ms) / 60000);
}

function compactAge(minutes) {
  if (!Number.isFinite(minutes)) return "等待";
  const seconds = Math.max(0, Math.round(minutes * 60));
  if (seconds < 60) return seconds + "s";
  if (seconds < 3600) return Math.round(seconds / 60) + "m";
  return Math.round(seconds / 3600) + "h";
}

function CoverageBoard({ matches, liveMatches, selectedGap = null, onSelectGap, onSelectLive, nowMs = Date.now() }) {
  const summary = dataCoverageSummary(matches);
  const totalCells = summary.reduce((sum, row) => sum + row.total, 0);
  const readyCells = summary.reduce((sum, row) => sum + row.count, 0);
  const overall = totalCells ? Math.round((readyCells / totalCells) * 100) : 0;
  const liveWithStats = liveMatches.filter((match) => hasReadableLiveStats(match.live?.stats)).length;
  const livePct = liveMatches.length ? Math.round((liveWithStats / liveMatches.length) * 100) : 0;
  const selectedChannel = selectedGap ? summary.find((row) => row.key === selectedGap) || null : null;
  const selectedReasons = selectedGap ? dataGapReasonSummary(matches, selectedGap, nowMs) : [];
  const selectedActions = selectedGap ? dataGapActionSummary(matches, selectedGap, nowMs) : [];

  return (
    <section className="ft5-coverage-board" aria-label="24 hour data coverage">
      <button
        type="button"
        className={"ft5-coverage-overall" + (!selectedGap ? " is-active" : "")}
        onClick={() => onSelectGap?.(null)}
        title="Show all missing data channels"
      >
        <span>DATA COVERAGE</span>
        <b>{overall}%</b>
        <small>{matches.length} matches · {readyCells}/{totalCells || 0} cells</small>
      </button>

      <div className="ft5-coverage-grid">
        {summary.map((row) => {
          const missingCount = Math.max(0, row.total - row.count);
          const reasons = missingCount ? dataGapReasonSummary(matches, row.key, nowMs) : [];
          const actions = missingCount ? dataGapActionSummary(matches, row.key, nowMs) : [];
          const topReason = reasons[0] || null;
          const topAction = actions[0] || null;
          return (
            <button
              type="button"
              className={"ft5-coverage-tile" + (row.percent >= 80 ? " is-good" : row.percent >= 55 ? " is-warn" : " is-low") + (selectedGap === row.key ? " is-selected" : "")}
              key={row.key}
              title={row.label + " · missing " + missingCount + " / " + row.total}
              onClick={() => onSelectGap?.(row.key)}
              aria-pressed={selectedGap === row.key}
            >
              <span>{row.short}</span>
              <b>{row.percent}%</b>
              <small>{missingCount ? missingCount + "缺" + (topAction ? " · " + topAction.label : topReason ? " · " + topReason.shortReason : "") : "完整"}</small>
              <i><em style={{ width: row.percent + "%" }} /></i>
            </button>
          );
        })}
        <button
          type="button"
          className={"ft5-coverage-tile ft5-coverage-live" + (livePct >= 80 ? " is-good" : livePct >= 55 ? " is-warn" : " is-low")}
          title={"Live stats " + liveWithStats + "/" + liveMatches.length}
          onClick={() => onSelectLive?.()}
        >
          <span>LIVE</span>
          <b>{liveMatches.length ? livePct + "%" : "—"}</b>
          <small>{liveWithStats}/{liveMatches.length}</small>
          <i><em style={{ width: livePct + "%" }} /></i>
        </button>
      </div>

      {selectedChannel ? (
        <div className="ft5-gap-reason-line">
          <b>{selectedChannel.short} 缺口 · {Math.max(0, selectedChannel.total - selectedChannel.count)} 場</b>
          <span className="ft5-gap-causes">
            <small>原因</small>
            {selectedReasons.length
              ? selectedReasons.slice(0, 3).map((row) => row.shortReason + " " + row.count).join(" · ")
              : "暫時未有缺口"}
          </span>
          <em className="ft5-gap-actions">
            <small>下一步</small>
            {selectedActions.length
              ? selectedActions.slice(0, 3).map((row) => row.label + " " + row.count).join(" · ")
              : "No action"}
          </em>
        </div>
      ) : null}
    </section>
  );
}

function ActionQueue({ matches, selectedAction = null, onSelectAction, nowMs = Date.now() }) {
  const queue = dataActionQueue(matches, nowMs);
  const groups = {
    intervene: queue.filter((row) => row.group === "intervene"),
    rerun: queue.filter((row) => row.group === "rerun"),
    wait: queue.filter((row) => row.group === "wait"),
  };
  const affectedMatches = new Set(
    matches
      .filter((match) => matchGapActions(match, nowMs).length > 0)
      .map((match) => String(match.id))
  ).size;
  const groupMatchCount = (rows) => new Set(
    matches
      .filter((match) => matchGapActions(match, nowMs).some((row) => rows.some((item) => item.key === row.action.key)))
      .map((match) => String(match.id))
  ).size;

  if (!queue.length) return null;

  return (
    <section className="ft5-action-queue" aria-label="data action queue">
      <button
        type="button"
        className={"ft5-action-summary" + (!selectedAction ? " is-active" : "")}
        onClick={() => onSelectAction?.(null)}
        title="Show all missing-data actions"
      >
        <span>ACTION QUEUE</span>
        <b>{affectedMatches}</b>
        <small>
          修復 {groupMatchCount(groups.intervene)} · 重跑 {groupMatchCount(groups.rerun)} · 等待 {groupMatchCount(groups.wait)}
        </small>
      </button>

      <div className="ft5-action-list">
        {queue.slice(0, 8).map((row) => (
          <button
            type="button"
            className={"ft5-action-chip is-" + row.group + (selectedAction === row.key ? " is-selected" : "")}
            key={row.key}
            onClick={() => onSelectAction?.(row.key)}
            aria-pressed={selectedAction === row.key}
            title={row.label + " · " + row.matchCount + " matches · " + row.channels.join("/")}
          >
            <span>{row.label}</span>
            <b>{row.matchCount}</b>
            <small>{row.channels.join("/")}</small>
          </button>
        ))}
      </div>
    </section>
  );
}



const DASHBOARD_LAYOUT_V5 = "\n.ft5-shell{max-width:1120px;margin:0 auto;padding:28px 20px 104px}\n.ft5-topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:22px}\n.ft5-brand{display:flex;align-items:center;gap:12px}\n.ft5-logo{display:grid;place-items:center;width:44px;height:44px;border-radius:15px;background:linear-gradient(135deg,#1f7a4f,#46a978);color:#fff;font-weight:950;letter-spacing:.02em;box-shadow:0 10px 24px rgba(31,122,79,.18)}\n.ft5-brand-copy b{display:block;font-size:24px;line-height:1;color:#143c2d}\n.ft5-brand-copy span{display:block;margin-top:4px;font-size:11px;color:#7c8d84;font-weight:700}\n.ft5-live-pill{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:9px 13px;background:#e4f6ea;color:#1d7950;font-size:11px;font-weight:900;border:1px solid #c8e9d3}\n.ft5-live-pill:before{content:\"\";width:7px;height:7px;border-radius:50%;background:#2fa46c;box-shadow:0 0 0 4px rgba(47,164,108,.10)}\n.ft5-hero{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:18px}\n.ft5-hero h1{margin:0;color:#123e2c;font-size:34px;line-height:1.05;letter-spacing:-.03em}\n.ft5-hero p{margin:8px 0 0;color:#75877e;font-size:13px;font-weight:650}\n.ft5-update{text-align:right;color:#7c8d84;font-size:11px;line-height:1.5}\n.ft5-pipeline{display:flex;align-items:center;gap:8px;margin:-4px 0 14px;padding:9px 12px;border:1px solid #f0d2c8;border-radius:12px;background:#fff5f1;color:#995345;font-size:11px;font-weight:800}\n.ft5-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:20px}\n.ft5-kpi{min-width:0;background:rgba(255,255,255,.94);border:1px solid #dce8df;border-radius:17px;padding:15px 16px;box-shadow:0 8px 24px rgba(42,79,61,.05)}\n.ft5-kpi span{display:block;color:#7b8c83;font-size:11px;font-weight:750;margin-bottom:6px}\n.ft5-kpi b{display:block;color:#164d35;font-size:28px;line-height:1;font-weight:950}\n.ft5-kpi small{display:block;margin-top:6px;color:#9aa79f;font-size:9px}\n.ft5-kpi.warn{background:#fffaf0;border-color:#eedfaf}\n.ft5-kpi.warn b{color:#98701c}\n.ft5-section{margin:0 0 20px}\n.ft5-section-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:11px}\n.ft5-section-head h2{margin:0;color:#153f2f;font-size:22px;letter-spacing:-.02em}\n.ft5-section-head p{margin:4px 0 0;color:#819087;font-size:11px}\n.ft5-section-head .ft5-count{color:#7b8a82;font-size:11px;font-weight:800}\n.ft5-topbets-wrap{padding:16px;border:1px solid #cce5d4;border-radius:22px;background:linear-gradient(135deg,#eaf8ef 0%,#dff3e7 100%);box-shadow:0 12px 30px rgba(46,102,72,.07)}\n.ft5-topbets-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}\n.ft5-topbets-title div span{display:block;color:#238054;font-size:10px;font-weight:950;letter-spacing:.08em}\n.ft5-topbets-title h2{margin:2px 0 0;color:#164832;font-size:22px}\n.ft5-topbets-title button{border:0;background:transparent;color:#277c55;font-size:11px;font-weight:900;cursor:pointer}\n.ft5-topbets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}\n.ft5-topbet{display:flex;flex-direction:column;min-width:0;background:#fff;border:1px solid #d9e8de;border-radius:16px;padding:13px;box-shadow:0 6px 18px rgba(44,85,64,.05);transition:.16s ease}\n.ft5-topbet:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(44,85,64,.09)}\n.ft5-topbet-meta{display:flex;justify-content:space-between;gap:8px;color:#809087;font-size:9px;font-weight:800}\n.ft5-topbet-meta span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}\n.ft5-topbet-teams{margin:10px 0 12px}\n.ft5-topbet-teams b{display:block;color:#17392d;font-size:16px;line-height:1.22}\n.ft5-topbet-teams small{display:block;color:#a2ada7;font-size:9px;margin:3px 0}\n.ft5-topbet-signal{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-top:auto}\n.ft5-topbet-pick{border-radius:11px;background:#eef8f1;padding:9px 10px}\n.ft5-topbet-pick span{display:block;color:#7d8d84;font-size:8px;font-weight:800}\n.ft5-topbet-pick b{display:block;margin-top:3px;color:#1b6847;font-size:16px}\n.ft5-topbet-edge{border-radius:11px;background:#e0f3e7;padding:9px 10px;text-align:center;color:#1f7a50}\n.ft5-topbet-edge span{display:block;font-size:8px;font-weight:800}\n.ft5-topbet-edge b{display:block;margin-top:3px;font-size:17px}\n.ft5-topbet-footer{display:flex;justify-content:space-between;gap:8px;margin-top:9px;color:#7f8e86;font-size:9px;font-weight:750}\n.ft5-live-zone{padding:15px;border:1px solid #cbe3d2;border-radius:20px;background:#edf8f0;margin-bottom:20px}\n.ft5-live-zone .live-zone-head{margin-bottom:10px}\n.ft5-live-zone .live-match-row{box-shadow:none;border-radius:14px}\n.ft5-live-zone .live-context-grid{display:none!important}\n.ft5-live-zone .live-score-hero{justify-content:center}\n.ft5-live-zone .live-stat-strip span{min-height:52px}\n.ft5-toolbar{position:sticky;top:0;z-index:8;padding:10px 0 8px;background:linear-gradient(180deg,rgba(245,247,242,.97) 72%,rgba(245,247,242,0))}\n.ft5-filters{display:flex;gap:7px;overflow-x:auto;padding:0 0 4px;scrollbar-width:none}\n.ft5-filters::-webkit-scrollbar{display:none}\n.ft5-filter{white-space:nowrap;border:1px solid #dae5dd;background:#fff;color:#708179;border-radius:999px;padding:8px 13px;font-size:10px;font-weight:850;cursor:pointer}\n.ft5-filter.active{background:#237b52;color:#fff;border-color:#237b52;box-shadow:0 5px 12px rgba(35,123,82,.18)}\n.ft5-match-list{display:grid;gap:10px}\n.ft5-match-card{display:block;background:#fff;border:1px solid #dce7df;border-radius:17px;padding:14px 15px;box-shadow:0 6px 20px rgba(45,77,62,.045);transition:.15s ease}\n.ft5-match-card:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgba(45,77,62,.08)}\n.ft5-match-meta{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:11px}\n.ft5-match-meta-left{display:flex;align-items:center;gap:8px;min-width:0}\n.ft5-kickoff{color:#173d2f;font-size:12px;font-weight:950;white-space:nowrap}\n.ft5-league{color:#8b9991;font-size:9px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.ft5-fresh{border-radius:999px;background:#edf7f0;color:#2b7b55;padding:5px 7px;font-size:8px;font-weight:900;white-space:nowrap}\n.ft5-match-main{display:grid;grid-template-columns:minmax(190px,1.05fr) minmax(150px,.75fr) minmax(210px,.9fr);gap:12px;align-items:stretch}\n.ft5-teams{display:flex;flex-direction:column;justify-content:center;gap:4px;min-width:0;padding:7px 2px}\n.ft5-teams b{color:#15392c;font-size:18px;line-height:1.18;font-weight:900;overflow-wrap:anywhere}\n.ft5-teams span{color:#a1aca6;font-size:9px;font-weight:700}\n.ft5-probs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;border:1px solid #d9e7de;border-radius:13px;background:#f4faf6;padding:8px}\n.ft5-prob{display:flex;flex-direction:column;justify-content:center;align-items:center;border-radius:9px;padding:7px 4px;color:#71847a}\n.ft5-prob span{font-size:8px;font-weight:900}\n.ft5-prob b{margin-top:4px;font-size:17px;line-height:1;color:#4d675a}\n.ft5-prob.selected{background:#dff2e5;color:#1f724c}\n.ft5-prob.selected b{color:#1b6b47}\n.ft5-signal{display:grid;grid-template-columns:1fr 1fr;gap:6px}\n.ft5-signal-box{display:flex;flex-direction:column;justify-content:center;min-width:0;border:1px solid #e0e9e3;border-radius:11px;background:#f8faf8;padding:8px 9px}\n.ft5-signal-box span{color:#84938b;font-size:8px;font-weight:850}\n.ft5-signal-box b{margin-top:4px;color:#1c5d41;font-size:13px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.ft5-signal-box.edge{background:#edf8f1;border-color:#d0e8d8}\n.ft5-signal-box.edge b{color:#177748;font-size:16px}\n.ft5-odds{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-top:10px}\n.ft5-odd{min-width:0;border:1px solid #e1e9e3;border-radius:9px;background:#fafcfa;padding:7px 8px}\n.ft5-odd span{display:block;color:#8b9991;font-size:7px;font-weight:850}\n.ft5-odd b{display:block;margin-top:3px;color:#234736;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.ft5-card-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px}\n.ft5-tags{display:flex;flex-wrap:wrap;gap:5px}\n.ft5-tag{border-radius:999px;background:#edf5ef;color:#4f6f5f;padding:5px 7px;font-size:8px;font-weight:850}\n.ft5-tag.blue{background:#edf3fb;color:#51719a}\n.ft5-tag.alert{background:#fff0ec;color:#a25749}\n.ft5-tag.health-rich{background:#e3f3e7;color:#27734d}\n.ft5-tag.health-partial{background:#e9f1fb;color:#466c96}\n.ft5-tag.health-warn{background:#fff2cf;color:#946514}\n.ft5-tag.health-danger{background:#f7e4e1;color:#9c4c46}\n.ft5-details{color:#22794f;font-size:10px;font-weight:950;white-space:nowrap}\n.ft5-empty{padding:20px;border:1px dashed #ccd9d0;border-radius:15px;text-align:center;color:#839087;font-size:12px;background:#fbfcfb}\n.ft5-bottom-nav{position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:20;width:min(92%,620px);display:grid;grid-template-columns:repeat(4,1fr);gap:5px;padding:6px;border:1px solid #d8e4db;border-radius:18px;background:rgba(255,255,255,.94);backdrop-filter:blur(16px);box-shadow:0 14px 40px rgba(47,78,62,.15)}\n.ft5-bottom-nav>*{border:0;background:transparent;border-radius:12px;padding:9px 3px;color:#7d8c84;font:inherit;font-size:10px;font-weight:900;text-align:center;cursor:pointer}\n.ft5-bottom-nav .selected{background:#e3f3e8;color:#1d7249}\n@media(max-width:820px){\n  .ft5-shell{padding:16px 12px 94px}\n  .ft5-brand-copy b{font-size:21px}\n  .ft5-logo{width:40px;height:40px;border-radius:13px}\n  .ft5-hero{align-items:flex-start}\n  .ft5-hero h1{font-size:27px}\n  .ft5-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}\n  .ft5-topbets{display:flex;overflow-x:auto;gap:8px;scroll-snap-type:x mandatory;padding-bottom:3px}\n  .ft5-topbet{min-width:270px;scroll-snap-align:start}\n  .ft5-match-main{grid-template-columns:1fr}\n  .ft5-teams{padding:2px 0}\n  .ft5-probs{grid-template-columns:repeat(3,1fr)}\n  .ft5-signal{grid-template-columns:repeat(2,1fr)}\n  .ft5-odds{grid-template-columns:repeat(3,1fr)}\n}\n@media(max-width:520px){\n  .ft5-shell{padding:12px 9px 88px}\n  .ft5-topbar{margin-bottom:17px}\n  .ft5-live-pill{padding:7px 10px;font-size:10px}\n  .ft5-brand-copy b{font-size:19px}\n  .ft5-brand-copy span{font-size:9px}\n  .ft5-hero{display:block}\n  .ft5-hero h1{font-size:24px}\n  .ft5-hero p{font-size:11px}\n  .ft5-update{margin-top:8px;text-align:left;font-size:9px}\n  .ft5-kpi{padding:12px}\n  .ft5-kpi b{font-size:24px}\n  .ft5-topbets-wrap{padding:12px;border-radius:18px}\n  .ft5-topbets-title h2{font-size:19px}\n  .ft5-topbet{min-width:245px;padding:12px}\n  .ft5-section-head h2{font-size:19px}\n  .ft5-match-card{padding:12px;border-radius:15px}\n  .ft5-match-meta{margin-bottom:9px}\n  .ft5-kickoff{font-size:11px}\n  .ft5-league{font-size:8px}\n  .ft5-teams b{font-size:17px}\n  .ft5-prob b{font-size:16px}\n  .ft5-signal-box b{font-size:12px}\n  .ft5-signal-box.edge b{font-size:15px}\n  .ft5-odd{padding:6px}\n  .ft5-odd b{font-size:10px}\n  .ft5-bottom-nav{bottom:6px;width:calc(100% - 16px);border-radius:14px}\n}\n\n\n\\n.ft5-total-pick{min-width:0}\\n.ft5-total-pick b{font-size:9px!important;white-space:nowrap}\\n.ft5-total-pick small{display:block;margin-top:2px;color:#738078;font-size:7px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\\n.ft5-total-pick.edge-target small{color:#2f6b4d}\\n@media(max-width:760px){.ft5-total-pick b{font-size:8.5px!important}.ft5-total-pick small{font-size:6.8px}}\n@keyframes ft5-breathe{0%,100%{transform:scale(.86);opacity:.58}50%{transform:scale(1.18);opacity:1}}\n@keyframes ft5-enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}\n@keyframes ft5-edge-flash{0%{transform:scale(1);background:#edf8f1}30%{transform:scale(1.035);background:#d0f1dc}100%{transform:scale(1);background:#edf8f1}}\n@keyframes ft5-odds-flash{0%{transform:translateY(0);background:#fafcfa}28%{transform:translateY(-2px);background:#fff2c9}100%{transform:translateY(0);background:#fafcfa}}\n@keyframes ft5-score-bump{0%{transform:scale(1)}32%{transform:scale(1.14)}100%{transform:scale(1)}}\n@keyframes ft5-new-card{from{opacity:.2;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}\n.ft5-live-pill:before{animation:ft5-breathe 2.2s ease-in-out infinite}\n.live-dot{position:relative;padding-left:17px!important}\n.live-dot:before{content:\"\";position:absolute;left:7px;top:50%;width:5px;height:5px;margin-top:-2.5px;border-radius:50%;background:#2fa46c;animation:ft5-breathe 2s ease-in-out infinite}\n.ft5-enter{animation:ft5-enter .38s ease-out both}\n.ft5-list-enter{animation:ft5-enter .24s ease-out both}\n.ft5-flash-edge .ft5-signal-box.edge,.ft5-topbet.ft5-flash-edge .ft5-topbet-edge{animation:ft5-edge-flash .9s ease-out}\n.ft5-flash-odds .ft5-odd,.ft5-topbet.ft5-flash-odds .ft5-topbet-pick{animation:ft5-odds-flash .9s ease-out}\n.live-match-row.ft5-flash-score .live-score-main{animation:ft5-score-bump .72s cubic-bezier(.2,.8,.2,1)}\n.ft5-flash-new{animation:ft5-new-card .55s ease-out both}\n.ft5-match-card{content-visibility:auto;contain-intrinsic-size:220px}\n@media(prefers-reduced-motion:reduce){\n  .ft5-live-pill:before,.live-dot:before,.ft5-enter,.ft5-list-enter,.ft5-flash-edge .ft5-signal-box.edge,.ft5-flash-odds .ft5-odd,.live-match-row.ft5-flash-score .live-score-main,.ft5-flash-new{animation:none!important}\n  .ft5-match-card,.ft5-topbet{transition:none!important}\n}\n";

const LIVE_RECOMMENDATION_CSS = ".ft5-live-recommendation{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;margin-top:8px;padding:10px 12px;border:1px solid #dce6df;border-radius:12px;background:#f8faf8}.ft5-live-reco-copy{min-width:0}.ft5-live-reco-copy>span{display:block;font-size:8px;font-weight:950;letter-spacing:.04em;color:#718179}.ft5-live-reco-copy>b{display:block;margin-top:3px;color:#214a37;font-size:13px}.ft5-live-reco-copy>small{display:-webkit-box;margin-top:3px;overflow:hidden;-webkit-line-clamp:2;-webkit-box-orient:vertical;color:#718179;font-size:8px;font-weight:750;line-height:1.3}.ft5-live-reco-metrics{display:grid;grid-template-columns:repeat(3,minmax(54px,1fr));gap:6px}.ft5-live-reco-metrics>span{display:block;min-width:0;padding:6px 7px;border-radius:9px;background:rgba(255,255,255,.72);text-align:center}.ft5-live-reco-metrics small{display:block;color:#84938b;font-size:7px;font-weight:850}.ft5-live-reco-metrics b{display:block;margin-top:2px;color:#315b47;font-size:11px}.ft5-live-recommendation.is-value,.ft5-live-recommendation.is-strong{background:#eaf7ee;border-color:#c3e3ce}.ft5-live-recommendation.is-strong .ft5-live-reco-copy>b,.ft5-live-recommendation.is-strong .ft5-live-reco-metrics b{color:#126d42}.ft5-live-recommendation.is-value .ft5-live-reco-copy>b{color:#23764f}.ft5-live-recommendation.is-lean{background:#f0f7ed;border-color:#d8e6d1}.ft5-live-recommendation.is-watch{background:#fffaf0;border-color:#eee0b9}.ft5-live-recommendation.is-watch .ft5-live-reco-copy>b{color:#88651d}.ft5-live-recommendation.is-pass{background:#f7f7f5;border-color:#e1e3df}.ft5-live-recommendation.is-pass .ft5-live-reco-copy>b{color:#6d756f}@media(max-width:760px){.ft5-live-recommendation{grid-template-columns:1fr;padding:9px 10px}.ft5-live-reco-metrics{grid-template-columns:repeat(3,1fr)}}";

const UI_BUILD = "AH-TOPBETS-20260928-1";
const FEED_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-phase1-feed?hours=24";
const LIVE_FEED_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-live-feed";
const MATCH_ANALYSIS_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-match-analysis?id=";

export default function DashboardClient({ feed, nowMs }) {
  const [filter, setFilter] = useState("focus");
  const [coverageGap, setCoverageGap] = useState(null);
  const [actionFilter, setActionFilter] = useState(null);
  const [currentFeed, setCurrentFeed] = useState(feed);
  const [clockMs, setClockMs] = useState(nowMs || Date.now());
  const [changeMap, setChangeMap] = useState({});
  const [liveAnalysisMap, setLiveAnalysisMap] = useState({});
  const previousFeedRef = useRef(feedMotionSnapshot(feed?.matches || []));
  const motionTimerRef = useRef(null);
  const all = currentFeed.matches || [];
  const liveMatches = useMemo(() => dedupeLiveMatches(all), [all]);
  const liveIdsKey = useMemo(
    () => liveMatches.map((match) => String(match.id || "")).filter(Boolean).sort().join(","),
    [liveMatches]
  );
  const liveIdentityKeys = new Set(liveMatches.map((match) => liveIdentityKey(match)));
  const prematchAll = all.filter((m) => !m.liveNow && !liveIdentityKeys.has(liveIdentityKey(m)));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("filter") || "focus";
    const requestedGap = params.get("gap");
    const requestedAction = params.get("action");
    setFilter(filters.some(([key]) => key === requested) ? requested : "focus");
    setCoverageGap(requested === "missing" && requestedGap ? requestedGap : null);
    setActionFilter(requested === "missing" && requestedAction ? requestedAction : null);

    try {
      const raw = window.sessionStorage.getItem("ft-dashboard-feed-v1")
        || window.localStorage.getItem("ft-dashboard-feed-v1");
      if (raw) {
        const cachedFeed = JSON.parse(raw);
        if (Array.isArray(cachedFeed?.matches) && cachedFeed.matches.length) {
          setCurrentFeed(cachedFeed);
          previousFeedRef.current = feedMotionSnapshot(cachedFeed.matches);
          setClockMs(Date.now());
        }
      }
    } catch {}

    let cancelled = false;
    async function refreshFeed() {
      try {
        const res = await fetch(FEED_URL + "&_=" + Date.now(), { cache: "no-store" });
        if (!res.ok) return;
        const next = await res.json();
        if (!cancelled && Array.isArray(next?.matches)) {
          const nextSnapshot = feedMotionSnapshot(next.matches);
          const changes = detectFeedMotion(previousFeedRef.current, nextSnapshot);
          previousFeedRef.current = nextSnapshot;
          setCurrentFeed(next);
          setClockMs(Date.now());
          try {
            const serialized = JSON.stringify(next);
            window.sessionStorage.setItem("ft-dashboard-feed-v1", serialized);
            window.localStorage.setItem("ft-dashboard-feed-v1", serialized);
          } catch {}
          if (Object.keys(changes).length) {
            setChangeMap(changes);
            if (motionTimerRef.current) window.clearTimeout(motionTimerRef.current);
            motionTimerRef.current = window.setTimeout(() => setChangeMap({}), 1700);
          }
        }
      } catch {}
    }

    async function refreshLive() {
      try {
        const res = await fetch(LIVE_FEED_URL + "?_=" + Date.now(), { cache: "no-store" });
        if (!res.ok) return;
        const payload = await res.json();
        if (!cancelled && Array.isArray(payload?.matches)) {
          setCurrentFeed((previous) => mergeLivePayload(previous, payload));
          setClockMs(Date.now());
        }
      } catch {}
    }

    refreshFeed();
    refreshLive();

    const fullTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshFeed();
      setClockMs(Date.now());
    }, 60000);

    const liveTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshLive();
    }, 10000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refreshLive();
        refreshFeed();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", refreshLive);

    return () => {
      cancelled = true;
      window.clearInterval(fullTimer);
      window.clearInterval(liveTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", refreshLive);
      if (motionTimerRef.current) window.clearTimeout(motionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const ids = liveIdsKey.split(",").filter(Boolean);
    if (!ids.length) {
      setLiveAnalysisMap({});
      return undefined;
    }

    let cancelled = false;
    let running = false;

    async function refreshLiveAnalysis() {
      if (running || cancelled) return;
      running = true;
      const next = {};
      let cursor = 0;

      async function worker() {
        while (!cancelled) {
          const index = cursor;
          cursor += 1;
          if (index >= ids.length) return;
          const id = ids[index];
          try {
            const res = await fetch(MATCH_ANALYSIS_URL + encodeURIComponent(id) + "&_=" + Date.now(), { cache: "no-store" });
            if (!res.ok) continue;
            const payload = await res.json();
            if (payload?.decision) next[id] = payload;
          } catch {}
        }
      }

      try {
        const workerCount = Math.min(3, ids.length);
        await Promise.all(Array.from({ length: workerCount }, () => worker()));
        if (!cancelled && Object.keys(next).length) {
          setLiveAnalysisMap((previous) => ({ ...previous, ...next }));
        }
      } finally {
        running = false;
      }
    }

    refreshLiveAnalysis();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshLiveAnalysis();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [liveIdsKey]);

  const byFocus = useMemo(() => [...prematchAll].sort((a, b) => {
    const aValue = valueEdge(a);
    const bValue = valueEdge(b);
    const bandDelta = valueBandRank(bValue) - valueBandRank(aValue);
    if (bandDelta) return bandDelta;

    const aEv = Number(aValue?.expectedValue);
    const bEv = Number(bValue?.expectedValue);
    if (Number.isFinite(aEv) && Number.isFinite(bEv) && aEv !== bEv) {
      return bEv - aEv;
    }

    const coverageDelta = modelCoverageCount(b) - modelCoverageCount(a);
    if (coverageDelta) return coverageDelta;

    const priorityDelta = reviewScore(b, clockMs) - reviewScore(a, clockMs);
    if (priorityDelta) return priorityDelta;

    return new Date(a.kickoff) - new Date(b.kickoff);
  }), [prematchAll, clockMs]);

  const candidateSort = (a, b) => {
    const bandDelta = valueBandRank(b.edge) - valueBandRank(a.edge);
    if (bandDelta) return bandDelta;
    const evDelta = Number(b.edge?.expectedValue || 0) - Number(a.edge?.expectedValue || 0);
    if (evDelta) return evDelta;
    return Number(b.edge?.value || 0) - Number(a.edge?.value || 0);
  };
  const hdaCandidates = useMemo(() => prematchAll
    .map((match) => ({ match, edge: valueEdge(match) }))
    .filter((row) => isValueCandidate(row.edge))
    .sort(candidateSort), [prematchAll]);
  const handicapCandidates = useMemo(() => prematchAll
    .map((match) => ({ match, edge: handicapValueEdge(match) }))
    .filter((row) => isValueCandidate(row.edge))
    .sort(candidateSort), [prematchAll]);
  const goalsCandidates = useMemo(() => prematchAll
    .map((match) => ({ match, edge: goalsValueEdge(match) }))
    .filter((row) => isValueCandidate(row.edge))
    .sort(candidateSort), [prematchAll]);
  const cornersCandidates = useMemo(() => prematchAll
    .map((match) => ({ match, edge: cornersValueEdge(match) }))
    .filter((row) => isValueCandidate(row.edge))
    .sort(candidateSort), [prematchAll]);

  const hdaPicks = hdaCandidates.slice(0, 5);
  const goalsGroups = groupLineCandidates(goalsCandidates, "goals", 2);
  const cornersGroups = groupLineCandidates(cornersCandidates, "corners", 2);
  const topBets = [
    ...hdaCandidates.map((row) => ({ ...row, type: "HDA" })),
    ...handicapCandidates.map((row) => ({ ...row, type: "讓球" })),
    ...goalsCandidates.map((row) => ({ ...row, type: "入球" })),
    ...cornersCandidates.map((row) => ({ ...row, type: "角球" })),
  ]
    .sort(candidateSort)
    .slice(0, 3);

  let matches = byFocus;
  if (filter === "all") matches = [...prematchAll].sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  if (filter === "gaps") {
    matches = prematchAll.filter((m) => bestMarketEdge(m))
      .sort((a, b) => Number(bestMarketEdge(b)?.expectedValue || 0) - Number(bestMarketEdge(a)?.expectedValue || 0));
  }
  if (filter === "odds") {
    matches = prematchAll
      .filter((m) => Number.isFinite(Number(m.oddsMovement?.rawOddsChangePct)) && Math.abs(Number(m.oddsMovement.rawOddsChangePct)) >= 10)
      .sort((a, b) => Math.abs(Number(b.oddsMovement.rawOddsChangePct)) - Math.abs(Number(a.oddsMovement.rawOddsChangePct)));
  }
  if (filter === "missing") {
    matches = prematchAll
      .filter((m) => {
        const detail = dataCompleteness(m);
        if (actionFilter) return matchGapActions(m, clockMs).some((row) => row.action.key === actionFilter);
        if (!coverageGap) return detail.missing.length > 0;
        return detail.channels.some((row) => row.key === coverageGap && !row.available);
      })
      .sort((a, b) => {
        const gapDelta = dataCompleteness(b).missing.length - dataCompleteness(a).missing.length;
        if (gapDelta) return gapDelta;
        return new Date(a.kickoff) - new Date(b.kickoff);
      });
  }
  if (filter === "stale") {
    matches = prematchAll.filter((m) => freshness(m, clockMs).key === "stale")
      .sort((a, b) => dataAgeMinutes(b, clockMs) - dataAgeMinutes(a, clockMs));
  }

  const coverageChannels = dataCoverageMatrix({});
  const selectedCoverageMeta = coverageChannels.find((row) => row.key === coverageGap) || null;
  const actionQueue = dataActionQueue(prematchAll, clockMs);
  const selectedActionMeta = actionQueue.find((row) => row.key === actionFilter) || null;
  const missing = prematchAll.filter((m) => {
    const detail = dataCompleteness(m);
    if (actionFilter) return matchGapActions(m, clockMs).some((row) => row.action.key === actionFilter);
    if (!coverageGap) return detail.missing.length > 0;
    return detail.channels.some((row) => row.key === coverageGap && !row.available);
  }).length;
  const stale = prematchAll.filter((m) => ["stale", "missing"].includes(freshness(m, clockMs).key)).length;
  const valueCandidates = hdaCandidates.length + handicapCandidates.length + goalsCandidates.length + cornersCandidates.length;
  const oddsAlerts = prematchAll.filter((m) => Number.isFinite(Number(m.oddsMovement?.rawOddsChangePct)) && Math.abs(Number(m.oddsMovement.rawOddsChangePct)) >= 10).length;
  const modelReady = prematchAll.filter((m) => modelCoverageCount(m) > 0).length;
  const priorityOne = prematchAll.filter((m) => reviewPriority(m, clockMs).band === "p1").length;
  const dataAlerts = prematchAll.filter((m) => hasActionableDataAlert(m, clockMs)).length;
  const booting = currentFeed.source === "boot-empty";
  const isLive = currentFeed.source === "supabase-canonical-live";
  const liveOddsAge = heartbeatAgeMinutes(currentFeed, "FLASHSCORE_BET365", clockMs);
  const liveScoreAge = heartbeatAgeMinutes(currentFeed, "LIVE_SCORE_EDGE", clockMs);
  const liveAge = Math.max(liveOddsAge, liveScoreAge);
  const frontendGuardAge = heartbeatAgeMinutes(currentFeed, "FRONTEND_ROUTE_GUARD", clockMs);
  const frontendGuard = currentFeed?.systemHealth?.FRONTEND_ROUTE_GUARD;
  const liveLayerGuard = currentFeed?.systemHealth?.LIVE_LAYER_GUARD;
  const upstreamDeploy = currentFeed?.systemHealth?.LIVE_UPSTREAM_DEPLOY;
  const nativeLiveShadow = currentFeed?.systemHealth?.LIVE_SOURCE_SHADOW;
  const liveShadowCompare = currentFeed?.systemHealth?.LIVE_SHADOW_COMPARE;
  const pipelineWarnings = booting ? [] : [
    heartbeatAgeMinutes(currentFeed, "FLASHSCORE_BET365", clockMs) > 30 ? "Bet365 cloud feed" : null,
    liveOddsAge > 3 ? "Live odds" : null,
    liveScoreAge > 3 ? "Live score" : null,
    liveLayerGuard?.status === "FAIL" ? "Live core" : null,
    liveLayerGuard?.status === "WARN" ? "Live stats / shadow" : null,
    upstreamDeploy?.status === "WARN" || upstreamDeploy?.status === "FAIL" ? "Live upstream build" : null,
    nativeLiveShadow?.status === "FAIL" ? "Native live shadow" : null,
    liveShadowCompare?.status === "WARN" && Number(liveShadowCompare?.raw?.live || 0) > 0 ? "Native live compare" : null,
    frontendGuard?.status === "FAIL" || frontendGuardAge > 10 ? "Dashboard links" : null,
  ].filter(Boolean);

  const headings = {
    focus: ["24小時投注重點", "最值得留意嘅賽事、投注方向同價值"],
    live: ["即場賽事", "正在進行嘅賽事、比分、賠率同投注建議"],
    all: ["未來24小時", "按開賽時間排序"],
    gaps: ["價值精選", "按現時賠率比較模型預測，集中顯示較有價值嘅投注選擇"],
    odds: ["賠率變動", `${oddsAlerts} 場有明顯變動 · 按幅度排序`],
    missing: ["後台資料檢查", "資料完整度及來源狀態"],
    stale: ["後台更新檢查", "資料更新狀態"],
  };

  function filterCount(key) {
    if (key === "live") return liveMatches.length;
    if (key === "all") return prematchAll.length;
    if (key === "gaps") return valueCandidates;
    if (key === "odds") return oddsAlerts;
    if (key === "missing") return missing;
    if (key === "stale") return stale;
    if (key === "focus") return null;
    return 0;
  }

  function selectFilter(key) {
    setFilter(key);
    if (key !== "missing") {
      setCoverageGap(null);
      setActionFilter(null);
    }
    const nextUrl = key === "focus" ? "/" : `/?filter=${key}`;
    window.history.replaceState({}, "", nextUrl);
  }

  function selectCoverageGap(key) {
    setCoverageGap(key || null);
    setActionFilter(null);
    setFilter("missing");
    const nextUrl = key ? `/?filter=missing&gap=${encodeURIComponent(key)}` : "/?filter=missing";
    window.history.replaceState({}, "", nextUrl);
  }

  function selectActionFilter(key) {
    setActionFilter(key || null);
    setCoverageGap(null);
    setFilter("missing");
    const nextUrl = key ? `/?filter=missing&action=${encodeURIComponent(key)}` : "/?filter=missing";
    window.history.replaceState({}, "", nextUrl);
  }

  if (booting) {
    return (
      <main className="ft5-shell">
        <style data-dashboard-layout="v5">{DASHBOARD_LAYOUT_V5 + LIVE_RECOMMENDATION_CSS}</style>
        <header className="ft5-topbar ft5-commandbar">
          <div className="ft5-brand">
            <div className="ft5-logo">FT</div>
            <div className="ft5-brand-copy">
              <b>Fast Track</b>
              <span>Bet365 × Multi-model Football Intelligence</span>
            </div>
          </div>
          <div className="ft5-header-status">
            <span className="ft5-live-pill">更新中</span>
            <small>正在讀取最新賽事、賠率及預測</small>
          </div>
        </header>
        <div className="ft5-pipeline">正在更新最新資料</div>
        <section className="ft5-section">
          <div className="ft5-fixture-controls">
            <div className="ft5-fixture-heading">
              <b>未來24小時</b>
              <span>正在整理最新賽事</span>
            </div>
          </div>
          <div className="ft5-empty">正在讀取最新賠率及預測…</div>
        </section>
      </main>
    );
  }

  return (
    <main className="ft5-shell">
      <style data-dashboard-layout="v5">{DASHBOARD_LAYOUT_V5 + LIVE_RECOMMENDATION_CSS}</style>

      <header className="ft5-topbar ft5-commandbar">
        <div className="ft5-brand">
          <div className="ft5-logo">FT</div>
          <div className="ft5-brand-copy">
            <b>Fast Track</b>
            <span>Bet365 × Multi-model Football Intelligence</span>
          </div>
        </div>

        <div className="ft5-header-stats" aria-label="dashboard summary">
          <div><span>24小時賽事</span><b>{prematchAll.length}</b></div>
          <div><span>價值精選</span><b>{valueCandidates}</b></div>
          <div><span>有預測</span><b>{modelReady}</b></div>
          
          
        </div>

        <div className="ft5-header-status">
          <span className="ft5-live-pill">{isLive ? "資料已更新" : "使用最近資料"}</span>
          <small>最後更新 {formatDashboardUpdate(currentFeed.generatedAt || currentFeed.updatedAt)}</small>
        </div>
      </header>

      {/* Technical pipeline, coverage and action-queue diagnostics are kept out of the public dashboard. */}

      <section className="ft5-section ft5-topbets-wrap">
        <div className="ft5-topbets-title">
          <div>
            <span>VALUE PICKS</span>
            <h2>價值精選</h2>
            <p style={{ margin:"4px 0 0", color:"#617a6c", fontSize:9, fontWeight:750 }}>
              模型預測同現時賠率有明顯差距嘅選擇，集中睇投注方向、賠率同價值
            </p>
          </div>
          <button type="button" onClick={() => selectFilter("gaps")}>查看更多 →</button>
        </div>
        {topBets.length ? (
          <>
            <TopBetsHead />
            <div className="ft5-topbets">
              {topBets.map((row, index) => (
                <TopBetCard key={row.match.id + "-" + row.type + "-" + index} row={row} index={index} changeType={changeMap[String(row.match.id)] || null} />
              ))}
            </div>
          </>
        ) : <div className="ft5-empty">暫時未有足夠價值嘅精選投注</div>}
      </section>

      {liveMatches.length > 0 && filter !== "live" && (
        <section className="ft5-live-zone">
          <div className="live-zone-head">
            <div><span>即場</span><h2>即場賽事</h2></div>
            <button type="button" onClick={() => selectFilter("live")}>查看全部 →</button>
          </div>
          <LiveTableHead />
          <div className="live-list">
            {liveMatches.slice(0, 3).map((match) => <LiveMatchRow key={match.id} match={match} analysis={liveAnalysisMap[String(match.id)] || null} nowMs={clockMs} changeType={changeMap[String(match.id)] || null} />)}
          </div>
        </section>
      )}

      <section className="ft5-section">
        <div className="ft5-fixture-controls">
          <div className="ft5-fixture-heading">
            <b>{
              filter === "live"
                ? "即場賽事"
                : filter === "missing" && selectedActionMeta
                  ? "待處理 · " + selectedActionMeta.label
                  : filter === "missing" && selectedCoverageMeta
                    ? "資料未齊 · " + selectedCoverageMeta.short
                    : "未來24小時"
            }</b>
            <span>{
              filter === "live"
                ? "即場比分、賠率及建議"
                : filter === "missing" && selectedActionMeta
                  ? missing + " 場 · " + selectedActionMeta.channels.join("/")
                  : filter === "missing" && selectedCoverageMeta
                    ? selectedCoverageMeta.label + " 缺口 · " + missing + " 場"
                    : "香港時間 · 即將開賽"
            }</span>
          </div>
          <nav className="ft5-filters ft5-filter-rail" aria-label="賽事篩選">
            {filters.map(([key, label]) => {
              const count = filterCount(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={"ft5-filter" + (filter === key ? " active" : "")}
                  onClick={() => selectFilter(key)}
                  aria-pressed={filter === key}
                >
                  <span className="ft5-filter-label">{label}</span>
                  {count != null ? <b className="ft5-filter-count">{count}</b> : null}
                </button>
              );
            })}
          </nav>
        </div>

        {filter === "live" ? (
          <div className="ft5-live-filter-table">
            <LiveTableHead />
            <div className="live-list">
            {liveMatches.length
              ? liveMatches.map((match) => <LiveMatchRow key={match.id} match={match} analysis={liveAnalysisMap[String(match.id)] || null} nowMs={clockMs} changeType={changeMap[String(match.id)] || null} />)
              : <div className="ft5-empty">暫時未有符合更新要求嘅即場賽事</div>}
            </div>
          </div>
        ) : (
          <div className="ft5-fixture-table">
            <div className="ft5-table-head" aria-hidden="true">
              <span>時間 / 賽事</span>
              <span>預測 / 主和客</span>
              <span>★ 投注建議 / 價值</span>
              <span>市場賠率</span>
            </div>
            <div className="ft5-match-list ft5-list-enter" key={filter}>
              {matches.length
                ? matches.map((match) => <MatchCard key={match.id} match={match} nowMs={clockMs} coverageGap={coverageGap} actionFilter={actionFilter} changeType={changeMap[String(match.id)] || null} />)
                : <div className="ft5-empty">呢個篩選暫時冇賽事</div>}
            </div>
          </div>
        )}
      </section>

      <footer className="ft5-bottom-nav">
        <button className={filter === "focus" ? "selected" : ""} type="button" onClick={() => selectFilter("focus")}>首頁</button>
        <button className={filter === "live" ? "selected" : ""} type="button" onClick={() => selectFilter("live")}>● 即場</button>
        <button className={filter === "gaps" ? "selected" : ""} type="button" onClick={() => selectFilter("gaps")}>★ 價值</button>
        <a href="/health/">⚙ 系統</a>
      </footer>
    </main>
  );
}
