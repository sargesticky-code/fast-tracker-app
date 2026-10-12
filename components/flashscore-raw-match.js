"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchFlashscoreRawFeed } from "@/lib/flashscore-raw-feed";
import { fetchVerifiedMatch, matchObservation } from "@/lib/verified-evidence-feed";
import FormationPitch from "@/components/formation-pitch";
import FotMobPlayerInsights from "@/components/fotmob-player-insights";

function knownNumber(v, digits=0) {
  return v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(digits);
}
function percentDecimal(v) { return v==null ? "—" : knownNumber(Number(v)*100,1); }
function scoredPair(h,a) {
  return Number.isInteger(h) && Number.isInteger(a) ? h+"–"+a : null;
}
function PlayerStats({ data }) {
  const list=Array.isArray(data?.humanFactors?.playerMatchStats)
    ? data.humanFactors.playerMatchStats.filter(p=>p?.playerId&&p?.playerName)
    : [];
  if(!list.length)return null;
  const rated=list.filter(p=>p.rating!=null && Number.isFinite(Number(p.rating)))
    .sort((a,b)=>Number(b.rating)-Number(a.rating)).slice(0,5);
  const row=(p)=><div key={p.playerId} className="ft-stat-row">
    <b>{p.playerName}</b>
    <small>{p.teamName||"Team not supplied"} · Rating {knownNumber(p.rating,2)} · Shots {p.totalShots??"—"}
      {" · "}On target {p.shotsOnTarget??"—"} · Passes {p.accuratePasses??"—"}
      {p.passAttempts == null ? "" : "/"+p.passAttempts} · Goals {p.goals??"—"} · Assists {p.assists??"—"}</small>
  </div>;
  return <section className="ft-enriched-panel" data-testid="fotmob-player-stats">
    <h2>Match player performance · FotMob</h2>
    <p>Source observed: {data?.humanFactors?.playerMatchStatsMeta?.observedAt||"unknown"} · {list.length} player records.
       Official-XI joins use exact FotMob player IDs; unknown statistics remain blank.</p>
    {rated.length>0 && <div className="ft-stats-grid">{rated.map(row)}</div>}
    <details><summary>All {list.length} player records</summary><div className="ft-stats-grid">{list.map(row)}</div></details>
  </section>;
}

export default function FlashscoreRawMatch() {
  const searchParams=useSearchParams();
  const id=searchParams.get("id")||"";
  const [state,setState]=useState({status:"loading",match:null,analysis:null});
  const [selectedPlayer,setSelectedPlayer]=useState(null);
  const closePlayerProfile=useCallback(()=>setSelectedPlayer(null),[]);

  useEffect(()=>{
    setSelectedPlayer(null);
    let cancelled=false;
    const controller=new AbortController();
    Promise.allSettled([
      fetchFlashscoreRawFeed(controller.signal),
      fetchVerifiedMatch(id,controller.signal)
    ]).then(([raw,deep])=>{
      if(cancelled)return;
      const match=raw.status==="fulfilled"
        ? (raw.value.matches.find(row=>row.id===id)||null) : null;
      const analysis=deep.status==="fulfilled"?deep.value:null;
      const unavailable=raw.status==="rejected"&&deep.status==="rejected";
      setState({status:(match||analysis)?"ready":unavailable?"error":"missing",match,analysis});
    });
    return ()=>{cancelled=true;controller.abort();};
  },[id]);

  const match=state.match, analysis=state.analysis;
  if(state.status==="loading")return <main className="ft-home"><p>Loading fixture and verified analysis…</p></main>;
  if(state.status!=="ready")return <main className="ft-home ft-raw-detail">
    <h1>Fixture unavailable</h1><p>{state.status==="error"?"The data sources could not be read.":"This exact Flashscore event is absent from available records."}</p>
    <a href="/">Back to fixtures</a></main>;

  const fixture=analysis?.fixture||null;
  const forebet=analysis?.models?.forebet||null;
  const model=analysis?.models?.internal?.quality==="MODELED"?analysis.models.internal:null;
  const lineups=Array.isArray(analysis?.humanFactors?.lineup)?analysis.humanFactors.lineup:[];
  const lineupProvenance=analysis?.humanFactors?.lineupProvenance;
  const managers=Array.isArray(analysis?.humanFactors?.managers)?analysis.humanFactors.managers:[];
  const score=scoredPair(fixture?.score_home,fixture?.score_away);
  const observed=matchObservation(analysis?.flashscoreStats);
  const home=match?.home||fixture?.home_en||"Home unknown";
  const away=match?.away||fixture?.away_en||"Away unknown";
  const validXI=lineups.length===22 && lineupProvenance?.sourceConfirmed===true
    && lineups.filter(p=>p.team_side==="H").length===11 && lineups.filter(p=>p.team_side==="A").length===11;
  return <main className="ft-home ft-raw-detail">
    <a href="/">← All fixtures</a>
    <p>{match?.league||fixture?.tournament||"Football"} · Flashscore ID {id}</p>
    <h1>{home} vs {away}</h1>
    {match && <p>Raw source date: {match.sourceDate||"—"} · displayed time: {match.sourceTime||"not supplied"} · time zone unverified</p>}
    {fixture?.kickoff_hkt && <p>Canonical fixture kickoff: {fixture.kickoff_hkt}</p>}
    {score && <p className="ft-key-evidence"><b>Verified Flashscore score: {score}</b> · {fixture?.status||"status unknown"}</p>}

    {match && <section className="ft-enriched-panel">
      <h2>Bet365 H / D / A · prematch odds</h2>
      <p>Raw prices: {match.odds.home??"—"} / {match.odds.draw??"—"} / {match.odds.away??"—"}</p>
      {match.quoteStatus!=="FRESH" && <small>Odds unavailable</small>}
    </section>}

    {!analysis && <p role="status">Verified analysis unavailable. Raw fixture fields remain visible.</p>}
    {analysis && <section className="ft-enriched-panel" data-testid="verified-match-analysis">
      <h2>Verified predictions</h2>
      {forebet ? <div className="ft-stats-grid">
        <div><b>Forebet predicted score: {forebet.predicted_score||"—"}</b>
          <small>Average goals: {knownNumber(forebet.avg_goals,2)} · Captured {forebet.fetched_at||"unknown"}</small></div>
        <div><b>Forebet H / D / A</b>
          <small>{knownNumber(forebet.prob_home,1)}% / {knownNumber(forebet.prob_draw,1)}% / {knownNumber(forebet.prob_away,1)}%</small></div>
      </div>: <p>Forebet forecast unavailable for this exact canonical event.</p>}
      {forebet && [forebet.prob_over25,forebet.prob_under25].every(v=>v!=null && Number.isFinite(Number(v)))
        && Math.abs(Number(forebet.prob_over25)+Number(forebet.prob_under25)-100)<=2 && (
        <div className="ft-stats-grid" data-testid="forebet-goals-25">
          <div><b>Forebet Goals 2.5</b>
            <small>Over {knownNumber(forebet.prob_over25,0)}% · Under {knownNumber(forebet.prob_under25,0)}%</small>
          </div>
        </div>
      )}
      {forebet && [forebet.corner_prob_under95,forebet.corner_prob_over95].every(v=>v!=null && Number.isFinite(Number(v)))
        && Math.abs(Number(forebet.corner_prob_under95)+Number(forebet.corner_prob_over95)-100)<=2 && (
        <div className="ft-stats-grid" data-testid="forebet-corners-95">
          <div><b>Forebet Corners 9.5</b>
            <small>Under {knownNumber(forebet.corner_prob_under95,0)}% · Over {knownNumber(forebet.corner_prob_over95,0)}%
              {forebet.corner_predicted_score?" · Predicted "+forebet.corner_predicted_score:""}
              {forebet.avg_corners==null?"":" · Avg "+knownNumber(forebet.avg_corners,2)}
            </small>
          </div>
        </div>
      )}
      {model && <p>Qualified internal model (DC) · H {percentDecimal(model.dc_prob_home)}% /
        D {percentDecimal(model.dc_prob_draw)}% /
        A {percentDecimal(model.dc_prob_away)}% · {model.model_source||"Source unavailable"}</p>}
      {!model && <p>Internal model not verified for this match.</p>}
      <p>Goal-line and corner predictions are shown only when real source fields exist. Unknown values remain unknown.</p>
    </section>}

    {observed && <section className="ft-enriched-panel" data-testid="historical-flashscore-stats">
      <h2>Flashscore match observations</h2>
      <p>Recorded at {observed.capturedAt}. These values are from a historical source snapshot,
        <strong> not verified final totals or current live statistics</strong>.</p>
      <div className="ft-stats-grid">
        {[
          ["Shots","shots",0],["Shots on target","shotsOnTarget",0],
          ["Expected goals (xG)","xg",2],["Corners","corners",0],
          ["Possession","possession",0],["Big chances","bigChances",0],
        ].filter(([_,key])=>observed.stats[key]).map(([label,key,digits])=>
          <div key={key}><b>{label}</b><small>
            {home}: {knownNumber(observed.stats[key].home,digits)}{key==="possession"?"%":""}
            {" · "}
            {away}: {knownNumber(observed.stats[key].away,digits)}{key==="possession"?"%":""}
          </small></div>
        )}
      </div>
    </section>}

    {lineups.length>0 && <section className="ft-enriched-panel" data-testid="official-xi">
      <h2>{validXI ? "Official starting XI" : "Available source lineup"}</h2>
      <p>{lineupProvenance?.sourceConfirmed === true ? "Source-confirmed starters." : "Incomplete source lineup."}
        {lineupProvenance?.canonicalIdentitiesVerified === true ? " Canonical player identities verified." : " Player identities not fully canonicalized."}</p>
      <FormationPitch
        home={lineups.filter(p=>p.team_side==="H")}
        away={lineups.filter(p=>p.team_side==="A")}
        homeTeam={home}
        awayTeam={away}
        homeFormation={analysis?.humanFactors?.homeFormation || analysis?.humanFactors?.formation?.home || null}
        awayFormation={analysis?.humanFactors?.awayFormation || analysis?.humanFactors?.formation?.away || null}
        confirmed={validXI}
        onPlayerSelect={setSelectedPlayer}
      />
    </section>}
    {managers.length>0 && <section className="ft-enriched-panel">
      <h2>Manager evidence</h2>
      <div className="ft-stats-grid">{managers.map((m,i)=><div key={m.team_side||i}>
        <b>{m.team_side==="H"?"Home":"Away"} coach</b>
        <small>{m.evidence_value||m.manager_key||m.manager_name||"Unknown"} · {m.source_name||analysis?.humanFactors?.managerProvenance?.source||"Source unavailable"}</small>
      </div>)}</div>
    </section>}
    {selectedPlayer && <FotMobPlayerInsights
      player={selectedPlayer}
      stats={analysis?.humanFactors?.playerMatchStats}
      homeTeam={home} awayTeam={away}
      onClose={closePlayerProfile} />}
    {analysis && <PlayerStats data={analysis}/>}
    {match && <details><summary>Original Flashscore source fields</summary>
      <pre>{JSON.stringify({fixture:match.raw,quote:match.rawQuote},null,2)}</pre></details>}
  </main>;
}
