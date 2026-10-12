"use client";

import { useEffect, useRef } from "react";

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
    games: sample.length, appearances: appearances.length,
    minutes: sum("minutes", 130), goals: sum("goals", 20), assists: sum("assists", 20),
  };
}

function Metric({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return <div className="ft-player-metric"><small>{label}</small><b>{value}</b></div>;
}

function trustedProfile(player) {
  const p=player?.fotmob_profile;
  if (player?.source_name !== "FOTMOB_OFFICIAL" || player?.confirmed !== true ||
      player?.starter !== true || !p ||
      !/^\d{3,12}$/.test(String(p.fotmobId || "")) ||
      String(p.fotmobId) !== String(player.player_key)) return null;
  return p;
}

// The pitch invokes this drawer with its exact lineup row. It never fetches a
// player separately and never joins FotMob to Flashscore by a similar name.
export default function FotMobPlayerInsights({ player = null, stats = [], homeTeam = "Home", awayTeam = "Away", onClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!player) return;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function handleKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      } else if (event.key === "Tab" && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll(
          "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"
        )].filter(node => node.getClientRects().length);
        if (!focusable.length) return;
        const first=focusable[0], last=focusable[focusable.length-1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [player, onClose]);

  if (!player) return null;

  const profile=trustedProfile(player);
  const side=player.team_side === "H" ? homeTeam : player.team_side === "A" ? awayTeam : "Unknown team";
  const id=profile ? String(profile.fotmobId) : null;
  const current=id && Array.isArray(stats) ? stats.find(row => String(row?.playerId ?? "")===id) : null;
  const recent=summaryOfRecent(profile?.recentMatches);
  const formatMetric=(value,decimals=0,max=200) => {
    const n=finite(value,0,max);
    return n === null ? null : n.toFixed(decimals);
  };
  const snapshot=profile?.updatedAt && Number.isFinite(Date.parse(profile.updatedAt))
    ? new Date(profile.updatedAt).toISOString().slice(0,10) : null;
  const name=String(player.player_name || player.canonical_player_name || "Unknown player");

  return <div className="ft-player-overlay" data-testid="player-profile-overlay">
    <button type="button" tabIndex={-1} className="ft-player-backdrop" aria-label="Close player panel" onClick={onClose} />
    <aside ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="ft-player-drawer-title"
      className="ft-player-drawer" data-testid="player-profile-drawer">
      <div className="ft-player-drawer-head">
        <div>
          <small>Player profile · {side}</small>
          <h2 id="ft-player-drawer-title">{name}</h2>
          <span className="ft-player-source">{profile ? "FotMob verified player ID" : (player.source_name || "Lineup source")}</span>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} className="ft-player-drawer-close" aria-label="Close player profile">×</button>
      </div>
      <div className="ft-player-drawer-scroll" data-testid="fotmob-selected-player">
        <div className="ft-player-metrics">
          <Metric label="Shirt number" value={player.shirt_number}/>
          <Metric label="Position" value={profile?.position || player.role}/>
          {profile && <>
            <Metric label="Country" value={profile.nationality}/>
            <Metric label="Age (snapshot)" value={formatMetric(profile.age,0,55)}/>
            <Metric label="Height" value={profile.height}/>
          </>}
        </div>
        {profile ? <>
          {recent && <section className="ft-player-drawer-section">
            <h3>Stored recent-match sample <small>({recent.games} records)</small></h3>
            <div className="ft-player-metrics">
              <Metric label="Appearances with minutes" value={recent.appearances}/>
              <Metric label="Minutes" value={recent.minutes}/>
              <Metric label="Goals" value={recent.goals}/>
              <Metric label="Assists" value={recent.assists}/>
            </div>
            <p>Available stored records, not season totals or verified last-five form. Match dates and opponent identities may be missing.</p>
          </section>}
          {current && <section className="ft-player-drawer-section">
            <h3>Match performance · FotMob</h3>
            <div className="ft-player-metrics">
              <Metric label="Rating" value={formatMetric(current.rating,2,10)}/>
              <Metric label="Shots" value={formatMetric(current.totalShots,0,30)}/>
              <Metric label="On target" value={formatMetric(current.shotsOnTarget,0,30)}/>
              <Metric label="Goals" value={formatMetric(current.goals,0,20)}/>
              <Metric label="Assists" value={formatMetric(current.assists,0,20)}/>
              <Metric label="Accurate passes" value={formatMetric(current.accuratePasses,0,300)}/>
            </div>
          </section>}
          {snapshot && <p className="ft-player-asof">Saved profile updated {snapshot}; details may have changed since then.</p>}
          <a className="ft-player-fotmob-link" href={"https://www.fotmob.com/players/"+id}
            target="_blank" rel="noopener noreferrer">View full profile on FotMob ↗</a>
        </> : <p className="ft-player-no-profile" data-testid="fotmob-profile-unavailable">
          FotMob profile not linked for this player. Only source-backed lineup details are shown.
        </p>}
      </div>
    </aside>
  </div>;
}
