"use client";

import {
  binaryFair,
  binaryOdds,
  binarySideName,
  cornersValueEdge,
  formatKickoff,
  formatOdds,
  freshness,
  goalsValueEdge,
  coverageStatusMeta,
  modelAgreement,
  matchDetailHref,
  preferredModel,
  reviewPriority,
  valueEdge,
} from "@/lib/fast-tracker";

const UI_BUILD = "SYSTEMATIC-EVIDENCE-20260925-1";

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

function marketOddsClass(edge, key) {
  const classes = ["ft5-odd"];
  if (edge?.key === key && edge?.value > 0) classes.push("edge-target");
  if (edge?.key === key && edge?.value >= 0.10) classes.push("edge-target-strong");
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
  return <svg {...common}><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>;
}

function recentFormCode(detail) {
  const recent = Array.isArray(detail?.recent) ? detail.recent.slice(0, 5) : [];
  if (!recent.length) return null;
  return recent.map((row) => String(row?.result || "—").slice(0, 1).toUpperCase()).join("");
}

function sourceCoverage(match) {
  return [
    ["FB", Boolean(match.forebet || match.forebetDetail?.predictedScore)],
    ["DC", Boolean(match.dc || match.dcDetail?.available)],
    ["PI", Boolean(match.pi || match.piDetail?.available)],
    ["FM", Boolean(match.form || match.formDetail)],
    ["PW", Boolean(match.power)],
    ["CTX", Boolean(match.sourceContext)],
  ];
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

function totalMarketSummary(match, edge, market, label) {
  const line = market?.line;
  if (line == null || line === "") return { label, text: "NO LINE", detail: "HKJC 未有盤口", positive: false };
  if (!edge || !Number.isFinite(Number(edge.value)) || Number(edge.value) <= 0) {
    return { label, text: "PASS · " + line, detail: "未見正 Edge", positive: false };
  }
  const odds = binaryOdds(market, edge.key);
  const fair = binaryFair(market?.over, market?.under);
  const modelP = edge.key === "O" ? Number(edge.model?.over) : Number(edge.model?.under);
  const fairP = edge.key === "O" ? Number(fair?.over) : Number(fair?.under);
  const formula = Number.isFinite(modelP) && Number.isFinite(fairP)
    ? "模型 " + (modelP * 100).toFixed(1) + "% − fair " + (fairP * 100).toFixed(1) + "%"
    : "精算 Edge";
  return {
    label,
    text: binarySideName(edge.key) + " " + line,
    detail: (odds ? "@" + formatOdds(odds) + " · " : "") + formula + " = +" + (Number(edge.value) * 100).toFixed(1) + "pp",
    positive: Number(edge.value) >= 0.025,
  };
}

export default function MatchCard({ match, nowMs, changeType = null }) {
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
  const edgeText = edge ? (edge.value >= 0 ? "+" : "") + (edge.value * 100).toFixed(1) + "pp" : "—";
  const pick = edge ? outcomeLabel(edge.key) : "—";
  const selectedOdds = edge ? edgeOdds(match, edge.key) : null;
  const selectedModelProbability = edge?.key === "H" ? Number(model?.home)
    : edge?.key === "D" ? Number(model?.draw)
      : edge?.key === "A" ? Number(model?.away)
        : null;
  const selectedFairProbability = edge?.key === "H" ? Number(match.market?.home)
    : edge?.key === "D" ? Number(match.market?.draw)
      : edge?.key === "A" ? Number(match.market?.away)
        : null;
  const edgeFormula = Number.isFinite(selectedModelProbability) && Number.isFinite(selectedFairProbability)
    ? "模型 " + (selectedModelProbability * 100).toFixed(1) + "% − fair " + (selectedFairProbability * 100).toFixed(1) + "%"
    : "模型概率 − HKJC fair";
  const quantBand = edge?.value >= 0.10 ? "強 VALUE" : edge?.value >= 0.05 ? "VALUE" : edge?.value >= 0.025 ? "WATCH" : "PASS";
  const strongEdge = edge?.value >= 0.10;
  const valueEdgeFlag = edge?.value >= 0.05;
  const staleRisk = fresh.key === "stale" || coverageMeta.tone === "danger";
  const goalsSummary = totalMarketSummary(match, goalsEdge, match.goals, "入球");
  const cornersSummary = totalMarketSummary(match, cornersEdge, match.corners, "角球");
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
        sourceContext.lineupAvailable ? "LINEUP" : null,
        sourceContext.detailAvailable && !sourceContext.lineupAvailable ? "DETAIL" : null,
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
  const sourceMatrix = sourceCoverage(match);
  const availableSources = sourceMatrix.filter(([, available]) => available).length;
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
            <span className="ft5-league">{match.league}</span>
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
          <div className="ft5-probs" aria-label="HDA model probability">
            <div className={selectedClass(edge, "H")}><span>H</span><b>{pct(model?.home)}</b></div>
            <div className={selectedClass(edge, "D")}><span>D</span><b>{pct(model?.draw)}</b></div>
            <div className={selectedClass(edge, "A")}><span>A</span><b>{pct(model?.away)}</b></div>
          </div>
        </div>

        <div className="ft5-cell ft5-pick-cell">
          <div className="ft5-pick-main">
            <b>{pick}</b>
            <small>{selectedOdds ? "@" + formatOdds(selectedOdds) : "—"}</small>
          </div>
          <div className="ft5-signal-stack">
            <div className={"ft5-edge-chip" + (strongEdge ? " strong" : valueEdgeFlag ? " positive" : "")}>
              <span style={{ display:"block", fontSize:7, fontWeight:950, color:"#6c7f74" }}>精算 EDGE · {quantBand}</span>
              <b>{edgeText}</b>
              <small style={{ display:"block", marginTop:2, fontSize:6.8, lineHeight:1.15, color:"#76877e", fontWeight:800 }}>{edgeFormula}</small>
            </div>
            {hasMove ? (
              <div className="ft5-move-chip">
                <span>MOVE</span>
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
            <div className={"ft5-odd ft5-total-pick" + (goalsSummary.positive ? " edge-target" : "")}>
              <span>{goalsSummary.label}</span><b>{goalsSummary.text}</b><small>{goalsSummary.detail}</small>
            </div>
            <div className={"ft5-odd ft5-total-pick" + (cornersSummary.positive ? " edge-target" : "")}>
              <span>{cornersSummary.label}</span><b>{cornersSummary.text}</b><small>{cornersSummary.detail}</small>
            </div>
          </div>
        </div>

        <div className="ft5-evidence-ribbon" aria-label="match evidence summary">
          <EvidenceItem icon="score" label="預測比分" value={scriptScore || "—"} detail={scriptShapeLabel || null} />
          <EvidenceItem icon="goals" label="Avg Goals" value={Number.isFinite(avgGoals) ? avgGoals.toFixed(2) : "—"} />
          <EvidenceItem icon="corner" label="Avg Corners" value={Number.isFinite(avgCorners) ? avgCorners.toFixed(1) : "—"} />
          <EvidenceItem icon="form" label="Form" value={homeFormCode && awayFormCode ? homeFormCode + " / " + awayFormCode : homeFormCode || awayFormCode || "—"} />
          <EvidenceItem icon="model" label="DC xG" value={dcXgText || "—"} />
          <EvidenceItem icon="power" label={match.power ? "Power" : "Pi Δ"} value={powerText || "—"} />
          <EvidenceItem icon="btts" label="BTTS Yes" value={Number.isFinite(bttsYes) ? Math.round(bttsYes * 100) + "%" : "—"} />
          <EvidenceItem icon="source" label="Sources" value={availableSources + "/6"}>
            <span className="ft5-source-matrix" aria-label="source coverage">
              {sourceMatrix.map(([name, available]) => (
                <i className={available ? "on" : ""} key={name} title={name + (available ? " available" : " no data")}>{name}</i>
              ))}
            </span>
          </EvidenceItem>
        </div>
      </div>
    </a>
  );
}
