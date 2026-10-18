"use client";
import { useEffect, useMemo, useState } from "react";
import { fetchFlashscoreRawFeed } from "@/lib/flashscore-raw-feed";
import { fetchVerifiedSummary, adviserPercentValue, mergeCanonicalFallback } from "@/lib/verified-evidence-feed";
import { fetchForebetProvisional } from "@/lib/forebet-provisional-feed";
import { GOAL_LINES, CORNER_LINES, exactLineForecast } from "@/lib/line-aware-forecasts";
import { fetchExternalProvisional } from "@/lib/external-adviser-provisional-feed";
import { ADVISER_KEYS, matchAdviserFacet } from "@/lib/adviser-visibility";
import { TeamNameWithLogo } from "@/components/team-logo";

// Source competition names can contain "COUNTRY: Live Standings". Keep the
// identity untouched for searches/joins while displaying a clean league label.
const COUNTRIES=["SOUTH AMERICA","NORTH AMERICA","UNITED STATES","CZECH REPUBLIC","SOUTH KOREA",
  "SAUDI ARABIA","NEW ZEALAND","ENGLAND","SCOTLAND","NETHERLANDS","PORTUGAL","ARGENTINA",
  "AUSTRALIA","BELGIUM","COLOMBIA","COSTA RICA","CYPRUS","DENMARK","ECUADOR","EGYPT",
  "ESTONIA","FRANCE","GERMANY","GUATEMALA","HONG KONG","HUNGARY","INDIA","IRAN","IRELAND",
  "ITALY","JAMAICA","JAPAN","KAZAKHSTAN","MALTA","MEXICO","MOROCCO","NICARAGUA","NORWAY","PARAGUAY",
  "POLAND","RUSSIA","SPAIN","SWEDEN","SWITZERLAND","TURKEY","URUGUAY","USA","WALES","BRAZIL",
  "ALGERIA","BELARUS","GREECE",
  "AFRICA","ASIA","EUROPE","WORLD"];
const alphaCollator=new Intl.Collator("en",{sensitivity:"base",numeric:true});
const normalizeCompetition=value=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
  .toUpperCase().replace(/[^A-Z0-9]/g,"");
const PRIORITY_COMPETITIONS=[
  {label:"Premier League",country:"ENGLAND",aliases:["Premier League","English Premier League"]},
  {label:"Champions League",country:"EUROPE",aliases:["UEFA Champions League","Champions League","Champions League - League phase"]},
  {label:"La Liga",country:"SPAIN",aliases:["LaLiga","La Liga","Primera Division","La Liga EA Sports"]},
  {label:"Bundesliga",country:"GERMANY",aliases:["Bundesliga"]},
  {label:"Serie A",country:"ITALY",aliases:["Serie A"]},
  {label:"Ligue 1",country:"FRANCE",aliases:["Ligue 1","Ligue 1 Uber Eats","Ligue 1 Mc Donalds"]},
  {label:"Europa League",country:"EUROPE",aliases:["UEFA Europa League","Europa League","Europa League - League phase"]},
  {label:"Conference League",country:"EUROPE",aliases:["UEFA Conference League","Conference League","Conference League - League phase"]},
  {label:"AFC Champions League",country:"ASIA",aliases:["AFC Champions League","AFC Champions League - League phase"]},
  {label:"AFC Champions League 2",country:"ASIA",aliases:["AFC Champions League 2"]},
  {label:"Copa Libertadores",country:"SOUTH AMERICA",aliases:["Copa Libertadores"]},
  {label:"Copa Sudamericana",country:"SOUTH AMERICA",aliases:["Copa Sudamericana","Copa Sudamericana - Play Offs"]},
  {label:"World Cup",country:"WORLD",aliases:["FIFA World Cup","World Cup","World Cup - Qualification","World Cup - Qualification - Play Offs"]},
  {label:"World Cup Women",country:"WORLD",aliases:["FIFA World Cup Women","World Cup Women","World Cup Women - Qualification"]},
  {label:"European Championship",country:"EUROPE",aliases:["UEFA European Championship","European Championship","European Championship - Qualification"]},
  {label:"Africa Cup of Nations",country:"AFRICA",aliases:["Africa Cup of Nations","Africa Cup of Nations - Qualification"]},
  {label:"AFC Asian Cup",country:"ASIA",aliases:["AFC Asian Cup","Asian Cup"]},
  {label:"Copa America",country:"SOUTH AMERICA",aliases:["Copa America"]},
  {label:"Gold Cup",country:"NORTH AMERICA",aliases:["CONCACAF Gold Cup","Gold Cup"]},
  {label:"FA Cup",country:"ENGLAND",aliases:["FA Cup"]},
  {label:"EFL Cup",country:"ENGLAND",aliases:["EFL Cup","Carabao Cup","League Cup"]},
  {label:"Copa del Rey",country:"SPAIN",aliases:["Copa del Rey"]},
  {label:"DFB-Pokal",country:"GERMANY",aliases:["DFB Pokal","DFB-Pokal"]},
  {label:"Coppa Italia",country:"ITALY",aliases:["Coppa Italia"]},
  {label:"Coupe de France",country:"FRANCE",aliases:["Coupe de France"]},
  {label:"Taça de Portugal",country:"PORTUGAL",aliases:["Taca de Portugal","Taça de Portugal"]},
  {label:"Scottish Cup",country:"SCOTLAND",aliases:["Scottish Cup"]},
  {label:"Championship",country:"ENGLAND",aliases:["Championship"]},
  {label:"Eredivisie",country:"NETHERLANDS",aliases:["Eredivisie"]},
  {label:"Primeira Liga",country:"PORTUGAL",aliases:["Primeira Liga","Liga Portugal"]}
];
const GLOBAL_PRIORITY=new Map(["UEFA Champions League","Champions League","UEFA Europa League","Europa League",
  "UEFA Conference League","Conference League","FIFA World Cup","World Cup"]
  .map(title=>[normalizeCompetition(title),title.replace(/^UEFA /,"" )]));
const UK_TIME = "Europe/London";
const ukClock = new Intl.DateTimeFormat("en-GB", {timeZone:UK_TIME,hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
const ukZone = new Intl.DateTimeFormat("en-GB",{timeZone:UK_TIME,timeZoneName:"short"});
const ukDateParts = new Intl.DateTimeFormat("en-GB",{timeZone:UK_TIME,year:"numeric",month:"2-digit",day:"2-digit"});

function Icon({name}) {
  const common={width:16,height:16,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.9,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":true};
  return <svg {...common}>
    {name==="search" && <><circle cx="10.8" cy="10.8" r="6.6"/><path d="m16 16 5 5"/></>}
    {name==="clock" && <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>}
    {name==="calendar" && <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>}
    {name==="live" && <><circle cx="12" cy="12" r="3"/><path d="M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/></>}
    {name==="trophy" && <><path d="M6 4h12v6a6 6 0 0 1-12 0V4ZM8 20h8M12 16v4M6 6H3v3a4 4 0 0 0 4 4M18 6h3v3a4 4 0 0 1-4 4"/></>}
    {name==="grid" && <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>}
    {name==="players" && <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 6a3 3 0 0 1 0 6M19 20v-2a5 5 0 0 0-3-4.5"/></>}
    {name==="chart" && <><path d="M4 19V5M4 19h17M8 15l4-5 4 2 4-7"/></>}
    {name==="filter" && <><path d="M4 6h16M7 12h10M10 18h4"/></>}
    {name==="check" && <><path d="M4 12l5 5L20 6"/></>}
    {name==="target" && <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>}
  </svg>;
}
function parseLeague(rawName) {
  const raw=String(rawName||"Football").trim();
  let clean=raw.replace(/\s*:\s*(?:Live Standings|Standings|Draw|Playoffs|Fixtures|Results)\s*$/i,"")
    .replace(/\u00a0/g," ").replace(/[:\s]+$/g,"").trim();
  let country="";
  for (const candidate of COUNTRIES) {
    if (clean.toUpperCase().endsWith(candidate) && clean.length>candidate.length) {
      country=candidate;
      clean=clean.slice(0,-candidate.length).trim();
      break;
    }
  }
  const title=clean || "Football";
  const titleKey=normalizeCompetition(title), countryKey=normalizeCompetition(country);
  const globalLabel=GLOBAL_PRIORITY.get(titleKey);
  const configured=PRIORITY_COMPETITIONS.find(entry=>normalizeCompetition(entry.country)===countryKey
    &&entry.aliases.some(alias=>normalizeCompetition(alias)===titleKey));
  const ranked=Boolean(configured||globalLabel);
  const label=configured?.label||globalLabel||title;
  const rankedLabel=configured?.label||globalLabel;
  const priority=rankedLabel?PRIORITY_COMPETITIONS.findIndex(entry=>entry.label===rankedLabel):1000;
  const display=label+(country?" · "+country[0]+country.slice(1).toLowerCase():"");
  return {label,country,priority,featured:ranked,display};
}
function explicitStatus(row,evidence) {
  // "LIVE" requires a verified provider event, never just kickoff elapsed.
  if(evidence?.liveNow===true) return "live";
  const raw=String(evidence?.matchStatus || row?.raw?.status || row?.raw?.match_status || row?.raw?.status_text || "").trim().toUpperCase();
  // In-play strings without current verified live evidence are not sufficient.
  if (["LIVE","IN PLAY","INPLAY","1H","2H","HT","HALF TIME","HALF-TIME","1ST HALF","2ND HALF","EXTRA TIME","ET"].includes(raw)) return null;
  if (["FT","FINISHED","FULL TIME","FULL-TIME","AFTER EXTRA TIME"].includes(raw)) return "finished";
  if (["NS","NOT STARTED","UPCOMING","SCHEDULED"].includes(raw)) return "upcoming";
  return null;
}
// Only an absolute UTC/offset timestamp may be translated into UK local time.
// A raw Flashscore browser clock is not a timezone and must not be re-labelled.
function verifiedKickoff(row, evidence, fixtureKickoffs) {
  const value=fixtureKickoffs?.get(row.id) || evidence?.canonicalRow?.kickoff
    || (row.sourceTimeStatus==="VERIFIED_CANONICAL_KICKOFF" ? row.kickoff : null);
  if (typeof value!=="string" || !/(Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const ms=Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
function ukDay(ms) {
  const parts=Object.fromEntries(ukDateParts.formatToParts(ms).map(p=>[p.type,p.value]));
  return [parts.year,parts.month,parts.day].join("-");
}
function enrich(row,evidence,now,fixtureKickoffs) {
  const info=parseLeague(row.league);
  const kickoffMs=verifiedKickoff(row,evidence,fixtureKickoffs);
  const status=explicitStatus(row,evidence);
  const phase=status || (kickoffMs===null?"unknown":kickoffMs>now?"upcoming":"started");
  const UKTime=kickoffMs===null?null:ukClock.format(kickoffMs);
  const tz=kickoffMs===null?null:ukZone.formatToParts(kickoffMs).find(p=>p.type==="timeZoneName")?.value||null;
  const quote=availableQuote(row,evidence,now,kickoffMs,phase);
  return {...row,info, evidence, kickoffMs, UKTime, tz, phase,quote,
    dateKey:kickoffMs===null?row.sourceDate:ukDay(kickoffMs)};
}
function scoreCaptureAge(capturedAt,now=Date.now()) {
  const at=Date.parse(String(capturedAt||""));
  if(!Number.isFinite(at)||at>now+60000)return null;
  const minutes=Math.max(0,Math.floor((now-at)/60000));
  if(minutes<1)return "captured just now";
  if(minutes<60)return `captured ${minutes}m ago`;
  const hours=Math.floor(minutes/60);
  if(hours<24)return `captured ${hours}h ${minutes%60}m ago`;
  return `captured ${Math.floor(hours/24)}d ${hours%24}h ago`;
}
function MatchChips({evidence,homeTeam,awayTeam,goalsLine=2.5,cornersLine=9.5}) {
  if (!evidence) return null;
  const chips=[];
  if (evidence.score) chips.push({label:"Actual score",age:scoreCaptureAge(evidence.scoreCapturedAt),
    value:evidence.score.home+"–"+evidence.score.away,mark:"⚽",test:"match-score"});
  if (evidence.prediction) chips.push({label:evidence.forebetCurrent?"Forebet predicted score":"Saved Forebet score",value:evidence.prediction,mark:"◇",test:"match-prediction"});
  if(evidence.forebet && typeof evidence.forebetAvgGoals==="number"
      &&Number.isFinite(evidence.forebetAvgGoals)&&evidence.forebetAvgGoals>0) {
    chips.push({label:evidence.forebetCurrent?"Forebet average goals":"Saved Forebet average goals",
      value:evidence.forebetAvgGoals.toFixed(2),mark:"Σ",test:"forebet-average-goals"});
  }
  if (evidence.forebet) chips.push({label:evidence.forebetCurrent?"Forebet H/D/A":"Saved Forebet H/D/A",value:[evidence.forebet.home,evidence.forebet.draw,evidence.forebet.away].map(p=>Math.round(p*100)).join("/")+"%",mark:"%",test:"forebet-hda"});
  // Exact lines only: 2.5 never becomes goals 3.5/4.5, or 9.5 corners 10.5.
  const goalForecast=exactLineForecast(evidence.forebetOU25,goalsLine);
  const cornerForecast=exactLineForecast(evidence.forebetCorners95,cornersLine);
  if(goalForecast) chips.push({label:(evidence.forebetCurrent?"Forebet O/U ":"Saved Forebet O/U ")+goalsLine,
    value:(goalForecast.pick==="Over"?"O ":"U ")+Math.round((goalForecast.pick==="Over"?goalForecast.over:goalForecast.under)*100)+"%",
    mark:"↗",test:goalsLine===2.5?"forebet-goals-25":"forebet-goals-selected"});
  else if(evidence.forebetOU25) chips.push({label:"Forebet O/U "+goalsLine,value:"Not provided at this line",
    mark:"—",test:"forebet-goals-line-unavailable"});
  if(cornerForecast) chips.push({label:(evidence.forebetCurrent?"Forebet corners ":"Saved Forebet corners ")+cornersLine,
    value:(cornerForecast.pick==="Over"?"O ":"U ")+Math.round((cornerForecast.pick==="Over"?cornerForecast.over:cornerForecast.under)*100)+"%",
    mark:"⚑",test:cornersLine===9.5?"forebet-corners-95":"forebet-corners-selected"});
  else if(evidence.forebetCorners95) chips.push({label:"Forebet corners "+cornersLine,value:"Not provided at this line",
    mark:"—",test:"forebet-corners-line-unavailable"});
  if (evidence.dc) chips.push({label:"Dixon–Coles (verified source)",value:[evidence.dc.home,evidence.dc.draw,evidence.dc.away].map(v=>Math.round(v*100)).join("/")+"%",mark:"◈",test:"advisor-dc-hda"});
  if (evidence.pi) chips.push({label:"Power Index (same source as DC)",value:[evidence.pi.home,evidence.pi.draw,evidence.pi.away].map(v=>Math.round(v*100)).join("/")+"%",mark:"◇",test:"advisor-pi-hda"});
  if (evidence.form) chips.push({label:"Verified Form model",value:[evidence.form.home,evidence.form.draw,evidence.form.away].map(v=>Math.round(v*100)).join("/")+"%",mark:"○",test:"advisor-form-hda"});
  // External adviser probabilities and source team comparisons belong in the
  // match Details page. The fixture listing stays compact and fast.
  const homeForm=evidence.historicalForm?.home, awayForm=evidence.historicalForm?.away;
  if(homeForm||awayForm) chips.push({label:"Last results",value:`H ${homeForm?.results||"—"} · A ${awayForm?.results||"—"}`,mark:"↗",test:"historical-form"});
  if (evidence.confirmedXI) chips.push({label:"Official XI",value:"XI",mark:"♟",test:"confirmed-xi"});
  if (!chips.length) return null;
  return <div className="ft-match-chips" data-testid="verified-evidence">
    {chips.map(c=><span key={c.test} className="ft-match-chip" data-testid={c.test} title={c.label+": "+c.value}><i aria-hidden="true">{c.mark}</i><b>{c.value}</b><small>{c.label}{c.age?" · "+c.age:""}</small></span>)}
  </div>;
}
function ProvisionalChip({candidate,verified}) {
  if (!candidate || verified) return null;
  const fuzzy=candidate.matchedSide==="SIMILARITY";
  const side=candidate.matchedSide==="HOME"?"Home":"Away";
  return <div className="ft-provisional-chip" data-testid="forebet-provisional"
    title={fuzzy?"Neither team verified: these are name-similarity candidates, not proven fixture identities":
      "Unverified opposite team: this is not a confirmed Forebet–Flashscore identity"}>
    <span>{fuzzy?"◇ Forebet tentative · 0.3 names · NOT VERIFIED":
      "◇ Forebet accepted · "+side+" team confirmed"}</span>
    {fuzzy&&<small>Source: {candidate.sourceHome} vs {candidate.sourceAway}
      {" · "}Name similarity: {candidate.nameSimilarities.map(v=>Math.round(v*100)+"%").join(" / ")}
      {" · "}One side at least 70%</small>}
    <strong>H/D/A {candidate.probs.map(v=>Math.round(v)).join("/")}%
      {" · "}Score {candidate.predictedScore} · Avg {candidate.avgGoals.toFixed(2)}</strong>
    <small>{fuzzy
      ?"Names only; not accepted as a confirmed event. Automatically rechecked."
      :"One confirmed team is sufficient to accept this Forebet forecast. Opponent not independently verified; automatically disconnected on conflicting evidence."}
      {" "}Not counted as a two-team verified backtest.</small>
  </div>;
}

function HistoricalFormDisclosure({evidence,homeName,awayName,goalsLine=2.5,cornersLine=9.5}) {
  const sides=[{name:homeName,label:"Home",form:evidence?.historicalForm?.home},
    {name:awayName,label:"Away",form:evidence?.historicalForm?.away}];
  if(!sides.some(side=>side.form)) return null;
  return <details className="ft-form-disclosure" data-testid="historical-form-disclosure">
    <summary>Recent team form and recorded results</summary>
    <p className="ft-form-provenance">Historical domestic-league results from football-data.co.uk. These are past outcomes, not forecasts.</p>
    <div className="ft-form-sides">{sides.map(side=>{
      const f=side.form;
      return <section key={side.label} data-testid={"historical-form-"+side.label.toLowerCase()}>
        <h3>{side.name} · {side.label}</h3>
        {f?<>
          <p>Last {f.matches} completed matches · newest first: <b>{f.results.split("").join(" · ")}</b></p>
          <p>Through {f.throughDate} · W-D-L {f.wins}-{f.draws}-{f.losses} · Goals {f.goalsFor} for / {f.goalsAgainst} against · average total goals {f.averageGoals??"unavailable"}.</p>
          <p>BTTS {f.bttsCount??"unavailable"}/{f.matches}{f.bttsRate===undefined?"":" ("+f.bttsRate+"%)"}.</p>
          {(()=>{const entry=f.observedGoalLines?.[goalsLine.toFixed(1)];
            return <p data-testid={"historical-goals-line-"+side.label.toLowerCase()}>
              Recorded goals O/U {goalsLine.toFixed(1)}: {entry
                ?entry.overCount+"/"+entry.sample+" over ("+Math.round(100*entry.overCount/entry.sample)+"%) · "+
                  entry.underCount+"/"+entry.sample+" under"
                :"unavailable at this line"} · Historical results, not a forecast.
            </p>;})()}
          {(()=>{const entry=f.observedCornerLines?.[cornersLine.toFixed(1)];
            return <p data-testid={"historical-corners-line-"+side.label.toLowerCase()}>
              Recorded corners O/U {cornersLine.toFixed(1)}: {entry
                ?entry.overCount+"/"+entry.sample+" over ("+Math.round(100*entry.overCount/entry.sample)+"%) · "+
                  entry.underCount+"/"+entry.sample+" under"
                :"unavailable at this line"} · Historical results, not a forecast.
            </p>;})()}
          <p>Corners sample {f.matchesWithCorners??"unavailable"}/{f.matches} · for/against/total averages {f.averageCornersFor??"—"}/{f.averageCornersAgainst??"—"}/{f.averageTotalCorners??"—"}.</p>
        </>:<p>No qualifying history is available for this team.</p>}
      </section>;
    })}</div>
  </details>;
}
function FilterButton({active,children,onClick,testId,disabled=false}) {
  return <button type="button" className="ft-filter-pill" aria-pressed={active} disabled={disabled} onClick={onClick} data-testid={testId}>{children}</button>;
}
function OverviewCard({icon,label,value,hint,active,onClick,testId,theme="normal"}) {
  return <button type="button" className={"ft-overview-card ft-overview-card-"+theme}
    aria-pressed={active} data-testid={testId} onClick={onClick}
    title={hint} aria-label={label+": "+value+". "+hint}>
    <span className="ft-overview-card-top"><span className="ft-overview-icon"><Icon name={icon}/></span>
      <span className="ft-overview-card-label">{label}</span></span>
    <strong className="ft-overview-number">{value}</strong>
    <span className="ft-overview-card-hint">{hint}</span>
  </button>;
}
// Treat bookmaker values as reference quotes. A valid source ID, full 1X2
// triplet, capture timestamp and future kickoff are all required. Never infer
// a quote by matching club names or show prematch prices as live.
function quoteValues(o) {
  const values=["home","draw","away"].map(k=>o?.[k]);
  return values.every(v=>typeof v==="number"&&Number.isFinite(v)&&v>=1.01&&v<=100)?values:null;
}
const quoteTimeUK = new Intl.DateTimeFormat("en-GB", {
  timeZone:UK_TIME,hour:"2-digit",minute:"2-digit",hourCycle:"h23",
  day:"2-digit",month:"short"
});
function availableQuote(row,evidence,now,kickoffMs,phase) {
  if(kickoffMs===null || kickoffMs<=now || phase!=="upcoming") return null;
  const candidates=[];
  function push(source,values,capturedAt) {
    const triplet=quoteValues(values);
    const time=Date.parse(String(capturedAt||""));
    if(!triplet||!Number.isFinite(time)||time>now+60_000||time>=kickoffMs) return;
    const age=now-time;
    if(age<0||age>24*60*60_000)return;
    candidates.push({prices:triplet,source,capturedAt:time,
      type:age<=20*60_000?"recent":"previous"});
  }
  if(evidence?.quote)push(evidence.quote.label,evidence.quote,evidence.quote.capturedAt);
  if(row.rawQuote?.provider_event_id===row.providerEventId)
    push("Bet365-labelled",row.rawQuote.hda,row.rawQuote.captured_at);
  if(row.quoteStatus==="FRESH" && row.oddsCapturedAt && row.rawQuote==null)
    push("Bookmaker reference",row.odds,row.oddsCapturedAt);
  // Prefer the newest actual capture, not the API response time.
  candidates.sort((a,b)=>b.capturedAt-a.capturedAt || (a.type==="recent"?-1:1));
  return candidates[0]||null;
}
function oddsText(row) {
  const q=row.quote;
  return q?q.prices.map(n=>n.toFixed(2)):null;
}
function oddsUnavailableText(row) {
  if(row.quoteStatus==="STALE") return "Stale quote unavailable";
  if(row.quoteStatus==="INVALID") return "Invalid quote unavailable";
  return "Unavailable · no verified quote";
}
function evidenceCoverage(row) {
  const e=row.evidence;
  return [e?.score,e?.prediction,e?.forebet,e?.forebetOU25,e?.forebetCorners95,e?.quote,
    e?.confirmedXI,e?.historicalForm?.home,e?.historicalForm?.away,e?.observedStats].filter(Boolean).length;
}
export default function HomepageClient() {
  const [feed,setFeed]=useState(null);
  const [status,setStatus]=useState("loading");
  const [verified,setVerified]=useState(null);
  const [verifiedStatus,setVerifiedStatus]=useState("loading");
  const [provisional,setProvisional]=useState(new Map());
  const [provisionalStatus,setProvisionalStatus]=useState("loading");
  const [externalProvisional,setExternalProvisional]=useState(new Map());
  const [externalProvisionalStatus,setExternalProvisionalStatus]=useState({legacy:false,extra:false});
  const [query,setQuery]=useState("");
  const [date,setDate]=useState("");
  const [league,setLeague]=useState("");
  const [scope,setScope]=useState("featured");
  const [phase,setPhase]=useState("all");
  const [feature,setFeature]=useState("all");
  const [goalsLine,setGoalsLine]=useState(2.5);
  const [cornersLine,setCornersLine]=useState(9.5);
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{
    let cancelled=false,inFlight=false;
    const controller=new AbortController();
    async function refresh(){
      if(cancelled||inFlight||document.visibilityState!=="visible")return;
      inFlight=true;
      try{const next=await fetchFlashscoreRawFeed(controller.signal);
        if(!cancelled){setFeed(next);setStatus("ready");setNow(Date.now());}}
      catch{if(!cancelled)setStatus("error");}
      finally{inFlight=false;}
    }
    refresh();
    // 5-minute browser polling makes 12 requests per visible hour, down from
    // 30 at the prior 2-minute interval; recovery may take up to 3 minutes longer.
    const timer=setInterval(refresh,300000);
    document.addEventListener("visibilitychange",refresh);
    return()=>{cancelled=true;controller.abort();clearInterval(timer);document.removeEventListener("visibilitychange",refresh);};
  },[]);
  useEffect(()=>{
    let cancelled=false,inFlight=false;
    const controller=new AbortController();
    async function refreshVerified(){
      if(cancelled||inFlight||document.visibilityState!=="visible")return;
      inFlight=true;
      try{const next=await fetchVerifiedSummary(controller.signal);
        if(!cancelled){setVerified(next);setVerifiedStatus("ready");setNow(Date.now());}}
      catch{if(!cancelled)setVerifiedStatus("unavailable");}
      finally{inFlight=false;}
    }
    refreshVerified();
    const timer=setInterval(refreshVerified,240000);
    document.addEventListener("visibilitychange",refreshVerified);
    return()=>{cancelled=true;controller.abort();clearInterval(timer);document.removeEventListener("visibilitychange",refreshVerified);};
  },[]);
  useEffect(()=>{
    let cancelled=false,inFlight=false;
    const controller=new AbortController();
    async function refreshProvisional(){
      if(cancelled||inFlight||document.visibilityState!=="visible")return;
      inFlight=true;
      try{
        const current=await fetchForebetProvisional(controller.signal);
        if(!cancelled){setProvisional(current);setProvisionalStatus("ready");}
      }catch{if(!cancelled){setProvisional(new Map());setProvisionalStatus("unavailable");}}
      finally{inFlight=false;}
    }
    refreshProvisional();
    const timer=setInterval(refreshProvisional,300000);
    document.addEventListener("visibilitychange",refreshProvisional);
    return()=>{cancelled=true;controller.abort();clearInterval(timer);
      document.removeEventListener("visibilitychange",refreshProvisional);};
  },[]);
  useEffect(()=>{
    let cancelled=false,inFlight=false;
    const controller=new AbortController();
    async function refreshExternal() {
      if(cancelled||inFlight||document.visibilityState!=="visible")return;
      inFlight=true;
      try {
        const next=await fetchExternalProvisional(controller.signal);
        if(!cancelled){setExternalProvisional(next);setExternalProvisionalStatus(next.feedStatus||{legacy:false,extra:false});}
      } catch {
        if(!cancelled){setExternalProvisional(new Map());setExternalProvisionalStatus({legacy:false,extra:false});}
      } finally {inFlight=false;}
    }
    refreshExternal();
    const timer=setInterval(refreshExternal,300000);
    document.addEventListener("visibilitychange",refreshExternal);
    return()=>{cancelled=true;controller.abort();clearInterval(timer);document.removeEventListener("visibilitychange",refreshExternal);};
  },[]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
  const rawCaptured=Date.parse(String(feed?.generatedAt||""));
  const rawReady=Number.isFinite(rawCaptured)&&now-rawCaptured>=-60000&&now-rawCaptured<=30*60000
    &&Array.isArray(feed?.matches)&&feed.matches.length>0;
  const usingCanonicalFallback=!rawReady&&(verified?.fallbackMatches?.length||0)>0;
  const rows=useMemo(()=>rawReady
    ? mergeCanonicalFallback(feed?.matches,verified?.fallbackMatches)
    : (verified?.fallbackMatches||[]),[rawReady,feed,verified]);
  const matches=useMemo(()=>rows.map(m=>{
    const full=enrich(m,verified?.byId.get(m.id)||null,now,verified?.fixtureKickoffs);
    const candidate=provisional.get(m.id);
    // Keep the model/odds/accuracy pipeline untouched. This is display only.
    const trustedKickoff=full.kickoffMs;
    const candidates=(externalProvisional.get(m.id)||[]).filter(x=>
      full.phase==="upcoming" && trustedKickoff!==null &&
      Math.abs(x.kickoff-trustedKickoff)<=60000 &&
      !full.evidence?.externalAdvisers?.some(a=>a.provider===x.provider));
    const safeForebet=candidate && full.phase==="upcoming" && trustedKickoff!==null
      && Math.abs(candidate.kickoff-trustedKickoff)<=60000
      && !full.evidence?.forebet ? candidate : null;
    return {...full,provisional:safeForebet,externalProvisional:candidates};
  }),[rows,verified,provisional,externalProvisional,now]);
  const leagues=useMemo(()=>[...new Set(matches.map(m=>m.league))].sort((a,b)=>alphaCollator.compare(parseLeague(a).display,parseLeague(b).display)),[matches]);
  const dates=useMemo(()=>[...new Set(matches.map(m=>m.dateKey).filter(Boolean))].sort(),[matches]);
  const liveKnown=matches.some(m=>m.phase==="live");
  const counts={all:matches.length,featured:matches.filter(m=>m.info.featured).length,other:matches.filter(m=>!m.info.featured).length,
    details:matches.filter(m=>Boolean(m.evidence)).length,
    live:matches.filter(m=>m.phase==="live").length,
    xi:matches.filter(m=>m.evidence?.confirmedXI).length,
    forebetStrict:matches.filter(m=>m.evidence?.prediction||m.evidence?.forebet).length,
    forebetOneSide:matches.filter(m=>m.provisional?.acceptedForDisplay).length,
    forebetFuzzy:matches.filter(m=>m.provisional && !m.provisional.acceptedForDisplay).length,
    // One confirmed team is sufficient for usable Forebet source matching.
    // Distinct fixtures, strict verified evidence retained separately.
    forebet:matches.filter(m=>m.evidence?.prediction||m.evidence?.forebet
      ||m.provisional?.acceptedForDisplay).length,
    betclan:matches.filter(m=>m.evidence?.externalAdvisers?.some(a=>a.provider==="BETCLAN")).length,
    sportytrader:matches.filter(m=>m.evidence?.externalAdvisers?.some(a=>a.provider==="SPORTYTRADER")).length,
    provisional:matches.filter(m=>m.provisional).length,
    betclanProvisional:matches.filter(m=>m.externalProvisional.some(x=>x.provider==="BETCLAN")).length,
    sportyProvisional:matches.filter(m=>m.externalProvisional.some(x=>x.provider==="SPORTYTRADER")).length,
    primatipsProvisional:matches.filter(m=>m.externalProvisional.some(x=>x.provider==="PRIMATIPS")).length,
    statareaProvisional:matches.filter(m=>m.externalProvisional.some(x=>x.provider==="STATAREA")).length,
    dc:matches.filter(m=>m.evidence?.dc).length,
    pi:matches.filter(m=>m.evidence?.pi).length,
    form:matches.filter(m=>m.evidence?.form).length,
    prediction:matches.filter(m=>m.evidence?.prediction||m.evidence?.forebet||m.evidence?.dc||m.evidence?.pi||m.evidence?.form||m.evidence?.externalAdvisers?.length||m.provisional||m.externalProvisional.length).length,
    odds:matches.filter(m=>oddsText(m)).length,
    recentOdds:matches.filter(m=>m.quote?.type==="recent").length};
  const visible=useMemo(()=>matches.filter(m=>
    (!date||m.dateKey===date)&&(!league||m.league===league)
    &&(scope==="all"||(scope==="featured"?m.info.featured:!m.info.featured))
    &&(phase==="all"||m.phase===phase)
    &&(feature==="all"||(ADVISER_KEYS[feature]
      ?matchAdviserFacet(m,feature)
      :(feature==="details"?Boolean(m.evidence):feature==="xi"?m.evidence?.confirmedXI:feature==="prediction"?(m.evidence?.prediction||m.evidence?.forebet||m.evidence?.dc||m.evidence?.pi||m.evidence?.form||m.evidence?.externalAdvisers?.length||m.provisional||m.externalProvisional.length):feature==="fresh-odds"?m.quote?.type==="recent":oddsText(m))))
    &&(m.home+" "+m.away+" "+m.league+" "+m.providerEventId).toLowerCase().includes(query.toLowerCase().trim())
  ).sort((a,b)=>(a.phase==="live"?0:1)-(b.phase==="live"?0:1)
    ||a.info.priority-b.info.priority
    ||(a.kickoffMs===null?1:0)-(b.kickoffMs===null?1:0)
    ||(a.kickoffMs!==null&&b.kickoffMs!==null?Math.abs(a.kickoffMs-now)-Math.abs(b.kickoffMs-now):0)
    ||evidenceCoverage(b)-evidenceCoverage(a)
    ||(String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0)
  ),[matches,date,league,scope,phase,feature,query,now]);
  const groups=[];
  for(const row of visible){
    const key=row.info.display;
    let group=groups.find(g=>g.key===key);
    if(!group){group={key,info:row.info,fixtures:[]};groups.push(group);}
    group.fixtures.push(row);
  }
  const clear=()=>{setQuery("");setDate("");setLeague("");setScope("featured");setPhase("all");setFeature("all");};
  // Provider shortcuts reveal relevant fixtures in ANY competition rather
  // than hiding them behind the initial Featured-only league filter.
  const selectAdviser=(provider)=>{
    setQuery("");setDate("");setLeague("");setPhase("all");setScope("all");
    setFeature("adviser-"+provider);
  };
  const hasFilters=Boolean(query||date||league||scope!=="featured"||phase!=="all"||feature!=="all");
  // Dashboard numbers describe the complete loaded snapshot, not the subset
  // currently filtered. All shortcuts clear conflicting filters before applying.
  const selectOverview=(target)=>{
    setQuery("");setDate("");setLeague("");setScope("all");
    if(target==="all"){setPhase("all");setFeature("all");}
    else if(target==="live"){setFeature("all");setPhase(old=>old==="live"?"all":"live");}
    else {setPhase("all");setFeature(old=>old===target?"all":target);}
  };
  const fixtureCount=(feed||usingCanonicalFallback)?counts.all:(status==="loading"?"…":"—");
  const detailsValue=verifiedStatus==="ready"?counts.details:"—";
  const liveValue=verifiedStatus==="ready"?counts.live:"—";
  const forecastValue=verifiedStatus==="ready"?counts.prediction:"—";
  const lineupsValue=verifiedStatus==="ready"?counts.xi:"—";
  const priceValue=(rawReady||usingCanonicalFallback)?counts.odds:"—";
  const fixturesReady=rawReady||usingCanonicalFallback;
  const overviewCards=[
    {key:"all",icon:"calendar",label:"Matches",value:fixtureCount,hint:"All fixtures",active:scope==="all"&&phase==="all"&&feature==="all"&&!query&&!date&&!league,test:"overview-matches"},
    {key:"details",icon:"target",label:"More details",value:detailsValue,hint:"Games with extra info",active:feature==="details"&&phase==="all",test:"overview-details"},
    {key:"live",icon:"live",label:"Live now",value:liveValue,hint:"Confirmed live games",active:phase==="live",test:"overview-live",theme:"live"},
    {key:"prediction",icon:"chart",label:"Predictions",value:forecastValue,hint:"Games with predictions",active:feature==="prediction"&&phase==="all",test:"overview-predictions"},
    {key:"xi",icon:"players",label:"Lineups",value:lineupsValue,hint:"Full starting XIs",active:feature==="xi"&&phase==="all",test:"overview-lineups"},
    {key:"odds",icon:"grid",label:"Odds",value:priceValue,hint:"Recent & earlier quotes",active:feature==="odds"&&phase==="all",test:"overview-odds"}
  ];

  return <main className="ft-home">
    <header className="ft-top">
      <div className="ft-brand"><strong>FAST TRACKER <em>2026</em></strong><small>FOOTBALL MATCH CENTRE</small></div>
      <a href="/health" className="ft-source-link">ⓘ Data status</a>
    </header>
    <section className="ft-raw-board">
      <div className="ft-page-heading">
        <div><h1>Football matches</h1><p>Find a match. Tap to see its details.</p></div>
        <span className="ft-timezone-badge"><Icon name="clock"/> UK · GMT/BST</span>
      </div>
      <section className="ft-overview" aria-label="Football dashboard overview" data-testid="match-overview">
        <div className="ft-overview-heading">
          <h2>At a glance</h2>
          <div className="ft-overview-health" aria-label="Data availability">
            <span data-testid="overview-feed-status" className={"ft-health-pill"+(fixturesReady?" ft-health-good":"")}>
              <i aria-hidden="true"/>{fixturesReady?"Matches ready":status==="loading"?"Loading matches":"Matches unavailable"}
            </span>
            <span data-testid="overview-insight-status" className={"ft-health-pill"+(verifiedStatus==="ready"?" ft-health-good":"")}>
              <i aria-hidden="true"/>{verifiedStatus==="ready"?"Stats ready":verifiedStatus==="loading"?"Loading stats":"Stats limited"}
            </span>
            <a href="/health" aria-label="See detailed data status">Details <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        <div className="ft-overview-grid">
          {overviewCards.map(card=><OverviewCard key={card.key}
            icon={card.icon} label={card.label} value={card.value} hint={card.hint}
            active={card.active} theme={card.theme||"normal"}
            testId={card.test} onClick={()=>selectOverview(card.key)}/>)}
        </div>
        <div className="ft-advisor-overview" data-testid="advisor-coverage" aria-label="Prediction advisor sources">
          <strong>Prediction sources</strong>
          <span data-testid="advisor-forebet-summary"><i aria-hidden="true">◇</i> Forebet · {(verifiedStatus==="ready"||provisionalStatus==="ready")?counts.forebet:"—"} accepted source forecasts</span>
          <span data-testid="advisor-forebet-provisional-summary"><i aria-hidden="true">✓</i> One-team accepted · {provisionalStatus==="ready"?counts.forebetOneSide:"—"} (opponent unverified) · {verifiedStatus==="ready"?counts.forebetStrict:"—"} two-team verified · {provisionalStatus==="ready"?counts.forebetFuzzy:"—"} fuzzy tentative</span>
          <span data-testid="advisor-dc-summary"><i aria-hidden="true">◈</i> Dixon–Coles · {verifiedStatus==="ready"?counts.dc:"—"} verified forecasts</span>
          <span data-testid="advisor-pi-summary"><i aria-hidden="true">◇</i> Power Index · {verifiedStatus==="ready"?counts.pi:"—"} (same model source)</span>
          <span data-testid="advisor-form-summary"><i aria-hidden="true">○</i> Form · {verifiedStatus==="ready"&&counts.form>0?counts.form+" verified forecasts":"Legacy inactive"}</span>
          <span data-testid="advisor-betclan-summary"><i aria-hidden="true">○</i> BetClan · {verifiedStatus==="ready"?counts.betclan+" verified":"Unavailable"} · {externalProvisionalStatus.legacy?counts.betclanProvisional+" provisional":"provisional unavailable"}</span>
          <span data-testid="advisor-sportytrader-summary"><i aria-hidden="true">○</i> SportyTrader · {verifiedStatus==="ready"?counts.sportytrader+" verified":"Unavailable"} · {externalProvisionalStatus.legacy?counts.sportyProvisional+" provisional":"provisional unavailable"}</span>
          <span data-testid="advisor-primatips-summary"><i aria-hidden="true">○</i> PrimaTips · {externalProvisionalStatus.extra?counts.primatipsProvisional+" provisional":"Unavailable"}</span>
          <span data-testid="advisor-statarea-summary"><i aria-hidden="true">○</i> Statarea · {externalProvisionalStatus.extra?counts.statareaProvisional+" provisional":"Unavailable"}</span>
          <small>Provisional source forecasts allow ≥0.3 name similarity only with a strong second check (one team ≥0.7 plus league/time evidence), unique source identity and automatic rechecks. NOT VERIFIED; no automatic picks. Prices are bookmaker quotes, not independent predictions.</small>
        </div>
        <p className="ft-overview-tip"><Icon name="filter"/> Select a card to see those matches.</p>
      </section>
      {status==="loading"&&!feed&&<p role="status">Loading matches…</p>}
      {status==="error"&&!usingCanonicalFallback&&<p role="alert">Fixtures temporarily unavailable. Please retry shortly.</p>}
      {usingCanonicalFallback&&<p role="status" data-testid="canonical-fallback">Showing {matches.length} saved matches while the latest results load.</p>}

      <div className="ft-filter-section">
        <div className="ft-filter-inputs">
          <label className="ft-search-label"><Icon name="search"/><input aria-label="Search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search team or league…" /></label>
          <label className="ft-league-label"><Icon name="trophy"/><select aria-label="Competition" value={league} onChange={e=>setLeague(e.target.value)}>
            <option value="">All competitions</option>
            {leagues.map(l=><option key={l} value={l}>{parseLeague(l).display}</option>)}
          </select></label>
        </div>
        <div className="ft-filter-row" aria-label="League priority">
          <strong><Icon name="trophy"/> View</strong>
          <FilterButton active={scope==="featured"} onClick={()=>setScope("featured")} testId="scope-featured">★ Featured <span>{counts.featured}</span></FilterButton>
          <FilterButton active={scope==="other"} onClick={()=>setScope("other")} testId="scope-other">Other <span>{counts.other}</span></FilterButton>
          <FilterButton active={scope==="all"} onClick={()=>setScope("all")} testId="scope-all">All <span>{counts.all}</span></FilterButton>
        </div>
        <div className="ft-filter-row" aria-label="Match status">
          <strong><Icon name="live"/> Status</strong>
          {[["all","All"],["live","● Live"],["upcoming","◷ Upcoming"],["started","▶ Started"],["finished","✓ Finished"],["unknown","? Time TBC"]].map(([key,label])=>
            <FilterButton key={key} active={phase===key} onClick={()=>setPhase(key)} testId={"status-"+key}>{label}</FilterButton>)}
        </div>
        <div className="ft-filter-row" aria-label="Forebet forecast lines">
          <strong><Icon name="chart"/> O/U lines</strong>
          <label>Goals O/U <select aria-label="Goals O/U line" data-testid="forebet-goals-line"
            value={goalsLine} onChange={e=>setGoalsLine(Number(e.target.value))}>
            {GOAL_LINES.map(line=><option key={line} value={line}>{line.toFixed(1)}</option>)}
          </select></label>
          <label>Corners O/U <select aria-label="Corners O/U line" data-testid="forebet-corners-line"
            value={cornersLine} onChange={e=>setCornersLine(Number(e.target.value))}>
            {CORNER_LINES.map(line=><option key={line} value={line}>{line.toFixed(1)}</option>)}
          </select></label>
          <small>Forebet predictions require exact source lines. Historical result frequencies appear separately when available.</small>
        </div>
        <div className="ft-filter-row" aria-label="Betting adviser sources">
          <strong><Icon name="chart"/> Advisers</strong>
          <FilterButton active={feature==="adviser-betclan"} onClick={()=>selectAdviser("betclan")} testId="filter-adviser-betclan">BetClan <span>{counts.betclan} verified · {counts.betclanProvisional} provisional</span></FilterButton>
          <FilterButton active={feature==="adviser-sportytrader"} onClick={()=>selectAdviser("sportytrader")} testId="filter-adviser-sportytrader">SportyTrader <span>{counts.sportytrader} verified · {counts.sportyProvisional} provisional</span></FilterButton>
          <FilterButton active={feature==="adviser-primatips"} onClick={()=>selectAdviser("primatips")} testId="filter-adviser-primatips">PrimaTips <span>{counts.primatipsProvisional} provisional</span></FilterButton>
          <FilterButton active={feature==="adviser-statarea"} onClick={()=>selectAdviser("statarea")} testId="filter-adviser-statarea">Statarea <span>{counts.statareaProvisional} provisional</span></FilterButton>
        </div>
        <div className="ft-filter-row" aria-label="Match details">
          <strong><Icon name="filter"/> Show</strong>
          <FilterButton active={feature==="all"} onClick={()=>setFeature("all")}>Everything</FilterButton>
          <FilterButton active={feature==="xi"} onClick={()=>setFeature("xi")}><Icon name="players"/> XI <span>{counts.xi}</span></FilterButton>
          <FilterButton active={feature==="prediction"} onClick={()=>setFeature("prediction")}><Icon name="chart"/> Predictions <span>{counts.prediction}</span></FilterButton>
          <FilterButton active={feature==="odds"} onClick={()=>setFeature("odds")}>H/D/A <span>{counts.odds}</span></FilterButton>
          <FilterButton active={feature==="fresh-odds"} onClick={()=>setFeature("fresh-odds")}>Recent <span>{counts.recentOdds}</span></FilterButton>
          {hasFilters&&<button type="button" className="ft-clear-filters" onClick={clear}>Clear ×</button>}
        </div>
      </div>
      <nav className="ft-daybar" aria-label="Fixture dates"><Icon name="calendar"/>
        <FilterButton active={!date} onClick={()=>setDate("")}>All days</FilterButton>
        {dates.map(d=><FilterButton key={d} active={date===d} onClick={()=>setDate(d)}>{d.slice(5)} <span>{matches.filter(m=>m.dateKey===d).length}</span></FilterButton>)}
      </nav>
      <div className="ft-list-meta"><strong>{visible.length} matches</strong>
        <small>UK times: verified kickoffs only · Unverified times: —</small>
      </div>
      {!liveKnown&&phase==="live"&&<p role="status" className="ft-filter-note">No confirmed live matches at the moment.</p>}
      <div className="ft-match-list" data-testid="fixture-list">
        {groups.map(g=><section className="ft-fixture-group" key={g.key} data-testid="league-group">
          <div className="ft-league-heading">
            <h2>{g.info.featured&&<span className="ft-top-league-star" aria-label="Priority league">★</span>}{g.info.display}</h2>
            <span>{g.fixtures.length} matches</span>
          </div>
          {g.fixtures.map(m=>{
            const odds=oddsText(m);
            const statusLabel=({"live":"LIVE","upcoming":"Upcoming","started":"Started","finished":"FT","unknown":"Time TBC"})[m.phase];
            return <div className="ft-fixture-card" key={m.id} data-fixture-id={m.id}>
              <a className="ft-match-row" data-testid="fixture-row" href={"/details?id="+encodeURIComponent(m.id)}>
              <div className="ft-fixture-main">
                <div className="ft-fixture-teams">
                  <span className="ft-team-home" data-testid="home-team-name"><TeamNameWithLogo team={m.home} logoTeam={m.home} context={m.league} size={22}/></span>
                  <span className="ft-team-away" data-testid="away-team-name"><TeamNameWithLogo team={m.away} logoTeam={m.away} context={m.league} size={22}/></span>
                </div>
                <MatchChips evidence={m.evidence} homeTeam={m.home} awayTeam={m.away} goalsLine={goalsLine} cornersLine={cornersLine}/>
                {(m.evidence?.externalAdvisers?.length>0||m.externalProvisional.length>0)&&
                  <span className="ft-match-adviser-link" data-testid="adviser-details-link">
                    {new Set([...(m.evidence?.externalAdvisers||[]).map(a=>a.provider),
                      ...m.externalProvisional.map(a=>a.provider)]).size} adviser source(s) · See predictions, stats and team names in Details →
                  </span>}
                <ProvisionalChip candidate={m.provisional} verified={m.evidence?.forebet}/>
              </div>
              <div className="ft-kickoff-cell">
                <span className={"ft-match-state ft-match-state-"+m.phase}>{m.phase==="live"&&<i className="ft-live-dot"/>}{statusLabel}</span>
                <b className="ft-kickoff-value" data-testid="uk-kickoff">{m.UKTime||"—:—"}</b>
                <small>{m.UKTime?(m.tz||"UK")+" · UK": "UK time unverified"}</small>
              </div>
              <div className="ft-odds-cell">
                {odds?<><div className={"ft-odds-mini"+(m.quote?.type==="previous"?" ft-odds-previous":"")} aria-label={(m.quote?.type==="recent"?"Recent":"Earlier")+" H/D/A odds"}>
                  {["H","D","A"].map((type,i)=><span key={type}><small>{type}</small><b>{odds[i]}</b></span>)}
                </div><small data-testid="match-odds-status">{m.quote?.type==="recent"?"Recent prematch reference":"Earlier · stale reference"} · {m.quote?.source} · {quoteTimeUK.format(m.quote.capturedAt)} UK</small></>:
                <span className="ft-odds-unavailable" data-testid="match-odds-status">— <small>{oddsUnavailableText(m)}</small></span>}
              </div>
              <span className="ft-row-arrow" aria-hidden="true">›</span>
              </a>
              <HistoricalFormDisclosure evidence={m.evidence} homeName={m.home} awayName={m.away} goalsLine={goalsLine} cornersLine={cornersLine}/>
            </div>;
          })}
        </section>)}
      </div>
      {!visible.length&&status!=="loading"&&<div className="ft-empty-state" role="status">
        <Icon name="filter"/><strong>No matches match these filters.</strong>
        <button onClick={clear} type="button">Show Featured matches</button>
      </div>}
    </section>
  </main>;
}
