"use client";

import { useState } from "react";

function finite(value, min = -Infinity, max = Infinity) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function summaryOfRecent(rows) {
  const sample = Array.isArray(rows) ? rows.slice(0, 5) : [];
  if (!sample.length) return null;
  const appearances = sample.filter(row => finite(row?.minutes, 0, 130) !== null && Number(row.minutes) > 0);
  const sum = (field, max) => {
    const found = sample.map(row => finite(row?.[field], 0, max)).filter(v => v !== null);
    return found.length === sample.length ? found.reduce((a, b) => a + b, 0) : null;
  };
  return {
    games: sample.length,
    appearances: appearances.length,
    minutes: sum("minutes", 130),
    goals: sum("goals", 20),
    assists: sum("assists", 20),
  };
}

function Metric({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return <div className="ft-player-metric"><small>{label}</small><b>{value}</b></div>;
}

export default function FotMobPlayerInsights({ lineup = [], stats = [], homeTeam = "Home", awayTeam = "Away" }) {
  // Deliberately match on exact FotMob IDs. Flashscore-only players cannot be
  // attached to FotMob records merely because their names look similar.
  const available = lineup.filter(row => row?.source_name === "FOTMOB_OFFICIAL" &&
    row?.confirmed === true && row?.starter === true &&
    row?.fotmob_profile && /^\d{3,12}$/.test(String(row.fotmob_profile.fotmobId || "")) &&
    String(row.fotmob_profile.fotmobId) === String(row.player_key));
  const [selectedId, setSelectedId] = useState(null);
  if (!available.length) return null;

  const selected = available.find(p => String(p.player_key) === selectedId) || available[0];
  const profile = selected.fotmob_profile;
  const current = (Array.isArray(stats) ? stats : []).find(row =>
    String(row?.playerId ?? "") === String(profile.fotmobId));
  const recent = summaryOfRecent(profile.recentMatches);
  const formatMetric = (value, decimals=0, max=200) => {
    const n=finite(value,0,max);
    return n === null ? null : n.toFixed(decimals);
  };
  const footId = String(profile.fotmobId);
  const snapshot = profile.updatedAt && !Number.isNaN(Date.parse(profile.updatedAt))
    ? new Date(profile.updatedAt).toISOString().slice(0, 10) : null;

  return <section className="ft-enriched-panel ft-player-insights" data-testid="fotmob-player-insights">
    <h2>FotMob player insights</h2>
    <p>Select an official starter to see saved FotMob biography and recorded performance. No additional live player requests.</p>
    <div className="ft-player-insights-body">
      <div className="ft-player-picker" aria-label="FotMob official starters">
        {["H","A"].map(side => <div className="ft-player-team" key={side}>
          <b>{side === "H" ? homeTeam : awayTeam}</b>
          <div className="ft-player-buttons">
            {available.filter(row => row.team_side === side).map(row =>
              <button type="button" className="ft-player-select" key={row.player_key}
                aria-pressed={String(row.player_key) === String(selected.player_key)}
                onClick={() => setSelectedId(String(row.player_key))}>
                <span>{row.shirt_number ?? "·"}</span>{row.player_name}
              </button>)}
          </div>
        </div>)}
      </div>
      <article className="ft-player-insight-detail" data-testid="fotmob-selected-player">
        <div className="ft-player-detail-heading">
          <div><h3>{selected.player_name}</h3>
            <small>{selected.team_side === "H" ? homeTeam : awayTeam} · Source: FotMob official XI</small>
          </div>
          <a href={"https://www.fotmob.com/players/"+footId} target="_blank"
             rel="noopener noreferrer">FotMob profile ↗</a>
        </div>
        <div className="ft-player-metrics">
          <Metric label="Position" value={profile.position}/>
          <Metric label="Country" value={profile.nationality}/>
          <Metric label="Age (snapshot)" value={formatMetric(profile.age,0,55)}/>
          <Metric label="Height" value={profile.height}/>
        </div>
        {recent && <>
          <h4>Stored recent-match sample <small>({recent.games} records, dates not guaranteed)</small></h4>
          <div className="ft-player-metrics">
            <Metric label="Appearances with minutes" value={recent.appearances}/>
            <Metric label="Minutes" value={recent.minutes}/>
            <Metric label="Goals" value={recent.goals}/>
            <Metric label="Assists" value={recent.assists}/>
          </div>
          <small>These are the available stored records, not season totals, per-90 rates or verified last-five form.</small>
        </>}
        {current && <>
          <h4>Match performance · FotMob</h4>
          <div className="ft-player-metrics">
            <Metric label="Rating" value={formatMetric(current.rating,2,10)}/>
            <Metric label="Shots" value={formatMetric(current.totalShots,0,30)}/>
            <Metric label="On target" value={formatMetric(current.shotsOnTarget,0,30)}/>
            <Metric label="Goals" value={formatMetric(current.goals,0,20)}/>
            <Metric label="Assists" value={formatMetric(current.assists,0,20)}/>
            <Metric label="Accurate passes" value={formatMetric(current.accuratePasses,0,300)}/>
          </div>
        </>}
        {snapshot && <small className="ft-player-asof">Saved profile updated {snapshot}. Older snapshots may not reflect current transfers or injuries.</small>}
      </article>
    </div>
  </section>;
}
