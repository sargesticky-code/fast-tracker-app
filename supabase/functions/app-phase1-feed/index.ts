import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import {footballDataCodeForLeague,predictFlashscoreFixtureExperimental}
  from "./dc-experimental.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const DB_READ_TIMEOUT_MS = 15_000;
const UPSTREAM_READ_TIMEOUT_MS = 45_000;
function boundedDbFetch(input:any, init:any = {}) {
  return fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(DB_READ_TIMEOUT_MS) });
}
function createReadClient(url:string, key:string) {
  return createClient(url, key, {
    auth: { persistSession:false, autoRefreshToken:false },
    db: { retry:false },
    global: { fetch: boundedDbFetch },
  });
}
function createReadClientWithTimeout(url:string,key:string,timeoutMs:number){
  return createClient(url,key,{
    auth:{persistSession:false,autoRefreshToken:false},
    db:{retry:false},
    global:{fetch:(input:any,init:any={})=>fetch(input,{...init,signal:init?.signal??AbortSignal.timeout(timeoutMs)})},
  });
}


function num(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function identityKey(v: unknown) {
  return String(v ?? "").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function clampProb(v: number) {
  return Math.min(0.999, Math.max(0.001, v));
}

function logit(p: number) {
  const q = clampProb(p);
  return Math.log(q / (1 - q));
}

function logistic(x: number) {
  return 1 / (1 + Math.exp(-x));
}

function poissonOver(meanValue: unknown, lineValue: unknown) {
  const mean = num(meanValue);
  const line = num(lineValue);
  if (mean == null || line == null || mean <= 0 || line < 0) return null;
  const threshold = Math.floor(line) + 1;
  let term = Math.exp(-mean);
  let cdf = term;
  for (let k = 1; k < threshold; k += 1) {
    term *= mean / k;
    cdf += term;
  }
  return Math.min(0.999, Math.max(0.001, 1 - cdf));
}

function lineModel(
  targetLineValue: unknown,
  avgValue: unknown,
  refLine: number,
  refOverValue: unknown,
  minLine: number,
  maxLine: number,
) {
  const targetLine = num(targetLineValue);
  const avg = num(avgValue);
  const refOver = num(refOverValue);
  if (targetLine == null || targetLine < minLine || targetLine > maxLine) return null;

  if (Math.abs(targetLine - refLine) < 0.001 && refOver != null && refOver > 0 && refOver < 1) {
    return {
      line: targetLine,
      over: refOver,
      under: 1 - refOver,
      avg,
      native: true,
      derived: false,
      method: "FOREBET_NATIVE",
      anchorLine: refLine,
    };
  }

  const baseTarget = poissonOver(avg, targetLine);
  if (baseTarget == null) return null;

  if (refOver != null && refOver > 0 && refOver < 1) {
    const baseRef = poissonOver(avg, refLine);
    if (baseRef != null) {
      const shifted = logistic(logit(baseTarget) + (logit(refOver) - logit(baseRef)));
      return {
        line: targetLine,
        over: shifted,
        under: 1 - shifted,
        avg,
        native: false,
        derived: true,
        method: "FOREBET_ANCHORED_POISSON",
        anchorLine: refLine,
      };
    }
  }

  return {
    line: targetLine,
    over: baseTarget,
    under: 1 - baseTarget,
    avg,
    native: false,
    derived: true,
    method: "FOREBET_AVG_POISSON",
    anchorLine: refLine,
  };
}

function handicapParts(v: unknown) {
  const s=String(v ?? "").trim();
  if(!s) return [];
  return s.split("/").map(x=>Number(x)).filter(Number.isFinite);
}
function poissonPmf(lambda:number,max=10){
  const a:number[]=[]; let p=Math.exp(-lambda); a.push(p);
  for(let k=1;k<=max;k++){ p*=lambda/k; a.push(p); }
  return a;
}
function asianEv(homeXg:unknown,awayXg:unknown,lineValue:unknown,oddsValue:unknown,side:"HOME"|"AWAY"){
  const hx=num(homeXg), ax=num(awayXg), odds=num(oddsValue), parts=handicapParts(lineValue);
  if(hx==null||ax==null||hx<=0||ax<=0||odds==null||odds<=1||!parts.length) return null;
  const hp=poissonPmf(hx), ap=poissonPmf(ax); let ev=0, mass=0;
  for(let h=0;h<hp.length;h++) for(let a=0;a<ap.length;a++){
    const pr=hp[h]*ap[a]; mass+=pr; let settle=0;
    for(const homeLine of parts){
      const margin=side==="HOME" ? (h-a+homeLine) : (a-h-homeLine);
      settle += margin>1e-9 ? odds-1 : margin<-1e-9 ? -1 : 0;
    }
    ev += pr*(settle/parts.length);
  }
  if(mass>0) ev/=mass;
  return { ev, edgePct:ev*100, fairOdds: ev>-0.999 ? odds/(1+ev) : null };
}
function statNum(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function statPair(stats: any, keys: string[]) {
  if (!Array.isArray(stats)) return null;
  const wanted = new Set(keys.map((x) => x.toLowerCase()));
  const ordered = [...stats].sort((a, b) => {
    const pa = String(a?.period ?? "").toLowerCase();
    const pb = String(b?.period ?? "").toLowerCase();
    const wa = pa === "all" || pa === "match" ? 0 : 1;
    const wb = pb === "all" || pb === "match" ? 0 : 1;
    return wa - wb;
  });
  for (const row of ordered) {
    const key = String(row?.key ?? "").toLowerCase();
    if (!wanted.has(key)) continue;
    const home = statNum(row?.home);
    const away = statNum(row?.away);
    if (home != null || away != null) return { home, away };
  }
  return null;
}

function compactLiveStats(row: any) {
  if (!row) return null;
  return {
    capturedAt: row.captured_at_hkt ?? null,
    detailStatus: row.detail_status ?? null,
    source: row.source ?? null,
    confidence: num(row.match_confidence),
    xg: statPair(row.team_stats, ["expected_goals"]),
    xgot: statPair(row.team_stats, ["expected_goals_on_target"]),
    shots: statPair(row.team_stats, ["total_shots", "shots"]),
    shotsOnTarget: statPair(row.team_stats, ["shotsontarget"]),
    possession: statPair(row.team_stats, ["ballpossesion"]),
    bigChances: statPair(row.team_stats, ["big_chance"]),
    boxTouches: statPair(row.team_stats, ["touches_opp_box"]),
    corners: statPair(row.team_stats, ["corners"]),
  };
}

function authorityFreshness(fetchedAt: unknown) {
  if (!fetchedAt) return { status: "MISSING", ageMinutes: null };
  const ageMinutes = Math.max(0, (Date.now() - new Date(String(fetchedAt)).getTime()) / 60000);
  if (!Number.isFinite(ageMinutes)) return { status: "UNKNOWN", ageMinutes: null };
  if (ageMinutes > 20) return { status: "STALE", ageMinutes };
  return { status: "FRESH", ageMinutes };
}

function noVig(home: unknown, draw: unknown, away: unknown) {
  const h = num(home), d = num(draw), a = num(away);
  if (h == null || d == null || a == null || h <= 1 || d <= 1 || a <= 1) return null;
  const ih = 1 / h, id = 1 / d, ia = 1 / a;
  const total = ih + id + ia;
  if (!(total > 0)) return null;
  return { home: ih / total, draw: id / total, away: ia / total };
}


// Parse only full-match Flashscore SG/SH/SI triplets; preserve provenance.
function observedFlashscoreStats(detail:any,kickoff:any){
  const raw=detail?.detail_raw?.statistics_raw;
  const observedAt=detail?.detail_fetched_at;
  if(typeof raw!=="string"||!raw.startsWith("SE÷Match"))return null;
  const capturedMs=Date.parse(String(observedAt||""));
  const kickoffMs=Date.parse(String(kickoff||""));
  if(!Number.isFinite(capturedMs)||!Number.isFinite(kickoffMs)
     ||capturedMs<kickoffMs||capturedMs>Date.now()+60_000)return null;
  const section=raw.split("¬~SE÷")[0];
  const labels:any={"Expected goals (xG)":"xg","xG on target (xGOT)":"xgot",
    "Ball possession":"possession","Total shots":"shots","Shots on target":"shotsOnTarget",
    "Big chances":"bigChances","Corner kicks":"corners"};
  const stats:any={};
  for(const item of section.split("¬~")){
    const m=item.match(/(?:^|¬)SG÷([^¬~]+)¬SH÷([^¬~]+)¬SI÷([^¬~]+)/);
    if(!m||!labels[m[1]])continue;
    const read=(v:string)=>{const x=String(v).match(/^-?(?:\d+(?:\.\d+)?|\.\d+)/);return x?Number(x[0]):null;};
    const home=read(m[2]),away=read(m[3]);
    if(home!==null&&away!==null&&!stats[labels[m[1]]])stats[labels[m[1]]]={home,away};
  }
  if(!stats.shots||!stats.corners||!stats.possession)return null;
  return {source:"FLASHSCORE",capturedAt:observedAt,
    freshness:(Date.now()-capturedMs)<=20*60000?"FRESH":"HISTORICAL_SNAPSHOT",
    semantics:"OBSERVED_MATCH_STATS_NOT_VERIFIED_LIVE_STATUS",stats};
}

// Optional external advisers share the existing response and exact fixture IDs.
// Failure here must never remove fixtures, prices or the existing advisers.
async function withExternalAdvisers(db:any,matches:any[]) {
  try {
    const {data,error}=await db.from("adviser_prediction_current")
      .select("provider,source_event_id,canonical_event_id,source_url,source_home,source_away,source_kickoff,last_seen_at,observation")
      .limit(240);
    if(error||!Array.isArray(data))return matches;
    const byId=new Map<string,any[]>();
    for(const r of data){
      const rows=byId.get(r.canonical_event_id)||[];
      rows.push({provider:r.provider,eventId:r.source_event_id,id:r.canonical_event_id,
        sourceUrl:r.source_url,sourceHome:r.source_home,sourceAway:r.source_away,
        kickoff:r.source_kickoff,capturedAt:r.last_seen_at,identityStatus:"VERIFIED",
        hda:r.observation?.hda??null,predictedScore:r.observation?.predicted_score??null,
        over25:r.observation?.over25??null,bttsYes:r.observation?.btts_yes??null,
        tip:r.observation?.tip??null});byId.set(r.canonical_event_id,rows);
    }
    return matches.map(m=>({...m,externalAdvisers:byId.get(m.id)||[]}));
  } catch {return matches;}
}

// Homepage only needs exact-ID forecast badges and canonical fallback context.
// This response shape is deliberately compact and requires NO additional SQL.
function verifiedCompactSummaryRow(m: any) {
  const src=m?.sourceContext??{};
  const c=src.lineupCoverage??{};
  const detail=m?.forebetDetail??{};
  return {
    id:m.id,kickoff:m.kickoff,league:m.league,home:m.home,away:m.away,
    scoreHome:m.scoreHome,scoreAway:m.scoreAway,scoreSource:m.scoreSource,
    status:m.status??null,liveNow:m.liveNow===true,
    // The canonical feed already applies the strict current-price freshness gate.
    // Preserve these exact-ID prices for collector-outage fallback instead of
    // replacing them with unknown values in the compact projection.
    odds:m.odds??null,
    oddsCapturedAt:m.health?.authorityFetchedAt??null,
    oddsLabel:m.sourceContext?.marketAuthority==="CHINA_500_SPF"
      ? "China 500 reference" : "Bookmaker reference",
    externalAdvisers:m.externalAdvisers??[],
    oddsMovement:m.oddsMovement??null,
    historicalForm:m.historicalForm??null,
    forebet:m.forebet??null,
    forebetDetail:{
      predictedScore:detail.predictedScore??null,
      ou25:detail.ou25??null,
      corners95:detail.corners95??null,
      fetchedAt:detail.fetchedAt??null
    },
    // The full summary already joins these exact canonical match IDs.
    // Project minimal provenance into the existing compact response instead
    // of inventing a second fetch or treating sibling models as independent
    // external sources. The browser must independently enforce freshness.
    advisors:{
      dc:m.dc??null,
      pi:m.pi??null,
      form:m.form??null,
      dcMeta:m.dcDetail?{
        quality:m.dcDetail.quality??null,
        source:m.dcDetail.source??null,
        fetchedAt:m.dcDetail.fetchedAt??null,
        trainingMatches:m.dcDetail.trainingMatches??null
      }:null,
      formMeta:m.formDetail?{
        quality:m.formDetail.quality??null,
        source:m.formDetail.source??null,
        fetchedAt:m.formDetail.fetchedAt??null
      }:null
    },
    sourceContext:{
      source:src.source??null,
      lineupAvailable:src.lineupAvailable===true,
      lineupCoverage:{homeStarters:c.homeStarters??null,awayStarters:c.awayStarters??null,
        updatedAt:c.updatedAt??null},
      observedStats:src.observedStats??null
    }
  };
}

function directAuthoritySummaryRow(r: any, liveNow = false) {
  const freshness = authorityFreshness(r.fetched_at);
  const pricesFresh = freshness.status === "FRESH" && new Date(String(r.kickoff_hkt||0)).getTime()>Date.now();
  // Distinct China Sports Lottery SPF evidence. Never claim Bet365 provenance,
  // never treat upstream source-updated time as equal to retrieval time.
  const chinaSourceMs=Date.parse(String(r.china500_source_updated_at??""));
  const chinaCaptureMs=Date.parse(String(r.china500_captured_at??""));
  const chinaAge=Date.now()-chinaSourceMs;
  const chinaCaptureAge=Date.now()-chinaCaptureMs;
  const chinaHad={home:num(r.china500_home),draw:num(r.china500_draw),away:num(r.china500_away)};
  // SPF remains reference-only even when source_updated_at is <=24h; no EV or live claim.
  const chinaFresh=!liveNow && Date.parse(String(r.kickoff_hkt??""))>Date.now() &&
    Number.isFinite(chinaAge) && chinaAge>=0 && chinaAge<=24*60*60*1000 &&
    Number.isFinite(chinaCaptureAge) && chinaCaptureAge>=0 && chinaCaptureAge<=75*60*1000 &&
    Object.values(chinaHad).every(x=>x!=null && x>=1.01 && x<=100);
  const had = pricesFresh
    ? { home: num(r.had_home), draw: num(r.had_draw), away: num(r.had_away) }
    : { home: null, draw: null, away: null };
  const handicap = pricesFresh && !chinaFresh
    ? { line: r.hdc_line ?? null, home: num(r.hdc_home), away: num(r.hdc_away) }
    : { line: null, home: null, away: null };
  const goals = pricesFresh && !chinaFresh
    ? { line: r.hil_line ?? null, over: num(r.hil_over), under: num(r.hil_under) }
    : { line: null, over: null, under: null };
  const corners = pricesFresh && !chinaFresh
    ? { line: r.chl_line ?? null, over: num(r.chl_over), under: num(r.chl_under) }
    : { line: null, over: null, under: null };
  // The single indexed summary RPC carries optional Forebet evidence as well.
  // Never reuse stale historical rows as a current prediction.
  const forebetTime=Date.parse(String(r.forebet_captured_at??""));
  const modelAge=Date.now()-forebetTime;
  const fh=num(r.forebet_home),fd=num(r.forebet_draw),fa=num(r.forebet_away);
  const favg=num(r.forebet_avg_goals);
  const modelSum=(fh??0)+(fd??0)+(fa??0);
  const validForebet=Number.isFinite(modelAge) && modelAge>=0 &&
    modelAge<=72*60*60*1000 && fh!=null && fd!=null && fa!=null &&
    [fh,fd,fa].every(p=>p>=0&&p<=1) && modelSum>=0.98 && modelSum<=1.02 &&
    typeof r.forebet_predicted_score==="string" &&
    /^\d{1,2}\s*-\s*\d{1,2}$/.test(r.forebet_predicted_score.trim()) &&
    favg!=null && favg>0;
  return {
    id: r.match_id,
    kickoff: r.kickoff_hkt,
    status: r.status ?? null,
    league: r.tournament ?? null,
    leagueZh: r.tournament ?? null,
    home: r.home_en ?? null,
    away: r.away_en ?? null,
    homeZh: r.home_en ?? null,
    awayZh: r.away_en ?? null,
    inPlay: liveNow,
    liveEligible: Boolean(liveNow || r.live_eligible),
    liveNow,
    // Source-verified AG/AH scores are independent of prematch probabilities.
    scoreHome: r.fs_home_score == null ? null : num(r.fs_home_score),
    scoreAway: r.fs_away_score == null ? null : num(r.fs_away_score),
    scoreCapturedAt: r.fs_score_fetched_at ?? null,
    scoreSource: r.fs_home_score != null && r.fs_away_score != null ? "FLASHSCORE" : null,
    live: liveNow ? {
      status: r.status ?? null,
      fetchedAt: r.fs_score_fetched_at ?? null,
      poolStatus: r.pool_status ?? null,
      oddsUpdatedAt: null,
      odds: { home: null, draw: null, away: null },
      oddsSemantics: "NO_VERIFIED_IN_PLAY_BOOKMAKER_ODDS",
      referenceOdds: {
        ...had,
        capturedAt: r.fetched_at ?? null,
        source: r.source ?? "FLASHSCORE_BET365",
        semantics: "PREMATCH_OR_NON_LIVE_REFERENCE_ONLY"
      },
      handicap: { line: null, home: null, away: null },
      goals: { line: null, over: null, under: null },
      corners: { line: null, over: null, under: null },
      score: r.fs_home_score != null && r.fs_away_score != null ? {
        home: num(r.fs_home_score), away: num(r.fs_away_score),
        text: `${r.fs_home_score} - ${r.fs_away_score}`,
        source:"FLASHSCORE", capturedAt:r.fs_score_fetched_at??null,
        status:r.status??"LIVE"
      } : null,
      stats: null,
      shadow: null,
    } : null,
    odds: chinaFresh ? chinaHad : had,
    // Only observed reference prices; the decision/value engine remains null.
    market: !chinaFresh && pricesFresh ? noVig(r.had_home,r.had_draw,r.had_away) : null,
    handicap,
    handicapAdvice: {
      status: "NO_MODEL",
      line: handicap.line,
      reason: pricesFresh
        ? "Model enrichment unavailable in summary recovery mode"
        : chinaFresh ? "China Sports Lottery SPF reference prices; no independent value model" : "Bet365 price snapshot is stale or unavailable; fixture identity only"
    },
    goals,
    corners,
    forebetDetail:validForebet?{
      predictedScore:r.forebet_predicted_score.trim(),
      ou25:{
        line:2.5, // Forebet source page explicitly shows Under/Over 2.5
        over:r.forebet_ou_over==null?null:num(r.forebet_ou_over),
        under:r.forebet_ou_under==null?null:num(r.forebet_ou_under),
        pick:r.forebet_ou_pick??null,
        avgGoals:num(r.forebet_avg_goals)
      },
      corners95:{
        line:9.5, // Forebet source page explicitly shows Under/Over 9.5
        over:r.forebet_corner_over==null?null:num(r.forebet_corner_over),
        under:r.forebet_corner_under==null?null:num(r.forebet_corner_under),
        pick:r.forebet_corner_pick??null,
        predictedScore:r.forebet_corner_score??null,
        avgCorners:r.forebet_avg_corners==null?null:num(r.forebet_avg_corners)
      },
      goalsCurrentLine:null,cornersCurrentLine:null,
      fetchedAt:r.forebet_captured_at,source:"FOREBET",
    }:null,
    multisourceDetail: null,
    forebet:validForebet?{home:fh,draw:fd,away:fa}:null,
    dc: null,
    dcDetail: null,
    pi: null,
    piDetail: null,
    form: null,
    // Observed football-data.co.uk domestic league results, not a forecast or live statistic.
    historicalForm: {
      home: r.historical_form_home ?? null,
      away: r.historical_form_away ?? null,
    },
    formDetail: null,
    multi: null,
    health: {
      status: chinaFresh ? "REFERENCE" : (freshness.status === "FRESH" ? "OK" : "ATTENTION"),
      primaryMissingReason: "SUMMARY_AUTHORITY_ONLY",
      diagnostics: freshness.status === "FRESH" ? [] : ["BET365_AUTHORITY_" + freshness.status],
      authorityFetchedAt: chinaFresh ? r.china500_captured_at : (r.fetched_at ?? null),
      priceChangedAt: chinaFresh ? r.china500_source_updated_at : (r.odds_updated_at ?? null),
      marketCapturedAt: r.fetched_at ?? null,
      authorityFetchAgeMinutes: freshness.ageMinutes,
      authorityFreshness: chinaFresh ? "REFERENCE_ONLY" : freshness.status,
      evidenceChannelCount: 0,
      multisourceMemberCount: 0,
      missingCanonical1x2: (!pricesFresh && !chinaFresh) || (!chinaFresh && (had.home == null || had.draw == null || had.away == null)),
      unifiedCoverageStatus: chinaFresh ? "CHINA_500_SPF_REFERENCE" : "FLASHSCORE_BET365",
      coverageExplanation: chinaFresh
        ? "Canonical fixture identity and dated China 500 Sports Lottery SPF reference quotes; not live bookmaker prices or verified value evidence."
        : pricesFresh
        ? "Canonical fixture identity and fresh Bet365 prices are available; model enrichment is temporarily unavailable."
        : "Canonical fixture identity is available, but Bet365 prices are stale or missing; odds and model actionability are suppressed.",
    },
    decision: null,
    decisionMarket: null,
    decisionSelection: null,
    decisionEdge: null,
    engineVersion: null,
    oddsMovement: null,
    power: null,
    storySummary: null,
    sourceContext:{
      ...(chinaFresh ? {marketAuthority:"CHINA_500_SPF",
        quoteSemantics:"PREMATCH_REFERENCE_ONLY",sourceUpdatedAt:r.china500_source_updated_at,
        capturedAt:r.china500_captured_at} : {}),
      source:"FLASHSCORE",matchConfidence:1,
      identityStatus:"EXACT_CANONICAL_PROVIDER_FIXTURE",
      lineupAvailable:r.flashscore_verified_source_xi===true,
      lineupCoverage:r.flashscore_verified_source_xi===true?{
        source:"FLASHSCORE_OFFICIAL",starters:22,homeStarters:11,awayStarters:11,
        confirmedStarters:22,updatedAt:r.flashscore_xi_observed_at??null
      }:null
    },
    updatedAt: chinaFresh ? r.china500_captured_at : (r.updated_at ?? r.fetched_at ?? null),
  };
}


function evidenceTriplet(row:any){
  const home=num(row?.prob_home), draw=num(row?.prob_draw), away=num(row?.prob_away);
  return home==null||draw==null||away==null ? null : {home,draw,away};
}

function fotmobTopRatedPlayers(playerStats:any) {
  if (!playerStats || typeof playerStats !== "object" || Array.isArray(playerStats)) return [];
  return Object.values(playerStats).flatMap((player:any) => {
    const name=String(player?.name??"").trim();
    const sections=Array.isArray(player?.stats)?player.stats:[];
    const top=sections.find((section:any)=>section?.key==="top_stats")?.stats??{};
    const rating=Number(top?.["FotMob rating"]?.stat?.value);
    if (!name || !Number.isFinite(rating) || rating<=0 || rating>10) return [];
    const numOrNull=(v:any)=>v===null||v===undefined||v===""
      ? null : Number.isFinite(Number(v))?Number(v):null;
    return [{id:String(player?.id??""),name,rating:Math.round(rating*100)/100,
      goals:numOrNull(top?.Goals?.stat?.value),
      assists:numOrNull(top?.Assists?.stat?.value)}];
  }).sort((a:any,b:any)=>b.rating-a.rating||a.name.localeCompare(b.name)).slice(0,3);
}

async function lightweightFullRecovery(supabaseUrl:string,serverKey:string,db:any,hours:number){
  const headers={ Authorization:`Bearer ${serverKey}`, apikey:serverKey };
  const summaryRes=await fetch(`${supabaseUrl}/functions/v1/app-phase1-feed?hours=${hours}&view=summary`,{
    headers,
    signal:AbortSignal.timeout(12_000),
  });
  if(!summaryRes.ok) throw new Error(`summary_recovery_http_${summaryRes.status}`);
  const summary=await summaryRes.json();
  const matches=Array.isArray(summary?.matches)?summary.matches:[];
  const ids=matches.map((m:any)=>String(m?.id||"")).filter(Boolean);
  if(!ids.length){
    return {...summary,source:"supabase-lightweight-enrichment-recovery",view:"full",recoveryMode:"AUTHORITY_ONLY"};
  }

  const [evidenceResult,modelResult,lineupResult,sourceDetailResult]=await Promise.all([
    db
      .from("prediction_evidence_feed_current")
      .select("match_id,source_key,market_key,source_updated_at,status,pick,predicted_score,prob_home,prob_draw,prob_away,prob_over,prob_under,avg_goals,avg_corners,confidence,updated_at")
      .in("match_id",ids),
    db.from("model_prediction_current")
      .select("match_id,fetched_at,quality,model_source,model_league,training_matches,team_match_quality,dc_prob_home,dc_prob_draw,dc_prob_away,dc_xg_home,dc_xg_away,dc_prob_over25,pi_prob_home,pi_prob_draw,pi_prob_away,pi_home_rating,pi_away_rating,pi_diff")
      .in("match_id",ids),
    db.from("lineup_evidence_current")
      .select("match_id,player_key,team_side,starter,confirmed,source_name,source_updated_at")
      .in("match_id",ids)
      .in("source_name",["FOTMOB_OFFICIAL","FOTMOB_PREDICTED","FLASHSCORE_OFFICIAL","SOFASCORE"])
      .eq("starter",true),
    db.from("source_match_detail_current")
      .select("match_id,source_key,detail_raw,detail_fetched_at,updated_at")
      .in("match_id",ids)
      .eq("source_key","FOTMOB"),
  ]);

  const evidenceRows=Array.isArray(evidenceResult.data)?evidenceResult.data:[];
  const modelRows=Array.isArray(modelResult.data)?modelResult.data:[];
  const evidenceById=new Map<string,any[]>();
  for(const row of evidenceRows){
    const id=String(row?.match_id||"");
    if(!id) continue;
    const bucket=evidenceById.get(id)||[];
    bucket.push(row);
    evidenceById.set(id,bucket);
  }
  const modelById=new Map(modelRows.map((row:any)=>[String(row?.match_id||""),row]));

  const sourceDetailRows=Array.isArray(sourceDetailResult.data)?sourceDetailResult.data:[];
  const sourceDetailById=new Map<string,any>();
  for(const row of sourceDetailRows){
    const id=String(row?.match_id||"");
    if(!id)continue;
    const current=sourceDetailById.get(id);
    const ts=new Date(row?.detail_fetched_at||row?.updated_at||0).getTime();
    const currentTs=new Date(current?.detail_fetched_at||current?.updated_at||0).getTime();
    if(!current||ts>=currentTs)sourceDetailById.set(id,row);
  }

  const lineupRows=Array.isArray(lineupResult.data)?lineupResult.data:[];
  const lineupByEventSource=new Map<string,any>();
  const allLineupPlayerKeys=new Set<string>();
  for(const row of lineupRows){
    const id=String(row?.match_id||"");
    const source=String(row?.source_name||"UNKNOWN");
    if(!id)continue;
    const key=id+"|"+source;
    const state=lineupByEventSource.get(key)||{id,source,home:0,away:0,confirmed:0,playerKeys:new Set<string>(),updatedAt:null};
    if(row?.team_side==="H")state.home++;
    if(row?.team_side==="A")state.away++;
    if(row?.confirmed)state.confirmed++;
    if(row?.player_key){state.playerKeys.add(String(row.player_key));allLineupPlayerKeys.add(String(row.player_key));}
    if(!state.updatedAt || new Date(row?.source_updated_at||0).getTime()>new Date(state.updatedAt||0).getTime())state.updatedAt=row?.source_updated_at||null;
    lineupByEventSource.set(key,state);
  }
  let profileKeys=new Set<string>();
  if(allLineupPlayerKeys.size){
    const profileResult=await db.from("phase2_players").select("player_key,profile").in("player_key",[...allLineupPlayerKeys].slice(0,1000));
    if(!profileResult.error){
      profileKeys=new Set((profileResult.data??[]).filter((r:any)=>r.profile!=null).map((r:any)=>String(r.player_key)));
    }
  }
  const lineupSourceRank=(source:string)=>source==="FOTMOB_OFFICIAL"?4:source==="FLASHSCORE_OFFICIAL"?3:source==="SOFASCORE"?2:source==="FOTMOB_PREDICTED"?1:0;
  const lineupBestByEvent=new Map<string,any>();
  for(const state of lineupByEventSource.values()){
    if(state.home!==11||state.away!==11)continue;
    const current=lineupBestByEvent.get(state.id);
    if(!current||lineupSourceRank(state.source)>lineupSourceRank(current.source))lineupBestByEvent.set(state.id,state);
  }

  const recovered=matches.map((m:any)=>{
    const id=String(m?.id||"");
    const rows=evidenceById.get(id)||[];
    const find=(source:string,market:string)=>rows.find((r:any)=>
      String(r?.source_key||"").toUpperCase()===source &&
      String(r?.market_key||"").toUpperCase()===market
    )||null;
    const fbHda=find("FOREBET","1X2");
    const fbOu=find("FOREBET","OU25");
    const fbCorners=find("FOREBET","CORNERS95");
    const formRow=find("FORM","1X2");
    const model:any=modelById.get(id)||null;
    const modeled=model?.quality==="MODELED";
    const forebet=evidenceTriplet(fbHda);
    const form=evidenceTriplet(formRow);
    const dc=modeled?evidenceTriplet({
      prob_home:model?.dc_prob_home,prob_draw:model?.dc_prob_draw,prob_away:model?.dc_prob_away
    }):null;
    const pi=modeled?evidenceTriplet({
      prob_home:model?.pi_prob_home,prob_draw:model?.pi_prob_draw,prob_away:model?.pi_prob_away
    }):null;
    const evidenceCount=[forebet,dc,pi,form].filter(Boolean).length;
    return {
      ...m,
      forebet,
      dc,
      pi,
      form,
      forebetDetail:{
        predictedScore:fbHda?.predicted_score??null,
        ou25:{line:2.5,over:num(fbOu?.prob_over),under:num(fbOu?.prob_under),
          pick:fbOu?.pick??null,avgGoals:num(fbOu?.avg_goals ?? fbHda?.avg_goals)},
        corners95:{line:9.5,over:num(fbCorners?.prob_over),under:num(fbCorners?.prob_under),
          pick:fbCorners?.pick??null,avgCorners:num(fbCorners?.avg_corners)},
        goalsCurrentLine:lineModel(m?.goals?.line,fbOu?.avg_goals,2.5,fbOu?.prob_over,0.5,6.5),
        cornersCurrentLine:lineModel(m?.corners?.line,fbCorners?.avg_corners,9.5,fbCorners?.prob_over,4.5,16.5),
      },
      dcDetail:modeled?{
        quality:model?.quality??null,
        source:model?.model_source??null,
        league:model?.model_league??null,
        fetchedAt:model?.fetched_at??null,
        trainingMatches:Number(model?.training_matches??0),
        teamMatchQuality:num(model?.team_match_quality),
        probabilities:dc,
        expectedGoals:{home:num(model?.dc_xg_home),away:num(model?.dc_xg_away)},
        over25:num(model?.dc_prob_over25),
        available:Boolean(dc),
        missingReason:dc?null:(model?.quality??"NO_MODEL_ROW"),
      }:null,
      piDetail:modeled?{
        quality:model?.quality??null,
        source:model?.model_source??null,
        league:model?.model_league??null,
        fetchedAt:model?.fetched_at??null,
        trainingMatches:Number(model?.training_matches??0),
        teamMatchQuality:num(model?.team_match_quality),
        probabilities:pi,
        ratings:{home:num(model?.pi_home_rating),away:num(model?.pi_away_rating),difference:num(model?.pi_diff)},
        available:Boolean(pi),
        missingReason:pi?null:(model?.quality??"NO_MODEL_ROW"),
      }:null,
      sourceContext:(()=>{
        const lineup=lineupBestByEvent.get(id);
        const detail=sourceDetailById.get(id);
        const content=detail?.detail_raw?.content||{};
        const playerStats=content?.playerStats;
           const fotmobPlayers=fotmobTopRatedPlayers(playerStats);
        const playerStatsAvailable=Boolean(playerStats&&typeof playerStats==="object"&&!Array.isArray(playerStats)&&Object.keys(playerStats).length);
        const matchStatsAvailable=Boolean(content?.stats||playerStatsAvailable);
        const shotRows=Array.isArray(content?.shotmap?.shots)?content.shotmap.shots:[];
        const xgAvailable=shotRows.some((shot:any)=>Number.isFinite(Number(shot?.expectedGoals)))
          || JSON.stringify(content?.stats||{}).toLowerCase().includes("expected_goals");
        if(!lineup&&!detail)return m?.sourceContext??null;
        return {
          ...(m?.sourceContext||{}),
          source:"FOTMOB",
          lineupAvailable:Boolean(lineup)||Boolean(m?.sourceContext?.lineupAvailable),
          statsAvailable:matchStatsAvailable||Boolean(m?.sourceContext?.statsAvailable),
          xgAvailable:xgAvailable||Boolean(m?.sourceContext?.xgAvailable),
          detailFetchedAt:detail?.detail_fetched_at??m?.sourceContext?.detailFetchedAt??null,
          fotmobPlayers,
          lineupCoverage:lineup?{
            source:lineup.source,
            starters:lineup.home+lineup.away,
            homeStarters:lineup.home,
            awayStarters:lineup.away,
            confirmedStarters:lineup.confirmed,
            profileCount:[...lineup.playerKeys].filter((key:string)=>profileKeys.has(key)).length,
            updatedAt:lineup.updatedAt
          }:(m?.sourceContext?.lineupCoverage??null)
        };
      })(),
      health:{
        ...(m?.health||{}),
        evidenceChannelCount:evidenceCount,
        unifiedCoverageStatus:evidenceCount>=3?"DATA_RICH":evidenceCount>=1?"PARTIAL_MODEL_COVERAGE":(m?.health?.unifiedCoverageStatus||"FLASHSCORE_BET365"),
        recoveryMode:"LIGHTWEIGHT_CANONICAL_EVIDENCE",
        enrichmentErrors:{
          predictionEvidence:evidenceResult.error?String(evidenceResult.error.message||evidenceResult.error):null,
          modelPredictions:modelResult.error?String(modelResult.error.message||modelResult.error):null,
          sourceDetail:sourceDetailResult.error?String(sourceDetailResult.error.message||sourceDetailResult.error):null,
        },
      },
    };
  });

  return {
    ...summary,
    source:"supabase-lightweight-enrichment-recovery",
    view:"full",
    recoveryMode:"LIGHTWEIGHT_CANONICAL_EVIDENCE",
    count:recovered.length,
    matches:recovered,
  };
}

function getServerKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      if (parsed?.default) return parsed.default as string;
    } catch (_) {}
  }
  return "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return Response.json({ error: "method_not_allowed" }, {
      status: 405,
      headers: { ...corsHeaders, "Cache-Control": "no-store" },
    });
  }

  try {
    const url = new URL(req.url);
    const requested = Number(url.searchParams.get("hours") ?? "24");
    const hours = Math.max(1, Math.min(48, Number.isFinite(requested) ? requested : 24));
    const requestedView = String(url.searchParams.get("view") ?? "").toLowerCase();
    const compactOnly = requestedView === "compact";
    const summaryOnly = requestedView === "summary" || compactOnly;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serverKey = getServerKey();
    if (!supabaseUrl || !serverKey) throw new Error("server_config_missing");

    const db = createReadClient(supabaseUrl, serverKey);
    if(requestedView==="experimental"){
      // Only on an explicit Details-page user click. No automatic homepage
      // model fitting, additional source scraping, cron, or database writes.
      const fixtureId=String(url.searchParams.get("id")??"");
      if(!/^FS:[A-Za-z0-9_-]{5,32}$/.test(fixtureId))
        return Response.json({status:"INVALID_FIXTURE_ID"},{status:400,headers:corsHeaders});
      const now=Date.now(),asOf=new Date(now).toISOString();
      const fixtureResult=await db.from("canonical_fixture_current")
        .select("match_id,league,home_en,away_en,kickoff_hkt,fetched_at,status")
        .eq("match_id",fixtureId).maybeSingle();
      if(fixtureResult.error)
        return Response.json({status:"SOURCE_UNAVAILABLE"},{status:503,headers:corsHeaders});
      const fixture=fixtureResult.data;
      const start=Date.parse(String(fixture?.kickoff_hkt||""));
      const fetched=Date.parse(String(fixture?.fetched_at||""));
      if(!fixture||!Number.isFinite(start)||start<=now||start>now+48*3600000
        ||!Number.isFinite(fetched)||now-fetched>36*3600000
        ||String(fixture.status||"").toUpperCase()==="FINISHED")
        return Response.json({status:"NO_CURRENT_VERIFIED_FIXTURE"},{status:404,headers:corsHeaders});
      const code=footballDataCodeForLeague(fixture.league);
      if(!code)
        return Response.json({status:"UNSUPPORTED_FOOTBALL_DATA_LEAGUE"},
          {headers:{...corsHeaders,"Cache-Control":"public, max-age=600"}});
      const since=new Date(now-365*86400000).toISOString().slice(0,10);
      const training=await db.from("football_data_matches")
        .select("league_code,home_team,away_team,fthg,ftag,match_date,fetched_at")
        .eq("source_kind","RESULTS").eq("league_code",code)
        .gte("match_date",since).lt("match_date",asOf.slice(0,10))
        .not("fthg","is",null).not("ftag","is",null)
        .order("match_date",{ascending:false}).limit(250);
      if(training.error||!Array.isArray(training.data))
        return Response.json({status:"TRAINING_DATA_UNAVAILABLE"},
          {status:503,headers:corsHeaders});
      const history=training.data.filter((r:any)=>
        Number.isInteger(r.fthg)&&Number.isInteger(r.ftag)
        &&Number.isFinite(Date.parse(String(r.fetched_at||"")))).map((r:any)=>({
        source:"FOOTBALL_DATA",league:r.league_code,
        homeId:r.home_team,awayId:r.away_team,hg:r.fthg,ag:r.ftag,
        playedAt:String(r.match_date)+"T00:00:00Z",
        capturedAt:r.fetched_at
      }));
      const model=predictFlashscoreFixtureExperimental({fixture,history,asOf});
      return Response.json({
        status:model.status,fixtureId,model,
        verification:"EXPERIMENTAL_UNCALIBRATED_NOT_BACKTEST_VERIFIED",
        independentModels:false,
        exactFixtureId:true,
        observedGoalResultsOnly:true,
        trainingSource:"FOOTBALL_DATA_CSV",
        bookmakerTraining:false,automaticBettingAdvice:false
      },{headers:{...corsHeaders,"Cache-Control":"public, max-age=600"}});
    }
    const adviserDb=createReadClientWithTimeout(supabaseUrl,serverKey,4_000);

    if (summaryOnly) {
      // One indexed, read-only RPC replaces repeated PostgREST fanout across
      // fixture, bookmaker, detail, profile and lineup views. This is the
      // critical All-in-One lane. Legacy queries remain only as fallback.
      const [fast,heartbeat,fixtureTimesResult,priorQuoteResult,movementResult]=await Promise.all([
        db.rpc("ft_fast_flashscore_summary",{p_window_hours:hours}),
        db.from("source_health")
          .select("status,value_text,observed_at,notes,raw")
           .eq("source","FLASHSCORE_BET365").eq("metric","cloud_ingest")
          .maybeSingle(),
        // All stored exact Flashscore fixture kickoffs in one small indexed read.
        // This is not a new collector and introduces no further browser fetches.
        db.from("canonical_fixture_current")
          .select("match_id,kickoff_hkt")
          .not("kickoff_hkt","is",null)
          .limit(1000),
        // Only the compact homepage needs earlier *reference* quotes.
        // Independent, bounded indexed read of existing snapshot history.
        // Fail closed on SQL/RLS errors; NEVER alter current odds or EV.
        compactOnly
          ? db.rpc("ft_prior_bet365_reference_quotes",{p_window_hours:hours})
          : Promise.resolve({data:[],error:null}),
        // Existing 15-minute native movement rollup. One bounded read, zero
        // additional bookmaker requests and no reinterpretation as model EV.
        compactOnly
          ? db.from("odds_movement_feed_current")
              .select("match_id,captured_at,kickoff_hkt,movement_side,now_odds,odds_1h,odds_2h")
              .gte("kickoff_hkt",new Date(Date.now()-6*3600_000).toISOString())
              .limit(350)
          : Promise.resolve({data:[],error:null}),
      ]);
      if(!fast.error && Array.isArray(fast.data)){
        const movementById=new Map<string,any>();
        if(compactOnly&&!movementResult.error&&Array.isArray(movementResult.data)){
          for(const move of movementResult.data){
            const id=String(move?.match_id||"");
            const captured=Date.parse(String(move?.captured_at||""));
            const current=num(move?.now_odds),oneHour=num(move?.odds_1h);
            const side=String(move?.movement_side||"");
            if(!/^FS:[A-Za-z0-9_-]{5,32}$/.test(id)
              ||!["H","D","A"].includes(side)
              ||!Number.isFinite(captured)||captured>Date.now()+60000
              ||captured<Date.now()-30*60_000
              ||current===null||current<=1||oneHour===null||oneHour<=1
              ||Math.abs(current-oneHour)<0.009
              ||movementById.has(id))continue;
            movementById.set(id,{side,current,prior:oneHour,capturedAt:new Date(captured).toISOString(),
              source:"FLASHSCORE_BET365",window:"1h"});
          }
        }
        if(compactOnly&&movementResult.error)
          console.error("native_odds_movement_unavailable",movementResult.error);
        const matches=fast.data.map((r:any)=>{
          const base=directAuthoritySummaryRow(r,r.fs_live_verified===true);
          const stats=observedFlashscoreStats(
            {detail_raw:r.detail_raw,detail_fetched_at:r.detail_fetched_at},
            r.kickoff_hkt
          );
          base.oddsMovement=movementById.get(base.id)||null;
          return stats ? {
            ...base,
            sourceContext:{
              ...(base.sourceContext??{}),
              source:"FLASHSCORE",
              observedStats:stats,statsAvailable:true,
              xgAvailable:Boolean(stats.stats.xg),
              detailFetchedAt:stats.capturedAt,
              lineupAvailable:Boolean(base.sourceContext?.lineupAvailable),
              lineupCoverage:base.sourceContext?.lineupCoverage??null
            }
          } : base;
        });
        // A historical reference may supplement a missing CURRENT price but
        // cannot enter directAuthoritySummaryRow, noVig or value calculations.
        const allowed=new Set(matches.map((m:any)=>String(m.id)));
        const priorBookmakerQuotes=compactOnly && !priorQuoteResult.error
          ? (Array.isArray(priorQuoteResult.data)?priorQuoteResult.data:[])
            .filter((r:any)=>allowed.has(String(r.match_id||"")))
            .slice(0,400).map((r:any)=>({
              id:r.match_id,capturedAt:r.captured_at,source:"FLASHSCORE_BET365",
              quoteType:"EARLIER_REFERENCE_ONLY",
              odds:{home:num(r.home_price),draw:num(r.draw_price),away:num(r.away_price)}
            }))
          : [];
        if(compactOnly && priorQuoteResult.error)
          console.error("prior_bookmaker_reference_unavailable",priorQuoteResult.error);
        const source=heartbeat.data??null;
        const publisherCaptureAt=source?.raw?.captured_at||source?.observed_at||null;
        const publisherAgeMs=publisherCaptureAt?Date.now()-Date.parse(String(publisherCaptureAt)):Infinity;
        const publisherFresh=Number.isFinite(publisherAgeMs)
          && publisherAgeMs>=-60_000 && publisherAgeMs<=20*60_000;
        // An OK publication event does not mean the bookmaker data is still fresh.
        const publisherStatus=source?.status==="OK"&&!publisherFresh?"STALE":
          (source?.status??"UNKNOWN");
        return Response.json({
          generatedAt:new Date().toISOString(),
          source:"flashscore-single-rpc-canonical",
          view:compactOnly?"compact":"summary",windowHours:hours,
          count:matches.length,
          matches:await withExternalAdvisers(adviserDb,compactOnly?matches.map(verifiedCompactSummaryRow):matches),
          ...(compactOnly ? {previousBookmakerQuotes:priorBookmakerQuotes} : {}),
          fixtureKickoffs: Array.isArray(fixtureTimesResult.data)
            ? fixtureTimesResult.data.filter((r:any)=>/^FS:[A-Za-z0-9_-]{5,32}$/.test(String(r.match_id||""))
                && typeof r.kickoff_hkt==="string")
              .map((r:any)=>({id:r.match_id,kickoff:r.kickoff_hkt}))
            : [],
          systemHealth:{
            FLASHSCORE_BET365:{
              status:publisherStatus,
              value:source?.value_text??null,
              observedAt:publisherCaptureAt,
              notes:publisherFresh?(source?.notes??null):
                "Latest verified bookmaker snapshot is stale or missing; successful jobs do not imply fresh data.",
              raw:{...(source?.raw??{}),snapshotFresh:publisherFresh,
                snapshotAgeMinutes:Number.isFinite(publisherAgeMs)?
                  Math.round(publisherAgeMs/60000):null}
            },
            authorityMode:{
              status:"OK",value:"EXACT_CANONICAL_WITH_SOURCE_PROVENANCE",
              notes:"Fast Flashscore fixture/Bet365 HDA and observed-match-stat summary. Independent model and lineups load separately.",
              observedAt:new Date().toISOString(),
              raw:{matches:matches.length,observedStats:matches.filter((m:any)=>m.sourceContext?.observedStats).length}
            }
          },
        },{headers:{...corsHeaders,"Cache-Control":"public, max-age=10, stale-while-revalidate=40"}});
      }
      console.error("fast_flashscore_summary_fallback",fast.error);
      const now = new Date();
      const end = new Date(now.getTime() + hours * 60 * 60 * 1000);
      const liveCutoff = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      const recentStart = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();

      const [fixtureResult, bet365Result, liveResult, bet365HealthResult, coverageResult, flashscoreDetailResult] = await Promise.all([
        db.from("flashscore_primary_fixture_current")
          .select("match_id,fetched_at,kickoff_hkt,status,tournament:league,home_en,away_en,updated_at")
          .gte("kickoff_hkt", recentStart)
          .lt("kickoff_hkt", end.toISOString())
          .order("kickoff_hkt", { ascending:true }),
        db.from("bookmaker_odds_current")
          .select("match_id,fetched_at,kickoff_hkt,league,home,away,bet365_home,bet365_draw,bet365_away,bet365_fixture_id,source,updated_at"),
        Promise.resolve({ data: [], error: null }),
        db.from("source_health")
          .select("source,status,value_text,observed_at,notes,raw")
          .eq("source","FLASHSCORE_BET365")
          .eq("metric","cloud_ingest")
          .maybeSingle(),
        // The legacy public coverage view joins every lineup to the full
        // player profile table, creating multi-second PostgREST fanout and
        // blank SSR feeds. Detailed lineup/profile coverage is returned by
        // the optional full enrichment lane, never allowed to block HDA.
        Promise.resolve({data:[],error:null}),
        db.from("source_match_detail_current")
          .select("match_id,source_key,detail_raw,detail_fetched_at")
          .eq("source_key","FLASHSCORE")
          .gte("detail_fetched_at",new Date(now.getTime()-24*60*60*1000).toISOString())
          .limit(180),
      ]);
      if (fixtureResult.error) throw fixtureResult.error;
      if (bet365Result.error) console.error("summary_bookmaker_odds_current_unavailable",bet365Result.error);
      if (liveResult.error) console.error("summary_bet365_live_unavailable",liveResult.error);

      const bet365Heartbeat=bet365HealthResult.data??null;
      const bet365HeartbeatAgeSeconds=bet365Heartbeat?.observed_at
        ? Math.max(0,(Date.now()-new Date(bet365Heartbeat.observed_at).getTime())/1000)
        : null;
      const bet365HeartbeatStatus=bet365HealthResult.error
        ? "UNAVAILABLE"
        : !bet365Heartbeat
          ? "MISSING"
          : bet365HeartbeatAgeSeconds==null || !Number.isFinite(bet365HeartbeatAgeSeconds) || bet365HeartbeatAgeSeconds>1200
            ? "STALE"
            : String(bet365Heartbeat.status||"OK").toUpperCase();

      // The global ingest heartbeat describes job health, not whether each
      // individual verified price snapshot is recent. A failed retry must not
      // hide still-fresh, correctly identified bookmaker odds in the table.
      // directAuthoritySummaryRow independently enforces the 20-minute
      // per-quote freshness gate before any value reaches the UI.
      const bet365ById=new Map((bet365Result.data??[]).map((r:any)=>[String(r.match_id),r]));
      const liveById=new Map((liveResult.data??[]).map((r:any)=>[String(r.canonical_match_id),r]));
      const coverageById=new Map((coverageResult.data??[]).map((r:any)=>[String(r.match_id),r]));
      const flashscoreDetailById=new Map((flashscoreDetailResult.data??[]).map((r:any)=>[String(r.match_id),r]));
      if(flashscoreDetailResult.error)console.error("summary_flashscore_details_unavailable",flashscoreDetailResult.error);
      if(coverageResult.error)console.error("summary_public_coverage_unavailable",coverageResult.error);
      const rows:any[]=[];
      for(const fixture of fixtureResult.data??[]){
        const id=String(fixture.match_id||""); if(!id) continue;
        const b:any=bet365ById.get(id)||null;
        const l:any=liveById.get(id)||null;
        const row={
          match_id:id,
          fetched_at:b?.fetched_at??null,
          kickoff_hkt:fixture.kickoff_hkt,
          status:l?.period??(new Date(String(fixture.kickoff_hkt)).getTime()<=Date.now() && String(fixture.status).toUpperCase()==="PREEVENT"?"STATUS_UNVERIFIED":fixture.status)??null,
          tournament:fixture.tournament??b?.league??null,
          home_en:fixture.home_en??b?.home??null,
          away_en:fixture.away_en??b?.away??null,
          had_home:b?.bet365_home??null,
          had_draw:b?.bet365_draw??null,
          had_away:b?.bet365_away??null,
          hdc_line:null,hdc_home:null,hdc_away:null,
          hil_line:null,hil_over:null,hil_under:null,
          chl_line:null,chl_over:null,chl_under:null,
          pool_status:l?"SELLINGSTARTED":"UNKNOWN",
          odds_updated_at:b?.fetched_at??null,
          updated_at:b?.updated_at??fixture.updated_at??null,
          live_eligible:Boolean(l),
        };
        rows.push({row,liveNow:Boolean(l)});
      }

      const directMatches=rows.map((item:any)=>{
        const match=directAuthoritySummaryRow(item.row,item.liveNow);
        const coverage:any=coverageById.get(String(match.id||""))||null;
        const stats=observedFlashscoreStats(flashscoreDetailById.get(String(match.id||"")),match.kickoff);
        if(!coverage && !stats)return match;
        return {
          ...match,
          sourceContext:{
            ...(stats?{observedStats:stats}:{}),
            source:stats?"FLASHSCORE":(coverage?.detail_source||coverage?.lineup_source||null),
            lineupAvailable:Number(coverage?.starters||0)>=22||Boolean(coverage?.source_lineup_available),
            statsAvailable:Boolean(stats)||Boolean(coverage?.stats_available),
            xgAvailable:Boolean(stats?.stats?.xg)||Boolean(coverage?.xg_available),
            detailAvailable:Boolean(stats)||Boolean(coverage?.detail_available),
            detailFetchedAt:stats?.capturedAt??coverage?.detail_fetched_at??null,
            lineupCoverage:{
              source:coverage?.lineup_source??null,
              starters:Number(coverage?.starters||0),
              homeStarters:Number(coverage?.home_starters||0),
              awayStarters:Number(coverage?.away_starters||0),
              confirmedStarters:Number(coverage?.confirmed_starters||0),
              profileCount:Number(coverage?.profile_count||0),
              updatedAt:coverage?.lineup_updated_at??null
            }
          }
        };
      }).sort((a:any,b:any)=>String(a.kickoff??"").localeCompare(String(b.kickoff??"")));
      return Response.json({
        generatedAt:new Date().toISOString(),
        source:"canonical-fixtures-flashscore-bet365",
        view:"summary",
        windowHours:hours,
        count:directMatches.length,
        systemHealth:{
          authorityMode:{
            status:bet365HeartbeatStatus==="OK"||bet365HeartbeatStatus==="EMPTY" ? "OK" : "ATTENTION",
            value:"CANONICAL_FIXTURES_FLASHSCORE_BET365",
            notes:"Fixture identity is served from the canonical registry; current bookmaker prices come from the cloud Flashscore/Bet365 collector. Missing bookmaker data stays unknown.",
            observedAt:new Date().toISOString(),
            raw:{fixtures:directMatches.length,bet365Rows:(bet365Result.data??[]).length,liveRows:(liveResult.data??[]).length,bet365HeartbeatStatus,bet365HeartbeatAgeSeconds}
          },
          FLASHSCORE_BET365:{
            status:bet365HeartbeatStatus,
            value:bet365Heartbeat?.value_text??null,
            notes:bet365Heartbeat?.notes??"No cloud Flashscore/Bet365 ingest has been observed yet.",
            observedAt:bet365Heartbeat?.observed_at??null,
            raw:bet365Heartbeat?.raw??{}
          }
        },
        matches:await withExternalAdvisers(adviserDb,compactOnly?directMatches.map(verifiedCompactSummaryRow):directMatches),
      },{headers:{...corsHeaders,"Cache-Control":"public, max-age=10, stale-while-revalidate=40"}});
    }

    // Phase 2: the retired generic Phase-1 RPC is not a supported feed path.
    // Full view enriches the current indexed Flashscore summary with bounded,
    // persisted evidence reads; unknown fields stay unknown on partial reads.
    const recovered=await lightweightFullRecovery(
      supabaseUrl,serverKey,createReadClientWithTimeout(supabaseUrl,serverKey,8_000),hours
    );
    recovered.matches=await withExternalAdvisers(adviserDb,recovered.matches||[]);
    return Response.json(recovered,{
      headers:{...corsHeaders,"Cache-Control":"public, max-age=10, stale-while-revalidate=40"}
    });
  } catch (error) {
    console.error(error);
    return Response.json({
      error: "feed_unavailable",
      message: error instanceof Error ? error.message : String(error),
    }, {
      status: 503,
      headers: { ...corsHeaders, "Cache-Control": "no-store" },
    });
  }
});
