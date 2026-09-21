"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import MatchCard from "@/components/match-card";
import {
  binaryOdds,
  binarySideName,
  cornersValueEdge,
  dataAgeMinutes,
  formatKickoff,
  formatOdds,
  freshness,
  goalsValueEdge,
  modelCoverageCount,
  reviewScore,
  sideName,
  valueEdge,
} from "@/lib/fast-tracker";

const filters = [
  ["focus", "焦點"],
  ["live", "Live"],
  ["all", "全部"],
  ["gaps", "Edge"],
  ["odds", "賠率"],
  ["missing", "缺資料"],
  ["stale", "過時"],
];

function hdaOdds(match, key) {
  if (key === "H") return match.odds?.home;
  if (key === "D") return match.odds?.draw;
  if (key === "A") return match.odds?.away;
  return null;
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

  if (type === "HDA") {
    selection = sideName(match, edge.key);
    odds = hdaOdds(match, edge.key);
  } else if (type === "入球") {
    selection = `${binarySideName(edge.key)} ${match.goals?.line ?? "—"}`;
    odds = binaryOdds(match.goals, edge.key);
  } else {
    selection = `${binarySideName(edge.key)} ${match.corners?.line ?? "—"}`;
    odds = binaryOdds(match.corners, edge.key);
  }

  return (
    <Link
      className="market-pick-row"
      href={`/match/?id=${encodeURIComponent(match.id)}`}
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
        <span>Odds</span>
        <b>{formatOdds(odds)}</b>
      </div>
      <div className="market-pick-number edge-number">
        <span>Edge</span>
        <b>+{(edge.value * 100).toFixed(1)}%</b>
      </div>
    </Link>
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

function hasReadableLiveStats(stats) {
  if (!stats) return false;
  return [stats.xg, stats.shots, stats.shotsOnTarget, stats.possession].some((pair) => (
    pair && Number.isFinite(Number(pair.home)) && Number.isFinite(Number(pair.away))
  ));
}

function shadowSideLabel(match, side) {
  if (side === "H") return match.homeZh || match.home || "主";
  if (side === "A") return match.awayZh || match.away || "客";
  if (side === "BALANCED") return "均衡";
  return "—";
}

function LiveMatchRow({ match, changeType = null }) {
  const live = match.live || {};
  const score = live.score || {};
  const scoreText = liveScoreText(score);
  const minuteText = liveMinuteText(score, live);
  const cornerProgress = liveCornerProgress(live);
  const stats = live.stats || null;
  const shadow = live.shadow || null;
  const showStats = hasReadableLiveStats(stats);
  const league = cleanLiveToken(match.league) || "LIVE";
  const homeName = cleanLiveToken(match.homeZh) || cleanLiveToken(match.home) || "主隊";
  const awayName = cleanLiveToken(match.awayZh) || cleanLiveToken(match.away) || "客隊";
  const goalsLine = cleanLiveToken(live.goals?.line) || "—";
  const cornersLine = cleanLiveToken(live.corners?.line) || "—";

  return (
    <Link
      className={"live-match-row" + (changeType ? " ft5-flash-" + changeType : "")}
      href={`/match/?id=${encodeURIComponent(match.id)}`}
      onClick={() => cacheMatch(match)}
    >
      <div className="live-match-head">
        <div className="live-match-state">
          <span className="live-dot">LIVE</span>
          <b>{minuteText}</b>
          {shadow ? <span className={`shadow-chip shadow-${String(shadow.status || "WAIT").toLowerCase()}`}>{shadow.status || "WAIT"}</span> : null}
        </div>
        <small>{league}</small>
      </div>

      <div className="live-card-body">
        <div className="live-score-hero">
          <div className="live-scoreboard">
            <b className="live-home-name">{homeName}</b>
            <strong className="live-score-main">{scoreText}</strong>
            <b className="live-away-name">{awayName}</b>
          </div>

          {shadow ? (
            <div className="live-context-grid">
              <div>
                <small>PRE EXPECTED</small>
                <b>{shadowSideLabel(match, shadow.expectedSide)}</b>
              </div>
              <div>
                <small>LIVE CONTROL</small>
                <b>{shadowSideLabel(match, shadow.actualSide)}</b>
              </div>
              <div>
                <small>METRICS</small>
                <b>{shadow.metricCount || 0}</b>
              </div>
            </div>
          ) : (
            <div className="live-context-empty">Live context building…</div>
          )}
        </div>

        <div className="live-intel">
          {showStats ? (
            <div className="live-stat-strip">
              <span><small>xG</small><b>{statPairText(stats.xg, 2)}</b></span>
              <span><small>射門</small><b>{statPairText(stats.shots)}</b></span>
              <span><small>中框</small><b>{statPairText(stats.shotsOnTarget)}</b></span>
              <span><small>控球</small><b>{statPairText(stats.possession, 0, "%")}</b></span>
            </div>
          ) : (
            <div className="live-stats-empty">LIVE STATS 等待更新</div>
          )}

          <div className="live-markets">
            <div className="live-market-had">
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
        </div>
      </div>
    </Link>
  );
}



function modelSourceLabel(match) {
  if (match.multi) return "Multi-source";
  if (match.forebet) return "Forebet";
  if (match.dc) return "Dixon-Coles";
  if (match.pi) return "Pi Rating";
  if (match.form) return "Team-Form";
  return "NO MODEL";
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

function TopBetCard({ row, index = 0, changeType = null }) {
  const { match, edge, type } = row;
  let pick = "—";
  let odds = null;
  let probability = null;

  if (type === "HDA") {
    pick = sideName(match, edge.key);
    odds = hdaOdds(match, edge.key);
    probability = hdaProbability(match, edge.key);
  } else if (type === "入球") {
    pick = binarySideName(edge.key) + " " + (match.goals?.line ?? "—");
    odds = binaryOdds(match.goals, edge.key);
    probability = edge.key === "O" ? Number(edge.model?.over) : Number(edge.model?.under);
  } else {
    pick = binarySideName(edge.key) + " " + (match.corners?.line ?? "—");
    odds = binaryOdds(match.corners, edge.key);
    probability = edge.key === "O" ? Number(edge.model?.over) : Number(edge.model?.under);
  }

  const p = Number.isFinite(probability) ? Math.round(probability * 100) + "%" : null;

  return (
    <Link
      className={"ft5-topbet ft5-enter" + (changeType ? " ft5-flash-" + changeType : "")}
      style={{ animationDelay: Math.min(index, 2) * 70 + "ms" }}
      href={"/match/?id=" + encodeURIComponent(match.id)}
      onClick={() => cacheMatch(match)}
    >
      <div className="ft5-topbet-meta">
        <span>{formatKickoff(match.kickoff)}</span>
        <span>{match.league}</span>
      </div>
      <div className="ft5-topbet-teams">
        <b>{match.homeZh || match.home}</b>
        <small>vs</small>
        <b>{match.awayZh || match.away}</b>
      </div>
      <div className="ft5-topbet-signal">
        <div className="ft5-topbet-pick">
          <span>{type} · {modelSourceLabel(match)}</span>
          <b>{pick}{p ? " · " + p : ""}</b>
        </div>
        <div className="ft5-topbet-edge">
          <span>EDGE</span>
          <b>+{(edge.value * 100).toFixed(1)}%</b>
        </div>
      </div>
      <div className="ft5-topbet-footer">
        <span>Odds {formatOdds(odds)}</span>
        <span>{modelCoverageCount(match)} model inputs</span>
      </div>
    </Link>
  );
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


const DASHBOARD_LAYOUT_V5 = "\n.ft5-shell{max-width:1120px;margin:0 auto;padding:28px 20px 104px}\n.ft5-topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:22px}\n.ft5-brand{display:flex;align-items:center;gap:12px}\n.ft5-logo{display:grid;place-items:center;width:44px;height:44px;border-radius:15px;background:linear-gradient(135deg,#1f7a4f,#46a978);color:#fff;font-weight:950;letter-spacing:.02em;box-shadow:0 10px 24px rgba(31,122,79,.18)}\n.ft5-brand-copy b{display:block;font-size:24px;line-height:1;color:#143c2d}\n.ft5-brand-copy span{display:block;margin-top:4px;font-size:11px;color:#7c8d84;font-weight:700}\n.ft5-live-pill{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:9px 13px;background:#e4f6ea;color:#1d7950;font-size:11px;font-weight:900;border:1px solid #c8e9d3}\n.ft5-live-pill:before{content:\"\";width:7px;height:7px;border-radius:50%;background:#2fa46c;box-shadow:0 0 0 4px rgba(47,164,108,.10)}\n.ft5-hero{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:18px}\n.ft5-hero h1{margin:0;color:#123e2c;font-size:34px;line-height:1.05;letter-spacing:-.03em}\n.ft5-hero p{margin:8px 0 0;color:#75877e;font-size:13px;font-weight:650}\n.ft5-update{text-align:right;color:#7c8d84;font-size:11px;line-height:1.5}\n.ft5-pipeline{display:flex;align-items:center;gap:8px;margin:-4px 0 14px;padding:9px 12px;border:1px solid #f0d2c8;border-radius:12px;background:#fff5f1;color:#995345;font-size:11px;font-weight:800}\n.ft5-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:20px}\n.ft5-kpi{min-width:0;background:rgba(255,255,255,.94);border:1px solid #dce8df;border-radius:17px;padding:15px 16px;box-shadow:0 8px 24px rgba(42,79,61,.05)}\n.ft5-kpi span{display:block;color:#7b8c83;font-size:11px;font-weight:750;margin-bottom:6px}\n.ft5-kpi b{display:block;color:#164d35;font-size:28px;line-height:1;font-weight:950}\n.ft5-kpi small{display:block;margin-top:6px;color:#9aa79f;font-size:9px}\n.ft5-kpi.warn{background:#fffaf0;border-color:#eedfaf}\n.ft5-kpi.warn b{color:#98701c}\n.ft5-section{margin:0 0 20px}\n.ft5-section-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:11px}\n.ft5-section-head h2{margin:0;color:#153f2f;font-size:22px;letter-spacing:-.02em}\n.ft5-section-head p{margin:4px 0 0;color:#819087;font-size:11px}\n.ft5-section-head .ft5-count{color:#7b8a82;font-size:11px;font-weight:800}\n.ft5-topbets-wrap{padding:16px;border:1px solid #cce5d4;border-radius:22px;background:linear-gradient(135deg,#eaf8ef 0%,#dff3e7 100%);box-shadow:0 12px 30px rgba(46,102,72,.07)}\n.ft5-topbets-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}\n.ft5-topbets-title div span{display:block;color:#238054;font-size:10px;font-weight:950;letter-spacing:.08em}\n.ft5-topbets-title h2{margin:2px 0 0;color:#164832;font-size:22px}\n.ft5-topbets-title button{border:0;background:transparent;color:#277c55;font-size:11px;font-weight:900;cursor:pointer}\n.ft5-topbets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}\n.ft5-topbet{display:flex;flex-direction:column;min-width:0;background:#fff;border:1px solid #d9e8de;border-radius:16px;padding:13px;box-shadow:0 6px 18px rgba(44,85,64,.05);transition:.16s ease}\n.ft5-topbet:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(44,85,64,.09)}\n.ft5-topbet-meta{display:flex;justify-content:space-between;gap:8px;color:#809087;font-size:9px;font-weight:800}\n.ft5-topbet-meta span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}\n.ft5-topbet-teams{margin:10px 0 12px}\n.ft5-topbet-teams b{display:block;color:#17392d;font-size:16px;line-height:1.22}\n.ft5-topbet-teams small{display:block;color:#a2ada7;font-size:9px;margin:3px 0}\n.ft5-topbet-signal{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-top:auto}\n.ft5-topbet-pick{border-radius:11px;background:#eef8f1;padding:9px 10px}\n.ft5-topbet-pick span{display:block;color:#7d8d84;font-size:8px;font-weight:800}\n.ft5-topbet-pick b{display:block;margin-top:3px;color:#1b6847;font-size:16px}\n.ft5-topbet-edge{border-radius:11px;background:#e0f3e7;padding:9px 10px;text-align:center;color:#1f7a50}\n.ft5-topbet-edge span{display:block;font-size:8px;font-weight:800}\n.ft5-topbet-edge b{display:block;margin-top:3px;font-size:17px}\n.ft5-topbet-footer{display:flex;justify-content:space-between;gap:8px;margin-top:9px;color:#7f8e86;font-size:9px;font-weight:750}\n.ft5-live-zone{padding:15px;border:1px solid #cbe3d2;border-radius:20px;background:#edf8f0;margin-bottom:20px}\n.ft5-live-zone .live-zone-head{margin-bottom:10px}\n.ft5-live-zone .live-match-row{box-shadow:none;border-radius:14px}\n.ft5-live-zone .live-context-grid{display:none!important}\n.ft5-live-zone .live-score-hero{justify-content:center}\n.ft5-live-zone .live-stat-strip span{min-height:52px}\n.ft5-toolbar{position:sticky;top:0;z-index:8;padding:10px 0 8px;background:linear-gradient(180deg,rgba(245,247,242,.97) 72%,rgba(245,247,242,0))}\n.ft5-filters{display:flex;gap:7px;overflow-x:auto;padding:0 0 4px;scrollbar-width:none}\n.ft5-filters::-webkit-scrollbar{display:none}\n.ft5-filter{white-space:nowrap;border:1px solid #dae5dd;background:#fff;color:#708179;border-radius:999px;padding:8px 13px;font-size:10px;font-weight:850;cursor:pointer}\n.ft5-filter.active{background:#237b52;color:#fff;border-color:#237b52;box-shadow:0 5px 12px rgba(35,123,82,.18)}\n.ft5-match-list{display:grid;gap:10px}\n.ft5-match-card{display:block;background:#fff;border:1px solid #dce7df;border-radius:17px;padding:14px 15px;box-shadow:0 6px 20px rgba(45,77,62,.045);transition:.15s ease}\n.ft5-match-card:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgba(45,77,62,.08)}\n.ft5-match-meta{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:11px}\n.ft5-match-meta-left{display:flex;align-items:center;gap:8px;min-width:0}\n.ft5-kickoff{color:#173d2f;font-size:12px;font-weight:950;white-space:nowrap}\n.ft5-league{color:#8b9991;font-size:9px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.ft5-fresh{border-radius:999px;background:#edf7f0;color:#2b7b55;padding:5px 7px;font-size:8px;font-weight:900;white-space:nowrap}\n.ft5-match-main{display:grid;grid-template-columns:minmax(190px,1.05fr) minmax(150px,.75fr) minmax(210px,.9fr);gap:12px;align-items:stretch}\n.ft5-teams{display:flex;flex-direction:column;justify-content:center;gap:4px;min-width:0;padding:7px 2px}\n.ft5-teams b{color:#15392c;font-size:18px;line-height:1.18;font-weight:900;overflow-wrap:anywhere}\n.ft5-teams span{color:#a1aca6;font-size:9px;font-weight:700}\n.ft5-probs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;border:1px solid #d9e7de;border-radius:13px;background:#f4faf6;padding:8px}\n.ft5-prob{display:flex;flex-direction:column;justify-content:center;align-items:center;border-radius:9px;padding:7px 4px;color:#71847a}\n.ft5-prob span{font-size:8px;font-weight:900}\n.ft5-prob b{margin-top:4px;font-size:17px;line-height:1;color:#4d675a}\n.ft5-prob.selected{background:#dff2e5;color:#1f724c}\n.ft5-prob.selected b{color:#1b6b47}\n.ft5-signal{display:grid;grid-template-columns:1fr 1fr;gap:6px}\n.ft5-signal-box{display:flex;flex-direction:column;justify-content:center;min-width:0;border:1px solid #e0e9e3;border-radius:11px;background:#f8faf8;padding:8px 9px}\n.ft5-signal-box span{color:#84938b;font-size:8px;font-weight:850}\n.ft5-signal-box b{margin-top:4px;color:#1c5d41;font-size:13px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.ft5-signal-box.edge{background:#edf8f1;border-color:#d0e8d8}\n.ft5-signal-box.edge b{color:#177748;font-size:16px}\n.ft5-odds{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-top:10px}\n.ft5-odd{min-width:0;border:1px solid #e1e9e3;border-radius:9px;background:#fafcfa;padding:7px 8px}\n.ft5-odd span{display:block;color:#8b9991;font-size:7px;font-weight:850}\n.ft5-odd b{display:block;margin-top:3px;color:#234736;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.ft5-card-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px}\n.ft5-tags{display:flex;flex-wrap:wrap;gap:5px}\n.ft5-tag{border-radius:999px;background:#edf5ef;color:#4f6f5f;padding:5px 7px;font-size:8px;font-weight:850}\n.ft5-tag.blue{background:#edf3fb;color:#51719a}\n.ft5-tag.alert{background:#fff0ec;color:#a25749}\n.ft5-details{color:#22794f;font-size:10px;font-weight:950;white-space:nowrap}\n.ft5-empty{padding:20px;border:1px dashed #ccd9d0;border-radius:15px;text-align:center;color:#839087;font-size:12px;background:#fbfcfb}\n.ft5-bottom-nav{position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:20;width:min(92%,620px);display:grid;grid-template-columns:repeat(4,1fr);gap:5px;padding:6px;border:1px solid #d8e4db;border-radius:18px;background:rgba(255,255,255,.94);backdrop-filter:blur(16px);box-shadow:0 14px 40px rgba(47,78,62,.15)}\n.ft5-bottom-nav>*{border:0;background:transparent;border-radius:12px;padding:9px 3px;color:#7d8c84;font:inherit;font-size:10px;font-weight:900;text-align:center;cursor:pointer}\n.ft5-bottom-nav .selected{background:#e3f3e8;color:#1d7249}\n@media(max-width:820px){\n  .ft5-shell{padding:16px 12px 94px}\n  .ft5-brand-copy b{font-size:21px}\n  .ft5-logo{width:40px;height:40px;border-radius:13px}\n  .ft5-hero{align-items:flex-start}\n  .ft5-hero h1{font-size:27px}\n  .ft5-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}\n  .ft5-topbets{display:flex;overflow-x:auto;gap:8px;scroll-snap-type:x mandatory;padding-bottom:3px}\n  .ft5-topbet{min-width:270px;scroll-snap-align:start}\n  .ft5-match-main{grid-template-columns:1fr}\n  .ft5-teams{padding:2px 0}\n  .ft5-probs{grid-template-columns:repeat(3,1fr)}\n  .ft5-signal{grid-template-columns:repeat(2,1fr)}\n  .ft5-odds{grid-template-columns:repeat(3,1fr)}\n}\n@media(max-width:520px){\n  .ft5-shell{padding:12px 9px 88px}\n  .ft5-topbar{margin-bottom:17px}\n  .ft5-live-pill{padding:7px 10px;font-size:10px}\n  .ft5-brand-copy b{font-size:19px}\n  .ft5-brand-copy span{font-size:9px}\n  .ft5-hero{display:block}\n  .ft5-hero h1{font-size:24px}\n  .ft5-hero p{font-size:11px}\n  .ft5-update{margin-top:8px;text-align:left;font-size:9px}\n  .ft5-kpi{padding:12px}\n  .ft5-kpi b{font-size:24px}\n  .ft5-topbets-wrap{padding:12px;border-radius:18px}\n  .ft5-topbets-title h2{font-size:19px}\n  .ft5-topbet{min-width:245px;padding:12px}\n  .ft5-section-head h2{font-size:19px}\n  .ft5-match-card{padding:12px;border-radius:15px}\n  .ft5-match-meta{margin-bottom:9px}\n  .ft5-kickoff{font-size:11px}\n  .ft5-league{font-size:8px}\n  .ft5-teams b{font-size:17px}\n  .ft5-prob b{font-size:16px}\n  .ft5-signal-box b{font-size:12px}\n  .ft5-signal-box.edge b{font-size:15px}\n  .ft5-odd{padding:6px}\n  .ft5-odd b{font-size:10px}\n  .ft5-bottom-nav{bottom:6px;width:calc(100% - 16px);border-radius:14px}\n}\n\n\n@keyframes ft5-breathe{0%,100%{transform:scale(.86);opacity:.58}50%{transform:scale(1.18);opacity:1}}\n@keyframes ft5-enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}\n@keyframes ft5-edge-flash{0%{transform:scale(1);background:#edf8f1}30%{transform:scale(1.035);background:#d0f1dc}100%{transform:scale(1);background:#edf8f1}}\n@keyframes ft5-odds-flash{0%{transform:translateY(0);background:#fafcfa}28%{transform:translateY(-2px);background:#fff2c9}100%{transform:translateY(0);background:#fafcfa}}\n@keyframes ft5-score-bump{0%{transform:scale(1)}32%{transform:scale(1.14)}100%{transform:scale(1)}}\n@keyframes ft5-new-card{from{opacity:.2;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}\n.ft5-live-pill:before{animation:ft5-breathe 2.2s ease-in-out infinite}\n.live-dot{position:relative;padding-left:17px!important}\n.live-dot:before{content:\"\";position:absolute;left:7px;top:50%;width:5px;height:5px;margin-top:-2.5px;border-radius:50%;background:#2fa46c;animation:ft5-breathe 2s ease-in-out infinite}\n.ft5-enter{animation:ft5-enter .38s ease-out both}\n.ft5-list-enter{animation:ft5-enter .24s ease-out both}\n.ft5-flash-edge .ft5-signal-box.edge,.ft5-topbet.ft5-flash-edge .ft5-topbet-edge{animation:ft5-edge-flash .9s ease-out}\n.ft5-flash-odds .ft5-odd,.ft5-topbet.ft5-flash-odds .ft5-topbet-pick{animation:ft5-odds-flash .9s ease-out}\n.live-match-row.ft5-flash-score .live-score-main{animation:ft5-score-bump .72s cubic-bezier(.2,.8,.2,1)}\n.ft5-flash-new{animation:ft5-new-card .55s ease-out both}\n.ft5-match-card{content-visibility:auto;contain-intrinsic-size:220px}\n@media(prefers-reduced-motion:reduce){\n  .ft5-live-pill:before,.live-dot:before,.ft5-enter,.ft5-list-enter,.ft5-flash-edge .ft5-signal-box.edge,.ft5-flash-odds .ft5-odd,.live-match-row.ft5-flash-score .live-score-main,.ft5-flash-new{animation:none!important}\n  .ft5-match-card,.ft5-topbet{transition:none!important}\n}\n";

const FEED_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-phase1-feed?hours=24";

export default function DashboardClient({ feed, nowMs }) {
  const [filter, setFilter] = useState("focus");
  const [currentFeed, setCurrentFeed] = useState(feed);
  const [clockMs, setClockMs] = useState(nowMs || Date.now());
  const [changeMap, setChangeMap] = useState({});
  const previousFeedRef = useRef(feedMotionSnapshot(feed?.matches || []));
  const motionTimerRef = useRef(null);
  const all = currentFeed.matches || [];
  const liveMatches = all.filter((m) => m.liveNow);
  const prematchAll = all.filter((m) => !m.liveNow);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("filter") || "focus";
    setFilter(filters.some(([key]) => key === requested) ? requested : "focus");

    let cancelled = false;
    async function refreshFeed() {
      try {
        const res = await fetch(FEED_URL, { cache: "no-store" });
        if (!res.ok) return;
        const next = await res.json();
        if (!cancelled && Array.isArray(next?.matches)) {
          const nextSnapshot = feedMotionSnapshot(next.matches);
          const changes = detectFeedMotion(previousFeedRef.current, nextSnapshot);
          previousFeedRef.current = nextSnapshot;
          setCurrentFeed(next);
          setClockMs(Date.now());
          if (Object.keys(changes).length) {
            setChangeMap(changes);
            if (motionTimerRef.current) window.clearTimeout(motionTimerRef.current);
            motionTimerRef.current = window.setTimeout(() => setChangeMap({}), 1700);
          }
        }
      } catch {}
    }

    refreshFeed();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshFeed();
      setClockMs(Date.now());
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (motionTimerRef.current) window.clearTimeout(motionTimerRef.current);
    };
  }, []);

  const byFocus = useMemo(() => [...prematchAll].sort((a, b) => {
    const kickoffDelta = new Date(a.kickoff) - new Date(b.kickoff);
    if (kickoffDelta) return kickoffDelta;
    return reviewScore(b, clockMs) - reviewScore(a, clockMs);
  }), [prematchAll, clockMs]);

  const hdaCandidates = useMemo(() => prematchAll
    .map((match) => ({ match, edge: valueEdge(match) }))
    .filter((row) => row.edge?.value >= 0.05 && row.edge.value < 0.60)
    .sort((a, b) => b.edge.value - a.edge.value), [prematchAll]);
  const goalsCandidates = useMemo(() => prematchAll
    .map((match) => ({ match, edge: goalsValueEdge(match) }))
    .filter((row) => row.edge?.value >= 0.05 && row.edge.value < 0.60)
    .sort((a, b) => b.edge.value - a.edge.value), [prematchAll]);
  const cornersCandidates = useMemo(() => prematchAll
    .map((match) => ({ match, edge: cornersValueEdge(match) }))
    .filter((row) => row.edge?.value >= 0.05 && row.edge.value < 0.60)
    .sort((a, b) => b.edge.value - a.edge.value), [prematchAll]);

  const hdaPicks = hdaCandidates.slice(0, 5);
  const goalsGroups = groupLineCandidates(goalsCandidates, "goals", 2);
  const cornersGroups = groupLineCandidates(cornersCandidates, "corners", 2);
  const topBets = [...hdaCandidates.map((row) => ({ ...row, type: "HDA" })), ...goalsCandidates.map((row) => ({ ...row, type: "入球" })), ...cornersCandidates.map((row) => ({ ...row, type: "角球" }))].sort((a, b) => b.edge.value - a.edge.value).slice(0, 3);

  let matches = byFocus;
  if (filter === "all") matches = [...prematchAll].sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  if (filter === "gaps") {
    matches = prematchAll.filter((m) => valueEdge(m))
      .sort((a, b) => valueEdge(b).value - valueEdge(a).value);
  }
  if (filter === "odds") {
    matches = prematchAll
      .filter((m) => Number.isFinite(Number(m.oddsMovement?.rawOddsChangePct)) && Math.abs(Number(m.oddsMovement.rawOddsChangePct)) >= 10)
      .sort((a, b) => Math.abs(Number(b.oddsMovement.rawOddsChangePct)) - Math.abs(Number(a.oddsMovement.rawOddsChangePct)));
  }
  if (filter === "missing") {
    matches = prematchAll.filter((m) => modelCoverageCount(m) === 0)
      .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  }
  if (filter === "stale") {
    matches = prematchAll.filter((m) => freshness(m, clockMs).key === "stale")
      .sort((a, b) => dataAgeMinutes(b, clockMs) - dataAgeMinutes(a, clockMs));
  }

  const missing = prematchAll.filter((m) => modelCoverageCount(m) === 0).length;
  const stale = prematchAll.filter((m) => freshness(m, clockMs).key === "stale").length;
  const valueCandidates = hdaCandidates.length + goalsCandidates.length + cornersCandidates.length;
  const oddsAlerts = prematchAll.filter((m) => Number.isFinite(Number(m.oddsMovement?.rawOddsChangePct)) && Math.abs(Number(m.oddsMovement.rawOddsChangePct)) >= 10).length;
  const modelReady = prematchAll.filter((m) => modelCoverageCount(m) > 0).length;
  const dataAlerts = missing + stale;
  const isLive = currentFeed.source === "supabase-canonical-live";
  const pipelineWarnings = [
    heartbeatAgeMinutes(currentFeed, "HKJC_UPCOMING_EDGE", clockMs) > 30 ? "Upcoming HKJC" : null,
    heartbeatAgeMinutes(currentFeed, "HKJC_LIVE_EDGE", clockMs) > 12 ? "Live odds" : null,
    heartbeatAgeMinutes(currentFeed, "LIVE_SCORE_EDGE", clockMs) > 12 ? "Live score" : null,
  ].filter(Boolean);

  const headings = {
    focus: ["NEXT 24H", "先睇 Value，再睇模型細節"],
    live: ["LIVE NOW", "只顯示 HKJC 正在售賣嘅即場市場"],
    all: ["Upcoming 24H", "按開賽時間排序"],
    gaps: ["HDA Edge 候選", "按模型高於 HKJC 市場機率嘅幅度排序"],
    odds: ["賠率大幅變動", `${oddsAlerts} 場達 ±10% · 按變動幅度排序`],
    missing: ["缺資料", "HKJC 有盤但暫時未有外部模型"],
    stale: ["過時資料", "超過 6 小時未更新"],
  };

  function selectFilter(key) {
    setFilter(key);
    const nextUrl = key === "focus" ? "/" : `/?filter=${key}`;
    window.history.replaceState({}, "", nextUrl);
  }

  return (
    <main className="ft5-shell">
      <style data-dashboard-layout="v5">{DASHBOARD_LAYOUT_V5}</style>

      <header className="ft5-topbar">
        <div className="ft5-brand">
          <div className="ft5-logo">FT</div>
          <div className="ft5-brand-copy">
            <b>Fast Track</b>
            <span>AI Football Betting</span>
          </div>
        </div>
        <span className="ft5-live-pill">{isLive ? "Live data" : "Fallback"}</span>
      </header>

      <section className="ft5-hero">
        <div>
          <h1>數據驅動 · 更聰明地睇盤</h1>
          <p>HKJC 市場 × 多模型 × 即場資料，一眼睇清邊場值得再分析</p>
        </div>
        <div className="ft5-update">
          香港時間<br />
          更新 {formatDashboardUpdate(currentFeed.generatedAt || currentFeed.updatedAt)}
        </div>
      </section>

      {pipelineWarnings.length > 0 && (
        <div className="ft5-pipeline">
          資料延遲：{pipelineWarnings.join(" · ")}
        </div>
      )}

      <section className="ft5-kpis">
        <div className="ft5-kpi"><span>24H 賽事</span><b>{prematchAll.length}</b><small>HKJC upcoming</small></div>
        <div className="ft5-kpi"><span>Value Picks</span><b>{valueCandidates}</b><small>HDA / 入球 / 角球</small></div>
        <div className="ft5-kpi"><span>模型就緒</span><b>{modelReady}</b><small>至少一個模型有資料</small></div>
        <div className={"ft5-kpi" + (dataAlerts ? " warn" : "")}><span>資料提醒</span><b>{dataAlerts}</b><small>Missing + stale</small></div>
      </section>

      <section className="ft5-section ft5-topbets-wrap">
        <div className="ft5-topbets-title">
          <div><span>BEST BETS</span><h2>精選投注</h2></div>
          <button type="button" onClick={() => selectFilter("gaps")}>查看更多 →</button>
        </div>
        {topBets.length ? (
          <div className="ft5-topbets">
            {topBets.map((row, index) => (
              <TopBetCard key={row.match.id + "-" + row.type + "-" + index} row={row} index={index} changeType={changeMap[String(row.match.id)] || null} />
            ))}
          </div>
        ) : <div className="ft5-empty">暫時未有達到 Edge 門檻嘅精選賽事</div>}
      </section>

      {liveMatches.length > 0 && (
        <section className="ft5-live-zone">
          <div className="live-zone-head">
            <div><span>HKJC LIVE</span><h2>即場賽事</h2></div>
            <button type="button" onClick={() => selectFilter("live")}>全部 Live →</button>
          </div>
          <div className="live-list">
            {liveMatches.slice(0, 3).map((match) => <LiveMatchRow key={match.id} match={match} changeType={changeMap[String(match.id)] || null} />)}
          </div>
        </section>
      )}

      <section className="ft5-section">
        <div className="ft5-section-head">
          <div>
            <h2>{filter === "live" ? "即場賽事" : "即將開賽 24 小時"}</h2>
            <p>{filter === "live" ? "HKJC Live markets" : "Next 24 Hours · 香港時間"}</p>
          </div>
          <span className="ft5-count">{filter === "live" ? liveMatches.length : matches.length} 場</span>
        </div>

        <div className="ft5-toolbar">
          <nav className="ft5-filters">
            {filters.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={"ft5-filter" + (filter === key ? " active" : "")}
                onClick={() => selectFilter(key)}
              >
                {key === "odds" && oddsAlerts ? "賠率 " + oddsAlerts : key === "live" && liveMatches.length ? "Live " + liveMatches.length : label}
              </button>
            ))}
          </nav>
        </div>

        {filter === "live" ? (
          <div className="live-list">
            {liveMatches.length
              ? liveMatches.map((match) => <LiveMatchRow key={match.id} match={match} changeType={changeMap[String(match.id)] || null} />)
              : <div className="ft5-empty">暫時冇符合 freshness gate 嘅 HKJC Live 賽事</div>}
          </div>
        ) : (
          <div className="ft5-match-list ft5-list-enter" key={filter}>
            {matches.length
              ? matches.map((match) => <MatchCard key={match.id} match={match} nowMs={clockMs} changeType={changeMap[String(match.id)] || null} />)
              : <div className="ft5-empty">呢個篩選暫時冇賽事</div>}
          </div>
        )}
      </section>

      <footer className="ft5-bottom-nav">
        <button className={filter === "focus" ? "selected" : ""} type="button" onClick={() => selectFilter("focus")}>首頁</button>
        <button className={filter === "live" ? "selected" : ""} type="button" onClick={() => selectFilter("live")}>Live</button>
        <button className={filter === "gaps" ? "selected" : ""} type="button" onClick={() => selectFilter("gaps")}>Edge</button>
        <a href="/health/">系統</a>
      </footer>
    </main>
  );
}
