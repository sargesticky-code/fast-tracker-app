"use client";

import React from "react";

function parseGrid(slot) {
  if (!slot) return null;
  const match = String(slot).match(/(\d+)\s*[:.-]\s*(\d+)/);
  if (!match) return null;
  return { row: Number(match[1]), col: Number(match[2]) };
}

function shortName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.length === 1 ? parts[0] : parts[parts.length - 1];
}

function positionFor(player, index, total, flip) {
  const grid = parseGrid(player?.formation_slot || player?.grid || player?.slot);
  if (grid) {
    const rows = Math.max(4, Number(player?.formation_rows) || 5);
    const cols = Math.max(1, Number(player?.formation_cols) || 5);
    const yBase = 8 + ((grid.row - 1) / Math.max(1, rows - 1)) * 84;
    const x = 8 + ((grid.col - 1) / Math.max(1, cols - 1)) * 84;
    return { left: `${x}%`, top: `${flip ? 100 - yBase : yBase}%` };
  }

  // Safe fallback: distribute unknown positions so the UI never becomes a blank card.
  const x = 12 + ((index % 4) / 3) * 76;
  const band = Math.floor(index / 4);
  const y = 10 + (band / Math.max(1, Math.ceil(total / 4) - 1)) * 80;
  return { left: `${x}%`, top: `${flip ? 100 - y : y}%` };
}

function PlayerMarker({ player, index, total, flip, tone }) {
  const pos = positionFor(player, index, total, flip);
  return (
    <div className="ft-lineup-player" style={pos} title={player?.player_name || player?.name || "Player"}>
      <div className={`ft-lineup-shirt ${tone || "home"}`}>
        {player?.shirt_number ?? player?.number ?? "•"}
      </div>
      <div className="ft-lineup-name">{shortName(player?.player_name || player?.name)}</div>
    </div>
  );
}

export default function FormationPitch({
  home = [],
  away = [],
  homeTeam = "Home",
  awayTeam = "Away",
  homeFormation,
  awayFormation,
  confirmed = false,
}) {
  const homeXI = home.filter((p) => p?.starter !== false).slice(0, 11);
  const awayXI = away.filter((p) => p?.starter !== false).slice(0, 11);
  if (!homeXI.length && !awayXI.length) return null;

  return (
    <section className="ft-lineup-wrap" aria-label="Match line-up formation">
      <div className="ft-lineup-head">
        <div><strong>{homeTeam}</strong><span>{homeFormation || "Formation —"}</span></div>
        <span className={`ft-lineup-status ${confirmed ? "confirmed" : "predicted"}`}>
          {confirmed ? "CONFIRMED" : "預計陣容"}
        </span>
        <div className="away"><strong>{awayTeam}</strong><span>{awayFormation || "Formation —"}</span></div>
      </div>

      <div className="ft-pitch">
        <div className="ft-pitch-half" />
        <div className="ft-pitch-circle" />
        <div className="ft-box top" />
        <div className="ft-box bottom" />
        {homeXI.map((p, i) => <PlayerMarker key={`h-${p?.player_key || p?.player_name || i}`} player={p} index={i} total={homeXI.length} flip={false} tone="home" />)}
        {awayXI.map((p, i) => <PlayerMarker key={`a-${p?.player_key || p?.player_name || i}`} player={p} index={i} total={awayXI.length} flip tone="away" />)}
      </div>

      <style jsx>{`
        .ft-lineup-wrap{margin:18px 0;border:1px solid #d9e3dc;border-radius:18px;background:#fff;padding:14px;overflow:hidden}
        .ft-lineup-head{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;margin-bottom:12px;font-size:14px}
        .ft-lineup-head>div{display:flex;flex-direction:column;gap:2px}.ft-lineup-head .away{text-align:right}.ft-lineup-head span{font-size:12px;color:#647067}
        .ft-lineup-status{padding:6px 9px;border-radius:999px;font-weight:800;letter-spacing:.03em}.ft-lineup-status.confirmed{background:#e4f5e9;color:#166534}.ft-lineup-status.predicted{background:#fff4d8;color:#8a5a00}
        .ft-pitch{position:relative;min-height:680px;border-radius:16px;overflow:hidden;background:linear-gradient(90deg,#3d8a51 0 12.5%,#438f56 12.5% 25%,#3d8a51 25% 37.5%,#438f56 37.5% 50%,#3d8a51 50% 62.5%,#438f56 62.5% 75%,#3d8a51 75% 87.5%,#438f56 87.5%);border:3px solid rgba(255,255,255,.92)}
        .ft-pitch:before{content:"";position:absolute;inset:2.5%;border:2px solid rgba(255,255,255,.75);pointer-events:none}.ft-pitch-half{position:absolute;left:2.5%;right:2.5%;top:50%;border-top:2px solid rgba(255,255,255,.75)}
        .ft-pitch-circle{position:absolute;width:110px;height:110px;border:2px solid rgba(255,255,255,.75);border-radius:50%;left:50%;top:50%;transform:translate(-50%,-50%)}
        .ft-box{position:absolute;left:25%;width:50%;height:15%;border:2px solid rgba(255,255,255,.75)}.ft-box.top{top:2.5%;border-top:0}.ft-box.bottom{bottom:2.5%;border-bottom:0}
        .ft-lineup-player{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;z-index:2;width:92px;text-align:center}
        .ft-lineup-shirt{width:36px;height:36px;border-radius:12px 12px 15px 15px;display:grid;place-items:center;font-weight:900;font-size:13px;box-shadow:0 2px 7px rgba(0,0,0,.28);border:2px solid rgba(255,255,255,.9)}.ft-lineup-shirt.home{background:#f7f7f7;color:#172019}.ft-lineup-shirt.away{background:#20262b;color:#fff}
        .ft-lineup-name{margin-top:4px;max-width:90px;padding:2px 5px;border-radius:5px;background:rgba(17,24,20,.78);color:#fff;font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 1px #000}
        @media(max-width:760px){.ft-lineup-wrap{padding:9px;border-radius:14px}.ft-pitch{min-height:600px}.ft-lineup-player{width:72px}.ft-lineup-name{max-width:70px;font-size:10px}.ft-lineup-shirt{width:31px;height:31px;font-size:11px}.ft-lineup-head{font-size:12px}.ft-lineup-status{font-size:10px}}
      `}</style>
    </section>
  );
}
