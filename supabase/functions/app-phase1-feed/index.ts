import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

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

function directAuthoritySummaryRow(r: any, liveNow = false) {
  const freshness = authorityFreshness(r.fetched_at);
  const pricesFresh = freshness.status === "FRESH" && new Date(String(r.kickoff_hkt||0)).getTime()>Date.now();
  const had = pricesFresh
    ? { home: num(r.had_home), draw: num(r.had_draw), away: num(r.had_away) }
    : { home: null, draw: null, away: null };
  const handicap = pricesFresh
    ? { line: r.hdc_line ?? null, home: num(r.hdc_home), away: num(r.hdc_away) }
    : { line: null, home: null, away: null };
  const goals = pricesFresh
    ? { line: r.hil_line ?? null, over: num(r.hil_over), under: num(r.hil_under) }
    : { line: null, over: null, under: null };
  const corners = pricesFresh
    ? { line: r.chl_line ?? null, over: num(r.chl_over), under: num(r.chl_under) }
    : { line: null, over: null, under: null };
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
    live: liveNow ? {
      status: r.status ?? null,
      fetchedAt: r.fetched_at ?? null,
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
      score: null,
      stats: null,
      shadow: null,
    } : null,
    odds: had,
    market: pricesFresh ? noVig(r.had_home, r.had_draw, r.had_away) : null,
    handicap,
    handicapAdvice: {
      status: "NO_MODEL",
      line: handicap.line,
      reason: pricesFresh
        ? "Model enrichment unavailable in summary recovery mode"
        : "Bet365 price snapshot is stale or unavailable; fixture identity only"
    },
    goals,
    corners,
    forebetDetail: null,
    multisourceDetail: null,
    forebet: null,
    dc: null,
    dcDetail: null,
    pi: null,
    piDetail: null,
    form: null,
    formDetail: null,
    multi: null,
    health: {
      status: freshness.status === "FRESH" ? "OK" : "ATTENTION",
      primaryMissingReason: "SUMMARY_AUTHORITY_ONLY",
      diagnostics: freshness.status === "FRESH" ? [] : ["BET365_AUTHORITY_" + freshness.status],
      authorityFetchedAt: r.fetched_at ?? null,
      priceChangedAt: r.odds_updated_at ?? null,
      marketCapturedAt: r.fetched_at ?? null,
      authorityFetchAgeMinutes: freshness.ageMinutes,
      authorityFreshness: freshness.status,
      evidenceChannelCount: 0,
      multisourceMemberCount: 0,
      missingCanonical1x2: !pricesFresh || had.home == null || had.draw == null || had.away == null,
      unifiedCoverageStatus: "FLASHSCORE_BET365",
      coverageExplanation: pricesFresh
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
    sourceContext: null,
    updatedAt: r.updated_at ?? r.fetched_at ?? null,
  };
}


function evidenceTriplet(row:any){
  const home=num(row?.prob_home), draw=num(row?.prob_draw), away=num(row?.prob_away);
  return home==null||draw==null||away==null ? null : {home,draw,away};
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
        ou25:{over:num(fbOu?.prob_over),under:num(fbOu?.prob_under),avgGoals:num(fbOu?.avg_goals)},
        corners95:{over:num(fbCorners?.prob_over),under:num(fbCorners?.prob_under),avgCorners:num(fbCorners?.avg_corners)},
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
    const summaryOnly = String(url.searchParams.get("view") ?? "").toLowerCase() === "summary";

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serverKey = getServerKey();
    if (!supabaseUrl || !serverKey) throw new Error("server_config_missing");

    const db = createReadClient(supabaseUrl, serverKey);
    const fullRpcDb = createReadClientWithTimeout(supabaseUrl,serverKey,8_000);

    if (summaryOnly) {
      // One indexed, read-only RPC replaces repeated PostgREST fanout across
      // fixture, bookmaker, detail, profile and lineup views. This is the
      // critical All-in-One lane. Legacy queries remain only as fallback.
      const [fast,heartbeat]=await Promise.all([
        db.rpc("ft_fast_flashscore_summary",{p_window_hours:hours}),
        db.from("source_health")
          .select("status,value_text,observed_at,notes,raw")
          .eq("source","FLASHSCORE_BET365").eq("metric","cloud_ingest")
          .maybeSingle(),
      ]);
      if(!fast.error && Array.isArray(fast.data)){
        const matches=fast.data.map((r:any)=>{
          const base=directAuthoritySummaryRow(r,false);
          const stats=observedFlashscoreStats(
            {detail_raw:r.detail_raw,detail_fetched_at:r.detail_fetched_at},
            r.kickoff_hkt
          );
          return stats ? {
            ...base,
            sourceContext:{
              source:"FLASHSCORE",
              observedStats:stats,statsAvailable:true,
              xgAvailable:Boolean(stats.stats.xg),
              detailFetchedAt:stats.capturedAt,
              lineupAvailable:false,lineupCoverage:null
            }
          } : base;
        });
        const source=heartbeat.data??null;
        return Response.json({
          generatedAt:new Date().toISOString(),
          source:"flashscore-single-rpc-canonical",
          view:"summary",windowHours:hours,
          count:matches.length,matches,
          systemHealth:{
            FLASHSCORE_BET365:{
              status:source?.status??"UNKNOWN",
              value:source?.value_text??null,
              observedAt:source?.observed_at??null,
              notes:source?.notes??null,raw:source?.raw??{}
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
        db.from("active_canonical_fixture_current")
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
          : !Number.isFinite(bet365HeartbeatAgeSeconds)||bet365HeartbeatAgeSeconds>1200
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
        matches:directMatches,
      },{headers:{...corsHeaders,"Cache-Control":"public, max-age=10, stale-while-revalidate=40"}});
    }

    // FT-20261009 P0: the generic RPC currently delegates to the removed
    // ft_internal_app_phase1_feed(integer) function (Postgres 42883).
    // Avoid that deterministic failure/timeout while preserving real canonical
    // evidence and explicit unknowns through the existing safe recovery path.
    // Re-enable this legacy RPC branch only after its SQL dependency is repaired
    // and an end-to-end production contract has been verified.
    if (Deno.env.get("FT_PHASE1_USE_GENERIC_RPC") !== "1") {
      const recovered = await lightweightFullRecovery(
        supabaseUrl, serverKey, createReadClientWithTimeout(supabaseUrl, serverKey, 8_000), hours
      );
      return Response.json(recovered, {
        headers: { ...corsHeaders, "Cache-Control": "public, max-age=10, stale-while-revalidate=40" },
      });
    }

    const { data, error } = await fullRpcDb.rpc("ft_internal_app_phase1_feed_generic", {
      window_hours: hours,
    });
    if (error) {
      console.error("full_feed_rpc_degraded", error);
      const recovered=await lightweightFullRecovery(supabaseUrl,serverKey,createReadClientWithTimeout(supabaseUrl,serverKey,8_000),hours);
      return Response.json(recovered,{
        headers:{...corsHeaders,"Cache-Control":"public, max-age=10, stale-while-revalidate=40"},
      });
    }

    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
      const recovered=await lightweightFullRecovery(supabaseUrl,serverKey,createReadClientWithTimeout(supabaseUrl,serverKey,8_000),hours);
      return Response.json(recovered,{
        headers:{...corsHeaders,"Cache-Control":"public, max-age=10, stale-while-revalidate=40"},
      });
    }

    const eventIds = rows.map((r: any) => r.match_id).filter(Boolean);
    const liveEventIds = rows.filter((r: any) => Boolean(r.live_now)).map((r: any) => r.match_id).filter(Boolean);
    const movementMap = new Map<string, any>();
    const liveStatsMap = new Map<string, any>();
    const shadowMap = new Map<string, any>();
    const powerMap = new Map<string, any>();
    const modelDetailMap = new Map<string, any>();
    const formDetailMap = new Map<string, any>();
    const formMetaMap = new Map<string, any>();
    const storySummaryMap = new Map<string, any>();
    const sourceContextMap = new Map<string, any>();
    const upcomingAuthorityMap = new Map<string, any>();
    const liveAuthorityMap = new Map<string, any>();
    const verifiedMasterKeys = new Set<string>();
    if (eventIds.length && !summaryOnly) {
      const currentNameKeys = [...new Set(
        rows.flatMap((row: any) => [identityKey(row.home_en), identityKey(row.away_en)]).filter(Boolean)
      )];

      // These enrichment reads are independent. Start them together so network
      // round trips do not accumulate before the homepage can render.
      const authorityPromise = Promise.all([
        db.from("bookmaker_odds_current")
          .select("match_id,league,fetched_at")
          .in("match_id", eventIds),
        Promise.resolve({ data: [], error: null }),
      ]);
      const identityPromise = currentNameKeys.length
        ? db.from("team_identity_current")
            .select("source_key")
            .in("source", ["FLASHSCORE","FOTMOB","BET365","FOOTBALL_DATA","OPTA","FORM","FOREBET","FOOTBALL_LIVE_API_SELF_HOSTED"])
            .eq("status", "VERIFIED")
            .in("source_key", currentNameKeys)
        : Promise.resolve({ data: [], error: null });
      const formDetailPromise = db.rpc("ft_internal_team_form_details", { event_ids: eventIds });
      const modelDetailPromise = db.from("model_prediction_current")
        .select("match_id,fetched_at,dc_prob_home,dc_prob_draw,dc_prob_away,dc_xg_home,dc_xg_away,dc_prob_over25,pi_prob_home,pi_prob_draw,pi_prob_away,pi_home_rating,pi_away_rating,pi_diff,training_matches,team_match_quality,quality,model_source,model_league")
        .in("match_id", eventIds);
      const formMetaPromise = db.from("form_prediction_current")
        .select("match_id,fetched_at,form_xg_home,form_xg_away,home_games,away_games,home_venue_games,away_venue_games,quality,model_source")
        .in("match_id", eventIds);
      const storyPromise = db.from("match_interpretation_feed_current")
        .select("match_id,match_script:payload->matchScript,editorial_alignment:payload->editorialAlignment")
        .in("match_id", eventIds)
        .eq("language", "en")
        .eq("style", "professional");
      const sourceContextPromise = db.from("source_shadow_current")
        .select("source_key,external_event_id,match_id,league_name,home_name,away_name,match_confidence,identity_status,detail_available,lineup_available,xg_available,stats_available,detail_fetched_at,updated_at")
        .eq("source_key", "FOTMOB")
        .in("match_id", eventIds);
      const sourceDetailPromise = db.from("source_match_detail_current")
        .select("match_id,source_key,external_event_id,detail_raw,detail_fetched_at,updated_at")
        .eq("source_key","FOTMOB")
        .in("match_id",eventIds);
      const lineupCoveragePromise = db.from("lineup_evidence_current")
        .select("match_id,player_key,team_side,starter,confirmed,source_name,source_updated_at")
        .in("match_id", eventIds)
        .in("source_name", ["FOTMOB_OFFICIAL","FOTMOB_PREDICTED","FLASHSCORE_OFFICIAL","SOFASCORE"])
        .eq("starter", true);
      const movementPromise = db.from("odds_movement_feed_current")
        .select("match_id,captured_at,movement_side,now_odds,odds_24h,move_24h_pp,odds_2h,move_2h_pp,odds_1h,move_1h_pp,vol_24h_pp,signal,model_side,model_prob,model_alignment,match_confidence,alert_score")
        .in("match_id", eventIds);
      const powerPromise = db.from("team_power_current")
        .select("match_id,fetched_at,home_rating,away_rating,home_opta_name,away_opta_name,home_match_confidence,away_match_confidence,home_rank,away_rank,coverage,source,power_updated")
        .in("match_id", eventIds);

      const [{ data: upcomingAuthorityRows, error: upcomingAuthorityError }, { data: liveAuthorityRows, error: liveAuthorityError }] = await authorityPromise;
      if (upcomingAuthorityError) {
        console.error("bet365_display_authority_query_failed", upcomingAuthorityError);
      } else {
        for (const row of upcomingAuthorityRows ?? []) {
          upcomingAuthorityMap.set(row.match_id, { tournament:row.league, hdc_line:null, hdc_home:null, hdc_away:null });
        }
      }
      if (liveAuthorityError) {
        console.error("bet365_live_display_authority_query_failed", liveAuthorityError);
      } else {
        for (const row of liveAuthorityRows ?? []) {
          if (!row.canonical_match_id) continue;
          liveAuthorityMap.set(row.canonical_match_id, { tournament:row.league, hdc_line:null, hdc_home:null, hdc_away:null });
        }
      }

      if (currentNameKeys.length) {
        const { data: identityRows, error: identityError } = await identityPromise;
        if (identityError) {
          console.error("master_identity_query_failed", identityError);
        } else {
          for (const row of identityRows ?? []) {
            const key = identityKey(row.source_key);
            if (key) verifiedMasterKeys.add(key);
          }
        }
      }

      const { data: formDetailPayload, error: formDetailError } = await formDetailPromise;
      if (formDetailError) {
        console.error("team_form_detail_query_failed", formDetailError);
      } else {
        for (const [id, detail] of Object.entries(formDetailPayload ?? {})) {
          formDetailMap.set(id, detail);
        }
      }

      const { data: modelDetailRows, error: modelDetailError } = await modelDetailPromise;
      if (modelDetailError) {
        console.error("model_detail_query_failed", modelDetailError);
      } else {
        for (const row of modelDetailRows ?? []) modelDetailMap.set(row.match_id, row);
      }

      const { data: formRows, error: formMetaError } = await formMetaPromise;
      if (formMetaError) {
        console.error("team_form_meta_query_failed", formMetaError);
      } else {
        for (const row of formRows ?? []) formMetaMap.set(row.match_id, row);
      }

      const { data: storyRows, error: storyError } = await storyPromise;
      if (storyError) {
        console.error("story_summary_query_failed", storyError);
      } else {
        for (const row of storyRows ?? []) {
          storySummaryMap.set(row.match_id, {
            matchScript: row.match_script ?? null,
            editorialAlignment: row.editorial_alignment ?? null,
          });
        }
      }

      const { data: sourceContextRows, error: sourceContextError } = await sourceContextPromise;
      if (sourceContextError) {
        console.error("source_context_query_failed", sourceContextError);
      } else {
        for (const row of sourceContextRows ?? []) {
          const id = String(row.match_id ?? "");
          if (!id) continue;
          const previous = sourceContextMap.get(id);
          const previousConfidence = Number(previous?.matchConfidence ?? -1);
          const confidence = Number(row.match_confidence ?? -1);
          if (previous && previousConfidence > confidence) continue;
          sourceContextMap.set(id, {
            source: row.source_key,
            externalEventId: row.external_event_id,
            league: row.league_name,
            home: row.home_name,
            away: row.away_name,
            matchConfidence: Number.isFinite(confidence) && confidence >= 0 ? confidence : null,
            identityStatus: row.identity_status,
            detailAvailable: Boolean(row.detail_available),
            lineupAvailable: Boolean(row.lineup_available),
            xgAvailable: Boolean(row.xg_available),
            statsAvailable: Boolean(row.stats_available),
            detailFetchedAt: row.detail_fetched_at,
            updatedAt: row.updated_at,
            mode: "SHADOW_CONTEXT_ONLY",
          });
        }
      }

      const { data: sourceDetailRows, error: sourceDetailError } = await sourceDetailPromise;
      if (sourceDetailError) {
        console.error("source_detail_query_failed", sourceDetailError);
      } else {
        const newestByMatch=new Map<string,any>();
        for(const row of sourceDetailRows ?? []){
          const id=String(row?.match_id||"");
          if(!id)continue;
          const current=newestByMatch.get(id);
          const ts=new Date(row?.detail_fetched_at||row?.updated_at||0).getTime();
          const currentTs=new Date(current?.detail_fetched_at||current?.updated_at||0).getTime();
          if(!current||ts>=currentTs)newestByMatch.set(id,row);
        }
        for(const [id,row] of newestByMatch.entries()){
          const content=row?.detail_raw?.content||{};
          const playerStats=content?.playerStats;
          const playerStatsAvailable=Boolean(playerStats&&typeof playerStats==="object"&&!Array.isArray(playerStats)&&Object.keys(playerStats).length);
          const matchStatsAvailable=Boolean(content?.stats||playerStatsAvailable);
          const shots=Array.isArray(content?.shotmap?.shots)?content.shotmap.shots:[];
          const xgAvailable=shots.some((shot:any)=>Number.isFinite(Number(shot?.expectedGoals)))
            || JSON.stringify(content?.stats||{}).toLowerCase().includes("expected_goals");
          const existing=sourceContextMap.get(id)||{};
          sourceContextMap.set(id,{
            ...existing,
            source:existing.source||"FOTMOB",
            externalEventId:existing.externalEventId||row?.external_event_id||null,
            detailAvailable:true,
            statsAvailable:matchStatsAvailable||Boolean(existing.statsAvailable),
            xgAvailable:xgAvailable||Boolean(existing.xgAvailable),
            detailFetchedAt:row?.detail_fetched_at??row?.updated_at??existing.detailFetchedAt??null,
          });
        }
      }

      const { data: lineupCoverageRows, error: lineupCoverageError } = await lineupCoveragePromise;
      if (lineupCoverageError) {
        console.error("lineup_coverage_query_failed", lineupCoverageError);
      } else {
        const byEventSource = new Map<string, any>();
        const playerKeys = new Set<string>();
        for (const row of lineupCoverageRows ?? []) {
          const id=String(row.match_id||"");
          const source=String(row.source_name||"UNKNOWN");
          const key=id+"|"+source;
          const state=byEventSource.get(key)||{id,source,home:0,away:0,confirmed:0,playerKeys:new Set<string>(),updatedAt:null};
          if(row.team_side==="H")state.home++;
          if(row.team_side==="A")state.away++;
          if(row.confirmed)state.confirmed++;
          if(row.player_key){state.playerKeys.add(String(row.player_key));playerKeys.add(String(row.player_key));}
          if(!state.updatedAt || new Date(row.source_updated_at||0).getTime()>new Date(state.updatedAt||0).getTime())state.updatedAt=row.source_updated_at||null;
          byEventSource.set(key,state);
        }
        let profileKeys=new Set<string>();
        if(playerKeys.size){
          const {data:profileRows,error:profileError}=await db.from("phase2_players")
            .select("player_key,profile")
            .in("player_key",[...playerKeys].slice(0,1000));
          if(profileError)console.error("lineup_profile_coverage_query_failed",profileError);
          else profileKeys=new Set((profileRows??[]).filter((r:any)=>r.profile!=null).map((r:any)=>String(r.player_key)));
        }
        const sourceRank=(source:string)=>source==="FOTMOB_OFFICIAL"?4:source==="FLASHSCORE_OFFICIAL"?3:source==="SOFASCORE"?2:source==="FOTMOB_PREDICTED"?1:0;
        const bestByEvent=new Map<string,any>();
        for(const state of byEventSource.values()){
          const complete=state.home===11&&state.away===11;
          if(!complete)continue;
          const current=bestByEvent.get(state.id);
          if(!current || sourceRank(state.source)>sourceRank(current.source))bestByEvent.set(state.id,state);
        }
        for(const [id,state] of bestByEvent.entries()){
          const existing=sourceContextMap.get(id)||{};
          const profileCount=[...state.playerKeys].filter((key:string)=>profileKeys.has(key)).length;
          sourceContextMap.set(id,{
            ...existing,
            lineupAvailable:true,
            lineupCoverage:{
              source:state.source,
              starters:state.home+state.away,
              homeStarters:state.home,
              awayStarters:state.away,
              confirmedStarters:state.confirmed,
              profileCount,
              updatedAt:state.updatedAt
            }
          });
        }
      }

      const { data: movementRows, error: movementError } = await movementPromise;

      if (movementError) {
        console.error("movement_query_failed", movementError);
      } else {
        for (const m of movementRows ?? []) {
          const nowOdds = num(m.now_odds);
          let baselineOdds = num(m.odds_24h);
          let baselineWindow = baselineOdds == null ? null : "24h";
          if (baselineOdds == null) {
            baselineOdds = num(m.odds_2h);
            baselineWindow = baselineOdds == null ? null : "2h";
          }
          if (baselineOdds == null) {
            baselineOdds = num(m.odds_1h);
            baselineWindow = baselineOdds == null ? null : "1h";
          }
          const rawOddsChangePct =
            nowOdds != null && baselineOdds != null && baselineOdds !== 0
              ? ((nowOdds / baselineOdds) - 1) * 100
              : null;

          movementMap.set(m.match_id, {
            capturedAt: m.captured_at ?? null,
            side: m.movement_side ?? null,
            nowOdds,
            baselineOdds,
            baselineWindow,
            rawOddsChangePct,
            move24hPp: num(m.move_24h_pp),
            move2hPp: num(m.move_2h_pp),
            move1hPp: num(m.move_1h_pp),
            volatility24hPp: num(m.vol_24h_pp),
            signal: m.signal ?? null,
            modelSide: m.model_side ?? null,
            modelProb: num(m.model_prob),
            modelAlignment: m.model_alignment ?? null,
            matchConfidence: num(m.match_confidence),
            alertScore: num(m.alert_score),
          });
        }
      }
      
      const liveCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const detailHistoryCutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      const { data: liveStatRows, error: liveStatsError } = await db
        .from("live_stats_feed_current")
        .select("match_id,captured_at_hkt,detail_status,source,match_confidence,team_stats")
        .in("match_id", liveEventIds)
        .gte("captured_at_hkt", liveCutoff);

      const currentStatRows = new Map<string, any>();
      if (liveStatsError) {
        console.error("live_stats_query_failed", liveStatsError);
      } else {
        for (const row of liveStatRows ?? []) {
          if (String(row.source ?? "") === "SOURCE_GAP") continue;
          const confidence = num(row.match_confidence);
          if (confidence != null && confidence < 0.74) continue;
          currentStatRows.set(row.match_id, row);
          if (Array.isArray(row.team_stats) && row.team_stats.length > 0) {
            liveStatsMap.set(row.match_id, {
              ...compactLiveStats(row),
              snapshotMode: "CURRENT_CAPTURED",
            });
          }
        }
      }

      const missingDetailIds = liveEventIds.filter((id: string) => !liveStatsMap.has(id));
      if (missingDetailIds.length) {
        const { data: historyRows, error: historyError } = await db
          .from("live_stats_history_feed")
          .select("match_id,captured_at_hkt,detail_status,source,match_confidence,team_stats")
          .in("match_id", missingDetailIds)
          .gte("captured_at_hkt", detailHistoryCutoff)
          .order("captured_at_hkt", { ascending: false })
          .limit(1000);

        if (historyError) {
          console.error("live_stats_history_feed_query_failed", historyError);
        } else {
          const seenHistory = new Set<string>();
          for (const row of historyRows ?? []) {
            const id = String(row.match_id ?? "");
            if (!id || seenHistory.has(id) || liveStatsMap.has(id)) continue;
            if (String(row.source ?? "") === "SOURCE_GAP") continue;
            const confidence = num(row.match_confidence);
            if (confidence != null && confidence < 0.74) continue;
            if (!Array.isArray(row.team_stats) || row.team_stats.length === 0) continue;
            seenHistory.add(id);
            const latestRow = currentStatRows.get(id);
            liveStatsMap.set(id, {
              ...compactLiveStats(row),
              snapshotMode: "LAST_GOOD_CAPTURE",
              latestDetailStatus: latestRow?.detail_status ?? null,
            });
          }
        }
      }

      const shadowSelect = "match_id,segment,match_minute,expected_control_side,actual_control_side,actual_control_score,live_metric_count,control_basis,context_coverage_score,model_hda_consensus,shadow_status,shadow_reason,xg_home,xg_away,shots_home,shots_away,sot_home,sot_away,possession_home,possession_away,box_touches_home,box_touches_away,big_chances_home,big_chances_away,corners_home,corners_away,captured_at_hkt";
      const shadowHistorySelect = "match_id,segment,match_minute,expected_control_side,actual_control_side,actual_control_score,live_metric_count,control_basis,context_coverage_score,shadow_status,shadow_reason,xg_home,xg_away,shots_home,shots_away,sot_home,sot_away,possession_home,possession_away,box_touches_home,box_touches_away,big_chances_home,big_chances_away,corners_home,corners_away,captured_at_hkt";
      const shadowObject = (row: any, snapshotMode: string) => ({
        segment: row.segment ?? null,
        minute: num(row.match_minute),
        expectedSide: row.expected_control_side ?? null,
        actualSide: row.actual_control_side ?? null,
        controlScore: num(row.actual_control_score),
        metricCount: Number(row.live_metric_count ?? 0),
        controlBasis: row.control_basis ?? null,
        contextCoverage: num(row.context_coverage_score),
        modelConsensus: row.model_hda_consensus ?? null,
        status: row.shadow_status ?? "WAIT",
        reason: row.shadow_reason ?? null,
        capturedAt: row.captured_at_hkt ?? null,
        snapshotMode,
        metrics: {
          xg: { home: num(row.xg_home), away: num(row.xg_away) },
          shots: { home: num(row.shots_home), away: num(row.shots_away) },
          shotsOnTarget: { home: num(row.sot_home), away: num(row.sot_away) },
          possession: { home: num(row.possession_home), away: num(row.possession_away) },
          boxTouches: { home: num(row.box_touches_home), away: num(row.box_touches_away) },
          bigChances: { home: num(row.big_chances_home), away: num(row.big_chances_away) },
          corners: { home: num(row.corners_home), away: num(row.corners_away) },
        },
      });

      const { data: shadowRows, error: shadowError } = await db
        .from("live_expected_actual_feed_current")
        .select(shadowSelect)
        .in("match_id", liveEventIds);

      const missingShadowIds: string[] = [];
      if (shadowError) {
        console.error("shadow_query_failed", shadowError);
        missingShadowIds.push(...liveEventIds);
      } else {
        for (const row of shadowRows ?? []) {
          if (Number(row.live_metric_count ?? 0) > 0) {
            shadowMap.set(row.match_id, shadowObject(row, "CURRENT_CAPTURED"));
          } else {
            missingShadowIds.push(row.match_id);
          }
        }
        for (const id of liveEventIds) {
          if (!(shadowRows ?? []).some((row: any) => row.match_id === id)) missingShadowIds.push(id);
        }
      }

      if (missingShadowIds.length) {
        const shadowHistoryCutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
        const { data: shadowHistoryRows, error: shadowHistoryError } = await db
          .from("live_expected_actual_history_feed")
          .select(shadowHistorySelect)
          .in("match_id", [...new Set(missingShadowIds)])
          .gte("captured_at_hkt", shadowHistoryCutoff)
          .gt("live_metric_count", 0)
          .order("captured_at_hkt", { ascending: false })
          .limit(1000);

        if (shadowHistoryError) {
          console.error("shadow_history_query_failed", shadowHistoryError);
        } else {
          const seen = new Set<string>();
          for (const row of shadowHistoryRows ?? []) {
            const id = String(row.match_id ?? "");
            if (!id || seen.has(id) || shadowMap.has(id)) continue;
            seen.add(id);
            shadowMap.set(id, shadowObject(row, "LAST_GOOD_CAPTURE"));
          }
        }
      }

      const { data: powerRows, error: powerError } = await powerPromise;

      if (powerError) {
        console.error("power_query_failed", powerError);
      } else {
        for (const row of powerRows ?? []) {
          powerMap.set(row.match_id, {
            fetchedAt: row.fetched_at ?? null,
            home: num(row.home_rating),
            away: num(row.away_rating),
            homeName: row.home_opta_name ?? null,
            awayName: row.away_opta_name ?? null,
            homeConfidence: num(row.home_match_confidence),
            awayConfidence: num(row.away_match_confidence),
            homeRank: num(row.home_rank),
            awayRank: num(row.away_rank),
            coverage: row.coverage ?? null,
            source: row.source ?? null,
            updatedAt: row.power_updated ?? null,
          });
        }
      }
    }

    const { data: heartbeatRows, error: heartbeatError } = summaryOnly
      ? { data: [], error: null }
      : await db
          .from("source_health")
          .select("source,status,value_text,notes,observed_at,raw")
          .in("source", ["FLASHSCORE_BET365", "LIVE_SCORE_EDGE", "LIVE_LAYER_GUARD", "LIVE_UPSTREAM_DEPLOY", "LIVE_SOURCE_SHADOW", "LIVE_SHADOW_COMPARE", "PHASE3_IDENTITY_REGISTRY", "FRONTEND_ROUTE_GUARD"])
          .eq("metric", "heartbeat");

    if (heartbeatError) console.error("heartbeat_query_failed", heartbeatError);

    const systemHealth = Object.fromEntries(
      (heartbeatRows ?? []).map((row: any) => [
        row.source,
        {
          status: row.status ?? null,
          value: row.value_text ?? null,
          notes: row.notes ?? null,
          observedAt: row.observed_at ?? null,
          raw: row.raw ?? null,
        },
      ]),
    );

    const identityPresent = (legacyValue: unknown, name: unknown) =>
      Boolean(legacyValue) || verifiedMasterKeys.has(identityKey(name));

    const matches = rows.map((r: any) => {
      const displayAuthority = Boolean(r.live_now)
        ? (liveAuthorityMap.get(r.match_id) ?? upcomingAuthorityMap.get(r.match_id) ?? null)
        : (upcomingAuthorityMap.get(r.match_id) ?? liveAuthorityMap.get(r.match_id) ?? null);
      return {
      id: r.match_id,
      kickoff: r.kickoff_hkt,
      status: r.status,
      league: r.tournament,
      leagueZh: displayAuthority?.tournament ?? r.tournament ?? null,
      home: r.home_en,
      away: r.away_en,
      homeZh: r.home_en,
      awayZh: r.away_en,
      inPlay: Boolean(r.in_play),
      liveEligible: Boolean(r.in_play),
      liveNow: Boolean(r.live_now),
      live: r.live_now ? {
        status: r.live_status ?? null,
        fetchedAt: r.live_fetched_at ?? null,
        poolStatus: r.live_pool_status ?? null,
        oddsUpdatedAt: r.live_odds_updated_at ?? null,
        odds: {
          home: null,
          draw: null,
          away: null,
        },
        oddsSemantics: "NO_VERIFIED_IN_PLAY_BOOKMAKER_ODDS",
        handicap: {
          line: displayAuthority?.hdc_line ?? null,
          home: num(displayAuthority?.hdc_home),
          away: num(displayAuthority?.hdc_away),
        },
        goals: {
          line: r.live_hil_line ?? null,
          over: num(r.live_hil_over),
          under: num(r.live_hil_under),
        },
        corners: {
          line: r.live_chl_line ?? null,
          over: num(r.live_chl_over),
          under: num(r.live_chl_under),
        },
        score: {
          text: r.live_score ?? null,
          home: num(r.live_home_score),
          away: num(r.live_away_score),
          minute: num(r.live_minute),
          status: r.live_score_status ?? null,
          source: r.live_score_source ?? null,
          confidence: num(r.live_score_confidence),
          capturedAt: r.live_score_captured_at ?? null,
          sourceUpdatedAt: r.live_score_source_updated_at ?? null,
          homeCorners: num(r.live_home_corners),
          awayCorners: num(r.live_away_corners),
          totalCorners: num(r.live_total_corners),
        },
        stats: liveStatsMap.get(r.match_id) ?? null,
        shadow: shadowMap.get(r.match_id) ?? null,
      } : null,
      odds: {
        home: num(r.bookmaker_home_odds),
        draw: num(r.bookmaker_draw_odds),
        away: num(r.bookmaker_away_odds),
      },
      market: {
        home: num(r.bookmaker_novig_home),
        draw: num(r.bookmaker_novig_draw),
        away: num(r.bookmaker_novig_away),
      },
      handicap: {
        line: displayAuthority?.hdc_line ?? null,
        home: num(displayAuthority?.hdc_home),
        away: num(displayAuthority?.hdc_away),
      },
      handicapAdvice: (() => {
        const m:any=modelDetailMap.get(r.match_id) ?? null;
        const line=displayAuthority?.hdc_line ?? null, homeOdds=num(displayAuthority?.hdc_home), awayOdds=num(displayAuthority?.hdc_away);
        const home=asianEv(m?.dc_xg_home,m?.dc_xg_away,line,homeOdds,"HOME");
        const away=asianEv(m?.dc_xg_home,m?.dc_xg_away,line,awayOdds,"AWAY");
        if(!home&&!away) return {status:"NO_MODEL",line,reason:line==null?"讓球盤未開":"缺少可用 xG 模型"};
        const best=!away||(home&&home.ev>=away.ev)?{side:"HOME",...home}:{side:"AWAY",...away};
        return {
          status:best.ev>=0.03?"VALUE":best.ev>0?"LEAN":"NO_VALUE",
          line,
          selection:best.side,
          odds:best.side==="HOME"?homeOdds:awayOdds,
          edgePct:best.edgePct,
          fairOdds:best.fairOdds,
          home:home?{edgePct:home.edgePct,fairOdds:home.fairOdds}:null,
          away:away?{edgePct:away.edgePct,fairOdds:away.fairOdds}:null,
          method:"DC_XG_POISSON_ASIAN_SETTLEMENT",
          explanation:best.ev>=0.03?"模型結算 EV 高於 3%":best.ev>0?"有輕微正 EV，未達主要投注門檻":"現價未有正 EV"
        };
      })(),
      goals: {
        line: r.bookmaker_goals_line ?? null,
        over: num(r.bookmaker_goals_over),
        under: num(r.bookmaker_goals_under),
      },
      corners: {
        line: r.bookmaker_corners_line ?? null,
        over: num(r.bookmaker_corners_over),
        under: num(r.bookmaker_corners_under),
      },
      forebetDetail: {
        predictedScore: r.forebet_predicted_score ?? null,
        ou25: { over: num(r.forebet_ou_over), under: num(r.forebet_ou_under), avgGoals: num(r.forebet_avg_goals) },
        corners95: { over: num(r.forebet_corners_over), under: num(r.forebet_corners_under), avgCorners: num(r.forebet_avg_corners) },
        goalsCurrentLine: lineModel(
          r.bookmaker_goals_line,
          r.forebet_avg_goals,
          2.5,
          r.forebet_ou_over,
          0.5,
          6.5,
        ),
        cornersCurrentLine: lineModel(
          r.bookmaker_corners_line,
          r.forebet_avg_corners,
          9.5,
          r.forebet_corners_over,
          4.5,
          16.5,
        ),
      },
      multisourceDetail: {
        ou25: { over: num(r.multisource_ou_over), under: num(r.multisource_ou_under) },
        btts: { yes: num(r.multisource_btts_yes), no: num(r.multisource_btts_no) },
      },
      forebet: r.forebet_home == null ? null : {
        home: num(r.forebet_home), draw: num(r.forebet_draw), away: num(r.forebet_away),
      },
      dc: r.dc_home == null ? null : {
        home: num(r.dc_home), draw: num(r.dc_draw), away: num(r.dc_away),
      },
      dcDetail: (() => {
        const m: any = modelDetailMap.get(r.match_id) ?? null;
        if (!m) return null;
        return {
          quality: m.quality ?? null,
          source: m.model_source ?? null,
          league: m.model_league ?? null,
          fetchedAt: m.fetched_at ?? null,
          trainingMatches: Number(m.training_matches ?? 0),
          teamMatchQuality: num(m.team_match_quality),
          probabilities: {
            home: num(m.dc_prob_home),
            draw: num(m.dc_prob_draw),
            away: num(m.dc_prob_away),
          },
          expectedGoals: {
            home: num(m.dc_xg_home),
            away: num(m.dc_xg_away),
          },
          over25: num(m.dc_prob_over25),
          available: m.quality === "MODELED" && m.dc_prob_home != null,
          missingReason: m.quality === "MODELED" ? null : (m.quality ?? "NO_MODEL_ROW"),
        };
      })(),
      pi: r.pi_home == null ? null : {
        home: num(r.pi_home), draw: num(r.pi_draw), away: num(r.pi_away),
      },
      piDetail: (() => {
        const m: any = modelDetailMap.get(r.match_id) ?? null;
        if (!m) return null;
        return {
          quality: m.quality ?? null,
          source: m.model_source ?? null,
          league: m.model_league ?? null,
          fetchedAt: m.fetched_at ?? null,
          trainingMatches: Number(m.training_matches ?? 0),
          teamMatchQuality: num(m.team_match_quality),
          probabilities: {
            home: num(m.pi_prob_home),
            draw: num(m.pi_prob_draw),
            away: num(m.pi_prob_away),
          },
          ratings: {
            home: num(m.pi_home_rating),
            away: num(m.pi_away_rating),
            difference: num(m.pi_diff),
          },
          available: m.quality === "MODELED" && m.pi_prob_home != null,
          missingReason: m.quality === "MODELED" ? null : (m.quality ?? "NO_MODEL_ROW"),
        };
      })(),
      form: r.form_home == null ? null : {
        home: num(r.form_home), draw: num(r.form_draw), away: num(r.form_away),
      },
      formDetail: (() => {
        const detail: any = formDetailMap.get(r.match_id) ?? null;
        const meta: any = formMetaMap.get(r.match_id) ?? null;
        if (!detail && !meta) return null;
        const homeDetail = detail?.home ?? {};
        const awayDetail = detail?.away ?? {};
        return {
          quality: meta?.quality ?? null,
          source: meta?.model_source ?? "Verified results history",
          fetchedAt: meta?.fetched_at ?? null,
          home: {
            ...homeDetail,
            modelGames: Number(meta?.home_games ?? homeDetail?.games ?? 0),
            venueGames: Number(meta?.home_venue_games ?? 0),
            expectedGoals: num(meta?.form_xg_home),
          },
          away: {
            ...awayDetail,
            modelGames: Number(meta?.away_games ?? awayDetail?.games ?? 0),
            venueGames: Number(meta?.away_venue_games ?? 0),
            expectedGoals: num(meta?.form_xg_away),
          },
        };
      })(),
      multi: r.multisource_home == null ? null : {
        home: num(r.multisource_home),
        draw: num(r.multisource_draw),
        away: num(r.multisource_away),
        sources: Number(r.multisource_count ?? 0),
        sourceNames: r.multisource_sources ?? [],
      },
      health: {
        status: r.health_status,
        primaryMissingReason: r.primary_missing_reason,
        diagnostics: (r.diagnostic_codes ?? []).filter((code: string) => {
          if (code === "HOME_ALIAS_NOT_REGISTERED" && identityPresent(r.home_alias_present, r.home_en)) return false;
          if (code === "AWAY_ALIAS_NOT_REGISTERED" && identityPresent(r.away_alias_present, r.away_en)) return false;
          return true;
        }),
        authorityFetchedAt: r.authority_fetched_at,
        priceChangedAt: r.price_changed_at,
        marketCapturedAt: r.market_captured_at,
        authorityFetchAgeMinutes: num(r.authority_fetch_age_minutes),
        authorityFreshness: r.authority_freshness,
        forebetCheckedAt: r.forebet_checked_at,
        forebetState: r.forebet_state,
        forebetReason: r.forebet_reason,
        forebetCheckFreshness: r.forebet_check_freshness,
        internalModelQuality: r.internal_model_quality,
        internalModelSource: r.internal_model_source,
        fallbackStatus: r.fallback_status,
        fallbackSource: r.fallback_source,
        fallbackRecommendation: r.fallback_recommendation,
        fallbackMarket: r.fallback_market,
        homeAliasPresent: identityPresent(r.home_alias_present, r.home_en),
        awayAliasPresent: identityPresent(r.away_alias_present, r.away_en),
        evidenceChannelCount: Number(r.evidence_channel_count ?? 0),
        multisourceMemberCount: Number(r.multisource_member_count ?? 0),
        missingCanonical1x2: Boolean(r.missing_canonical_1x2),
        forebetCoverageStatus: r.forebet_coverage_status ?? null,
        dcPiCoverageStatus: r.dc_pi_coverage_status ?? null,
        formCoverageStatus: r.form_coverage_status ?? null,
        multisourceCoverageStatus: r.multisource_coverage_status ?? null,
        formQuality: r.form_quality ?? null,
        multisourceMatchStatus: r.multisource_match_status ?? null,
        multisourceMatchReason: r.multisource_match_reason ?? null,
        multisourceSourceCountTotal: Number(r.multisource_source_count_total ?? 0),
        unifiedCoverageStatus: (() => {
          const evidenceCount = Number(r.evidence_channel_count ?? 0);
          const rawStatus = String(r.unified_coverage_status ?? "");
          const sourceSpecificIdentityBlock =
            r.dc_pi_coverage_status === "IDENTITY_BLOCK" ||
            r.form_coverage_status === "IDENTITY_BLOCK";

          // The underlying health view historically treated a missing source row
          // as an identity mismatch because NULL names were compared as empty
          // strings. Preserve only source-specific, confirmed identity blocks.
          if (rawStatus === "IDENTITY_BLOCK" && !sourceSpecificIdentityBlock) {
            if (evidenceCount >= 3) return "DATA_RICH";
            if (evidenceCount >= 1) return "PARTIAL_MODEL_COVERAGE";
            if (identityPresent(r.home_alias_present, r.home_en) && identityPresent(r.away_alias_present, r.away_en)) {
              return "SOURCE_COVERAGE_GAP";
            }
          }

          // A missing optional model row is coverage information, not a hard
          // pipeline failure, when at least one independent channel is usable.
          if (rawStatus === "PIPELINE_COVERAGE_GAP" && evidenceCount >= 1) {
            return evidenceCount >= 3 ? "DATA_RICH" : "PARTIAL_MODEL_COVERAGE";
          }

          if (
            evidenceCount === 0 &&
            identityPresent(r.home_alias_present, r.home_en) &&
            identityPresent(r.away_alias_present, r.away_en) &&
            r.forebet_check_freshness === "FRESH" &&
            ["SOURCE_ABSENT", "FIXTURE_ONLY"].includes(String(r.forebet_coverage_status || "")) &&
            r.multisource_coverage_status === "NO_MATCHED_SOURCE"
          ) {
            return "SOURCE_COVERAGE_GAP";
          }

          return rawStatus || null;
        })(),
        coverageExplanation:
          Number(r.evidence_channel_count ?? 0) === 0 &&
          identityPresent(r.home_alias_present, r.home_en) &&
          identityPresent(r.away_alias_present, r.away_en)
            ? "Team identity is verified; prediction sources were checked but no usable independent 1X2 model is available."
            : null,
      },
      decision: r.decision,
      decisionMarket: r.decision_market,
      decisionSelection: r.decision_selection,
      decisionEdge: num(r.decision_edge),
      engineVersion: r.decision_engine_version,
      oddsMovement: (() => {
        const movement = movementMap.get(r.match_id);
        if (!movement) return null;
        const side = movement.side;
        const freshNow =
          side === "H" ? num(r.bookmaker_home_odds) :
          side === "D" ? num(r.bookmaker_draw_odds) :
          side === "A" ? num(r.bookmaker_away_odds) :
          null;
        const baseline = num(movement.baselineOdds);
        if (freshNow == null || baseline == null || baseline <= 0) return null;
        return {
          ...movement,
          nowOdds: freshNow,
          rawOddsChangePct: ((freshNow / baseline) - 1) * 100,
        };
      })(),
      power: powerMap.get(r.match_id) ?? null,
      storySummary: storySummaryMap.get(r.match_id) ?? null,
      sourceContext: sourceContextMap.get(r.match_id) ?? null,
      updatedAt: r.data_updated_at,
      };
    });

    return Response.json({
      generatedAt: new Date().toISOString(),
      source: "supabase-canonical-live",
      view: summaryOnly ? "summary" : "full",
      windowHours: hours,
      count: matches.length,
      systemHealth,
      matches,
    }, {
      headers: { ...corsHeaders, "Cache-Control": "public, max-age=5, stale-while-revalidate=15" },
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