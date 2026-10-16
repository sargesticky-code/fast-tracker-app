"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchFlashscoreRawFeed } from "@/lib/flashscore-raw-feed";
import { fetchVerifiedMatch, matchObservation, currentExternalAdvisers, adviserPercentValue } from "@/lib/verified-evidence-feed";
import FormationPitch from "@/components/formation-pitch";
import FotMobPlayerInsights from "@/components/fotmob-player-insights";
import { fetchExternalProvisional } from "@/lib/external-adviser-provisional-feed";

function knownNumber(v, digits=0) {
  return v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(digits);
}
function percentDecimal(v) { return v==null ? "—" : knownNumber(Number(v)*100,1); }
function scoredPair(h,a) {
  return Number.isInteger(h) && Number.isInteger(a) ? h+"–"+a : null;
}
function MatchContext({analysis,home,away}) {
  const claims=Array.isArray(analysis?.humanFactors?.playerStatus)
    ?analysis.humanFactors.playerStatus.filter(row=>
      (row?.team_side==="H"||row?.team_side==="A")
      &&typeof row?.status_type==="string"&&row.status_type.trim()
      &&typeof row?.status_value==="string"&&row.status_value.trim())
    :[];
  const h2h=analysis?.h2h;
  const games=h2h?.h2h_games;
  const homeWins=h2h?.home_wins,draws=h2h?.draws,awayWins=h2h?.away_wins;
  const validH2H=h2h?.status==="OK"&&Number.isInteger(games)&&games>0;
  const validRecord=[homeWins,draws,awayWins].every(v=>Number.isInteger(v)&&v>=0)
    &&homeWins+draws+awayWins===games;
  const homeGoals=h2h?.home_goals,awayGoals=h2h?.away_goals;
  const validGoals=Number.isInteger(homeGoals)&&homeGoals>=0&&Number.isInteger(awayGoals)&&awayGoals>=0;
  const avg=h2h?.avg_total_goals;
  const validAverage=typeof avg==="number"&&Number.isFinite(avg)&&avg>=0&&avg<=20;
  const recent=typeof h2h?.last5==="string"&&/^[WDL]{1,5}$/.test(h2h.last5)?h2h.last5:null;
  if(!claims.length&&!validH2H)return null;
  return <>
    {claims.length>0&&<section className="ft-enriched-panel" data-testid="player-status-evidence">
      <h2>Player availability evidence</h2>
      <p>Match-linked source claims. Confirmation and player identity are shown as recorded.</p>
      <div className="ft-stats-grid">{claims.map((row,index)=>{
        const side=row.team_side==="H"?"Home":"Away";
        const status=String(row.status_type).trim()+": "+String(row.status_value).trim();
        const fact=row.fact_status==="CONFIRMED"?"Confirmed and canonically matched"
          :row.fact_status==="SOURCE_CONFIRMED_IDENTITY_UNRESOLVED"?"Source-confirmed · identity unresolved"
          :row.confirmed===true?"Source-confirmed · identity not verified":"Unconfirmed source claim";
        return <div className="ft-stat-row" key={row.evidence_key||index}>
          <b>{row.player_name||"Player identity unavailable"} · {side}</b>
          <small>{home} vs {away} · {status} · {fact}</small>
        </div>;
      })}</div>
    </section>}
    {validH2H&&<section className="ft-enriched-panel" data-testid="verified-h2h">
      <h2>Previous meetings</h2>
      <p>Verified results history · {games} meetings for {home} vs {away}.</p>
      {validRecord&&<p>{home} wins {homeWins} · Draws {draws} · {away} wins {awayWins}</p>}
      {validGoals&&<p>Goals: {home} {homeGoals} · {away} {awayGoals}</p>}
      {validAverage&&<p>Average total goals: {avg.toFixed(1)}</p>}
      {recent&&<p>Recent results, newest first: {recent.split("").join(" · ")}</p>}
    </section>}
  </>;
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
function verifiedInternalForecast(model, fixture, now=Date.now()) {
  if (model?.quality!=="MODELED" || !fixture) return null;
  const kickoff=Date.parse(String(fixture.kickoff_hkt||""));
  const captured=Date.parse(String(model.fetched_at||""));
  if(!Number.isFinite(kickoff)||kickoff<=now||!Number.isFinite(captured)
    ||captured>now+60000||captured>=kickoff||captured<now-72*3600000) return null;
  // Only accept exact approved result-history provenance. Old, retired
  // provider labels or unknown model sources never become current advice.
  if(String(model.model_source||"")!=="VERIFIED_RESULTS_HISTORY")return null;
  const probs=[model.dc_prob_home,model.dc_prob_draw,model.dc_prob_away];
  if(probs.some(p=>p===null||p===undefined||!Number.isFinite(Number(p))
    ||Number(p)<0||Number(p)>1))return null;
  const sum=probs.reduce((a,b)=>a+Number(b),0);
  return sum>=0.98&&sum<=1.02 ? model : null;
}
function recentPrediction(record, fixture, now=Date.now()){
  const time=Date.parse(String(record?.fetched_at||""));
  const kickoff=Date.parse(String(fixture?.kickoff_hkt||""));
  return Number.isFinite(time)&&Number.isFinite(kickoff)&&kickoff>now
    &&time<=now+60000&&time<kickoff&&time>=now-72*3600000;
}
function OddsPanel({match,fixture}) {
  if(!match && !fixture)return null;
  const now=Date.now();
  const kickoff=Date.parse(String(fixture?.kickoff_hkt||""));
  const future=Number.isFinite(kickoff)&&kickoff>now;
  const recorded=Boolean(match) && match.rawQuote?.provider_event_id===match.providerEventId
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
    </>:<p className="ft-odds-note" data-testid="odds-missing">{match?.quoteStatus==="STALE"?"Stale odds are unavailable for this match.":match?.quoteStatus==="INVALID"?"Invalid bookmaker prices were suppressed.":"No recorded odds available for this match."}</p>}
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
  const [tentative,setTentative]=useState([]);
  const closePlayerProfile=useCallback(()=>setSelectedPlayer(null),[]);

  useEffect(()=>{
    setSelectedPlayer(null);
    let cancelled=false;
    let inFlight=false;
    let controller=null;
    const refresh=async()=>{
      if(cancelled||inFlight||document.visibilityState==="hidden")return;
      inFlight=true;
      controller=new AbortController();
      const [raw,deep]=await Promise.allSettled([
        fetchFlashscoreRawFeed(controller.signal),
        fetchVerifiedMatch(id,controller.signal)
      ]);
      if(!cancelled){
        const match=raw.status==="fulfilled"
          ? (raw.value.matches.find(row=>row.id===id)||null) : null;
        const analysis=deep.status==="fulfilled"?deep.value:null;
        const unavailable=raw.status==="rejected"&&deep.status==="rejected";
        setState(previous=>{
          const nextMatch=match||previous.match;
          const nextAnalysis=analysis||previous.analysis;
          return {
            status:(nextMatch||nextAnalysis)?"ready":unavailable?"error":"missing",
            match:nextMatch,
            analysis:nextAnalysis,
            checkedAt:new Date().toISOString()
          };
        });
      }
      inFlight=false;
    };
    void refresh();
    const timer=setInterval(()=>void refresh(),60_000);
    return ()=>{cancelled=true;clearInterval(timer);controller?.abort();};
  },[id]);

  useEffect(()=>{
    setTentative([]);
    if(!/^FS:[A-Za-z0-9_-]{5,32}$/.test(id))return;
    let cancelled=false,inFlight=false;
    const controller=new AbortController();
    const refresh=async()=>{
      if(cancelled||inFlight||document.visibilityState==="hidden")return;
      inFlight=true;
      try {
        const map=await fetchExternalProvisional(controller.signal);
        if(!cancelled)setTentative(map.get(id)||[]);
      } catch {
        if(!cancelled)setTentative([]);
      } finally {inFlight=false;}
    };
    void refresh();
    const timer=setInterval(()=>void refresh(),300_000);
    return ()=>{cancelled=true;controller.abort();clearInterval(timer);};
  },[id]);

  const match=state.match, analysis=state.analysis;
  if(state.status==="loading")return <main className="ft-home"><p>Loading fixture and verified analysis…</p></main>;
  if(state.status!=="ready")return <main className="ft-home ft-raw-detail">
    <h1>Fixture unavailable</h1><p>{state.status==="error"?"The data sources could not be read.":"This exact Flashscore event is absent from available records."}</p>
    <a href="/">Back to fixtures</a></main>;

  const fixture=analysis?.fixture||null;
  const external=currentExternalAdvisers({id,kickoff:fixture?.kickoff_hkt,externalAdvisers:analysis?.externalAdvisers});
  const unmatchedTentative=tentative.filter(x=>!external.some(y=>y.provider===x.provider));
  const forebet=analysis?.models?.forebet||null;
  const model=verifiedInternalForecast(analysis?.models?.internal,fixture);
  const forebetRecent=recentPrediction(forebet,fixture);
  const lineups=Array.isArray(analysis?.humanFactors?.lineup)?analysis.humanFactors.lineup:[];
  const lineupProvenance=analysis?.humanFactors?.lineupProvenance;
  const managers=Array.isArray(analysis?.humanFactors?.managers)?analysis.humanFactors.managers:[];
  const score=scoredPair(fixture?.score_home,fixture?.score_away);
  const observed=matchObservation(analysis?.flashscoreStats);
  const home=match?.home||fixture?.home_en||"Home unknown";
  const away=match?.away||fixture?.away_en||"Away unknown";
  const validXI=lineups.length===22 && lineupProvenance?.sourceConfirmed===true
    && lineups.filter(p=>p.team_side==="H").length===11 && lineups.filter(p=>p.team_side==="A").length===11;
  const predictedXI=lineupProvenance?.predicted===true
    ||lineupProvenance?.status==="PREDICTED"
    ||lineups.some(player=>player?.predicted===true);
  return <main className="ft-home ft-raw-detail">
    <a href="/">← All fixtures</a>
    <p className="ft-match-competition">{String(match?.league||fixture?.tournament||"Football").replace(/:\s*(?:Live Standings|Standings|Draw|Results)$/i,"")}</p>
    <h1>{home} vs {away}</h1>
    <p className="ft-match-when">{ukDate(fixture?.kickoff_hkt) || "Kickoff time unavailable"}
      {score && <strong> · {fixture?.status==="FINISHED"?"Final score":"Actual score"} {score}</strong>}</p>
    {state.checkedAt&&<small role="status">Checked {new Date(state.checkedAt).toLocaleTimeString("en-HK",{timeZone:"Asia/Hong_Kong",hour:"2-digit",minute:"2-digit",second:"2-digit"})} HKT · refreshes every minute while this page is open</small>}

    <OddsPanel match={match} fixture={fixture}/>

    {!analysis && <p role="status">More match details are not available yet.</p>}
    {(analysis || unmatchedTentative.length>0) && <section className="ft-enriched-panel" data-testid="verified-match-analysis">
      <h2>Match predictions</h2>
      <div className="ft-advisor-card-grid" data-testid="advisor-source-status">
        <div className="ft-advisor-card" data-testid="advisor-forebet">
          <strong>◇ Forebet</strong>
          <span className={"ft-advisor-state"+(forebetRecent?" ft-advisor-state-ready":"")}>{forebetRecent?"Verified forecast":forebet?"Saved forecast · not current":"No matched forecast"}</span>
          <small>1X2, predicted score, goals and corners only if supplied</small>
        </div>
        <div className="ft-advisor-card" data-testid="advisor-dc">
          <strong>◈ Dixon–Coles</strong>
          <span className={"ft-advisor-state"+(model?" ft-advisor-state-ready":"")}>{model?"Verified model":"No current qualified model"}</span>
          <small>Internal results-based probability model; separate from Forebet</small>
        </div>
        <div className="ft-advisor-card" data-testid="advisor-form">
          <strong>○ Team Form</strong><span className="ft-advisor-state">Legacy model inactive</span>
          <small>Old predictions excluded until rebuilt from approved match results</small>
        </div>
        {["BETCLAN","SPORTYTRADER"].map(provider=>{
          const a=external.find(x=>x.provider===provider),name=provider==="BETCLAN"?"BetClan":"SportyTrader";
          return <div className="ft-advisor-card" data-testid={"advisor-"+provider.toLowerCase()} key={provider}>
            <strong>○ {name}</strong><span className="ft-advisor-state">{a?"Verified forecast":"No current matched forecast"}</span>
            {a?.hda&&<small>H / D / A: {[a.hda.home,a.hda.draw,a.hda.away].map(v=>adviserPercentValue(v)+"%").join(" / ")}</small>}
            {a?.predictedScore&&<small>Predicted score: {a.predictedScore}</small>}
            {a&&a.over25!==null&&<small>Over 2.5: {adviserPercentValue(a.over25)}%</small>}
            {a&&a.bttsYes!==null&&<small>BTTS Yes: {adviserPercentValue(a.bttsYes)}%</small>}
            {a?.tip&&<small>Source tip: {a.tip}</small>}
            {a&&<small><a href={a.sourceUrl} target="_blank" rel="noopener noreferrer">Source prediction</a> · Captured {new Date(a.capturedAt).toISOString()}</small>}
          </div>;
        })}
        {unmatchedTentative.map(a=><div className="ft-advisor-card"
          data-testid={"advisor-"+a.provider.toLowerCase()+"-provisional"} key={a.provider+"-provisional"}>
          <strong>◇ {({BETCLAN:"BetClan",SPORTYTRADER:"SportyTrader",PRIMATIPS:"PrimaTips",STATAREA:"Statarea"})[a.provider]||a.provider}</strong>
          <span className="ft-advisor-state">PROVISIONAL · NOT VERIFIED</span>
          {a.hda&&<small>Source H / D / A: {[a.hda.home,a.hda.draw,a.hda.away].map(x=>adviserPercentValue(x)+"%").join(" / ")}</small>}
          {a.score&&<small>Source predicted score: {a.score}</small>}
          {a.over25!==null&&<small>Over 2.5: {adviserPercentValue(a.over25)}%</small>}
          {a.bttsYes!==null&&<small>BTTS Yes: {adviserPercentValue(a.bttsYes)}%</small>}
          <small>{a.clockEvidence==="CALIBRATED_FROM_DAY_COHORT_NOT_SOURCE_VERIFIED"
            ?"Source clock inferred from "+a.clockCalibrationSamples+" high-confidence fixtures. Source timezone NOT verified."
            :"Source date and kickoff match."} 0.4 team threshold, unique fixture. Revoked when source evidence conflicts.</small>
          <small><a href={a.sourceUrl} target="_blank" rel="noopener noreferrer">Original source</a></small>
        </div>)}

      </div>
      {forebet && <p className="ft-odds-note">{forebetRecent?"Verified prematch source forecast":"Saved Forebet record · not a current betting recommendation"}</p>}
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
      {!forebet && !model && external.length===0 && unmatchedTentative.length===0 &&
        <p data-testid="prediction-unavailable">No prediction for this match yet.</p>}
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
      <h2>{validXI ? "Confirmed starting XI" : predictedXI ? "Predicted starting XI" : "Available source lineup"}</h2>
      <p>{lineupProvenance?.sourceConfirmed===true?"Starting XI confirmed by the source.":predictedXI?"Predicted lineup; not confirmed by the source.":"Lineup confirmation is unavailable."}
        {lineupProvenance?.canonicalIdentitiesVerified===false?" Source player identities have not been resolved to canonical player records.":""}
        {validXI?" Tap a player for available profile details.":" Source player rows are preserved."}</p>
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
    {analysis&&<MatchContext analysis={analysis} home={home} away={away}/>}
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
