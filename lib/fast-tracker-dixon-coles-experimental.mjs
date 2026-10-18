// Independently sourced, EXPERIMENTAL Dixon–Coles low-score correction and
// power rating. This is NOT the retired HKJC publisher, not a calibrated model,
// and is never authorized as an automatic bet or verified prediction.
// Full joint team-strength MLE is intentionally not claimed: attack/defense
// rates use shrinkage and recency weights; only the DC rho term is fitted.
export const DC_VERSION="FT_FOOTBALL_DATA_DC_SHRINKAGE_EXPERIMENTAL_V1";
const msDay=86_400_000;
const finite=x=>typeof x==="number"&&Number.isFinite(x);
const parsedDate=x=>{const t=Date.parse(String(x??""));return Number.isFinite(t)?t:null;};
const clip=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
const poisson=(mu,k)=>{let p=Math.exp(-mu);for(let i=1;i<=k;i++)p*=mu/i;return p;};
export function dcTau(h,a,muH,muA,rho){
  if(!finite(rho)||Math.abs(rho)>0.18)return null;
  let value=1;
  if(h===0&&a===0)value=1-muH*muA*rho;
  else if(h===0&&a===1)value=1+muH*rho;
  else if(h===1&&a===0)value=1+muA*rho;
  else if(h===1&&a===1)value=1-rho;
  return value>0?value:null;
}
export function dcScoreGrid(muH,muA,rho=0){
  if(!finite(muH)||!finite(muA)||muH<0.25||muA<0.25||muH>4.5||muA>4.5)return null;
  let home=0,draw=0,away=0,total=0,max=-1,score="",more25=0,more35=0,more45=0;
  for(let h=0;h<=15;h++)for(let a=0;a<=15;a++){
    const tau=dcTau(h,a,muH,muA,rho);
    if(tau===null)return null;
    const p=poisson(muH,h)*poisson(muA,a)*tau;
    if(!finite(p)||p<0)return null;
    total+=p;
    if(h>a)home+=p;else if(h===a)draw+=p;else away+=p;
    if(h+a>=3)more25+=p;
    if(h+a>=4)more35+=p;
    if(h+a>=5)more45+=p;
    if(p>max){max=p;score=h+"-"+a;}
  }
  if(total<0.999||total>1.001)return null;
  return {home:home/total,draw:draw/total,away:away/total,
    over25:more25/total,over35:more35/total,over45:more45/total,
    mostLikelyScore:score};
}
function trainingRows(history,source,league,asof,retrospective){
  const asofMs=parsedDate(asof);
  if(asofMs===null)return [];
  return history.filter(x=>{
    if(x?.source!==source||x?.league!==league||typeof x?.homeId!=="string"||
      typeof x?.awayId!=="string"||x.homeId===x.awayId)return false;
    if(![x.hg,x.ag].every(v=>Number.isInteger(v)&&v>=0&&v<=20))return false;
    const played=parsedDate(x.playedAt),captured=parsedDate(x.capturedAt);
    if(played===null||captured===null||played>=asofMs
      ||played<asofMs-365*msDay||(!retrospective&&captured>asofMs))return false;
    return true;
  }).sort((a,b)=>parsedDate(a.playedAt)-parsedDate(b.playedAt));
}
function weightedTraining(rows,asofMs,halfLifeDays){
  const lg={n:0,homeGoals:0,awayGoals:0},teams=new Map();
  const team=name=>{if(!teams.has(name))teams.set(name,{
    total:0,gf:0,ga:0,normalizedGF:0,normalizedGA:0,
    home:{w:0,gf:0,ga:0},away:{w:0,gf:0,ga:0}
  });return teams.get(name);};
  // Weighted league averages pass 1; normalized power strength pass 2.
  const weighted=rows.map(x=>({...x,w:Math.exp(-Math.LN2*
    Math.max(0,(asofMs-parsedDate(x.playedAt))/msDay)/halfLifeDays)}));
  for(const x of weighted){lg.n+=x.w;lg.homeGoals+=x.hg*x.w;lg.awayGoals+=x.ag*x.w;}
  const avgH=lg.homeGoals/lg.n,avgA=lg.awayGoals/lg.n;
  if(!finite(avgH)||!finite(avgA)||avgH<0.4||avgA<0.4||avgH>4||avgA>4)return null;
  for(const x of weighted){
    const h=team(x.homeId),a=team(x.awayId);
    h.total+=x.w;h.gf+=x.hg*x.w;h.ga+=x.ag*x.w;
    h.normalizedGF+=(x.hg/avgH)*x.w;h.normalizedGA+=(x.ag/avgA)*x.w;
    h.home.w+=x.w;h.home.gf+=x.hg*x.w;h.home.ga+=x.ag*x.w;
    a.total+=x.w;a.gf+=x.ag*x.w;a.ga+=x.hg*x.w;
    a.normalizedGF+=(x.ag/avgA)*x.w;a.normalizedGA+=(x.hg/avgH)*x.w;
    a.away.w+=x.w;a.away.gf+=x.ag*x.w;a.away.ga+=x.hg*x.w;
  }
  return {avgH,avgA,teams,weighted};
}
function expected(fit,home,away){
  const h=fit.teams.get(home),a=fit.teams.get(away);
  if(!h||!a)return null;
  const prior=5;
  const norm=(sum,w,base)=>((sum+prior*base)/(w+prior))/base;
  const muH=clip(fit.avgH*norm(h.home.gf,h.home.w,fit.avgH)
    *norm(a.away.ga,a.away.w,fit.avgH),0.3,4.2);
  const muA=clip(fit.avgA*norm(a.away.gf,a.away.w,fit.avgA)
    *norm(h.home.ga,h.home.w,fit.avgA),0.3,4.2);
  return {muH,muA};
}
function fitRho(fit){
  let best=0,bestLoss=Infinity;
  for(let index=-15;index<=15;index++){
    const rho=index/100;
    let loss=18*rho*rho;
    for(const x of fit.weighted){
      if(x.hg>1||x.ag>1)continue;
      const expectedGoals=expected(fit,x.homeId,x.awayId);
      if(!expectedGoals)continue;
      const tau=dcTau(x.hg,x.ag,expectedGoals.muH,expectedGoals.muA,rho);
      if(tau===null){loss=Infinity;break;}
      loss-=x.w*Math.log(tau);
    }
    if(loss<bestLoss){bestLoss=loss;best=rho;}
  }
  return best;
}
function rating(t){
  if(!t)return null;
  // 100 log points: zero is neutral, positive stronger scored/allowed
  // goals against league-relative scoring expectation. Same data as DC.
  return 100*Math.log((t.normalizedGF+5)/(t.normalizedGA+5));
}
export function predictFootballDataDcPi({
  history,source="FOOTBALL_DATA",league,homeId,awayId,asOf,kickoff,
  retrospective=false,minLeague=140,minTeam=8,maxAgeDays=30
}={}){
  if(!Array.isArray(history)||!["FOOTBALL_DATA","FS_VERIFIED"].includes(source)||
     !league||typeof homeId!=="string"||typeof awayId!=="string"
     ||!homeId.trim()||!awayId.trim()||homeId===awayId)
    return {status:"INVALID_IDENTITY"};
  const before=parsedDate(asOf),start=parsedDate(kickoff);
  if(before===null||start===null||start<=before)return {status:"NOT_PREMATCH"};
  const rows=trainingRows(history,source,league,asOf,retrospective);
  if(rows.length<minLeague)return {status:"INSUFFICIENT_LEAGUE_RESULTS",trainingCount:rows.length};
  const newest=Math.max(...rows.map(x=>parsedDate(x.playedAt)));
  if(before-newest>maxAgeDays*msDay)return {status:"STALE_TRAINING_DATA",trainingCount:rows.length};
  const games=team=>rows.filter(x=>x.homeId===team||x.awayId===team);
  const h=games(homeId),a=games(awayId);
  if(h.length<minTeam||a.length<minTeam
    ||h.filter(x=>x.homeId===homeId).length<3
    ||a.filter(x=>x.awayId===awayId).length<3)
    return {status:"INSUFFICIENT_TEAM_HISTORY",trainingCount:rows.length,
      homeGames:h.length,awayGames:a.length};
  const fit=weightedTraining(rows,before,100);
  if(!fit)return {status:"INVALID_LEAGUE_BASELINE"};
  const goals=expected(fit,homeId,awayId);
  if(!goals)return {status:"MISSING_TRAINED_TEAM"};
  const rho=fitRho(fit),dc=dcScoreGrid(goals.muH,goals.muA,rho);
  const homeRating=rating(fit.teams.get(homeId)),awayRating=rating(fit.teams.get(awayId));
  if(!dc||homeRating===null||awayRating===null)return {status:"INVALID_DISTRIBUTION"};
  const difference=homeRating-awayRating;
  // Parallel PI-style rating-based goal intensities: related to DC, never
  // asserted to be a second independent betting adviser.
  const piH=clip(fit.avgH*Math.exp(difference/180),0.3,4.2);
  const piA=clip(fit.avgA*Math.exp(-difference/180),0.3,4.2);
  const pi=dcScoreGrid(piH,piA,0);
  if(!pi)return {status:"INVALID_POWER_DISTRIBUTION"};
  return {
    status:"EXPERIMENTAL_NOT_VALIDATED",modelVersion:DC_VERSION,
    source,league,sourceHome:homeId,sourceAway:awayId,
    asOf,kickoff,sourceCapturedBeforeAsOf:!retrospective,
    trainingCount:rows.length,homeGames:h.length,awayGames:a.length,
    latestResultAt:new Date(newest).toISOString(),halfLifeDays:100,
    rho,dc:{...dc,expectedHomeGoals:goals.muH,expectedAwayGoals:goals.muA},
    pi:{...pi,homeRating,awayRating,difference},
    evaluationMode:retrospective?"RETROSPECTIVE_ONLY":"PROSPECTIVE_UNVERIFIED",
    provenance:retrospective?"PLAYED_BEFORE_ASOF_BACKFILLED_AFTERWARD":
      "PLAYED_AND_CAPTURED_BEFORE_ASOF",
    bookmakerUsed:false,forebetUsed:false,cornerPrediction:null,
    releaseGate:"NOT_PROMOTED_NO_VERIFIED_ACCURACY"
  };
}
