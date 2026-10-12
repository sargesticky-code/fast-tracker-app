// Baseline v0: source-independent, calibrated only after prospective evidence.
// Input must be league-verified and capture-time-qualified by caller.
// No bookmaker probabilities, Forebet forecasts, or HTML fields enter this model.
export const VERSION = "FAST_TRACKER_INDEPENDENT_POISSON_V0";
const norm = x => String(x ?? "").toLocaleLowerCase("en").normalize("NFKD").replace(/[^a-z0-9]/g,"");
const finite = x => typeof x === "number" && Number.isFinite(x);
const iso = t => { const n=Date.parse(t); return Number.isFinite(n)?n:null; };
const clip = (n,min,max)=>Math.min(max,Math.max(min,n));
const pmf = (mean,k) => {let p=Math.exp(-mean);for(let i=1;i<=k;i++)p*=mean/i;return p;};

export function normalizedTeamKey(name) { return norm(name); }
export function scoreFromIndependentPoisson(homeXg,awayXg) {
  if(!finite(homeXg)||!finite(awayXg)||homeXg<=0||awayXg<=0||homeXg>5||awayXg>5) return null;
  let h=0,d=0,a=0,over25=0,total=0,maximum=-1,score=null;
  for(let i=0;i<=14;i++)for(let j=0;j<=14;j++){
    const p=pmf(homeXg,i)*pmf(awayXg,j);
    total+=p;
    if(i>j)h+=p;else if(i===j)d+=p;else a+=p;
    if(i+j>=3)over25+=p;
    if(p>maximum){maximum=p;score=`${i}-${j}`;}
  }
  // Finite 0..14 grid has a tiny Poisson tail at high means; normalize only when retained mass is sufficient.
  if(total<0.999) return null;
  return {home:h/total,draw:d/total,away:a/total,over25:over25/total,
          under25:1-over25/total,predictedScore:score};
}
export function poissonOver95(mean){
  if(!finite(mean)||mean<=0||mean>25) return null;
  let under=0;for(let i=0;i<=9;i++) under+=pmf(mean,i);
  return {over95:1-under,under95:under,expectedCorners:mean};
}

// Provider IDs are case sensitive; do not lowercase/collapse Flashscore IDs.
const key=x=>String(x??'').trim();
function completedRows(history,source,league,asOf,retrospective=false) {
  const cutoff=iso(asOf);
  if(cutoff==null) return [];
  return history.filter(r=>{
    if(r.source!==source || r.league!==league || !finite(r.hg)||!finite(r.ag))return false;
    if(r.hg<0||r.ag<0||r.hg>20||r.ag>20||!r.homeId||!r.awayId)return false;
    const played=iso(r.playedAt),captured=iso(r.capturedAt);
    if(played==null||played>=cutoff||captured==null)return false;
    if(!retrospective && captured>cutoff)return false;
    return true;
  });
}
function venue(rows,teamKey,homeSide){
  const r=rows.filter(x=>(homeSide?key(x.homeId):key(x.awayId))===teamKey);
  return {n:r.length,
    goalsFor:r.reduce((a,x)=>a+(homeSide?x.hg:x.ag),0),
    goalsAgainst:r.reduce((a,x)=>a+(homeSide?x.ag:x.hg),0),
    corners:r.filter(x=>finite(x.hc)&&finite(x.ac)),
  };
}
export function predictNativeModel({history,source,league,homeId,awayId,
  kickoff,asOf,retrospective=false,minLeague=60,minTeam=6,maxAgeDays=30}={}) {
  if(!Array.isArray(history)||!source||!league||!homeId||!awayId||key(homeId)===key(awayId))
    return {status:"INVALID_IDENTITY"};
  const before=iso(asOf),start=iso(kickoff);
  if(before==null||start==null||start<=before)
    return {status:"NOT_PREMATCH"};
  const past=completedRows(history,source,league,asOf,retrospective);
  if(past.length<minLeague) return {status:"INSUFFICIENT_LEAGUE_RESULTS",sample:past.length};
  const newest=Math.max(...past.map(x=>iso(x.playedAt)));
  if(before-newest>maxAgeDays*86400000)
    return {status:"STALE_TRAINING_DATA",sample:past.length,latestResultAt:new Date(newest).toISOString()};
  const hkey=key(homeId),akey=key(awayId);
  const hHome=venue(past,hkey,true),hAway=venue(past,hkey,false);
  const aHome=venue(past,akey,true),aAway=venue(past,akey,false);
  const hN=hHome.n+hAway.n,aN=aHome.n+aAway.n;
  if(hN<minTeam||aN<minTeam||hHome.n<2||aAway.n<2)
    return {status:"INSUFFICIENT_TEAM_HISTORY",sample:past.length,homeGames:hN,awayGames:aN};
  const leagueHome=past.reduce((s,x)=>s+x.hg,0)/past.length;
  const leagueAway=past.reduce((s,x)=>s+x.ag,0)/past.length;
  if(leagueHome<0.4||leagueAway<0.4||leagueHome>5||leagueAway>5)
    return {status:"INVALID_LEAGUE_BASELINE"};
  const prior=7;
  const rate=(sum,n,base)=>(sum+prior*base)/(n+prior)/base;
  const expectedHome=clip(leagueHome*rate(hHome.goalsFor,hHome.n,leagueHome)
     *rate(aAway.goalsAgainst,aAway.n,leagueHome),0.35,4.2);
  const expectedAway=clip(leagueAway*rate(aAway.goalsFor,aAway.n,leagueAway)
     *rate(hHome.goalsAgainst,hHome.n,leagueAway),0.35,4.2);
  const goals=scoreFromIndependentPoisson(expectedHome,expectedAway);
  if(!goals)return {status:"INVALID_DISTRIBUTION"};
  const leagueCorners=past.filter(x=>finite(x.hc)&&finite(x.ac)&&x.hc>=0&&x.ac>=0
      &&x.hc<=30&&x.ac<=30);
  const hCorner=past.filter(x=>(key(x.homeId)===hkey||key(x.awayId)===hkey)
    &&finite(x.hc)&&finite(x.ac)&&x.hc>=0&&x.ac>=0);
  const aCorner=past.filter(x=>(key(x.homeId)===akey||key(x.awayId)===akey)
    &&finite(x.hc)&&finite(x.ac)&&x.hc>=0&&x.ac>=0);
  let corners=null;
  if(leagueCorners.length>=minLeague&&hCorner.length>=minTeam&&aCorner.length>=minTeam){
    const avg=arr=>arr.reduce((s,x)=>s+x.hc+x.ac,0)/arr.length;
    const lg=avg(leagueCorners);
    const mu=clip((lg*12 + hCorner.length*avg(hCorner) +
      aCorner.length*avg(aCorner))/(12+hCorner.length+aCorner.length),5,17);
    corners=poissonOver95(mu);
  }
  return {status:"EXPERIMENTAL_UNCALIBRATED",source:VERSION,sourceKind:source,
    league,asOf,kickoff,trainingCount:past.length,homeGames:hN,awayGames:aN,
    latestResultAt:new Date(newest).toISOString(),
    expectedHomeGoals:expectedHome,expectedAwayGoals:expectedAway,
    ...goals,corners,
    provenance:retrospective?"PLAYED_BEFORE_ASOF_RETROSPECTIVE_ONLY":"PLAYED_AND_CAPTURED_BEFORE_ASOF",
    evaluationMode:retrospective?"RETROSPECTIVE_ONLY":"PROSPECTIVE"};
}
