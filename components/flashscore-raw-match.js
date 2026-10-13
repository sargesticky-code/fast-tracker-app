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
function priceTriplet(source) {
  if(!source || typeof source!=="object") return null;
  const values=["home","draw","away"].map(key=>source[key]);
  if(values.some(v=>v===null||v===undefined||v===""||!Number.isFinite(Number(v))
    ||Number(v)<1.01||Number(v)>100)) return null;
  return values.map(v=>Number(v));
}
function ukDate(value) {
  const timestamp=Date.parse(String(value||""));
  if(!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat("en-GB",{
    timeZone:"Europe/London",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).format(new Date(timestamp))+" UK";
}
function OddsPanel({match,fixture}) {
  if(!match && !fixture)return null;
  const now=Date.now();
  const kickoff=Date.parse(String(fixture?.kickoff_hkt||""));
  const future=Number.isFinite(kickoff)&&kickoff>now;
  const recorded=match?.rawQuote?.provider_event_id===match?.providerEventId
    ?priceTriplet(match.rawQuote?.hda):null;
  const rawTime=Date.parse(String(match?.rawQuote?.captured_at||match?.oddsCapturedAt||""));
  const validRawTime=Number.isFinite(rawTime)&&rawTime<=now+60_000
    &&rawTime>=now-7*86400_000;
  const rawCurrent=Boolean(future&&match?.quoteStatus==="FRESH"
    &&validRawTime&&rawTime>=now-20*60_000&&rawTime<kickoff
    &&priceTriplet(match?.odds));
  // The exact-match detail RPC already returns qualified canonical odds.
  // Do not require an extra HTTP request or substitute similarly named teams.
  const canonical=fixture?.bookmaker_source==="FLASHSCORE_BET365"
    ?priceTriplet({home:fixture.had_home,draw:fixture.had_draw,away:fixture.had_away})
    :null;
  const canonTime=Date.parse(String(fixture?.odds_updated_at||""));
  const canonCurrent=Boolean(future&&canonical&&Number.isFinite(canonTime)
    &&canonTime>=now-20*60_000&&canonTime<=now+60_000&&canonTime<kickoff);
  const selectCanonical=canonCurrent&&(!rawCurrent||canonTime>rawTime);
  const showFresh=canonCurrent||rawCurrent;
  const prices=selectCanonical?canonical:rawCurrent?priceTriplet(match?.odds):validRawTime?recorded:null;
  const captured=selectCanonical?fixture.odds_updated_at:match?.rawQuote?.captured_at||match?.oddsCapturedAt||null;
  const opening=prices&&recorded&&!selectCanonical?priceTriplet({
    home:match?.rawQuote?.hda?.opening_home,
    draw:match?.rawQuote?.hda?.opening_draw,
    away:match?.rawQuote?.hda?.opening_away
  }):null;
  return <section className="ft-enriched-panel ft-match-odds" data-testid="match-odds">
    <div className="ft-panel-title-row"><h2>{showFresh?"Recent prematch odds":prices?"Previous odds":"Match odds"}</h2>
      <span className="ft-panel-source">{prices?"Bet365-labelled snapshot":""}</span>
    </div>
    {prices ? <>
      <div className="ft-match-prices" aria-label="Stored home, draw and away prices">
        {["Home","Draw","Away"].map((label,i)=><div key={label} className="ft-match-price">
          <small>{label}</small><strong>{prices[i].toFixed(2)}</strong>
          {opening && <span>Opened {opening[i].toFixed(2)}</span>}
        </div>)}
      </div>
      <p className="ft-odds-note">{showFresh?"Recent prematch quote":"Recorded earlier · not live"}
        {captured?" · "+(ukDate(captured)||""):""}</p>
    </>:<p className="ft-odds-note" data-testid="odds-missing">No recorded odds available for this match.</p>}
  </section>;
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
    <p>{list.length} recorded player performances</p>
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
    <p className="ft-match-competition">{String(match?.league||fixture?.tournament||"Football").replace(/:\s*(?:Live Standings|Standings|Draw|Results)$/i,"")}</p>
    <h1>{home} vs {away}</h1>
    <p className="ft-match-when">{ukDate(fixture?.kickoff_hkt) || "Kickoff time unavailable"}
      {score && <strong> · {score}</strong>}</p>

    <OddsPanel match={match} fixture={fixture}/>

    {!analysis && <p role="status">More match details are not available yet.</p>}
    {analysis && <section className="ft-enriched-panel" data-testid="verified-match-analysis">
      <h2>Match predictions</h2>
      {forebet ? <div className="ft-stats-grid">
        <div><b>Forebet predicted score: {forebet.predicted_score||"—"}</b>
          <small>Average goals: {knownNumber(forebet.avg_goals,2)}</small></div>
        <div><b>Forebet H / D / A</b>
          <small>{knownNumber(forebet.prob_home,1)}% / {knownNumber(forebet.prob_draw,1)}% / {knownNumber(forebet.prob_away,1)}%</small></div>
      </div>: null}
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
      {!forebet && !model && <p data-testid="prediction-unavailable">No prediction for this match yet.</p>}
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
      <p>{validXI?"Tap any player for their profile.":"Available players are shown below."}</p>
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
    {managers.some(m=>m.team_side==="H"||m.team_side==="A") && <section className="ft-enriched-panel" data-testid="match-coaches">
      <h2>Coaches</h2>
      <div className="ft-coach-grid">
        {["H","A"].map(side=>{
          const coach=managers.find(m=>m.team_side===side &&
            (m.evidence_value||m.manager_name||m.manager_key));
          return coach?<div key={side} className={"ft-coach-card "+(side==="H"?"ft-coach-home":"ft-coach-away")}>
            <small>{side==="H"?"Home":"Away"} coach</small>
            <strong>{coach.evidence_value||coach.manager_name||coach.manager_key}</strong>
            <span>{side==="H"?home:away}</span>
          </div>:null;
        })}
      </div>
    </section>}
    {selectedPlayer && <FotMobPlayerInsights
      player={selectedPlayer}
      stats={analysis?.humanFactors?.playerMatchStats}
      homeTeam={home} awayTeam={away}
      onClose={closePlayerProfile} />}
    {analysis && <PlayerStats data={analysis}/>}
  </main>;
}
