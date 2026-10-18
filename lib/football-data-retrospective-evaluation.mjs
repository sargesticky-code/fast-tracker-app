// Phase 24: read-only walk-forward validation engine.
// Imported historical observations are NEVER represented as genuine frozen live predictions.
import {predictFootballDataDcPi,DC_VERSION} from "./fast-tracker-dixon-coles-experimental.mjs";
const DAY=86400000;
const VALID_LEAGUES=new Set(["E0","D1","SP1","I1","F1","N1","P1"]);
function dayStart(v){
  const t=Date.parse(String(v??""));if(!Number.isFinite(t))return null;
  return Math.floor(t/DAY)*DAY;
}
const finite=n=>typeof n==="number"&&Number.isFinite(n);
const round=x=>Number(x.toFixed(6));
function outcome(row){return row.hg>row.ag?0:row.hg===row.ag?1:2;}
function scores(probabilities,y){
  if(!Array.isArray(probabilities)||probabilities.length!==3||
      !probabilities.every(x=>finite(x)&&x>=0&&x<=1)||
      Math.abs(probabilities.reduce((a,b)=>a+b,0)-1)>.001)return null;
  const p=Math.max(1e-12,probabilities[y]);
  return {brier:probabilities.reduce((sum,v,i)=>sum+(v-(i===y?1:0))**2,0)/3,
    logLoss:-Math.log(p)};
}
function baseline(rows,league,asOf){
  const filtered=rows.filter(x=>x.source==="FOOTBALL_DATA"&&x.league===league&&
    dayStart(x.playedAt)!==null&&dayStart(x.playedAt)<asOf&&
    dayStart(x.playedAt)>=asOf-365*DAY);
  if(filtered.length<140)return null;
  const totals=[1,1,1];
  for(const match of filtered)totals[outcome(match)]++;
  const denom=totals.reduce((a,b)=>a+b,0);
  return totals.map(x=>x/denom);
}
function qualify(row,league){
  if(!row||row.source!=="FOOTBALL_DATA"||row.league!==league||
    typeof row.homeId!=="string"||typeof row.awayId!=="string"||
    !row.homeId.trim()||!row.awayId.trim()||row.homeId===row.awayId||
    ![row.hg,row.ag].every(x=>Number.isInteger(x)&&x>=0&&x<=20))return false;
  return dayStart(row.playedAt)!==null;
}
// Hold out all matches on each future date as a cohort so a result from the
// same match day can never train a forecast for another match on that day.
export function evaluateFootballDataWalkForward({
  history,league,holdoutFraction=0.2,maxFixtures=60
}={}){
  if(!Array.isArray(history)||!VALID_LEAGUES.has(league)||
     !finite(holdoutFraction)||holdoutFraction<0.1||holdoutFraction>0.4||
     !Number.isInteger(maxFixtures)||maxFixtures<1||maxFixtures>100){
    return {status:"INVALID_BACKTEST_REQUEST"};
  }
  const rows=history.filter(x=>qualify(x,league))
    .sort((a,b)=>dayStart(a.playedAt)-dayStart(b.playedAt)||
      a.homeId.localeCompare(b.homeId)||a.awayId.localeCompare(b.awayId));
  if(rows.length<180)return {status:"INSUFFICIENT_RESULTS",league,count:rows.length};
  const dates=[...new Set(rows.map(x=>dayStart(x.playedAt)))].sort((a,b)=>a-b);
  const holdDays=Math.max(1,Math.ceil(dates.length*holdoutFraction));
  const cutoff=dates[dates.length-holdDays];
  const evaluatedRows=rows.filter(x=>dayStart(x.playedAt)>=cutoff).slice(0,maxFixtures);
  const accum={dc:{brier:0,logLoss:0},pi:{brier:0,logLoss:0},baseline:{brier:0,logLoss:0}};
  const skipped={};let evaluated=0;
  for(const target of evaluatedRows){
    const targetDate=dayStart(target.playedAt);
    const asOf=new Date(targetDate).toISOString();
    const kickoff=new Date(targetDate+DAY-1).toISOString();
    const prediction=predictFootballDataDcPi({
      history:rows,source:"FOOTBALL_DATA",league,homeId:target.homeId,
      awayId:target.awayId,asOf,kickoff,retrospective:true});
    if(prediction.status!=="EXPERIMENTAL_NOT_VALIDATED"){
      skipped[prediction.status]=(skipped[prediction.status]||0)+1;continue;
    }
    const base=baseline(rows,league,targetDate);
    if(!base){skipped.NO_BASELINE=(skipped.NO_BASELINE||0)+1;continue;}
    const y=outcome(target);
    const metrics={
      dc:scores([prediction.dc.home,prediction.dc.draw,prediction.dc.away],y),
      pi:scores([prediction.pi.home,prediction.pi.draw,prediction.pi.away],y),
      baseline:scores(base,y)
    };
    if(Object.values(metrics).some(x=>!x)){skipped.INVALID_PROBABILITY=(skipped.INVALID_PROBABILITY||0)+1;continue;}
    for(const name of Object.keys(metrics)){
      accum[name].brier+=metrics[name].brier;
      accum[name].logLoss+=metrics[name].logLoss;
    }
    evaluated++;
  }
  return {
    status:evaluated>0?"RETROSPECTIVE_EVALUATION_ONLY":"NO_ELIGIBLE_HOLDOUT",
    evaluationMode:"RETROSPECTIVE_ONLY",capturedBeforeHistoricalKickoff:false,
    neverCountAsIssuedPredictions:true,modelVersion:DC_VERSION,league,
    historyRows:rows.length,holdoutStart:new Date(cutoff).toISOString().slice(0,10),
    holdoutCandidates:evaluatedRows.length,evaluated,skipped,
    metrics:evaluated>0?Object.fromEntries(Object.entries(accum).map(([name,m])=>[
      name,{brier:round(m.brier/evaluated),logLoss:round(m.logLoss/evaluated)}
    ])):null,
    dcAndPiIndependent:false,
    releaseGate:"NOT_PROMOTED_NO_VERIFIED_ACCURACY",
    trainingRule:"STRICT_EARLIER_CALENDAR_DATES_SAME_SOURCE_AND_LEAGUE",
    baselineRule:"ONE_YEAR_PRIOR_SAME_LEAGUE_LAPLACE_HDA"
  };
}
