"use client";

import {
  binaryFair,
  binaryOdds,
  binarySideName,
  cornersValueEdge,
  dataCompleteness,
  dataCoverageMatrix,
  dataGapAction,
  dataGapDiagnostic,
  formatKickoff,
  formatOdds,
  freshness,
  goalsValueEdge,
  handicapValueEdge,
  leagueDisplayName,
  coverageStatusMeta,
  modelAgreement,
  matchDetailHref,
  matchGapActions,
  preferredModel,
  reviewPriority,
  valueEdge,
} from "@/lib/fast-tracker";

const UI_BUILD = "DASH-FOCUS-20260928-1";

function pct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) + "%" : "—";
}

function modelLabel(match) {
  if (match.multi) return "綜合預測";
  if (match.forebet) return "比分預測";
  if (match.dc) return "入球模型";
  if (match.pi) return "實力評分";
  if (match.form) return "近期狀態";
  return "未有預測";
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

function marketOddsClass(edge, key) {
  const classes = ["ft5-odd"];
  if (edge?.key === key && ["LEAN","VALUE","STRONG_VALUE"].includes(edge?.band)) classes.push("edge-target");
  if (edge?.key === key && edge?.band === "STRONG_VALUE") classes.push("edge-target-strong");
  return classes.join(" ");
}

function outcomeLabel(key) {
  if (key === "H") return "主";
  if (key === "D") return "和";
  if (key === "A") return "客";
  return "—";
}

function MiniIcon({ type }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  if (type === "score") return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 9h2M14 9h2M9 14h6"/></svg>;
  if (type === "goals") return <svg {...common}><circle cx="12" cy="12" r="8"/><path d="m12 8 3 2-1 4h-4l-1-4 3-2ZM7 7l2 3M17 7l-2 3M7 17l3-3M17 17l-3-3"/></svg>;
  if (type === "corner") return <svg {...common}><path d="M6 20V4M6 5h9l-2 4 2 4H6M4 20h5"/></svg>;
  if (type === "form") return <svg {...common}><path d="M4 17l5-5 4 3 7-8"/><path d="M16 7h4v4"/></svg>;
  if (type === "model") return <svg {...common}><path d="M4 18V9M10 18V5M16 18v-7M22 18H2"/></svg>;
  if (type === "power") return <svg {...common}><path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z"/></svg>;
  if (type === "btts") return <svg {...common}><circle cx="8" cy="12" r="4"/><circle cx="16" cy="12" r="4"/><path d="M10 12h4"/></svg>;
  if (type === "source") return <svg {...common}><path d="M9 7H7a4 4 0 0 0 0 8h2M15 7h2a4 4 0 0 1 0 8h-2M8 12h8"/></svg>;
  if (type === "decision") return <svg {...common}><path d="M4 12h10M10 6l6 6-6 6"/><path d="M18 5h2v14h-2"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>;
}

function recentFormCode(detail) {
  const recent = Array.isArray(detail?.recent) ? detail.recent.slice(0, 5) : [];
  if (!recent.length) return null;
  return recent.map((row) => String(row?.result || "—").slice(0, 1).toUpperCase()).join("");
}

function EvidenceItem({ icon, label, value, detail = null, tone = "", children = null }) {
  return (
    <div className={"ft5-evidence-item" + (tone ? " tone-" + tone : "")}>
      <span className="ft5-evidence-icon"><MiniIcon type={icon} /></span>
      <span className="ft5-evidence-copy">
        <small>{label}</small>
        <b>{value ?? "—"}</b>
        {detail ? <em>{detail}</em> : null}
      </span>
      {children}
    </div>
  );
}

function BinaryMarketBar({ market, edge, overLabel = "大", underLabel = "細" }) {
  const fair = binaryFair(market?.over, market?.under);
  const over = Number(fair?.over);
  const under = Number(fair?.under);
  if (!Number.isFinite(over) || !Number.isFinite(under)) return null;
  return (
    <div style={{ display:"grid", gap:3, marginTop:4 }}>
      <div style={{ display:"flex", height:7, overflow:"hidden", borderRadius:999, background:"#e9eeeb" }}>
        <span title={overLabel + " " + (over * 100).toFixed(0) + "%"} style={{ width:(over * 100) + "%", background:"#2f80ed" }} />
        <span title={underLabel + " " + (under * 100).toFixed(0) + "%"} style={{ width:(under * 100) + "%", background:"#e05a5a" }} />
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:6.8, fontWeight:900, color:"#687a71" }}>
        <span style={{ color:edge?.key==="O" ? "#245fa8" : undefined }}>{overLabel} {(over * 100).toFixed(0)}%</span>
        <span style={{ color:edge?.key==="U" ? "#a64b4b" : undefined }}>{underLabel} {(under * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

function marketQuality({ evPct = null, gapPp = null, odds = null, freshnessKey, coveragePercent, consensusBonus = 0, hasModel = true, band = null }) {
  const ev = Number(evPct);
  const gap = Number(gapPp);
  const o = Number(odds);
  let score = 0;
  const reasons = [];
  if (Number.isFinite(ev)) {
    score += Math.max(-20, Math.min(46, ev * 1.9));
    if (band === "STRONG_VALUE") reasons.push("強價值");
    else if (band === "VALUE") reasons.push("有價值");
    else if (band === "LEAN") reasons.push("輕微價值");
    else if (ev > 0) reasons.push("EV正");
  }
  if (Number.isFinite(gap)) {
    score += Math.max(-8, Math.min(12, gap * 0.8));
  }
  if (hasModel) { score += 12; reasons.push("有模型"); }
  if (freshnessKey === "fresh") { score += 14; reasons.push("資料新"); }
  else if (freshnessKey === "warn") score += 4;
  else if (freshnessKey === "stale") { score -= 22; reasons.push("資料舊"); }
  if (Number.isFinite(coveragePercent)) {
    score += Math.max(0, Math.min(14, coveragePercent / 7));
    if (coveragePercent >= 80) reasons.push("覆蓋高");
  }
  if (Number.isFinite(o) && o > 1 && o <= 10) score += 6;
  if (Number.isFinite(o) && o > 10) { score -= 10; reasons.push("賠率偏極端"); }
  if (consensusBonus > 0) { score += consensusBonus; reasons.push("模型同向"); }
  return { score, reasons: reasons.slice(0, 3) };
}

function totalMarketSummary(match, edge, market, label) {
  const line = market?.line;
  if (line == null || line === "") return { label, text: "NO LINE", detail: "HKJC 未有盤口", positive: false };
  if (!edge || !Number.isFinite(Number(edge.expectedValue)) || Number(edge.expectedValue) <= 0) {
    return { label, text: "暫不選 · " + line, detail: "現價未見投注價值", positive: false };
  }
  const odds = Number.isFinite(Number(edge.odds)) ? Number(edge.odds) : binaryOdds(market, edge.key);
  const fair = binaryFair(market?.over, market?.under);
  const modelP = Number.isFinite(Number(edge.modelProbability))
    ? Number(edge.modelProbability)
    : edge.key === "O" ? Number(edge.model?.over) : Number(edge.model?.under);
  const fairP = Number.isFinite(Number(edge.marketProbability))
    ? Number(edge.marketProbability)
    : edge.key === "O" ? Number(fair?.over) : Number(fair?.under);
  const evPct = Number(edge.expectedValue) * 100;
  const gapPp = Number(edge.value) * 100;
  const band = edge.band === "STRONG_VALUE" ? "強價值"
    : edge.band === "VALUE" ? "有價值"
      : edge.band === "LEAN" ? "輕微價值"
        : edge.band === "WATCH" ? "觀望" : "暫不選";
  const formula = Number.isFinite(modelP) && Number.isFinite(fairP)
    ? "模型 " + (modelP * 100).toFixed(1) + "% / 市場約 " + (fairP * 100).toFixed(1) + "%"
    : "模型預測 vs 市場概率";
  return {
    label,
    text: binarySideName(edge.key) + " " + line,
    detail: (odds ? "@" + formatOdds(odds) + " · " : "") + "EV " + (evPct >= 0 ? "+" : "") + evPct.toFixed(1) + "% · 差距 " + (gapPp >= 0 ? "+" : "") + gapPp.toFixed(1) + "百分點 · " + band + " · " + formula,
    positive: ["LEAN","VALUE","STRONG_VALUE"].includes(edge.band),
  };
}

export default function MatchCard({ match, nowMs, coverageGap = null, actionFilter = null, changeType = null }) {
  const edge = valueEdge(match);
  const model = preferredModel(match);
  const goalsEdge = goalsValueEdge(match);
  const cornersEdge = cornersValueEdge(match);
  const fresh = freshness(match, nowMs);
  const coverageMeta = coverageStatusMeta(match);
  const agreement = modelAgreement(match);
  const priority = reviewPriority(match, nowMs);
  const home = match.homeZh || match.home;
  const away = match.awayZh || match.away;
  const rawMove = Number(match.oddsMovement?.rawOddsChangePct);
  const hasMove = Number.isFinite(rawMove) && Math.abs(rawMove) >= 10;
  const edgeGapPp = edge && Number.isFinite(Number(edge.value)) ? Number(edge.value) * 100 : null;
  const edgeEvPct = edge && Number.isFinite(Number(edge.expectedValue)) ? Number(edge.expectedValue) * 100 : null;
  const edgeText = edgeEvPct == null ? "—" : (edgeEvPct >= 0 ? "+" : "") + edgeEvPct.toFixed(1) + "%";
  const pick = edge ? outcomeLabel(edge.key) : "—";
  const selectedOdds = edge && Number.isFinite(Number(edge.odds)) ? Number(edge.odds) : edge ? edgeOdds(match, edge.key) : null;
  const selectedModelProbability = Number.isFinite(Number(edge?.modelProbability)) ? Number(edge.modelProbability) : null;
  const selectedFairProbability = Number.isFinite(Number(edge?.marketProbability)) ? Number(edge.marketProbability) : null;
  const edgeFormula = Number.isFinite(selectedModelProbability) && Number.isFinite(selectedFairProbability)
    ? "模型 " + (selectedModelProbability * 100).toFixed(1) + % / 市場約 " + (selectedFairProbability * 100).toFixed(1) + "%" + (edgeGapPp == null ? "" : " · 差距 " + (edgeGapPp >= 0 ? "+" : "") + edgeGapPp.toFixed(1) + "百分點")
    : "模型預測 vs 市場概率";
  const quantBand = edge?.band === "STRONG_VALUE" ? "強 VALUE"
    : edge?.band === "VALUE" ? "VALUE"
      : edge?.band === "LEAN" ? "LEAN"
        : edge?.band === "WATCH" ? "觀望" : "PASS";
  const strongEdge = edge?.band === "STRONG_VALUE";
  const valueEdgeFlag = edge?.band === "VALUE";
  const staleRisk = fresh.key === "stale" || coverageMeta.tone === "danger";
  const handicapAdvice = handicapValueEdge(match);
  const handicapLine = match.handicap?.line ?? null;
  const handicapOdds = handicapAdvice?.odds ?? null;
  const handicapEvPct = Number.isFinite(Number(handicapAdvice?.expectedValue))
    ? Number(handicapAdvice.expectedValue) * 100
    : null;
  const handicapBand = handicapAdvice?.band === "STRONG_VALUE" ? "強 VALUE"
    : handicapAdvice?.band === "VALUE" ? "VALUE"
      : handicapAdvice?.band === "LEAN" ? "LEAN"
        : handicapAdvice?.band === "WATCH" ? "觀望" : "PASS";
  const handicapSummary = handicapLine == null
    ? { text:"NO LINE", detail:"HKJC 未有讓球盤", positive:false }
    : !handicapAdvice
      ? { text:"讓球 " + handicapLine, detail:"未有足夠模型 + HKJC 盤口建立 AH EV", positive:false }
      : {
          text: (handicapAdvice.selectionLabel || "讓球 " + handicapLine) + (handicapOdds ? " @" + formatOdds(handicapOdds) : ""),
          detail: handicapBand
            + (handicapEvPct == null ? "" : " · EV " + (handicapEvPct >= 0 ? "+" : "") + handicapEvPct.toFixed(1) + "%")
            + " · 支援 " + Number(handicapAdvice.supportCount || 0) + "/" + Number(handicapAdvice.familyCount || 0)
            + (Number.isFinite(Number(handicapAdvice.dispersion)) ? " · 分歧 " + (Number(handicapAdvice.dispersion) * 100).toFixed(1) + "pp" : ""),
          positive: ["LEAN","VALUE","STRONG_VALUE"].includes(handicapAdvice.band)
        };
  const goalsSummary = totalMarketSummary(match, goalsEdge, match.goals, "入球");
  const cornersSummary = totalMarketSummary(match, cornersEdge, match.corners, "角球");
  const coveragePctForRank = Number(dataCompleteness(match)?.percent);
  const hdcConsensusBonus = agreement?.key === "agree"
    && ((handicapAdvice?.selection === "HOME" && agreement.side === "H") || (handicapAdvice?.selection === "AWAY" && agreement.side === "A"))
      ? 10 : 0;
  const handicapQuality = marketQuality({
    evPct: handicapEvPct,
    gapPp: null,
    odds: handicapOdds,
    freshnessKey: fresh.key,
    coveragePercent: coveragePctForRank,
    consensusBonus: hdcConsensusBonus,
    hasModel: Boolean(handicapAdvice),
    band: handicapAdvice?.band,
  });
  const goalsOdds = goalsEdge ? binaryOdds(match.goals, goalsEdge.key) : null;
  const goalsQuality = marketQuality({
    evPct: goalsEdge ? Number(goalsEdge.expectedValue) * 100 : null,
    gapPp: goalsEdge ? Number(goalsEdge.value) * 100 : null,
    odds: goalsOdds,
    freshnessKey: fresh.key,
    coveragePercent: coveragePctForRank,
    hasModel: Boolean(goalsEdge?.model),
    band: goalsEdge?.band,
  });
  const cornersOdds = cornersEdge ? binaryOdds(match.corners, cornersEdge.key) : null;
  const cornersQuality = marketQuality({
    evPct: cornersEdge ? Number(cornersEdge.expectedValue) * 100 : null,
    gapPp: cornersEdge ? Number(cornersEdge.value) * 100 : null,
    odds: cornersOdds,
    freshnessKey: fresh.key,
    coveragePercent: coveragePctForRank,
    hasModel: Boolean(cornersEdge?.model),
    band: cornersEdge?.band,
  });
  const secondaryMarkets = [
    {
      key: "HANDICAP",
      rank: handicapQuality.score + (handicapAdvice?.band === "STRONG_VALUE" ? 34 : handicapAdvice?.band === "VALUE" ? 26 : handicapAdvice?.band === "LEAN" ? 12 : 0),
      available: handicapLine != null,
      node: (
        <div className={"ft5-odd ft5-total-pick" + (handicapSummary.positive ? " edge-target" : "")}>
          <span>讓球</span><b>{handicapSummary.text}</b>
          <small>{handicapSummary.detail}</small>
          {handicapQuality.reasons.length ? <small style={{ fontWeight:900 }}>點解排前：{handicapQuality.reasons.join(" · ")}</small> : null}
        </div>
      ),
    },
    {
      key: "GOALS",
      rank: goalsQuality.score + (goalsSummary.positive ? 24 : 0),
      available: match.goals?.line != null,
      node: (
        <div className={"ft5-odd ft5-total-pick" + (goalsSummary.positive ? " edge-target" : "")}>
          <span>{goalsSummary.label}</span><b>{goalsSummary.text}</b><small>{goalsSummary.detail}</small>
          {goalsQuality.reasons.length ? <small style={{ fontWeight:900 }}>點解排前：{goalsQuality.reasons.join(" · ")}</small> : null}
          <BinaryMarketBar market={match.goals} edge={goalsEdge} />
        </div>
      ),
    },
    {
      key: "CORNERS",
      rank: cornersQuality.score + (cornersSummary.positive ? 24 : 0),
      available: match.corners?.line != null,
      node: (
        <div className={"ft5-odd ft5-total-pick" + (cornersSummary.positive ? " edge-target" : "")}>
          <span>{cornersSummary.label}</span><b>{cornersSummary.text}</b><small>{cornersSummary.detail}</small>
          {cornersQuality.reasons.length ? <small style={{ fontWeight:900 }}>點解排前：{cornersQuality.reasons.join(" · ")}</small> : null}
          <BinaryMarketBar market={match.corners} edge={cornersEdge} />
        </div>
      ),
    },
  ].filter((row) => row.available).sort((a, b) => b.rank - a.rank);
  const visibleSecondaryMarkets = secondaryMarkets.slice(0, 2);
  const hiddenSecondaryCount = Math.max(0, secondaryMarkets.length - visibleSecondaryMarkets.length);
  const storyScript = match.storySummary?.matchScript || null;
  const editorialAlignment = match.storySummary?.editorialAlignment || null;
  const avgGoals = Number(match.forebetDetail?.ou25?.avgGoals);
  const scriptShape = storyScript?.shapeKey
    || (Number.isFinite(avgGoals) ? (avgGoals >= 3 ? "OPEN" : avgGoals <= 2.2 ? "CONTROLLED" : "BALANCED") : null);
  const scriptShapeLabel = scriptShape === "OPEN" ? "偏開放"
    : scriptShape === "CONTROLLED" ? "偏受控"
      : scriptShape === "BALANCED" ? "均衡"
        : null;
  const scriptScore = storyScript?.predictedScore || match.forebetDetail?.predictedScore || null;
  const editorialContradict = Number(editorialAlignment?.contradict || 0);
  const editorialSupport = Number(editorialAlignment?.support || 0);
  const sourceContext = match.sourceContext || null;
  const sourceContextVerified = sourceContext && Number(sourceContext.matchConfidence) >= 0.94;
  const sourceContextDetail = sourceContextVerified
    ? [
        sourceContext.source || "External",
        sourceContext.identityStatus === "EXACT_PAIR" ? "verified" : "matched",
        sourceContext.detailAvailable ? "DETAIL" : null,
      ].filter(Boolean).join(" · ")
    : null;

  const avgCorners = Number(match.forebetDetail?.corners95?.avgCorners);
  const bttsYes = Number(match.multisourceDetail?.btts?.yes);
  const dcXgHome = Number(match.dcDetail?.expectedGoals?.home);
  const dcXgAway = Number(match.dcDetail?.expectedGoals?.away);
  const dcXgText = Number.isFinite(dcXgHome) && Number.isFinite(dcXgAway)
    ? dcXgHome.toFixed(2) + "–" + dcXgAway.toFixed(2)
    : null;
  const piDiff = Number(match.piDetail?.ratings?.difference);
  const powerHome = Number(match.power?.home);
  const powerAway = Number(match.power?.away);
  const powerText = Number.isFinite(powerHome) && Number.isFinite(powerAway)
    ? powerHome.toFixed(1) + "–" + powerAway.toFixed(1)
    : Number.isFinite(piDiff)
      ? (piDiff >= 0 ? "+" : "") + piDiff.toFixed(2)
      : null;
  const homeFormCode = recentFormCode(match.formDetail?.home);
  const awayFormCode = recentFormCode(match.formDetail?.away);
  const completeness = dataCompleteness(match);
  const sourceMatrix = dataCoverageMatrix(match);
  const availableSources = completeness.available;
  const coverageTone = completeness.percent >= 80 ? "good" : completeness.percent >= 55 ? "warn" : "danger";
  const selectedGapDiagnostic = coverageGap ? dataGapDiagnostic(match, coverageGap, nowMs) : null;
  const selectedGapAction = coverageGap ? dataGapAction(match, coverageGap, nowMs) : null;
  const actionRows = actionFilter
    ? matchGapActions(match, nowMs).filter((row) => row.action.key === actionFilter)
    : [];
  const selectedQueueAction = actionRows[0]?.action || null;
  const selectedQueueChannels = actionRows.map((row) => row.channel.short);
  const selectedAction = selectedQueueAction || selectedGapAction;
  const selectedActionTone = selectedAction?.tone === "ready" ? "good"
    : selectedAction?.tone === "wait" ? "warn"
      : selectedAction ? "danger" : coverageTone;
  const decisionValue = match.decision || "—";
  const decisionDetail = [
    match.decisionMarket || null,
    match.decisionSelection || null,
    Number.isFinite(Number(match.decisionEdge)) ? ((Number(match.decisionEdge) >= 0 ? "+" : "") + (Number(match.decisionEdge) * 100).toFixed(1) + "%") : null,
  ].filter(Boolean).join(" · ");
  const rowClass = [
    "ft5-match-card",
    "ft5-forebet-row",
    strongEdge ? "ft5-row-strong-edge" : valueEdgeFlag ? "ft5-row-value-edge" : "",
    hasMove ? "ft5-row-market-move" : "",
    staleRisk ? "ft5-row-data-risk" : "",
    agreement.key === "split" ? "ft5-row-model-split" : "",
    "ft5-priority-" + priority.band,
    changeType ? "ft5-flash-" + changeType : "",
  ].filter(Boolean).join(" ");

  function cacheMatch() {
    try {
      window.localStorage.setItem("ft-match-" + match.id, JSON.stringify(match));
      window.sessionStorage.setItem("ft-match-" + match.id, JSON.stringify(match));
    } catch {}
  }

  return (
    <a
      className={rowClass}
      href={matchDetailHref(match.id, UI_BUILD)}
      onClick={cacheMatch}
    >
      <div className="ft5-row-grid">
        <div className="ft5-cell ft5-fixture-cell">
          <div className="ft5-match-meta">
            <strong className="ft5-kickoff">{formatKickoff(match.kickoff)}</strong>
            <span className="ft5-league">{leagueDisplayName(match.leagueZh || match.league)}</span>
            <span className="ft5-meta-sep">·</span>
            <span className={"ft5-fresh-text ft5-fresh-" + fresh.key}>{fresh.label}</span>
          </div>
          <div className="ft5-teams">
            <b>{home}</b>
            <span>vs</span>
            <b>{away}</b>
          </div>
          {(scriptShapeLabel || scriptScore || editorialContradict || editorialSupport) ? (
            <div
              className="ft5-match-script-mini"
              style={{
                display:"flex",
                alignItems:"center",
                gap:5,
                flexWrap:"wrap",
                marginTop:6,
                padding:"5px 7px",
                border:"1px solid #e0e8e2",
                borderRadius:8,
                background:"#f8faf8",
              }}
            >
              <span style={{ fontSize:7, fontWeight:950, color:"#76877e" }}>MATCH SCRIPT</span>
              {scriptShapeLabel ? <b style={{ fontSize:8, color:"#2f6349" }}>{scriptShapeLabel}</b> : null}
              {scriptScore ? <small style={{ fontSize:8, color:"#53685c", fontWeight:850 }}>{scriptScore}</small> : null}
              {editorialContradict ? <em style={{ fontSize:7, color:"#9a4e45", fontStyle:"normal", fontWeight:900 }}>球評反向 {editorialContradict}</em> : null}
              {!editorialContradict && editorialSupport ? <em style={{ fontSize:7, color:"#2d714c", fontStyle:"normal", fontWeight:900 }}>球評同向 {editorialSupport}</em> : null}
            </div>
          ) : null}
          {sourceContextDetail && coverageMeta.tone !== "rich" ? (
            <div
              className="ft5-source-context-mini"
              style={{
                display:"flex",
                alignItems:"center",
                gap:5,
                flexWrap:"wrap",
                marginTop:5,
                padding:"4px 7px",
                border:"1px solid #dce6ef",
                borderRadius:8,
                background:"#f5f8fb",
                color:"#526b7a",
                fontSize:7.5,
                fontWeight:850,
              }}
              title="External fixture context only — does not change model probability or Edge"
            >
              <span>SOURCE CTX</span>
              <b>{sourceContextDetail}</b>
              <small>{Math.round(Number(sourceContext.matchConfidence) * 100)}%</small>
            </div>
          ) : null}
        </div>

        <div className="ft5-cell ft5-model-cell">
          <div className="ft5-model-heading">
            <b>{modelLabel(match)}</b>
            <div className="ft5-model-badges">
              {agreement.key !== "limited" ? <small className={"ft5-consensus ft5-consensus-" + agreement.key}>{agreement.label}</small> : null}
              <small
                className={"ft5-review-inline ft5-review-" + priority.band}
                title={"Review priority " + priority.score + "/100" + (priority.reasons.length ? " · " + priority.reasons.join(" · ") : "")}
              >R {priority.score}</small>
              {coverageMeta.tone !== "rich" ? <small className={"ft5-health-inline health-" + coverageMeta.tone}>{coverageMeta.label}</small> : null}
            </div>
          </div>
          <div className="ft5-probs" aria-label="HDA model probability" style={{ display:"grid", gap:5 }}>
            <div style={{ display:"flex", width:"100%", height:12, overflow:"hidden", borderRadius:999, background:"#e9eeeb" }}>
              {[
                ["H", model?.home, "#2f80ed"],
                ["D", model?.draw, "#f2b134"],
                ["A", model?.away, "#e05a5a"],
              ].map(([key, value, color]) => (
                <span
                  key={key}
                  title={key + " " + pct(value)}
                  style={{ width:Math.max(0, Math.min(100, Number(value) * 100 || 0)) + "%", background:color }}
                />
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:5 }}>
              {[
                ["H", model?.home, "#2f80ed"],
                ["D", model?.draw, "#f2b134"],
                ["A", model?.away, "#e05a5a"],
              ].map(([key, value, color], index) => (
                <div className={selectedClass(edge, key)} key={key} style={{ display:"flex", alignItems:"center", gap:4, justifyContent:index===0?"flex-start":index===2?"flex-end":"center" }}>
                  <i aria-hidden="true" style={{ width:7, height:7, flex:"0 0 7px", borderRadius:2, background:color }} />
                  <span>{key === "H" ? "主" : key === "D" ? "和" : "客"}</span><b>{pct(value)}</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="ft5-cell ft5-pick-cell">
          <div className="ft5-pick-main">
            <b>{pick}</b>
            <small>{selectedOdds ? "@" + formatOdds(selectedOdds) : "—"}</small>
          </div>
          <div className="ft5-signal-stack">
            <div className={"ft5-edge-chip" + (strongEdge ? " strong" : valueEdgeFlag ? " positive" : "")}>
              <span style={{ display:"block", fontSize:7, fontWeight:950, color:"#6c7f74" }}>{strongEdge ? "★ " : valueEdgeFlag ? "↑ " : ""}價值 · {quantBand === "STRONG_VALUE" ? "強" : quantBand === "VALUE" ? "有價值" : quantBand}</span>
              <b>{edgeText}</b>
              <small style={{ display:"block", marginTop:2, fontSize:6.8, lineHeight:1.15, color:"#76877e", fontWeight:800 }}>{edgeFormula}</small>
            </div>
            {hasMove ? (
              <div className="ft5-move-chip">
                <span>{rawMove > 0 ? "↑ 賠率" : "↓ 賠率"}</span>
                <b>{rawMove > 0 ? "+" : ""}{rawMove.toFixed(1)}%</b>
              </div>
            ) : null}
          </div>
        </div>

        <div className="ft5-cell ft5-market-cell">
          <div className="ft5-odds ft5-row-odds">
            <div className={marketOddsClass(edge, "H")}>
              <span>主</span><b>{formatOdds(match.odds?.home)}</b>
            </div>
            <div className={marketOddsClass(edge, "D")}>
              <span>和</span><b>{formatOdds(match.odds?.draw)}</b>
            </div>
            <div className={marketOddsClass(edge, "A")}>
              <span>客</span><b>{formatOdds(match.odds?.away)}</b>
            </div>
            {visibleSecondaryMarkets.map((row) => <div key={row.key}>{row.node}</div>)}
            {hiddenSecondaryCount > 0 ? (
              <div className="ft5-odd ft5-total-pick" style={{ opacity:.72 }}>
                <span>更多</span><b>+{hiddenSecondaryCount} 市場</b><small>完整盤口及模型分析請入 Detail</small>
              </div>
            ) : null}
          </div>
        </div>

        <div className="ft5-evidence-ribbon" aria-label="match evidence summary">
          <EvidenceItem icon="score" label="預測比分" value={scriptScore || "—"} detail={scriptShapeLabel || null} />
          <EvidenceItem icon="form" label="Form" value={homeFormCode && awayFormCode ? homeFormCode + " / " + awayFormCode : homeFormCode || awayFormCode || "—"} />
          <EvidenceItem icon="model" label="DC xG" value={dcXgText || "—"} />
          {Number.isFinite(bttsYes) ? <EvidenceItem icon="btts" label="BTTS" value={Math.round(bttsYes * 100) + "%"} /> : null}
          <EvidenceItem icon="decision" label="Engine" value={decisionValue} detail={decisionDetail || null} />
          <EvidenceItem
            icon="source"
            label={
              selectedQueueAction
                ? "Action · " + selectedQueueChannels.join("/")
                : selectedGapAction
                  ? selectedGapDiagnostic.short + " Next"
                  : "Coverage"
            }
            value={selectedAction ? selectedAction.label : availableSources + "/" + completeness.total}
            detail={
              selectedQueueAction
                ? actionRows.map((row) => row.channel.short + " " + row.action.diagnostic.shortReason).join(" · ") + (selectedQueueAction.detail ? " · " + selectedQueueAction.detail : "")
                : selectedGapAction
                  ? [
                      selectedGapDiagnostic.shortReason,
                      selectedGapDiagnostic.detail,
                      selectedGapAction.detail,
                    ].filter(Boolean).join(" · ")
                  : completeness.percent + "% · " + (sourceContextDetail || (completeness.missing.length ? "Missing " + completeness.missing.map((row) => row.short).join("/") : "complete"))
            }
            tone={selectedActionTone}
          >
            <span className="ft5-source-matrix" aria-label="source coverage">
              {sourceMatrix.map((row) => {
                const diag = coverageGap === row.key ? selectedGapDiagnostic : null;
                const actionRow = actionRows.find((item) => item.channel.key === row.key) || null;
                const focused = coverageGap === row.key || Boolean(actionRow);
                return (
                  <i
                    className={(row.available ? "on" : "") + (focused ? " gap-focus" : "")}
                    key={row.key}
                    title={
                      row.label + (row.available ? " available" : " no data")
                      + (diag && !diag.available ? " · " + diag.code + (diag.detail ? " · " + diag.detail : "") + (selectedGapAction ? " · Next: " + selectedGapAction.label : "") : "")
                      + (actionRow ? " · " + actionRow.action.diagnostic.code + " · Next: " + actionRow.action.label : "")
                    }
                  >{row.short}</i>
                );
              })}
            </span>
          </EvidenceItem>
        </div>
      </div>
    </a>
  );
}
