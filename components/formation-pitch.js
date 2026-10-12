"use client";

import React from "react";

// The detail API exposes verified XI identities but does not guarantee pitch slots.
// Plot only explicit source slots. Never infer positions from shirt number, array
// order, player name, or a formation label.
function sourcePosition(player) {
  // FotMob's stored normalized coordinates are source-supplied, not inferred.
  // FotMob x and Flashscore grid columns run from player right to player left.
// The pitch shows goalkeeper at the bottom and attackers at the top, so mirror
// that source horizontal axis: right backs/wingers RIGHT; left backs/wingers LEFT.
  const x = player?.position_x, y = player?.position_y;
  if (typeof x === "number" && typeof y === "number" &&
      Number.isFinite(x) && Number.isFinite(y) &&
      x >= 0 && x <= 1 && y >= 0 && y <= 1) {
    return { left: (94 - 88 * x) + "%", top: (94 - 88 * y) + "%" };
  }
  // Flashscore provides a verified positional grid instead of coordinates.
  const slots = [
    player?.formation_slot, player?.grid, player?.slot,
    player?.raw?.formation_slot, player?.raw?.grid, player?.raw?.slot
  ];
  for (const value of slots) {
    const match = String(value ?? "").trim().match(/^([1-5])\s*[:.-]\s*([1-5])$/);
    if (!match) continue;
    const row = Number(match[1]), column = Number(match[2]);
    return { left: (90 - (column - 1) * 20) + "%", top: (90 - (row - 1) * 20) + "%" };
  }
  return null;
}

function starters(rows) {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).filter((player) => {
    if (!player || player.starter === false) return false;
    const key = player.player_key || player.canonical_player_key
      || (String(player.player_name || player.name || "") + "/" + String(player.shirt_number ?? ""));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 11);
}

function PlayerToken({ player, onPitch = false, position, onPlayerSelect }) {
  const name = String(player.player_name || player.name || "Unknown player");
  const number = player.shirt_number ?? player.number ?? "·";
  const className = onPitch ? "ft-xi-marker" : "ft-xi-roster-player";
  const contents = <>
    <b className="ft-xi-shirt">{number}</b>
    <span className="ft-xi-player-name">{name}</span>
  </>;
  return onPlayerSelect
    ? <button type="button" className={className+" ft-xi-player-action"}
        style={onPitch ? position : undefined}
        aria-label={"View player profile: "+name}
        onClick={() => onPlayerSelect(player)}>{contents}</button>
    : <div className={className} style={onPitch ? position : undefined} title={name}>
        {contents}
      </div>;
}

function SidePitch({ team, rows, tone, formation, onPlayerSelect }) {
  const players = starters(rows);
  const positioned = players.map((player) => ({ player, position: sourcePosition(player) }));
  const onPitch = positioned.filter((item) => item.position);
  const unplaced = positioned.filter((item) => !item.position);
  return <div className={"ft-xi-side ft-xi-side-" + tone}>
    <div className="ft-xi-side-head">
      <strong>{team}</strong>
      <span>{players.length}/11 starters · {(formation || players.find(p => p.formation)?.formation) ? "Formation " + (formation || players.find(p => p.formation)?.formation) : "Formation unavailable"}</span>
    </div>
    <div className="ft-xi-pitch" role="group" aria-label={team + " football pitch with " + onPitch.length + " source-positioned players"}>
      <div className="ft-xi-pitch-midline" />
      <div className="ft-xi-pitch-circle" />
      <div className="ft-xi-box ft-xi-box-top" />
      <div className="ft-xi-box ft-xi-box-bottom" />
      {onPitch.map(({player, position}, index) =>
        <PlayerToken key={player.player_key || player.player_name || index} player={player} onPitch position={position} onPlayerSelect={onPlayerSelect} />
      )}
      {!onPitch.length && <div className="ft-xi-empty-pitch">Player positions not supplied</div>}
    </div>
    {unplaced.length > 0 && <div className="ft-xi-unpositioned">
      <small>Starting XI · source positions unavailable for {unplaced.length} player{unplaced.length === 1 ? "" : "s"}</small>
      <div className="ft-xi-roster">
        {unplaced.map(({player},index) =>
          <PlayerToken key={player.player_key || player.player_name || index} player={player} onPlayerSelect={onPlayerSelect} />
        )}
      </div>
    </div>}
    {!players.length && <p className="ft-xi-empty-roster">No source-backed starters available.</p>}
  </div>;
}

export default function FormationPitch({
  home = [], away = [], homeTeam = "Home", awayTeam = "Away",
  homeFormation = null, awayFormation = null, confirmed = false, onPlayerSelect = null
}) {
  if (!home.length && !away.length) return null;
  return <div className="ft-xi-board" data-testid="official-xi-pitch">
    <div className="ft-xi-board-head">
      <strong>Starting XI · pitch view</strong>
      <span>{confirmed ? "SOURCE-CONFIRMED 11v11" : "PARTIAL SOURCE LINEUP"}</span>
    </div>
    <div className="ft-xi-pitch-columns">
      <SidePitch team={homeTeam} rows={home} tone="home" formation={homeFormation} onPlayerSelect={onPlayerSelect} />
      <SidePitch team={awayTeam} rows={away} tone="away" formation={awayFormation} onPlayerSelect={onPlayerSelect} />
    </div>
  </div>;
}
