"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
        <b>+{(edge.value * 100).toFixed(1)}pp</b>
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

function LiveMatchRow({ match }) {
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
      className="live-match-row"
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


function heartbeatAgeMinutes(feed, key, nowMs) {
  const t = feed?.systemHealth?.[key]?.observedAt;
  if (!t) return Infinity;
  const ms = new Date(t).getTime();
  if (!Number.isFinite(ms)) return Infinity;
  return Math.max(0, (nowMs - ms) / 60000);
}


const DASHBOARD_LAYOUT_V4 = `
/* Dashboard V4 critical layout — intentionally inline to avoid stale static CSS caches */
.match-list{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:10px!important}
.match-card.upcoming-command-card{display:block;width:100%;min-width:0;box-sizing:border-box;padding:12px 13px;border-radius:14px}
.upcoming-command-card *{box-sizing:border-box}
.upcoming-command-card .match-topline{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:9px}
.upcoming-meta-left,.upcoming-meta-right{display:flex;align-items:center;gap:7px;min-width:0}
.upcoming-meta-right{margin-left:auto;justify-content:flex-end}
.upcoming-kickoff{font-size:13px;color:#245f45;white-space:nowrap}
.upcoming-command-card .league{max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;font-weight:900;color:#587268}
.upcoming-command-card .freshness,.upcoming-command-card .odds-move-badge{margin-left:0;font-size:8.5px;padding:4px 6px}

.upcoming-score-hero{display:grid;grid-template-columns:minmax(0,1fr) 118px minmax(0,1fr);gap:12px;align-items:center;padding:11px 12px;margin-bottom:7px;border-radius:11px;border:1px solid #dce8df;background:linear-gradient(180deg,#fbfdfb,#f2f8f3)}
.upcoming-team{min-width:0}
.upcoming-team small,.upcoming-forecast small{display:block;color:#74877c;font-size:8.5px;font-weight:900;letter-spacing:.04em;margin-bottom:4px}
.upcoming-team b{display:block;color:#13291f;font-size:18px;line-height:1.08;font-weight:900}
.upcoming-away-team{text-align:right}
.upcoming-side-label{display:block;margin-top:4px;color:#8a9991;font-size:8px;font-weight:800;letter-spacing:.06em}
.upcoming-forecast{text-align:center;padding:7px;border-radius:9px;background:#e8f4eb;border:1px solid #cee2d3}
.upcoming-forecast strong{display:block;color:#245f45;font-size:22px;line-height:1;font-weight:950}
.upcoming-forecast span{display:block;margin-top:4px;color:#6f8177;font-size:8.5px;line-height:1.15;font-weight:800}

.upcoming-intel-grid{display:grid;grid-template-columns:1.18fr 1fr 1fr;gap:6px;margin-bottom:7px}
.upcoming-value-card,.upcoming-market-card{min-width:0;padding:8px 9px;border-radius:9px;border:1px solid #dfe8e1;background:#f8faf8}
.upcoming-value-card small,.upcoming-market-card small{display:block;color:#71847a;font-size:9px;font-weight:900;margin-bottom:5px}
.upcoming-value-main{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.upcoming-value-main b,.upcoming-market-card>b{display:block;color:#183326;font-size:14px;line-height:1.05;font-weight:900}
.upcoming-value-main strong{font-size:15px;line-height:1;color:#245f45;white-space:nowrap}
.upcoming-value-card>span,.upcoming-market-card>span{display:block;margin-top:4px;color:#819088;font-size:8.5px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.upcoming-bottom-row{display:flex;justify-content:space-between;align-items:center;gap:8px}
.upcoming-had{display:flex;align-items:center;gap:6px;flex:1;min-width:0}
.upcoming-had span{min-width:72px;padding:6px 9px;border:1px solid #e0e8e1;border-radius:8px;background:#f5f8f5;color:#71847a;font-size:9.5px}
.upcoming-had b{margin-left:4px;color:#15291f;font-size:12.5px}
.upcoming-card-status{display:flex;align-items:center;gap:7px;white-space:nowrap}

.live-zone{padding:12px!important}
.live-list{display:grid;gap:9px}
.live-match-row{display:block;background:#fff;border:1px solid #d2e4d7;border-radius:14px;padding:11px 12px 12px}
.live-match-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px}
.live-match-state{display:flex;align-items:center;gap:7px}
.live-match-state>b{font-size:14px!important}
.live-dot,.shadow-chip{font-size:9px!important;padding:4px 7px!important}
.live-card-body{display:grid;grid-template-columns:minmax(280px,.92fr) minmax(0,1.38fr);gap:10px;align-items:stretch}
.live-score-hero{display:flex;flex-direction:column;justify-content:space-between;gap:10px;min-width:0;padding:10px;border-radius:12px;background:linear-gradient(180deg,#f7fbf8,#eef7f0);border:1px solid #dce9df}
.live-scoreboard{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:12px;align-items:center;min-height:58px}
.live-scoreboard>b{min-width:0;font-size:19px!important;line-height:1.12;font-weight:900}
.live-away-name{text-align:right}
.live-score-main{display:inline-grid;place-items:center;min-width:78px;padding:8px 12px;border-radius:12px;background:#dff1e4;border:1px solid #bedbc7;color:#245f45;font-size:31px!important;line-height:1;font-weight:950}
.live-context-grid{display:grid;grid-template-columns:1fr 1fr .64fr;gap:5px}
.live-context-grid>div{padding:7px 8px;border:1px solid #dfe8e1;border-radius:8px;background:#fff}
.live-context-grid small{display:block;color:#71847a;font-size:8px;font-weight:800;margin-bottom:3px}
.live-context-grid b{display:block;color:#245f45;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.live-intel{display:flex;flex-direction:column;justify-content:space-between;gap:8px;min-width:0}
.live-stat-strip{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:6px!important;margin:0!important}
.live-stat-strip span{display:flex!important;flex-direction:column;justify-content:center;gap:4px;min-height:58px;padding:8px 9px!important;border-radius:9px!important;text-align:left!important}
.live-stat-strip small{font-size:10px!important}
.live-stat-strip b{font-size:16px!important}
.live-markets{display:grid!important;grid-template-columns:1.15fr 1fr 1fr!important;gap:6px!important}
.live-markets>div{padding:8px 10px!important;border-radius:9px!important}
.live-markets span{font-size:10px!important;margin-bottom:4px!important}
.live-markets b{font-size:15px!important}
.live-markets small{font-size:9px!important}
.live-stats-empty,.live-context-empty{font-size:10px}

.market-pick-row{padding:8px 7px!important}
.market-pick-match span,.market-pick-selection span,.market-pick-number span{font-size:8.5px!important}
.market-pick-match b{font-size:11px!important}
.market-pick-selection b,.market-pick-number b{font-size:11.5px!important}
.line-value-label{font-size:8px!important}
.value-section-head h3{font-size:15px!important}
.value-section-head span{font-size:9px!important}

@media(max-width:860px){
  .live-card-body{grid-template-columns:1fr}
}
@media(max-width:680px){
  .match-list{gap:6px!important}
  .match-card.upcoming-command-card{padding:8px;border-radius:10px}
  .upcoming-command-card .match-topline{gap:5px;margin-bottom:7px}
  .upcoming-meta-left,.upcoming-meta-right{gap:4px}
  .upcoming-kickoff{font-size:10px}
  .upcoming-command-card .league{max-width:116px;font-size:7.5px}
  .upcoming-command-card .freshness,.upcoming-command-card .odds-move-badge{font-size:7px;padding:3px 4px}
  .upcoming-score-hero{grid-template-columns:minmax(0,1fr) 68px minmax(0,1fr);gap:6px;padding:9px 7px;margin-bottom:6px;border-radius:9px}
  .upcoming-team small,.upcoming-forecast small{font-size:7px;margin-bottom:3px}
  .upcoming-team b{font-size:15px;white-space:normal;overflow-wrap:anywhere}
  .upcoming-side-label{font-size:6.5px;margin-top:3px}
  .upcoming-forecast{padding:6px 4px;border-radius:8px}
  .upcoming-forecast strong{font-size:18px}
  .upcoming-forecast span{font-size:6.8px}
  .upcoming-intel-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;margin-bottom:5px}
  .upcoming-value-card{grid-column:1/-1;padding:7px 8px}
  .upcoming-market-card{padding:7px}
  .upcoming-value-card small,.upcoming-market-card small{font-size:7.5px}
  .upcoming-value-main b{font-size:12.5px}
  .upcoming-value-main strong{font-size:14px}
  .upcoming-market-card>b{font-size:12px}
  .upcoming-value-card>span,.upcoming-market-card>span{font-size:7px}
  .upcoming-bottom-row{display:grid;grid-template-columns:1fr auto;gap:5px}
  .upcoming-had{gap:3px}
  .upcoming-had span{flex:1;min-width:0;padding:5px 4px;text-align:center;font-size:7px}
  .upcoming-had b{display:block;margin:1px 0 0;font-size:10px}
  .upcoming-card-status .coverage{display:none}
  .upcoming-card-status .details-link{font-size:8px}

  .live-zone{padding:7px!important}
  .live-match-row{padding:8px!important}
  .live-card-body{grid-template-columns:1fr;gap:6px}
  .live-score-hero{padding:8px;gap:7px}
  .live-scoreboard{gap:7px;min-height:52px}
  .live-scoreboard>b{font-size:16px!important}
  .live-score-main{min-width:66px;padding:7px 8px;font-size:25px!important}
  .live-context-grid{grid-template-columns:1fr 1fr .58fr;gap:4px}
  .live-context-grid>div{padding:6px}
  .live-context-grid small{font-size:7.2px}
  .live-context-grid b{font-size:10.5px}
  .live-stat-strip{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:4px!important}
  .live-stat-strip span{min-height:48px;padding:6px 7px!important}
  .live-stat-strip small{font-size:8.8px!important}
  .live-stat-strip b{font-size:13px!important}
  .live-markets{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:4px!important}
  .live-markets .live-market-had{grid-column:1/-1}
  .live-markets>div{padding:7px!important}
  .live-markets span{font-size:8.8px!important}
  .live-markets b{font-size:13px!important}

  .market-pick-match span,.market-pick-selection span,.market-pick-number span{font-size:7px!important}
  .market-pick-match b{font-size:9.2px!important}
  .market-pick-selection b,.market-pick-number b{font-size:9.5px!important}
}
`;

const FEED_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-phase1-feed?hours=24";

export default function DashboardClient({ feed, nowMs }) {
  const [filter, setFilter] = useState("focus");
  const [currentFeed, setCurrentFeed] = useState(feed);
  const [clockMs, setClockMs] = useState(nowMs || Date.now());
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
          setCurrentFeed(next);
          setClockMs(Date.now());
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
    <main className="shell">
      <style data-dashboard-layout="v4">{DASHBOARD_LAYOUT_V4}</style>
      <header className="hero compact-hero">
        <div>
          <p className="eyebrow">FAST TRACK 2026</p>
          <h1>Betting Board</h1>
          <p className="subtitle">HKJC · HDA / 入球 / 角球 · Pre-match 同 Live 市場分開</p>
        </div>
        <span className={`preview-badge ${isLive ? "live-badge" : ""}`}>
          {isLive ? "LIVE SQL" : "FALLBACK"}
        </span>
      </header>

      {pipelineWarnings.length > 0 && (
        <div className="pipeline-alert">
          <b>DATA PIPELINE DELAY</b>
          <span>{pipelineWarnings.join(" · ")}</span>
        </div>
      )}

      <section className="board-stats">
        <div className={liveMatches.length ? "live-stat" : ""}><span>LIVE</span><b>{liveMatches.length}</b></div>
        <div><span>24H 賽事</span><b>{prematchAll.length}</b></div>
        <div><span>Value Picks</span><b>{valueCandidates}</b></div>
        <div className={missing || stale ? "health-warn" : ""}>
          <span>資料提醒</span><b>{missing + stale}</b>
        </div>
      </section>

      {liveMatches.length > 0 && (
        <section className="live-zone">
          <div className="live-zone-head">
            <div><span>HKJC LIVE</span><h2>LIVE NOW</h2></div>
            <button type="button" onClick={() => selectFilter("live")}>全部 Live →</button>
          </div>
          <div className="live-list">
            {liveMatches.slice(0, 4).map((match) => <LiveMatchRow key={match.id} match={match} />)}
          </div>
        </section>
      )}

      <section className="focus-zone">
        <div className="focus-zone-head">
          <div>
            <span>BEST BETS · VALUE SHORTLIST</span>
            <h2>三個市場分開睇</h2>
          </div>
          <p>只計 HKJC line 同模型 line 可以直接比較嘅 pre-match Edge</p>
        </div>
        <div className="value-columns">
          <ValueSection title="HDA" subtitle="主和客" rows={hdaPicks} type="HDA" />
          <LineValueSection title="入球" subtitle="GOALS · CURRENT LINE" groups={goalsGroups} type="入球" />
          <LineValueSection title="角球" subtitle="CORNERS · CURRENT LINE" groups={cornersGroups} type="角球" />
        </div>
      </section>

      <nav className="filters sticky-filters">
        {filters.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={filter === key ? "active" : ""}
            onClick={() => selectFilter(key)}
          >
            {key === "odds" && oddsAlerts ? `賠率 ${oddsAlerts}` : key === "live" && liveMatches.length ? `Live ${liveMatches.length}` : label}
          </button>
        ))}
      </nav>

      <section className="section-head">
        <div>
          <h2>{headings[filter]?.[0] || headings.focus[0]}</h2>
          <p>{filter === "live" ? liveMatches.length : matches.length} 場 · 香港時間</p>
        </div>
        <span>{headings[filter]?.[1] || headings.focus[1]}</span>
      </section>

      {filter === "live" ? (
        <div className="live-list standalone-live-list">
          {liveMatches.length
            ? liveMatches.map((match) => <LiveMatchRow key={match.id} match={match} />)
            : <div className="market-pick-empty">暫時冇符合 freshness gate 嘅 HKJC Live 賽事</div>}
        </div>
      ) : (
        <div className="match-list">
          {matches.map((match) => <MatchCard key={match.id} match={match} nowMs={clockMs} />)}
        </div>
      )}

      <footer className="bottom-nav">
        <button className={filter === "focus" ? "selected" : ""} type="button" onClick={() => selectFilter("focus")}>焦點</button>
        <button className={filter === "live" ? "selected" : ""} type="button" onClick={() => selectFilter("live")}>Live</button>
        <button className={filter === "gaps" ? "selected" : ""} type="button" onClick={() => selectFilter("gaps")}>Edge</button>
        <a href="/health/">系統</a>
      </footer>
    </main>
  );
}
