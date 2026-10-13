"use client";
import { useEffect, useMemo, useState } from "react";
import { fetchFlashscoreRawFeed } from "@/lib/flashscore-raw-feed";
import { fetchVerifiedSummary } from "@/lib/verified-evidence-feed";
import { TeamNameWithLogo } from "@/components/team-logo";

// Source competition names can contain "COUNTRY: Live Standings". Keep the
// identity untouched for searches/joins while displaying a clean league label.
const COUNTRIES=["ENGLAND","SPAIN","GERMANY","ITALY","FRANCE","EUROPE","WORLD","BRAZIL",
  "NETHERLANDS","PORTUGAL","JAMAICA","SCOTLAND","AFRICA","ASIA","USA","UNITED STATES",
  "AUSTRALIA","JAPAN","BELGIUM","ARGENTINA","TURKEY","MEXICO","IRELAND","WALES","SWEDEN",
  "NORWAY","DENMARK","SWITZERLAND","AUSTRIA","COLOMBIA","ECUADOR","SAUDI ARABIA",
  "POLAND","CZECH REPUBLIC","SOUTH KOREA","CHINA","INDIA","CHILE"];
const alphaCollator=new Intl.Collator("en",{sensitivity:"base",numeric:true});
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
  let clean=raw.replace(/\s*:\s*(?:Live Standings|Standings|Draw|Playoffs|Fixtures|Results)\s*$/i,"").trim();
  let country="";
  for (const candidate of COUNTRIES) {
    if (clean.toUpperCase().endsWith(candidate) && clean.length>candidate.length) {
      country=candidate;
      clean=clean.slice(0,-candidate.length).trim();
      break;
    }
  }
  const title=clean || "Football";
  const upper=title.toUpperCase().replace(/[-_.]/g," ").replace(/\s+/g," ").trim();
  const inCountry=(c)=>country===c || !country;
  let priority=100;
  if (inCountry("ENGLAND") && /^(PREMIER LEAGUE|ENGLISH PREMIER LEAGUE)$/.test(upper)) priority=0;
  else if (inCountry("SPAIN") && /^(LA ?LIGA|PRIMERA DIVISION|LA LIGA EA SPORTS)$/.test(upper)) priority=1;
  else if (inCountry("GERMANY") && /^BUNDESLIGA$/.test(upper)) priority=2;
  else if (inCountry("ITALY") && /^SERIE A$/.test(upper)) priority=3;
  else if (inCountry("FRANCE") && /^LIGUE 1( UBER EATS| MC DONALDS)?$/.test(upper)) priority=4;
  else if (inCountry("EUROPE") && /^(UEFA )?CHAMPIONS LEAGUE$/.test(upper)) priority=5;
  else if (inCountry("EUROPE") && /^(UEFA )?EUROPA LEAGUE$/.test(upper)) priority=6;
  else if (inCountry("EUROPE") && /^(UEFA )?CONFERENCE LEAGUE$/.test(upper)) priority=7;
  else if (inCountry("NETHERLANDS") && /^EREDIVISIE$/.test(upper)) priority=8;
  else if (inCountry("PORTUGAL") && /^(PRIMEIRA LIGA|LIGA PORTUGAL)$/.test(upper)) priority=9;
  else if (inCountry("ENGLAND") && /^CHAMPIONSHIP$/.test(upper)) priority=10;
  else if (inCountry("WORLD") && /^WORLD CUP( QUALIFICATION)?/.test(upper)) priority=11;
  return {label:title, country, priority,featured:priority<=11,
    display: title+(country?" · "+country[0]+country.slice(1).toLowerCase():"")};
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
function MatchChips({evidence}) {
  if (!evidence) return null;
  const chips=[];
  if (evidence.score) chips.push({label:"Score",value:evidence.score.home+"–"+evidence.score.away,mark:"⚽",test:"match-score"});
  if (evidence.prediction) chips.push({label:"Pred",value:evidence.prediction,mark:"◇",test:"match-prediction"});
  if (evidence.forebet) chips.push({label:"H/D/A",value:[evidence.forebet.home,evidence.forebet.draw,evidence.forebet.away].map(p=>Math.round(p*100)).join("/")+"%",mark:"%",test:"forebet-hda"});
  if (evidence.forebetOU25) chips.push({label:"O/U 2.5",value:(evidence.forebetOU25.pick==="Over"?"O ":"U ")+Math.round((evidence.forebetOU25.pick==="Over"?evidence.forebetOU25.over:evidence.forebetOU25.under)*100)+"%",mark:"↗",test:"forebet-goals-25"});
  if (evidence.forebetCorners95) chips.push({label:"Corners 9.5",value:(evidence.forebetCorners95.pick==="Over"?"O ":"U ")+Math.round((evidence.forebetCorners95.pick==="Over"?evidence.forebetCorners95.over:evidence.forebetCorners95.under)*100)+"%",mark:"⚑",test:"forebet-corners-95"});
  if (evidence.dc) chips.push({label:"Dixon–Coles (verified source)",value:[evidence.dc.home,evidence.dc.draw,evidence.dc.away].map(v=>Math.round(v*100)).join("/")+"%",mark:"◈",test:"advisor-dc-hda"});
  if (evidence.pi) chips.push({label:"Power Index (same source as DC)",value:[evidence.pi.home,evidence.pi.draw,evidence.pi.away].map(v=>Math.round(v*100)).join("/")+"%",mark:"◇",test:"advisor-pi-hda"});
  if (evidence.form) chips.push({label:"Verified Form model",value:[evidence.form.home,evidence.form.draw,evidence.form.away].map(v=>Math.round(v*100)).join("/")+"%",mark:"○",test:"advisor-form-hda"});
  if (evidence.confirmedXI) chips.push({label:"Official XI",value:"XI",mark:"♟",test:"confirmed-xi"});
  if (!chips.length) return null;
  return <div className="ft-match-chips" data-testid="verified-evidence">
    {chips.map(c=><span key={c.test} className="ft-match-chip" data-testid={c.test} title={c.label+": "+c.value}><i aria-hidden="true">{c.mark}</i><b>{c.value}</b><small>{c.label}</small></span>)}
  </div>;
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
export default function HomepageClient() {
  const [feed,setFeed]=useState(null);
  const [status,setStatus]=useState("loading");
  const [verified,setVerified]=useState(null);
  const [verifiedStatus,setVerifiedStatus]=useState("loading");
  const [query,setQuery]=useState("");
  const [date,setDate]=useState("");
  const [league,setLeague]=useState("");
  const [scope,setScope]=useState("all");
  const [phase,setPhase]=useState("all");
  const [feature,setFeature]=useState("all");
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
    const timer=setInterval(refresh,120000);
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
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
  const rawCaptured=Date.parse(String(feed?.generatedAt||""));
  const rawReady=Number.isFinite(rawCaptured)&&now-rawCaptured>=-60000&&now-rawCaptured<=30*60000
    &&Array.isArray(feed?.matches)&&feed.matches.length>0;
  const usingCanonicalFallback=!rawReady&&(verified?.fallbackMatches?.length||0)>0;
  const rows=rawReady?feed.matches:(verified?.fallbackMatches||[]);
  const matches=useMemo(()=>rows.map(m=>enrich(m,verified?.byId.get(m.id)||null,now,verified?.fixtureKickoffs)),[rows,verified,now]);
  const leagues=useMemo(()=>[...new Set(matches.map(m=>m.league))].sort((a,b)=>alphaCollator.compare(parseLeague(a).display,parseLeague(b).display)),[matches]);
  const dates=useMemo(()=>[...new Set(matches.map(m=>m.dateKey).filter(Boolean))].sort(),[matches]);
  const liveKnown=matches.some(m=>m.phase==="live");
  const counts={all:matches.length,top:matches.filter(m=>m.info.featured).length,other:matches.filter(m=>!m.info.featured).length,
    details:matches.filter(m=>Boolean(m.evidence)).length,
    live:matches.filter(m=>m.phase==="live").length,
    xi:matches.filter(m=>m.evidence?.confirmedXI).length,
    forebet:matches.filter(m=>m.evidence?.prediction||m.evidence?.forebet).length,
    dc:matches.filter(m=>m.evidence?.dc).length,
    pi:matches.filter(m=>m.evidence?.pi).length,
    form:matches.filter(m=>m.evidence?.form).length,
    prediction:matches.filter(m=>m.evidence?.prediction||m.evidence?.forebet||m.evidence?.dc||m.evidence?.pi||m.evidence?.form).length,
    odds:matches.filter(m=>oddsText(m)).length,
    recentOdds:matches.filter(m=>m.quote?.type==="recent").length};
  const visible=useMemo(()=>matches.filter(m=>
    (!date||m.dateKey===date)&&(!league||m.league===league)
    &&(scope==="all"||(scope==="top"?m.info.featured:!m.info.featured))
    &&(phase==="all"||m.phase===phase)
    &&(feature==="all"||(feature==="details"?Boolean(m.evidence):feature==="xi"?m.evidence?.confirmedXI:feature==="prediction"?(m.evidence?.prediction||m.evidence?.forebet||m.evidence?.dc||m.evidence?.pi||m.evidence?.form):feature==="fresh-odds"?m.quote?.type==="recent":oddsText(m)))
    &&(m.home+" "+m.away+" "+m.league+" "+m.providerEventId).toLowerCase().includes(query.toLowerCase().trim())
  ).sort((a,b)=>a.info.priority-b.info.priority
    ||alphaCollator.compare(a.info.display,b.info.display)
    ||({"live":0,"upcoming":1,"started":2,"finished":3,"unknown":4}[a.phase]-{"live":0,"upcoming":1,"started":2,"finished":3,"unknown":4}[b.phase])
    ||(a.kickoffMs===null?1:0)-(b.kickoffMs===null?1:0)
    ||(a.kickoffMs!==null&&b.kickoffMs!==null?a.kickoffMs-b.kickoffMs:0)
    ||String(a.sourceDate||"").localeCompare(String(b.sourceDate||""))
    ||String(a.sourceTime||"").localeCompare(String(b.sourceTime||""))
    ||alphaCollator.compare(a.home,b.home)
  ),[matches,date,league,scope,phase,feature,query]);
  const groups=[];
  for(const row of visible){
    const key=row.info.display;
    let group=groups.find(g=>g.key===key);
    if(!group){group={key,info:row.info,fixtures:[]};groups.push(group);}
    group.fixtures.push(row);
  }
  const clear=()=>{setQuery("");setDate("");setLeague("");setScope("all");setPhase("all");setFeature("all");};
  const hasFilters=Boolean(query||date||league||scope!=="all"||phase!=="all"||feature!=="all");
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
    {key:"all",icon:"calendar",label:"Matches",value:fixtureCount,hint:"All fixtures",active:phase==="all"&&feature==="all"&&!hasFilters,test:"overview-matches"},
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
          <span data-testid="advisor-forebet-summary"><i aria-hidden="true">◇</i> Forebet · {verifiedStatus==="ready"?counts.forebet:"—"} saved forecasts</span>
          <span data-testid="advisor-dc-summary"><i aria-hidden="true">◈</i> Dixon–Coles · {verifiedStatus==="ready"?counts.dc:"—"} verified forecasts</span>
          <span data-testid="advisor-pi-summary"><i aria-hidden="true">◇</i> Power Index · {verifiedStatus==="ready"?counts.pi:"—"} (same model source)</span>
          <span data-testid="advisor-form-summary"><i aria-hidden="true">○</i> Form · {verifiedStatus==="ready"&&counts.form>0?counts.form+" verified forecasts":"Legacy inactive"}</span>
          <span><i aria-hidden="true">○</i> BetClan · Not connected</span>
          <span><i aria-hidden="true">○</i> SportyTrader · Not connected</span>
          <small>Prices are bookmaker quotes, not independent predictions. Missing or retired sources do not count as picks.</small>
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
          <strong><Icon name="trophy"/> Leagues</strong>
          <FilterButton active={scope==="all"} onClick={()=>setScope("all")} testId="scope-all">All <span>{counts.all}</span></FilterButton>
          <FilterButton active={scope==="top"} onClick={()=>setScope("top")} testId="scope-top">★ Top <span>{counts.top}</span></FilterButton>
          <FilterButton active={scope==="other"} onClick={()=>setScope("other")} testId="scope-other">Other <span>{counts.other}</span></FilterButton>
        </div>
        <div className="ft-filter-row" aria-label="Match status">
          <strong><Icon name="live"/> Status</strong>
          {[["all","All"],["live","● Live"],["upcoming","◷ Upcoming"],["started","▶ Started"],["finished","✓ Finished"],["unknown","? Time TBC"]].map(([key,label])=>
            <FilterButton key={key} active={phase===key} onClick={()=>setPhase(key)} testId={"status-"+key}>{label}</FilterButton>)}
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
            return <a className="ft-match-row" data-testid="fixture-row" href={"/details?id="+encodeURIComponent(m.id)} key={m.id}>
              <div className="ft-fixture-main">
                <div className="ft-fixture-teams">
                  <span className="ft-team-home" data-testid="home-team-name"><TeamNameWithLogo team={m.home} logoTeam={m.home} context={m.league} size={22}/></span>
                  <span className="ft-team-away" data-testid="away-team-name"><TeamNameWithLogo team={m.away} logoTeam={m.away} context={m.league} size={22}/></span>
                </div>
                <MatchChips evidence={m.evidence}/>
              </div>
              <div className="ft-kickoff-cell">
                <span className={"ft-match-state ft-match-state-"+m.phase}>{m.phase==="live"&&<i className="ft-live-dot"/>}{statusLabel}</span>
                <b className="ft-kickoff-value" data-testid="uk-kickoff">{m.UKTime||"—:—"}</b>
                <small>{m.UKTime?(m.tz||"UK")+" · UK": "UK time unverified"}</small>
              </div>
              <div className="ft-odds-cell">
                {odds?<><div className={"ft-odds-mini"+(m.quote?.type==="previous"?" ft-odds-previous":"")} aria-label={(m.quote?.type==="recent"?"Recent":"Earlier")+" H/D/A odds"}>
                  {["H","D","A"].map((type,i)=><span key={type}><small>{type}</small><b>{odds[i]}</b></span>)}
                </div><small data-testid="match-odds-status">{m.quote?.type==="recent"?"Recent":"Earlier"} · {m.quote?.source} · {quoteTimeUK.format(m.quote.capturedAt)} UK</small></>:
                <span className="ft-odds-unavailable">— <small>No recorded odds</small></span>}
              </div>
              <span className="ft-row-arrow" aria-hidden="true">›</span>
            </a>;
          })}
        </section>)}
      </div>
      {!visible.length&&status!=="loading"&&<div className="ft-empty-state" role="status">
        <Icon name="filter"/><strong>No matches match these filters.</strong>
        <button onClick={clear} type="button">Show all matches</button>
      </div>}
    </section>
  </main>;
}
