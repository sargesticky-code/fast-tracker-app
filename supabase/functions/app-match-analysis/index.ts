import { eligibleLineupRows, confirmedStartingXI } from "../_shared/lineup-display.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const DB_READ_TIMEOUT_MS = 15_000;
const SUMMARY_AUTHORITY_TIMEOUT_MS = 10_000;
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


function serverKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const j = JSON.parse(modern);
      if (j?.default) return j.default;
    } catch {}
  }
  return "";
}

function n(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function p(v: unknown): number | null {
  const x = n(v);
  if (x === null) return null;
  const q = x > 1.5 ? x / 100 : x;
  return q >= 0 && q <= 1 ? q : null;
}

type T = { home: number; draw: number; away: number };
type Family = { key: string; label: string; probs: T; weight: number; sources?: number; provenanceGroup?: string; memberKeys?: string[]; independentEligible?: boolean };

function triplet(h: unknown, d: unknown, a: unknown): T | null {
  const home = p(h), draw = p(d), away = p(a);
  if (home === null || draw === null || away === null) return null;
  const s = home + draw + away;
  if (s <= 0) return null;
  return { home: home / s, draw: draw / s, away: away / s };
}

function avgTriplets(items: T[]): T | null {
  if (!items.length) return null;
  return {
    home: items.reduce((s, x) => s + x.home, 0) / items.length,
    draw: items.reduce((s, x) => s + x.draw, 0) / items.length,
    away: items.reduce((s, x) => s + x.away, 0) / items.length,
  };
}

function weighted(items: Family[]): T | null {
  const w = items.reduce((s, x) => s + x.weight, 0);
  if (!w) return null;
  return {
    home: items.reduce((s, x) => s + x.probs.home * x.weight, 0) / w,
    draw: items.reduce((s, x) => s + x.probs.draw * x.weight, 0) / w,
    away: items.reduce((s, x) => s + x.probs.away * x.weight, 0) / w,
  };
}

function provenanceGroup(sourceValue: unknown, fallback: string) {
  const source = String(sourceValue || "").toLowerCase();
  if (source.includes("forebet")) return "FOREBET";
  if (source.includes("brazilianfootball") || source.includes("brazil serie b full-league")) return "BRAZILIANFOOTBALL_SHARED";
  if (source.includes("football-data.co.uk") || source.includes("football data co uk")) return "FOOTBALL_DATA_CO_UK";
  if (source.includes("martj42")) return "MARTJ42_INTERNATIONAL_RESULTS";
  if (source.includes("hkjc")) return "HKJC_RESULTS";
  return fallback;
}

function knownProvenanceGroup(sourceValue: unknown) {
  const group = provenanceGroup(sourceValue, "UNKNOWN");
  return group === "UNKNOWN" ? null : group;
}

function collapseCorrelatedFamilies(items: Family[]): Family[] {
  const grouped = new Map<string, Family[]>();
  for (const item of items.filter((row) => row.independentEligible !== false)) {
    const key = item.provenanceGroup || item.key;
    grouped.set(key, [...(grouped.get(key) || []), item]);
  }
  return [...grouped.entries()].map(([group, members]) => {
    if (members.length === 1) return { ...members[0], provenanceGroup: group, memberKeys: [members[0].key] };
    const w = members.reduce((sum, item) => sum + item.weight, 0);
    const probs = weighted(members) || members[0].probs;
    return {
      key: members.map((item) => item.key).join("+"),
      label: members.map((item) => item.label).join(" + ") + " (shared history)",
      probs,
      weight: w > 0 ? w / members.length : 1,
      sources: members.reduce((sum, item) => sum + Math.max(1, Number(item.sources || 1)), 0),
      provenanceGroup: group,
      memberKeys: members.map((item) => item.key),
    };
  });
}

function pick(t: T | null): "H" | "D" | "A" | null {
  if (!t) return null;
  if (t.home >= t.draw && t.home >= t.away) return "H";
  if (t.draw >= t.home && t.draw >= t.away) return "D";
  return "A";
}

function val(t: T | null, side: "H" | "D" | "A") {
  if (!t) return null;
  return side === "H" ? t.home : side === "D" ? t.draw : t.away;
}

function pct(v: number | null, dp = 1) {
  return v === null ? "—" : (v * 100).toFixed(dp) + "%";
}

function sideLabel(side: string | null, home: string, away: string) {
  if (side === "H") return "主勝 · " + home;
  if (side === "D") return "和局";
  if (side === "A") return "客勝 · " + away;
  return "暫無投注位";
}

function oddsFor(r: any, side: string | null) {
  if (side === "H") return n(r.hkjc_home_odds);
  if (side === "D") return n(r.hkjc_draw_odds);
  if (side === "A") return n(r.hkjc_away_odds);
  return null;
}

function fairMarket(r: any): T | null {
  const direct = triplet(r.hkjc_novig_home, r.hkjc_novig_draw, r.hkjc_novig_away);
  if (direct) return direct;
  const oh = n(r.hkjc_home_odds), od = n(r.hkjc_draw_odds), oa = n(r.hkjc_away_odds);
  if (!oh || !od || !oa || oh <= 0 || od <= 0 || oa <= 0) return null;
  const s = 1 / oh + 1 / od + 1 / oa;
  return { home: (1 / oh) / s, draw: (1 / od) / s, away: (1 / oa) / s };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function liveScorePair(scoreText: unknown, homeValue: unknown, awayValue: unknown) {
  const directHome = n(homeValue);
  const directAway = n(awayValue);
  if (directHome !== null && directAway !== null) {
    return { home: Math.max(0, Math.round(directHome)), away: Math.max(0, Math.round(directAway)) };
  }
  const m = String(scoreText || "").match(/(\d+)\s*[-:]\s*(\d+)/);
  if (!m) return null;
  return { home: Number(m[1]), away: Number(m[2]) };
}

function secondsOld(value: unknown) {
  if (!value) return null;
  const ms = new Date(String(value)).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, (Date.now() - ms) / 1000);
}

function matchStatusToken(...values: unknown[]) {
  for (const value of values) {
    const token = String(value ?? "").trim().toUpperCase().replace(/[\s_-]+/g, "");
    if (token) return token;
  }
  return "";
}

function statusIsLive(token: string) {
  return [
    "LIVE",
    "INPLAY",
    "FIRSTHALF",
    "FIRSTHALFCOMPLETED",
    "HALFTIME",
    "HT",
    "SECONDHALF",
    "EXTRATIME",
    "PENALTIES",
  ].includes(token);
}

function statusIsPrematch(token: string) {
  return ["PREEVENT", "PREMATCH", "UPCOMING", "SCHEDULED", "NOTSTARTED"].includes(token);
}

function statusIsTerminal(token: string) {
  return [
    "FULLTIME",
    "FINISHED",
    "FT",
    "ENDED",
    "MATCHENDED",
    "INPLAYMATCHENDED",
    "AET",
    "PEN",
    "CANCELLED",
    "CANCELED",
    "VOID",
    "ABANDONED",
  ].includes(token);
}

function inferredLiveMinute(explicit: unknown, kickoff: unknown) {
  const direct = n(explicit);
  if (direct !== null) return clamp(Math.round(direct), 0, 100);
  if (!kickoff) return null;
  const ms = new Date(String(kickoff)).getTime();
  if (!Number.isFinite(ms)) return null;
  return clamp(Math.round((Date.now() - ms) / 60000), 0, 100);
}

function poissonPmf(k: number, lambda: number) {
  if (k < 0 || lambda < 0) return 0;
  if (lambda === 0) return k === 0 ? 1 : 0;
  let term = Math.exp(-lambda);
  if (k === 0) return term;
  for (let i = 1; i <= k; i += 1) term *= lambda / i;
  return term;
}

function livePaceRatio(totalMean: number, minute: number, shadow: any) {
  const xgHome = n(shadow?.xg_home);
  const xgAway = n(shadow?.xg_away);
  const xgTotal = (xgHome ?? 0) + (xgAway ?? 0);
  if (minute < 10 || xgTotal <= 0) return 1;
  const expectedElapsed = totalMean * Math.max(0.08, minute / 95);
  return clamp(xgTotal / expectedElapsed, 0.65, 1.55);
}

function liveStateAdjustedTriplet(
  prior: T,
  homeScore: number,
  awayScore: number,
  minuteValue: number,
  totalMeanValue: number,
  shadow: any,
): T {
  const minute = clamp(minuteValue, 0, 96);
  const remainingFraction = Math.max(0, (95 - minute) / 95);
  const totalMean = clamp(totalMeanValue || 2.7, 1.2, 5.2);
  const paceRatio = livePaceRatio(totalMean, minute, shadow);

  let remainingMean = totalMean * remainingFraction * (0.72 + 0.28 * paceRatio);
  if (minute >= 55 && homeScore !== awayScore) remainingMean *= 1.06;

  let homeShare = clamp(0.5 + (prior.home - prior.away) * 0.58, 0.20, 0.80);
  const xgHome = n(shadow?.xg_home);
  const xgAway = n(shadow?.xg_away);
  const xgTotal = (xgHome ?? 0) + (xgAway ?? 0);
  if (xgHome !== null && xgAway !== null && xgTotal > 0.15) {
    const xgShare = clamp((xgHome + 0.15) / (xgTotal + 0.30), 0.18, 0.82);
    homeShare = 0.72 * homeShare + 0.28 * xgShare;
  }
  const actualSide = String(shadow?.actual_control_side || "").toUpperCase();
  if (actualSide === "H") homeShare += 0.035;
  if (actualSide === "A") homeShare -= 0.035;
  if (homeScore < awayScore) homeShare += 0.04;
  if (homeScore > awayScore) homeShare -= 0.04;
  homeShare = clamp(homeShare, 0.16, 0.84);

  const lambdaHome = Math.max(0, remainingMean * homeShare);
  const lambdaAway = Math.max(0, remainingMean * (1 - homeShare));
  let home = 0, draw = 0, away = 0;
  for (let hg = 0; hg <= 8; hg += 1) {
    const ph = poissonPmf(hg, lambdaHome);
    for (let ag = 0; ag <= 8; ag += 1) {
      const prob = ph * poissonPmf(ag, lambdaAway);
      const fh = homeScore + hg;
      const fa = awayScore + ag;
      if (fh > fa) home += prob;
      else if (fh === fa) draw += prob;
      else away += prob;
    }
  }
  const s = home + draw + away;
  if (s <= 0) return prior;
  return { home: home / s, draw: draw / s, away: away / s };
}

function liveResidualOver(
  fullMeanValue: unknown,
  currentTotal: number,
  minuteValue: number,
  lineValue: unknown,
  paceRatioValue = 1,
) {
  const fullMean = n(fullMeanValue);
  const line = n(lineValue);
  if (fullMean === null || fullMean <= 0 || line === null) return null;
  if (currentTotal > line) return 0.999;
  const minute = clamp(minuteValue, 0, 96);
  const remainingFraction = Math.max(0, (95 - minute) / 95);
  const remainingMean = fullMean * remainingFraction * (0.72 + 0.28 * clamp(paceRatioValue, 0.65, 1.55));
  const residualLine = line - currentTotal;
  return poissonOver(remainingMean, residualLine);
}

function parseAsianHandicapLine(value: unknown): number[] | null {
  const raw = String(value ?? "").trim().replace(/−/g, "-").replace(/＋/g, "+");
  if (!raw) return null;
  const parts = raw.split("/").map((x) => Number(x.trim())).filter(Number.isFinite);
  if (!parts.length || parts.length > 2) return null;
  return parts;
}

type DiffOutcome = { diff: number; probability: number };

function scoreDiffDistribution(
  prior: T,
  totalMeanValue: number,
  homeScoreValue = 0,
  awayScoreValue = 0,
  minuteValue: number | null = null,
  shadow: any = null,
): DiffOutcome[] {
  const homeScore = Math.max(0, Math.round(homeScoreValue));
  const awayScore = Math.max(0, Math.round(awayScoreValue));
  const totalMean = clamp(totalMeanValue || 2.7, 1.2, 5.2);
  const liveMode = minuteValue !== null;
  const minute = liveMode ? clamp(Number(minuteValue), 0, 96) : 0;
  const paceRatio = liveMode ? livePaceRatio(totalMean, minute, shadow) : 1;

  let remainingMean = liveMode
    ? totalMean * Math.max(0, (95 - minute) / 95) * (0.72 + 0.28 * paceRatio)
    : totalMean;
  if (liveMode && minute >= 55 && homeScore !== awayScore) remainingMean *= 1.06;

  let homeShare = clamp(0.5 + (prior.home - prior.away) * 0.58, 0.20, 0.80);
  if (liveMode) {
    const xgHome = n(shadow?.xg_home);
    const xgAway = n(shadow?.xg_away);
    const xgTotal = (xgHome ?? 0) + (xgAway ?? 0);
    if (xgHome !== null && xgAway !== null && xgTotal > 0.15) {
      const xgShare = clamp((xgHome + 0.15) / (xgTotal + 0.30), 0.18, 0.82);
      homeShare = 0.72 * homeShare + 0.28 * xgShare;
    }
    const actualSide = String(shadow?.actual_control_side || "").toUpperCase();
    if (actualSide === "H") homeShare += 0.035;
    if (actualSide === "A") homeShare -= 0.035;
    if (homeScore < awayScore) homeShare += 0.04;
    if (homeScore > awayScore) homeShare -= 0.04;
  }
  homeShare = clamp(homeShare, 0.16, 0.84);

  const lambdaHome = Math.max(0, remainingMean * homeShare);
  const lambdaAway = Math.max(0, remainingMean * (1 - homeShare));
  const diffMap = new Map<number, number>();
  let mass = 0;
  for (let hg = 0; hg <= 10; hg += 1) {
    const ph = poissonPmf(hg, lambdaHome);
    for (let ag = 0; ag <= 10; ag += 1) {
      const probability = ph * poissonPmf(ag, lambdaAway);
      if (probability <= 0) continue;
      const diff = (homeScore + hg) - (awayScore + ag);
      diffMap.set(diff, (diffMap.get(diff) ?? 0) + probability);
      mass += probability;
    }
  }
  if (mass <= 0) return [];
  return [...diffMap.entries()].map(([diff, probability]) => ({ diff, probability: probability / mass }));
}

function asianSettlementNet(diff: number, homeLine: number, odds: number, side: "HOME" | "AWAY") {
  const adjustedHome = diff + homeLine;
  const sideMargin = side === "HOME" ? adjustedHome : -adjustedHome;
  if (sideMargin > 1e-9) return odds - 1;
  if (sideMargin < -1e-9) return -1;
  return 0;
}

function asianExpectedValue(
  distribution: DiffOutcome[],
  homeLines: number[],
  oddsValue: unknown,
  side: "HOME" | "AWAY",
) {
  const odds = n(oddsValue);
  if (!distribution.length || !homeLines.length || odds === null || odds <= 1) return null;
  let ev = 0;
  for (const row of distribution) {
    const settlement = homeLines.reduce(
      (sum, line) => sum + asianSettlementNet(row.diff, line, odds, side),
      0,
    ) / homeLines.length;
    ev += row.probability * settlement;
  }
  return ev;
}

function buildHandicapAdvice(opts: {
  lineValue: unknown;
  homeOdds: unknown;
  awayOdds: unknown;
  consensus: T | null;
  families: Family[];
  totalMean: number;
  homeName: string;
  awayName: string;
  live: boolean;
  score: { home: number; away: number } | null;
  minute: number | null;
  shadow: any;
  fresh: boolean;
  fallbackMode: boolean;
}) {
  const lines = parseAsianHandicapLine(opts.lineValue);
  const homeOdds = n(opts.homeOdds);
  const awayOdds = n(opts.awayOdds);
  const usable = Boolean(lines && opts.consensus && homeOdds && awayOdds && homeOdds > 1 && awayOdds > 1);
  if (!usable || !opts.fresh || opts.fallbackMode) {
    return {
      market: "ASIAN_HANDICAP",
      label: "亞洲讓球",
      line: opts.lineValue ?? null,
      selection: null,
      selectionLabel: "暫不建議",
      currentOdds: null,
      expectedValuePct: null,
      candidateClass: "DATA_RISK",
      action: "NO_BET",
      method: "MODEL_DERIVED_SCORE_DISTRIBUTION",
      advice: !usable
        ? "亞洲讓球：現時未有完整 HKJC 讓球盤或可用模型分布。"
        : "亞洲讓球：市場價格 freshness 未通過，暫不以舊價計 Value。",
    };
  }

  const baseHome = opts.live && opts.score ? opts.score.home : 0;
  const baseAway = opts.live && opts.score ? opts.score.away : 0;
  const minute = opts.live ? opts.minute : null;
  const dist = scoreDiffDistribution(opts.consensus!, opts.totalMean, baseHome, baseAway, minute, opts.shadow);
  const homeEv = asianExpectedValue(dist, lines!, homeOdds, "HOME");
  const awayEv = asianExpectedValue(dist, lines!, awayOdds, "AWAY");
  const side: "HOME" | "AWAY" | null =
    homeEv === null && awayEv === null ? null :
    (homeEv ?? -999) >= (awayEv ?? -999) ? "HOME" : "AWAY";
  const ev = side === "HOME" ? homeEv : side === "AWAY" ? awayEv : null;
  const odds = side === "HOME" ? homeOdds : side === "AWAY" ? awayOdds : null;

  const familyEvs = side ? opts.families.map((family) => {
    const fd = scoreDiffDistribution(family.probs, opts.totalMean, baseHome, baseAway, minute, opts.shadow);
    return asianExpectedValue(fd, lines!, side === "HOME" ? homeOdds : awayOdds, side);
  }).filter((x): x is number => x !== null) : [];
  const supportCount = familyEvs.filter((x) => x > 0).length;
  const supportRatio = familyEvs.length ? supportCount / familyEvs.length : 0;
  const evDispersion = familyEvs.length >= 2 ? Math.max(...familyEvs) - Math.min(...familyEvs) : null;

  let candidateClass = "NO_EDGE";
  if (side === null || ev === null || ev <= 0) candidateClass = "NO_EDGE";
  else if (opts.families.length < 2) candidateClass = "WATCH_SINGLE_SOURCE";
  else if (evDispersion !== null && evDispersion > 0.18) candidateClass = "WATCH_MODEL_SPLIT";
  // Asian handicap has push/half-win settlement, so there is no clean
  // probability-gap equivalent. Use EV + independent-family support +
  // dispersion as the second evidence gate instead.
  else if (ev >= 0.12 && supportRatio >= 0.75 && (evDispersion === null || evDispersion <= 0.12)) candidateClass = "STRONG_VALUE_CANDIDATE";
  else if (ev >= 0.05 && supportRatio >= 0.50 && (evDispersion === null || evDispersion <= 0.15)) candidateClass = "VALUE_CANDIDATE";
  else if (ev >= 0.02) candidateClass = "LEAN";
  else candidateClass = "WATCH";

  const action = candidateClass === "NO_EDGE" ? "PASS"
    : candidateClass.includes("STRONG") ? "STRONG_VALUE_CANDIDATE"
    : candidateClass.includes("VALUE") ? "VALUE_CANDIDATE"
    : candidateClass === "LEAN" ? "LEAN"
    : "WATCH";
  const lineText = String(opts.lineValue ?? "—");
  const selectionLabel = side === "HOME"
    ? `${opts.homeName} ${lineText}`
    : side === "AWAY"
      ? `${opts.awayName} ${lines!.map((x) => -x).map((x) => (x > 0 ? "+" : "") + x).join("/")}`
      : "暫不建議";
  const evText = ev === null ? "—" : `${ev >= 0 ? "+" : ""}${(ev * 100).toFixed(1)}%`;
  let advice = "亞洲讓球：模型計算後未見正期望值。";
  if (side && ev !== null && ev > 0) {
    const supportText = `${supportCount}/${Math.max(1, familyEvs.length)} 個 evidence family 為正值`;
    const dispersionText = evDispersion !== null ? `，模型 EV 分歧 ${(evDispersion * 100).toFixed(1)}pp` : "";
    const whyWatch = action === "WATCH"
      ? "；EV 雖正，但 family 數量、支持率或模型分歧未過 Value gate"
      : "";
    advice = `${action === "WATCH" ? "觀望" : action === "LEAN" ? "輕微傾向" : action.includes("STRONG") ? "強 Value 候選" : "Value 候選"} ${selectionLabel} @ ${odds?.toFixed(2) ?? "—"}；模型衍生 EV ${evText}，${supportText}${dispersionText}${whyWatch}。`;
  }

  return {
    market: "ASIAN_HANDICAP",
    label: "亞洲讓球",
    line: opts.lineValue ?? null,
    selection: side,
    selectionLabel,
    currentOdds: odds,
    expectedValuePct: ev === null ? null : ev * 100,
    candidateClass,
    action,
    supportCount,
    evidenceFamilyCount: opts.families.length,
    supportRatio,
    dispersionPct: evDispersion === null ? null : evDispersion * 100,
    method: "MODEL_DERIVED_SCORE_DISTRIBUTION",
    homeExpectedValuePct: homeEv === null ? null : homeEv * 100,
    awayExpectedValuePct: awayEv === null ? null : awayEv * 100,
    advice,
  };
}

function maxHdaValue(
  consensus: T | null,
  market: T | null,
  oddsBySide: { H: number | null; D: number | null; A: number | null },
) {
  if (!consensus || !market) {
    return {
      side: null as "H"|"D"|"A"|null,
      edge: null as number|null,
      expectedValue: null as number|null,
      modelProbability: null as number|null,
      marketProbability: null as number|null,
      odds: null as number|null,
    };
  }
  const rows = [
    { side: "H" as const, modelProbability: consensus.home, marketProbability: market.home, odds: oddsBySide.H },
    { side: "D" as const, modelProbability: consensus.draw, marketProbability: market.draw, odds: oddsBySide.D },
    { side: "A" as const, modelProbability: consensus.away, marketProbability: market.away, odds: oddsBySide.A },
  ].filter((row) => row.odds !== null && row.odds > 1)
    .map((row) => ({
      ...row,
      edge: row.modelProbability - row.marketProbability,
      expectedValue: row.modelProbability * (row.odds as number) - 1,
    }))
    .sort((a, b) => b.expectedValue - a.expectedValue);
  if (!rows.length) {
    return {
      side: null as "H"|"D"|"A"|null,
      edge: null as number|null,
      expectedValue: null as number|null,
      modelProbability: null as number|null,
      marketProbability: null as number|null,
      odds: null as number|null,
    };
  }
  return rows[0];
}

function oneError(e: any) {
  return e ? { code: e.code ?? null, message: e.message ?? String(e) } : null;
}

function normalizedSide(value:any){
  const side=String(value||"").trim().toUpperCase();
  if(side==="H"||side==="HOME") return "H";
  if(side==="A"||side==="AWAY") return "A";
  return null;
}
function compactToken(value:any){
  return String(value||"").trim().toLowerCase().replace(/\s+/g," ").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}
function evidenceKey(table:string,row:any,idFallback:string){
  const rowId=String(row?.id??"").trim();
  return rowId ? `${table}:${rowId}` : `${table}:${idFallback}:${compactToken(row?.player_key||row?.player_name||"unknown")}`;
}
function playerClaimFingerprint(row:any,canonicalIdentity:string|null){
  return [
    String(row?.hkjc_event_id||""),
    normalizedSide(row?.team_side)||"?",
    canonicalIdentity || "UNRESOLVED:" + compactToken(row?.player_name||row?.raw?.player?.name||row?.raw?.player_name||row?.player_key||"unknown"),
    compactToken(row?.status_type),
    compactToken(row?.status_value),
  ].join("|");
}
function annotatePlayerEvidence(row:any,canonicalPlayers:Map<string,{canonicalName:string,teamKey:string}>,table:string,idFallback:string){
  const playerKey=String(row?.player_key||"").trim();
  const side=normalizedSide(row?.team_side);
  const canonicalPlayer=playerKey ? canonicalPlayers.get(playerKey) : null;
  const canonical=Boolean(canonicalPlayer);
  // The exact registry key is stable and unique. Names/team membership are
  // descriptive metadata and may collide or change after a transfer.
  const canonicalIdentity=canonicalPlayer ? `phase2_players:${playerKey}` : null;
  const sourceConfirmed=row?.confirmed===true;
  const factStatus=sourceConfirmed&&canonical
    ?"CONFIRMED"
    : sourceConfirmed
      ?"SOURCE_CONFIRMED_IDENTITY_UNRESOLVED"
      :"UNCONFIRMED";
  return {
    ...row,
    team_side:side||row?.team_side||null,
    evidence_key:evidenceKey(table,row,idFallback),
    source_link:row?.source_url||null,
    identity_status:canonical?"CANONICAL":"UNRESOLVED",
    canonical_player_identity:canonicalIdentity,
    fact_status:factStatus,
    record_group:playerClaimFingerprint(row,canonicalIdentity),
  };
}
function uniqueConfirmedClaims(rows:any[]){
  const out=new Map<string,any>();
  for(const row of rows){
    if(row?.fact_status!=="CONFIRMED") continue;
    const key=String(row?.record_group||"");
    if(!out.has(key)) out.set(key,row);
  }
  return [...out.values()];
}

type BinaryModel = {
  key: string;
  label: string;
  over: number;
  weight: number;
  sources?: number;
  method?: string;
  provenanceGroup?: string;
  memberKeys?: string[];
  independentEligible?: boolean;
};


function collapseCorrelatedBinaryModels(items: BinaryModel[]): BinaryModel[] {
  const grouped = new Map<string, BinaryModel[]>();
  for (const item of items.filter((row) => row.independentEligible !== false)) {
    const key = item.provenanceGroup || item.key;
    grouped.set(key, [...(grouped.get(key) || []), item]);
  }
  return [...grouped.entries()].map(([group, members]) => {
    if (members.length === 1) return { ...members[0], provenanceGroup: group, memberKeys: [members[0].key] };
    const w = members.reduce((sum, item) => sum + item.weight, 0);
    const over = w > 0
      ? members.reduce((sum, item) => sum + item.over * item.weight, 0) / w
      : members.reduce((sum, item) => sum + item.over, 0) / members.length;
    return {
      key: members.map((item) => item.key).join("+"),
      label: members.map((item) => item.label).join(" + ") + " (shared history)",
      over,
      weight: w > 0 ? w / members.length : 1,
      sources: members.reduce((sum, item) => sum + Math.max(1, Number(item.sources || 1)), 0),
      method: "CORRELATED_SOURCE_GROUP",
      provenanceGroup: group,
      memberKeys: members.map((item) => item.key),
    };
  });
}

function fairBinary(overOddsValue: unknown, underOddsValue: unknown) {
  const overOdds = n(overOddsValue);
  const underOdds = n(underOddsValue);
  if (!overOdds || !underOdds || overOdds <= 0 || underOdds <= 0) return null;
  const s = (1 / overOdds) + (1 / underOdds);
  if (s <= 0) return null;
  return { over: (1 / overOdds) / s, under: (1 / underOdds) / s };
}

function clampProb(v: number) {
  return Math.min(0.999, Math.max(0.001, v));
}

function logit(v: number) {
  const q = clampProb(v);
  return Math.log(q / (1 - q));
}

function logistic(v: number) {
  return 1 / (1 + Math.exp(-v));
}

function poissonOver(meanValue: unknown, lineValue: unknown) {
  const mean = n(meanValue);
  const line = n(lineValue);
  if (mean === null || line === null || mean <= 0 || line < 0) return null;
  const threshold = Math.floor(line) + 1;
  let term = Math.exp(-mean);
  let cdf = term;
  for (let k = 1; k < threshold; k += 1) {
    term *= mean / k;
    cdf += term;
  }
  return clampProb(1 - cdf);
}

function currentLineOver(
  targetLineValue: unknown,
  avgValue: unknown,
  refLine: number,
  refOverValue: unknown,
) {
  const targetLine = n(targetLineValue);
  const avg = n(avgValue);
  const refOver = p(refOverValue);
  if (targetLine === null) return null;
  if (Math.abs(targetLine - refLine) < 0.001 && refOver !== null) {
    return { over: refOver, method: "NATIVE_REFERENCE_LINE" };
  }
  const baseTarget = poissonOver(avg, targetLine);
  if (baseTarget === null) return null;
  if (refOver !== null) {
    const baseRef = poissonOver(avg, refLine);
    if (baseRef !== null) {
      return {
        over: clampProb(logistic(logit(baseTarget) + (logit(refOver) - logit(baseRef)))),
        method: "ANCHORED_POISSON",
      };
    }
  }
  return { over: baseTarget, method: "AVG_POISSON" };
}

function buildBinaryAdvice(opts: {
  marketKey: string;
  label: string;
  lineValue: unknown;
  overOdds: unknown;
  underOdds: unknown;
  models: BinaryModel[];
  healthOk: boolean;
  fresh: boolean;
  fallbackMode: boolean;
  productionValidated: boolean;
}) {
  const line = n(opts.lineValue);
  const market = fairBinary(opts.overOdds, opts.underOdds);
  const rawModels = opts.models.filter((m) => Number.isFinite(m.over) && m.over >= 0 && m.over <= 1 && m.weight > 0);
  const models = collapseCorrelatedBinaryModels(rawModels);
  const weight = models.reduce((s, m) => s + m.weight, 0);
  const modelOver = weight > 0 ? models.reduce((s, m) => s + m.over * m.weight, 0) / weight : null;
  const modelUnder = modelOver === null ? null : 1 - modelOver;
  const overEdge = market && modelOver !== null ? modelOver - market.over : null;
  const underEdge = market && modelUnder !== null ? modelUnder - market.under : null;
  const overOdds = n(opts.overOdds);
  const underOdds = n(opts.underOdds);
  const overExpectedValue = modelOver !== null && overOdds !== null && overOdds > 1 ? modelOver * overOdds - 1 : null;
  const underExpectedValue = modelUnder !== null && underOdds !== null && underOdds > 1 ? modelUnder * underOdds - 1 : null;

  let selection: "OVER" | "UNDER" | null = null;
  let edge: number | null = null;
  let expectedValue: number | null = null;
  if (overExpectedValue !== null || underExpectedValue !== null) {
    if ((overExpectedValue ?? -999) >= (underExpectedValue ?? -999)) {
      selection = (overExpectedValue ?? -1) > 0 ? "OVER" : null;
      edge = selection ? overEdge : null;
      expectedValue = selection ? overExpectedValue : Math.max(overExpectedValue ?? -999, underExpectedValue ?? -999);
    } else {
      selection = (underExpectedValue ?? -1) > 0 ? "UNDER" : null;
      edge = selection ? underEdge : null;
      expectedValue = selection ? underExpectedValue : Math.max(overExpectedValue ?? -999, underExpectedValue ?? -999);
    }
  }

  const odds = selection === "OVER" ? overOdds : selection === "UNDER" ? underOdds : null;
  const modelProbability = selection === "OVER" ? modelOver : selection === "UNDER" ? modelUnder : null;
  const marketProbability = selection === "OVER" ? market?.over ?? null : selection === "UNDER" ? market?.under ?? null : null;
  const lineText = line === null ? "—" : String(line).replace(/\.0$/, "");
  const selectionLabel = selection === "OVER"
    ? `大 ${lineText}`
    : selection === "UNDER"
      ? `細 ${lineText}`
      : "PASS";

  const selectedModelProbabilities = selection === "OVER"
    ? models.map((m) => m.over)
    : selection === "UNDER"
      ? models.map((m) => 1 - m.over)
      : [];
  const supportCount = marketProbability === null
    ? 0
    : selectedModelProbabilities.filter((prob) => prob > marketProbability).length;
  const supportRatio = selectedModelProbabilities.length ? supportCount / selectedModelProbabilities.length : 0;
  const dispersion = selectedModelProbabilities.length >= 2
    ? Math.max(...selectedModelProbabilities) - Math.min(...selectedModelProbabilities)
    : null;

  let dataRiskReason: string | null = null;
  if (!market) dataRiskReason = "MISSING_MARKET_PRICE";
  else if (line === null) dataRiskReason = "MISSING_MARKET_LINE";
  else if (opts.fallbackMode) dataRiskReason = "REFERENCE_PRICE_ONLY";
  else if (!opts.fresh) dataRiskReason = "STALE_MARKET_PRICE";

  let candidateClass = "NO_EDGE";
  if (dataRiskReason) candidateClass = "DATA_RISK";
  else if (!models.length) candidateClass = "NO_MODEL";
  else if (selection === null || expectedValue === null || expectedValue <= 0) candidateClass = "NO_EDGE";
  else if (models.length < 2) candidateClass = "WATCH_SINGLE_SOURCE";
  else if (dispersion !== null && dispersion > 0.18) candidateClass = "WATCH_MODEL_SPLIT";
  // Same dual gate as HDA: actual-price EV plus a meaningful model-vs-fair
  // probability gap. This prevents long prices from amplifying tiny probability
  // disagreements into misleading Value labels.
  else if (expectedValue >= 0.08 && (edge ?? -1) >= 0.06 && supportRatio >= 0.66 && (dispersion === null || dispersion <= 0.12)) candidateClass = "STRONG_VALUE_CANDIDATE";
  else if (expectedValue >= 0.04 && (edge ?? -1) >= 0.03 && supportRatio >= 0.50 && (dispersion === null || dispersion <= 0.15)) candidateClass = "VALUE_CANDIDATE";
  else if (expectedValue >= 0.02 && (edge ?? -1) >= 0.015) candidateClass = "LEAN";
  else candidateClass = "WATCH";

  const action = candidateClass === "DATA_RISK" ? "NO_BET"
    : ["NO_MODEL", "NO_EDGE"].includes(candidateClass) ? "PASS"
    : candidateClass === "LEAN" ? "LEAN"
    : candidateClass.includes("VALUE") ? candidateClass
    : "WATCH";

  const edgePp = edge === null ? null : edge * 100;
  const expectedValuePct = expectedValue === null || !Number.isFinite(expectedValue) ? null : expectedValue * 100;
  const sourceCount = models.reduce((s, m) => s + Math.max(1, Number(m.sources || 1)), 0);
  let advice = "PASS：未有足夠模型證據形成方向。";
  if (candidateClass === "DATA_RISK") {
    const why = dataRiskReason === "MISSING_MARKET_PRICE"
      ? "HKJC 現價未齊"
      : dataRiskReason === "MISSING_MARKET_LINE"
        ? "HKJC 盤口線未齊"
        : dataRiskReason === "REFERENCE_PRICE_ONLY"
          ? "目前只得參考舊價"
          : "HKJC 現價已超過 freshness 門檻";
    advice = `${opts.label}：暫不下注，因為${why}；呢個係資料 gate，唔代表市場本身冇價值。`;
  }
  else if (candidateClass === "NO_MODEL") advice = `${opts.label} ${lineText}：有 HKJC 現盤，但未有可比較模型，所以暫不下注；原因係冇模型，而唔係計過冇 Edge。`;
  else if (candidateClass === "NO_EDGE") advice = `${opts.label} ${lineText}：已按現價計算，最佳方向 EV 仍然 ≤ 0%，所以跳過。`;
  else if (selection) {
    const lead = candidateClass.includes("VALUE")
      ? "Value 候選"
      : candidateClass === "LEAN"
        ? "輕微傾向"
        : "觀察";
    const thinGapNote = expectedValuePct !== null && expectedValuePct >= 4 && edgePp !== null && edgePp < 3
      ? "；EV 雖高但機率差不足 3pp，可能受高賠率放大，只列觀望"
      : "";
    advice = `${opts.label}${lead} ${selectionLabel}${odds ? " @ " + odds.toFixed(2) : ""}；現價 EV ${expectedValuePct === null ? "—" : (expectedValuePct >= 0 ? "+" : "") + expectedValuePct.toFixed(1) + "%"}，模型 ${pct(modelProbability)} vs HKJC fair ${pct(marketProbability)}（機率差 ${edgePp === null ? "—" : (edgePp >= 0 ? "+" : "") + edgePp.toFixed(1) + "pp"}），${supportCount}/${models.length} 個 evidence family 支持 / ${sourceCount} 個來源訊號${dispersion !== null ? "，模型分歧 " + (dispersion * 100).toFixed(1) + "pp" : ""}${thinGapNote}。`;
  }

  return {
    market: opts.marketKey,
    label: opts.label,
    line,
    selection,
    selectionLabel,
    currentOdds: (!opts.fresh || opts.fallbackMode) ? null : odds,
    referenceOdds: (!opts.fresh || opts.fallbackMode) ? odds : null,
    oddsStatus: (!opts.fresh || opts.fallbackMode) ? "REFERENCE_STALE" : "CURRENT",
    marketFairProbability: marketProbability,
    analystConsensusProbability: modelProbability,
    candidateEdgePp: edgePp,
    expectedValuePct,
    candidateClass,
    action,
    dataRiskReason,
    healthWarning: !opts.healthOk,
    autoStakeAllowed: opts.productionValidated,
    evidenceFamilyCount: models.length,
    supportCount,
    supportRatio,
    dispersion,
    sourceSignalCount: sourceCount,
    marketProbabilities: market,
    modelProbabilities: modelOver === null ? null : { over: modelOver, under: modelUnder },
    models: models.map((m) => ({
      key: m.key,
      label: m.label,
      over: m.over,
      under: 1 - m.over,
      weight: m.weight,
      sources: m.sources ?? 1,
      method: m.method ?? null,
      provenanceGroup: m.provenanceGroup ?? m.key,
      memberKeys: m.memberKeys ?? [m.key],
      independentEligible: m.independentEligible !== false,
    })),
    advice,
  };
}

async function readSummaryAuthority(sbUrl:string,id:string){
  const res=await fetch(`${sbUrl}/functions/v1/app-phase1-feed?hours=48&view=summary`,{
    signal:AbortSignal.timeout(SUMMARY_AUTHORITY_TIMEOUT_MS),
  });
  if(!res.ok) throw new Error(`summary_authority_http_${res.status}`);
  const body=await res.json();
  const match=Array.isArray(body?.matches)?body.matches.find((x:any)=>String(x?.id||"")===id):null;
  return match||null;
}

function summaryMatchToAnalysisRow(m:any,id:string){
  if(!m) return null;
  return {
    hkjc_event_id:id,
    home_zh:m?.homeZh ?? null,
    away_zh:m?.awayZh ?? null,
    home_en:m?.home ?? null,
    away_en:m?.away ?? null,
    tournament:m?.league ?? null,
    kickoff_hkt:m?.kickoff ?? null,
    hkjc_home_odds:m?.odds?.home ?? null,
    hkjc_draw_odds:m?.odds?.draw ?? null,
    hkjc_away_odds:m?.odds?.away ?? null,
    hkjc_novig_home:m?.market?.home ?? null,
    hkjc_novig_draw:m?.market?.draw ?? null,
    hkjc_novig_away:m?.market?.away ?? null,
    hkjc_goals_line:m?.goals?.line ?? null,
    hkjc_goals_over:m?.goals?.over ?? null,
    hkjc_goals_under:m?.goals?.under ?? null,
    hkjc_corners_line:m?.corners?.line ?? null,
    hkjc_corners_over:m?.corners?.over ?? null,
    hkjc_corners_under:m?.corners?.under ?? null,
    forebet_home:null,forebet_draw:null,forebet_away:null,
    forebet_ou_over:null,forebet_ou_under:null,forebet_avg_goals:null,
    forebet_corners_over:null,forebet_corners_under:null,forebet_avg_corners:null,
    dc_home:null,dc_draw:null,dc_away:null,
    pi_home:null,pi_draw:null,pi_away:null,
    form_home:null,form_draw:null,form_away:null,
    multisource_home:null,multisource_draw:null,multisource_away:null,
    multisource_count:0,multisource_member_count:0,
    status:m?.status ?? null,
    health_status:m?.health?.status ?? "SUMMARY_AUTHORITY",
    hkjc_freshness:m?.health?.hkjcFreshness ?? (m?.liveNow?"LIVE":"UNKNOWN"),
    hkjc_price_changed_at:m?.health?.hkjcPriceChangedAt ?? m?.live?.oddsUpdatedAt ?? null,
    hkjc_fetched_at:m?.health?.hkjcFetchedAt ?? m?.live?.fetchedAt ?? null,
    evidence_channel_count:0,
    unified_coverage_status:m?.health?.unifiedCoverageStatus ?? "HKJC_ONLY",
    diagnostic_codes:["SUMMARY_AUTHORITY_FIRST"],
    decision:null,
    decision_engine_version:"summary_authority_first_v1",
    live_now:Boolean(m?.liveNow),
  };
}

function evidenceRow(rows:any[],source:string,market:string){
  return (Array.isArray(rows)?rows:[]).find((x:any)=>
    String(x?.source_key||"").toUpperCase()===source &&
    String(x?.market_key||"").toUpperCase()===market
  ) || null;
}

function englishPublicText(input: string) {
  let out = String(input);
  const replacements: Array<[string,string]> = [
    ["只有 1 個獨立模型 family，方向只列觀望", "Only 1 independent model family; direction remains WATCH"],
    ["EV 雖高但機率差不足 3pp，高賠率放大效應：只列觀望", "EV is positive but the probability gap is below 3pp; long-odds amplification keeps this at WATCH"],
    ["高賠率尾部風險：Phase 5 calibration 未完成，Strong Value 上限降為 Value", "Long-odds tail risk: Phase 5 calibration is incomplete, so Strong Value is capped at Value"],
    ["即場走勢與預期矛盾，降為觀望", "Live movement contradicts the expectation; downgrade to WATCH"],
    ["賽事已開賽/完結，賽前價格只可作歷史參考", "The match has started or finished; pre-match prices are historical reference only"],
    ["Phase 5 calibration 未完成：只限制自動注碼，不取消人工 recommendation", "Phase 5 calibration is incomplete; automated stake sizing is disabled, but the analytical recommendation remains visible"],
    ["Phase 5 calibration 未完成只限制自動 stake sizing；方向同 Edge 照常顯示", "Phase 5 calibration is incomplete; automated stake sizing is disabled while direction and edge remain visible"],
    ["已按剩餘時間重估 H/D/A", "H/D/A re-estimated for the remaining time"],
    ["以目前可用模型估值", "using currently available model estimates"],
    ["EV 為正，但機率差", "EV is positive, but the probability gap"],
    ["模型支持、分歧或信心其中一項未達 Value 門檻，等價位／場面再改善", "one of model support, dispersion, or confidence is below the Value threshold; wait for a better price or stronger live evidence"],
    ["現價 EV", "current price EV"],
    ["模型 vs fair 機率差", "model vs fair probability gap"],
    ["模型 family 支持", "model family support"],
    ["模型分歧", "model dispersion"],
    ["主勝", "Home win"], ["客勝", "Away win"], ["和局", "Draw"],
    ["暫無投注位", "No actionable position"], ["亞洲讓球", "Asian handicap"],
    ["暫不建議", "No recommendation"], ["入球大細", "Goals O/U"], ["角球大細", "Corners O/U"],
    ["暫不下注", "NO BET"], ["暫時跳過", "PASS"], ["觀望", "WATCH"], ["輕微傾向", "Lean"],
    ["強 Value 候選", "Strong Value candidate"], ["Value 候選", "Value candidate"],
    ["未有可用模型機率", "No usable model probability"],
    ["未有足夠模型證據形成方向", "Insufficient model evidence for a direction"],
    ["未有足夠 odds history", "Insufficient odds history"],
    ["目前沒有足夠模型 evidence", "Insufficient model evidence"],
    ["市場或模型資料未足以建立可比較機率", "Market or model data is insufficient to establish comparable probabilities"],
    ["資料可信度未達計算門檻", "Data reliability is below the calculation threshold"],
    ["市場價格 freshness 未通過", "Market price freshness failed"],
    ["HKJC 市場不新鮮", "HKJC market is stale"],
    ["缺可靠比分／分鐘", "Reliable score/minute is missing"],
    ["Official XI 尚未確認", "Official XI is not confirmed"],
    ["獨立 evidence family 少於 2", "Fewer than 2 independent evidence families"],
    ["模型分歧較大", "Model dispersion is high"],
    ["模型共識較集中", "Model consensus is concentrated"],
    ["模型有一定支持", "Models provide some support"],
    ["模型支持有限", "Model support is limited"],
    ["暫未見可執行 Edge", "no actionable edge yet"],
    ["目前未見額外 data-risk flag", "No additional data-risk flag"],
    ["主要風險/失效條件", "Primary risks/invalidators"],
    ["主要支持", "Primary support"], ["風險", "Risk"],
    ["模型", "model"], ["現價", "current price"], ["機率差", "probability gap"],
    ["支持", "support"], ["分歧", "dispersion"], ["場面控制", "actual control"],
    ["賽事", "match"], ["資料", "data"], ["方向", "direction"], ["價格", "price"],
    ["即場", "live"], ["比分", "score"], ["分鐘", "minute"], ["正選", "starting XI"],
    ["主隊", "Home team"], ["客隊", "Away team"]
  ];
  for (const [from,to] of replacements) out = out.split(from).join(to);
  out = out.replace(/[；]/g, "; ").replace(/[，]/g, ", ").replace(/[。]/g, ". ").replace(/[：]/g, ": ");
  out = out.replace(/[（]/g, "(").replace(/[）]/g, ")");
  out = out.replace(/[\u3400-\u9fff]+/g, " ");
  out = out
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])\s*([,.;:!?])/g, "$1 ")
    .replace(/\s*[、，]\s*/g, ", ")
    .replace(/\s*[／]\s*/g, " / ")
    .replace(/\s+/g, " ")
    .replace(/(^|\s)[,;/]+(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out;
}
function englishPublicPayload(value: any): any {
  if (typeof value === "string") return englishPublicText(value);
  if (Array.isArray(value)) return value.map(englishPublicPayload);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, englishPublicPayload(v)]));
  }
  return value;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return Response.json({ error: "method_not_allowed" }, { status: 405, headers: cors });

  const u = new URL(req.url);
  const id = String(u.searchParams.get("id") || "").trim();
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(id)) {
    return Response.json({ error: "invalid_match_id" }, { status: 400, headers: { ...cors, "Cache-Control": "no-store" } });
  }

  const sbUrl = Deno.env.get("SUPABASE_URL") || "";
  const key = serverKey();
  if (!sbUrl || !key) return Response.json({ error: "server_config_missing" }, { status: 500, headers: cors });
  const db = createReadClient(sbUrl, key);
  const coreDb = createReadClientWithTimeout(sbUrl,key,8_000);
  const optionalDb = createReadClientWithTimeout(sbUrl,key,4_000);

  let authorityRpcError:any = null;
  let r:any = null;
  let fallbackMode = false;

  try {
    const summaryMatch=await readSummaryAuthority(sbUrl,id);
    if(summaryMatch) r=summaryMatchToAnalysisRow(summaryMatch,id);
  } catch (summaryAuthorityError) {
    console.error("analysis_summary_authority_failed",summaryAuthorityError);
  }

  if (!r) {
    const baseResult = await db.rpc("ft_internal_app_phase1_feed", { window_hours: 48 });
    authorityRpcError = oneError(baseResult.error);
    const rows = Array.isArray(baseResult.data) ? baseResult.data : [];
    r = rows.find((x: any) => String(x.hkjc_event_id) === id) || null;
    fallbackMode = Boolean(authorityRpcError);
  }

  if (!r) {
    const [matchRes, oddsRes, forebetRes, modelRes, formRes] = await Promise.all([
      db.from("matches").select("*").eq("hkjc_event_id", id).maybeSingle(),
      db.from("hkjc_odds_current").select("*").eq("hkjc_event_id", id).maybeSingle(),
      db.from("forebet_predictions").select("*").eq("hkjc_event_id", id).maybeSingle(),
      db.from("model_predictions").select("*").eq("hkjc_event_id", id).maybeSingle(),
      db.from("form_predictions").select("*").eq("hkjc_event_id", id).maybeSingle(),
    ]);

    const m:any = matchRes.data || null;
    const o:any = oddsRes.data || null;
    const fb:any = forebetRes.data || null;
    const im:any = modelRes.data || null;
    const fr:any = formRes.data || null;

    if (m || o || fb || im || fr) {
      r = {
        hkjc_event_id:id,
        home_zh:m?.home_zh ?? fb?.raw?.hkjc_home_zh ?? null,
        away_zh:m?.away_zh ?? fb?.raw?.hkjc_away_zh ?? null,
        home_en:m?.home_en ?? im?.home ?? fb?.raw?.hkjc_home_team ?? fb?.forebet_home_team ?? null,
        away_en:m?.away_en ?? im?.away ?? fb?.raw?.hkjc_away_team ?? fb?.forebet_away_team ?? null,
        tournament:m?.tournament ?? fb?.raw?.hkjc_league ?? null,
        kickoff_hkt:m?.kickoff_hkt ?? fb?.raw?.hkjc_kickoff_hkt ?? null,

        hkjc_home_odds:o?.had_home ?? fb?.raw?.hkjc_had_home ?? null,
        hkjc_draw_odds:o?.had_draw ?? fb?.raw?.hkjc_had_draw ?? null,
        hkjc_away_odds:o?.had_away ?? fb?.raw?.hkjc_had_away ?? null,
        hkjc_novig_home:null,
        hkjc_novig_draw:null,
        hkjc_novig_away:null,
        hkjc_goals_line:o?.hil_line ?? null,
        hkjc_goals_over:o?.hil_over ?? null,
        hkjc_goals_under:o?.hil_under ?? null,
        hkjc_corners_line:o?.chl_line ?? null,
        hkjc_corners_over:o?.chl_over ?? null,
        hkjc_corners_under:o?.chl_under ?? null,

        forebet_home:fb?.prob_home ?? null,
        forebet_draw:fb?.prob_draw ?? null,
        forebet_away:fb?.prob_away ?? null,
        forebet_ou_over:fb?.prob_over25 ?? null,
        forebet_ou_under:fb?.prob_under25 ?? null,
        forebet_avg_goals:fb?.avg_goals ?? null,
        forebet_corners_over:fb?.corner_prob_over95 ?? null,
        forebet_corners_under:fb?.corner_prob_under95 ?? null,
        forebet_avg_corners:fb?.avg_corners ?? null,

        dc_home:im?.dc_prob_home ?? null,
        dc_draw:im?.dc_prob_draw ?? null,
        dc_away:im?.dc_prob_away ?? null,
        pi_home:im?.pi_prob_home ?? null,
        pi_draw:im?.pi_prob_draw ?? null,
        pi_away:im?.pi_prob_away ?? null,

        form_home:fr?.form_prob_home ?? null,
        form_draw:fr?.form_prob_draw ?? null,
        form_away:fr?.form_prob_away ?? null,

        multisource_home:null,
        multisource_draw:null,
        multisource_away:null,
        multisource_count:0,
        multisource_member_count:0,
        multisource_ou_over:null,
        multisource_ou_under:null,

        status:m?.status ?? null,
        health_status:"FALLBACK",
        hkjc_freshness:"DB_FALLBACK",
        hkjc_price_changed_at:o?.odds_updated_at ?? null,
        decision:"CALIBRATION_PENDING_FALLBACK",
        decision_engine_version:"db_fallback_fail_closed_v2",
        evidence_channel_count:[
          fb?.prob_home,
          im?.dc_prob_home,
          im?.pi_prob_home,
          fr?.form_prob_home,
        ].filter((x)=>x!==null&&x!==undefined&&x!=="").length,
        unified_coverage_status:"DB_FALLBACK",
        diagnostic_codes:[
          "MATCH_NOT_IN_ACTIVE_FEED",
          "DB_FALLBACK_FAIL_CLOSED",
          ...(authorityRpcError ? ["AUTHORITY_RPC_DEGRADED"] : []),
        ],
        live_now:false,
        hkjc_fetched_at:o?.fetched_at ?? m?.fetched_at ?? fb?.fetched_at ?? null,
      };
      fallbackMode = true;
    }

    if (!r) {
      const fallbackErrors = [matchRes.error, oddsRes.error, forebetRes.error, modelRes.error, formRes.error].filter(Boolean);
      if (authorityRpcError || fallbackErrors.length) {
        return Response.json({
          error:"analysis_read_unavailable",
          id,
          authorityRpcError,
          fallbackReadErrors:fallbackErrors.map(oneError),
          semantics:"read_failure_not_fixture_absence",
        }, {
          status:503,
          headers:{...cors,"Cache-Control":"no-store"}
        });
      }
      return Response.json({ error:"match_not_in_active_48h_feed", id }, {
        status:404,
        headers:{...cors,"Cache-Control":"no-store"}
      });
    }
  }

  const oneWith = async (client:any, table: string, schema = "public") => {
    const q = (schema === "public" ? client : client.schema(schema)).from(table).select("*").eq("hkjc_event_id", id).maybeSingle();
    const x = await q;
    return { data: x.data ?? null, error: oneError(x.error) };
  };
  const manyWith = async (client:any, table: string, schema = "public") => {
    const q = (schema === "public" ? client : client.schema(schema)).from(table).select("*").eq("hkjc_event_id", id);
    const x = await q;
    return { data: x.data ?? [], error: oneError(x.error) };
  };

  // Critical probability evidence is deliberately read before the optional
  // human/live fan-out. This prevents connection pressure in optional layers
  // from starving the model rows already stored for the match.
  const predictionEvidence = await manyWith(coreDb,"prediction_evidence_current","private");
  const [modelTotals,formTotals] = await Promise.all([
    oneWith(coreDb,"model_predictions"),
    oneWith(coreDb,"form_predictions"),
  ]);

  const [
    human, eventMap, playerStatus, lineups, managers, movement,
    liveScore, liveStats, liveOdds, upcomingOdds, liveShadow, scenarios
  ] = await Promise.all([
    oneWith(optionalDb,"human_factors_current"),
    oneWith(optionalDb,"api_football_event_map"),
    manyWith(optionalDb,"phase2_player_status_evidence"),
    manyWith(optionalDb,"phase2_lineup_display_current"),
    manyWith(optionalDb,"phase2_manager_evidence"),
    oneWith(optionalDb,"odds_movement_current"),
    oneWith(optionalDb,"live_score_current"),
    oneWith(optionalDb,"live_stats_current"),
    oneWith(optionalDb,"hkjc_live_odds_current"),
    oneWith(optionalDb,"hkjc_upcoming_current"),
    oneWith(optionalDb,"live_expected_actual_current"),
    manyWith(optionalDb,"match_scenario_current"),
  ]);


  const playerEvidenceRaw=[...(playerStatus.data||[]),...eligibleLineupRows(lineups.data,id)];
  const playerKeys=[...new Set(playerEvidenceRaw.map((row:any)=>String(row?.player_key||"").trim()).filter(Boolean))];
  let canonicalPlayersByKey=new Map<string,{canonicalName:string,teamKey:string}>();
  let playerIdentityError:any=null;
  if(playerKeys.length){
    const canonicalPlayers=await db.from("phase2_players").select("player_key,canonical_name,team_key").in("player_key",playerKeys);
    if(canonicalPlayers.error) playerIdentityError=oneError(canonicalPlayers.error);
    else canonicalPlayersByKey=new Map((canonicalPlayers.data||[]).map((row:any)=>[
      String(row.player_key),
      {canonicalName:String(row.canonical_name||row.player_key),teamKey:String(row.team_key||"")}
    ]));
  }
  const playerStatusRowsAnnotated=(playerStatus.data||[]).map((row:any)=>annotatePlayerEvidence(row,canonicalPlayersByKey,"phase2_player_status_evidence",id));
  const lineupRowsAnnotated=eligibleLineupRows(lineups.data,id).map((row:any)=>annotatePlayerEvidence(row,canonicalPlayersByKey,"phase2_match_lineup_evidence",id));

  const evidenceRows=predictionEvidence.data||[];
  const forebetEvidenceHda=evidenceRow(evidenceRows,"FOREBET","1X2");
  const forebetEvidenceOu=evidenceRow(evidenceRows,"FOREBET","OU25");
  const forebetEvidenceCorners=evidenceRow(evidenceRows,"FOREBET","CORNERS95");
  const formEvidenceHda=evidenceRow(evidenceRows,"FORM","1X2");
  if(r.forebet_home==null && forebetEvidenceHda?.prob_home!=null){
    r.forebet_home=forebetEvidenceHda.prob_home;
    r.forebet_draw=forebetEvidenceHda.prob_draw;
    r.forebet_away=forebetEvidenceHda.prob_away;
  }
  if(r.forebet_ou_over==null && forebetEvidenceOu?.prob_over!=null){
    r.forebet_ou_over=forebetEvidenceOu.prob_over;
    r.forebet_ou_under=forebetEvidenceOu.prob_under;
    r.forebet_avg_goals=forebetEvidenceOu.avg_goals;
  }
  if(r.forebet_corners_over==null && forebetEvidenceCorners?.prob_over!=null){
    r.forebet_corners_over=forebetEvidenceCorners.prob_over;
    r.forebet_corners_under=forebetEvidenceCorners.prob_under;
    r.forebet_avg_corners=forebetEvidenceCorners.avg_corners;
  }
  if(r.dc_home==null && modelTotals.data?.quality==="MODELED"){
    r.dc_home=modelTotals.data?.dc_prob_home ?? null;
    r.dc_draw=modelTotals.data?.dc_prob_draw ?? null;
    r.dc_away=modelTotals.data?.dc_prob_away ?? null;
    r.pi_home=modelTotals.data?.pi_prob_home ?? null;
    r.pi_draw=modelTotals.data?.pi_prob_draw ?? null;
    r.pi_away=modelTotals.data?.pi_prob_away ?? null;
  }
  if(r.form_home==null){
    r.form_home=formTotals.data?.form_prob_home ?? formEvidenceHda?.prob_home ?? null;
    r.form_draw=formTotals.data?.form_prob_draw ?? formEvidenceHda?.prob_draw ?? null;
    r.form_away=formTotals.data?.form_prob_away ?? formEvidenceHda?.prob_away ?? null;
  }
  r.evidence_channel_count=[
    r.forebet_home,r.dc_home,r.pi_home,r.form_home,r.multisource_home
  ].filter((x:any)=>x!==null&&x!==undefined&&x!=="").length;

  const forebet = triplet(r.forebet_home, r.forebet_draw, r.forebet_away);
  const dc = triplet(r.dc_home, r.dc_draw, r.dc_away);
  const pi = triplet(r.pi_home, r.pi_draw, r.pi_away);
  const form = triplet(r.form_home, r.form_draw, r.form_away);
  const multi = triplet(r.multisource_home, r.multisource_draw, r.multisource_away);
  const internal = avgTriplets([dc, pi].filter(Boolean) as T[]);

  const families: Family[] = [];
  if (forebet) families.push({ key: "FOREBET", label: "Forebet", probs: forebet, weight: 1, provenanceGroup: "FOREBET" });
  if (internal) {
    const provenance = knownProvenanceGroup(modelTotals.data?.model_source ?? r.internal_model_source);
    families.push({
      key: "INTERNAL",
      label: "Dixon-Coles + Pi family",
      probs: internal,
      weight: 1,
      provenanceGroup: provenance ?? "INTERNAL_UNKNOWN",
      independentEligible: Boolean(provenance),
    });
  }
  if (form) {
    const provenance = knownProvenanceGroup(formTotals.data?.model_source);
    families.push({
      key: "FORM",
      label: "Team Form",
      probs: form,
      weight: 0.9,
      provenanceGroup: provenance ?? "FORM_UNKNOWN",
      independentEligible: Boolean(provenance),
    });
  }
  const multiCount = Number(r.multisource_count ?? r.multisource_member_count ?? 0);
  if (multi) families.push({
    key: "MULTI",
    label: "External consensus",
    probs: multi,
    weight: multiCount >= 2 ? 0.75 : 0.35,
    sources: multiCount,
    // Member provenance is not sufficiently explicit to prove disjointness
    // from Forebet/other external predictions, so it is kept as its own
    // uncertainty bucket rather than being treated as method-level evidence.
    provenanceGroup: "MULTISOURCE_AGGREGATE",
    independentEligible: false,
  });
  const independentFamilies = collapseCorrelatedFamilies(families);

  const home = r.home_en || r.home_zh || "Home team";
  const away = r.away_en || r.away_zh || "Away team";
  const shadow = liveShadow.data;
  const liveOddsRow:any = liveOdds.data || null;

  // Treat the canonical feed's live_now as the primary authority. Some HKJC
  // rows carry in_play=true before kickoff, and stale live rows can survive
  // after a match, so row presence alone must never flip a match into live mode.
  const liveStatusToken = matchStatusToken(
    r.live_status,
    liveScore.data?.match_status,
    liveScore.data?.status,
    liveStats.data?.match_status,
    r.status,
  );
  const kickoffMs = r.kickoff_hkt ? new Date(String(r.kickoff_hkt)).getTime() : NaN;
  const nowMs = Date.now();
  const kickoffStarted = Number.isFinite(kickoffMs) && kickoffMs <= nowMs + 2 * 60 * 1000;
  const withinLiveWindow = Number.isFinite(kickoffMs) && kickoffMs >= nowMs - 4 * 60 * 60 * 1000;
  const candidateLiveOddsAgeSeconds = secondsOld(
    liveOddsRow?.fetched_at ??
    liveOddsRow?.odds_updated_at ??
    r.live_fetched_at ??
    r.live_odds_updated_at
  );
  const liveScoreAgeSeconds = secondsOld(
    liveScore.data?.captured_at_hkt ??
    liveScore.data?.captured_at ??
    liveScore.data?.source_updated_at ??
    liveScore.data?.updated_at ??
    r.live_score_captured_at ??
    r.live_score_source_updated_at
  );
  const recentLiveEvidence = [candidateLiveOddsAgeSeconds, liveScoreAgeSeconds]
    .some((age) => age !== null && age <= 10 * 60);
  let live = Boolean(r.live_now) ||
    (statusIsLive(liveStatusToken) && kickoffStarted && withinLiveWindow && recentLiveEvidence) ||
    (kickoffStarted && withinLiveWindow && recentLiveEvidence);
  if (statusIsTerminal(liveStatusToken)) {
    live = false;
  } else if (statusIsPrematch(liveStatusToken) && Number.isFinite(kickoffMs) && kickoffMs > nowMs - 2 * 60 * 1000) {
    live = false;
  }

  const explicitLiveMinute =
    n(liveScore.data?.minute) ??
    n(liveStats.data?.match_minute) ??
    n(shadow?.match_minute) ??
    n(r.live_minute);
  const resolvedLiveMinute = live
    ? (explicitLiveMinute ?? inferredLiveMinute(null, r.kickoff_hkt))
    : null;
  const scorePair = live
    ? liveScorePair(
        liveScore.data?.live_score ?? liveStats.data?.live_score ?? shadow?.live_score ?? r.live_score,
        liveScore.data?.home_score ?? r.live_home_score,
        liveScore.data?.away_score ?? r.live_away_score,
      )
    : null;

  const liveMarketInput = {
    hkjc_home_odds: liveOddsRow?.had_home ?? r.live_had_home,
    hkjc_draw_odds: liveOddsRow?.had_draw ?? r.live_had_draw,
    hkjc_away_odds: liveOddsRow?.had_away ?? r.live_had_away,
  };
  const liveMarket = live ? fairMarket(liveMarketInput) : null;
  const liveOddsAgeSeconds = live ? candidateLiveOddsAgeSeconds : null;
  const liveFresh = live && liveMarket
    ? liveOddsAgeSeconds !== null && liveOddsAgeSeconds <= 240
    : false;

  const dcMean = (n(modelTotals.data?.dc_xg_home) ?? 0) + (n(modelTotals.data?.dc_xg_away) ?? 0);
  const prematchTotalMean = n(r.forebet_avg_goals) ?? (dcMean > 0 ? dcMean : 2.7);
  const prematchConsensus = weighted(independentFamilies);
  const canStateAdjust = Boolean(live && prematchConsensus && scorePair && resolvedLiveMinute !== null);
  const decisionFamilies: Family[] = canStateAdjust
    ? independentFamilies.map((f) => ({
        ...f,
        probs: liveStateAdjustedTriplet(
          f.probs,
          scorePair!.home,
          scorePair!.away,
          resolvedLiveMinute!,
          prematchTotalMean,
          shadow,
        ),
      }))
    : independentFamilies;

  const consensus = weighted(decisionFamilies);
  const market = live ? liveMarket : fairMarket(r);
  const hdaOdds = {
    H: live ? n(liveMarketInput.hkjc_home_odds) : n(r.hkjc_home_odds),
    D: live ? n(liveMarketInput.hkjc_draw_odds) : n(r.hkjc_draw_odds),
    A: live ? n(liveMarketInput.hkjc_away_odds) : n(r.hkjc_away_odds),
  };
  const best = maxHdaValue(consensus, market, hdaOdds);
  const bestSide = best.expectedValue !== null && best.expectedValue > 0 ? best.side : null;
  const bestProb = bestSide ? best.modelProbability : null;
  const marketProb = bestSide ? best.marketProbability : null;
  const bestOdds = bestSide ? best.odds : null;

  // Value support means the model family prices the candidate above the current no-vig market.
  const support = bestSide && market
    ? decisionFamilies.filter(x => (val(x.probs, bestSide) ?? -1) > (val(market, bestSide) ?? 2)).length
    : 0;
  const agreement = decisionFamilies.length ? support / decisionFamilies.length : 0;
  const selectedFamilyValues = bestSide
    ? decisionFamilies.map(x => val(x.probs, bestSide)).filter((x): x is number => x !== null)
    : [];
  const dispersion = selectedFamilyValues.length >= 2
    ? Math.max(...selectedFamilyValues) - Math.min(...selectedFamilyValues)
    : null;
  const familySupport = bestSide && market
    ? decisionFamilies.map((f) => {
        const probability = val(f.probs, bestSide);
        const fair = val(market, bestSide);
        return {
          key: f.key,
          label: f.label,
          probability,
          edgePp: probability === null || fair === null ? null : (probability - fair) * 100,
          supports: probability !== null && fair !== null ? probability > fair : false,
        };
      })
    : [];
  const supportingFamilies = familySupport.filter((x) => x.supports).sort((a,b) => (b.edgePp ?? -999) - (a.edgePp ?? -999));
  const opposingFamilies = familySupport.filter((x) => !x.supports).sort((a,b) => (a.edgePp ?? 999) - (b.edgePp ?? 999));

  const phase1HealthOk = String(r.health_status || "").toUpperCase() === "OK";
  const healthOk = live ? Boolean(market && decisionFamilies.length) : phase1HealthOk;
  const prematchPriceAgeSeconds = secondsOld(
    r.hkjc_price_changed_at ??
    r.hkjc_odds_updated_at ??
    r.hkjc_fetched_at
  );
  const prematchFresh = Boolean(
    !kickoffStarted &&
    !statusIsTerminal(liveStatusToken) &&
    String(r.hkjc_freshness || "").toUpperCase() === "FRESH" &&
    prematchPriceAgeSeconds !== null &&
    prematchPriceAgeSeconds <= 6 * 60 * 60
  );
  const fresh = live ? liveFresh : prematchFresh;
  const pipelineGate = String(r.decision || "").toUpperCase();
  const calibrationPending = pipelineGate.includes("CALIBRATION") || pipelineGate === "";

  // A hard NO_BET is now reserved for cases where the live calculation itself is not trustworthy.
  // Calibration and partial Phase 1 coverage may limit staking confidence, but must not erase a real edge.
  const hardLiveDataGap = Boolean(live && (!scorePair || resolvedLiveMinute === null));
  const liveContradiction = Boolean(
    live && shadow?.shadow_status &&
    ["CONTRADICTION","REJECT","RISK"].some((k) => String(shadow.shadow_status).toUpperCase().includes(k))
  );
  const edgePpNow = bestSide && best.edge !== null ? best.edge * 100 : null;
  const expectedValuePctNow = bestSide && best.expectedValue !== null ? best.expectedValue * 100 : null;
  const liveMetricCount = Number(shadow?.live_metric_count ?? 0);
  const confidenceParts = {
    edge: expectedValuePctNow === null ? 0 : clamp(expectedValuePctNow * 3.2, 0, 36),
    evidence: clamp(decisionFamilies.length * 6, 0, 18),
    agreement: clamp(agreement * 18, 0, 18),
    live: live ? clamp(liveMetricCount * 1.8, 0, 10) : 6,
    freshness: live
      ? (liveOddsAgeSeconds !== null && liveOddsAgeSeconds <= 90 ? 10
        : liveOddsAgeSeconds !== null && liveOddsAgeSeconds <= 180 ? 6
          : 0)
      : 8,
  };
  let confidenceScore = Math.round(
    confidenceParts.edge +
    confidenceParts.evidence +
    confidenceParts.agreement +
    confidenceParts.live +
    confidenceParts.freshness
  );
  if (dispersion !== null && dispersion > 0.18) confidenceScore -= 18;
  else if (dispersion !== null && dispersion > 0.12) confidenceScore -= 8;
  if (liveContradiction) confidenceScore -= 20;
  if (decisionFamilies.length < 2) confidenceScore = Math.min(confidenceScore, 48);
  if (!fresh || hardLiveDataGap || fallbackMode) confidenceScore = Math.min(confidenceScore, 25);
  confidenceScore = Math.round(clamp(confidenceScore, 0, 100));
  const confidenceLabel = confidenceScore >= 75 ? "高"
    : confidenceScore >= 58 ? "中高"
      : confidenceScore >= 45 ? "中"
        : "低";

  const recommendationReasons = [
    expectedValuePctNow !== null ? `現價 EV ${expectedValuePctNow >= 0 ? "+" : ""}${expectedValuePctNow.toFixed(1)}%` : "無可計現價 EV",
    edgePpNow !== null ? `模型 vs fair 機率差 ${edgePpNow >= 0 ? "+" : ""}${edgePpNow.toFixed(1)}pp` : null,
    `${support}/${decisionFamilies.length} 模型 family 支持`,
    decisionFamilies.length === 1 ? "只有 1 個獨立模型 family，方向只列觀望" : null,
    expectedValuePctNow !== null && expectedValuePctNow >= 4 && edgePpNow !== null && edgePpNow < 3
      ? "EV 雖高但機率差不足 3pp，高賠率放大效應：只列觀望"
      : null,
    calibrationPending && bestOdds !== null && bestOdds >= 8
      ? "高賠率尾部風險：Phase 5 calibration 未完成，Strong Value 上限降為 Value"
      : null,
    dispersion !== null ? `模型分歧 ${(dispersion * 100).toFixed(1)}pp` : null,
    live ? `${liveMetricCount} 項 live metrics` : null,
    liveContradiction ? "即場走勢與預期矛盾，降為觀望" : null,
    !fresh ? "市場價格 freshness 未通過" : null,
    !live && kickoffStarted ? "賽事已開賽/完結，賽前價格只可作歷史參考" : null,
    !live && prematchPriceAgeSeconds !== null ? `prematch price age ${Math.round(prematchPriceAgeSeconds)}s` : null,
    hardLiveDataGap ? "缺可靠比分／分鐘" : null,
    live && liveOddsAgeSeconds !== null ? `live price ${Math.round(liveOddsAgeSeconds)}s` : null,
  ].filter(Boolean);

  // Classify the recommendation from direct price-vs-model evidence. Confidence
  // is a corroborating gate, not a second copy of the Edge threshold.
  let candidate = "NO_EDGE";
  if (!market || !decisionFamilies.length || !fresh || hardLiveDataGap || fallbackMode) candidate = "DATA_RISK";
  else if ((best.expectedValue ?? -1) <= 0) candidate = "NO_EDGE";
  else if (decisionFamilies.length < 2) candidate = "WATCH";
  else if (liveContradiction || (dispersion !== null && dispersion > 0.18)) candidate = "WATCH";
  // Use a dual gate: actual-price EV must be positive AND the model-market
  // probability gap must be large enough. This prevents long odds from turning
  // a tiny probability disagreement into a misleading "Strong Value".
  else if ((best.expectedValue ?? -1) >= 0.08 && (best.edge ?? -1) >= 0.06 && agreement >= 0.66 && confidenceScore >= 65 && !(calibrationPending && (bestOdds ?? 0) >= 8)) candidate = "STRONG_VALUE_CANDIDATE";
  else if ((best.expectedValue ?? -1) >= 0.04 && (best.edge ?? -1) >= 0.03 && agreement >= 0.50 && confidenceScore >= 50) candidate = "VALUE_CANDIDATE";
  else if ((best.expectedValue ?? -1) >= 0.02 && (best.edge ?? -1) >= 0.015 && confidenceScore >= 40) candidate = "LEAN";
  else candidate = "WATCH";

  const productionValidated = !fallbackMode && !pipelineGate.includes("CALIBRATION") && pipelineGate !== "";
  // This is a recommendation/action label, not an auto-staking permission.
  const action = candidate === "DATA_RISK" ? "NO_BET"
    : candidate === "NO_EDGE" ? "PASS"
    : candidate;

  const hdcAuthority:any = live ? (liveOddsRow ?? null) : (upcomingOdds.data ?? null);
  const currentHdcLine = hdcAuthority?.hdc_line ?? null;
  const currentHdcHome = hdcAuthority?.hdc_home ?? null;
  const currentHdcAway = hdcAuthority?.hdc_away ?? null;
  const handicapAdvice = buildHandicapAdvice({
    lineValue: currentHdcLine,
    homeOdds: currentHdcHome,
    awayOdds: currentHdcAway,
    consensus,
    families: decisionFamilies,
    totalMean: prematchTotalMean,
    homeName: home,
    awayName: away,
    live,
    score: scorePair,
    minute: resolvedLiveMinute,
    shadow,
    fresh,
    fallbackMode,
  });

  const currentGoalsLine = live ? (liveOddsRow?.hil_line ?? r.live_hil_line) : r.hkjc_goals_line;
  const currentGoalsOver = live ? (liveOddsRow?.hil_over ?? r.live_hil_over) : r.hkjc_goals_over;
  const currentGoalsUnder = live ? (liveOddsRow?.hil_under ?? r.live_hil_under) : r.hkjc_goals_under;
  const currentCornersLine = live ? (liveOddsRow?.chl_line ?? r.live_chl_line) : r.hkjc_corners_line;
  const currentCornersOver = live ? (liveOddsRow?.chl_over ?? r.live_chl_over) : r.hkjc_corners_over;
  const currentCornersUnder = live ? (liveOddsRow?.chl_under ?? r.live_chl_under) : r.hkjc_corners_under;

  const goalsModels: BinaryModel[] = [];
  const goalsLine = n(currentGoalsLine);
  const currentGoalTotal = scorePair ? scorePair.home + scorePair.away : 0;
  const goalPaceRatio = live && resolvedLiveMinute !== null
    ? livePaceRatio(prematchTotalMean, resolvedLiveMinute, shadow)
    : 1;
  const forebetGoals = live && resolvedLiveMinute !== null
    ? liveResidualOver(r.forebet_avg_goals, currentGoalTotal, resolvedLiveMinute, currentGoalsLine, goalPaceRatio)
    : currentLineOver(currentGoalsLine, r.forebet_avg_goals, 2.5, r.forebet_ou_over);
  if (forebetGoals !== null && forebetGoals !== undefined) {
    goalsModels.push({
      key: "FOREBET",
      label: live ? "Forebet live residual" : "Forebet goals",
      over: typeof forebetGoals === "number" ? forebetGoals : forebetGoals.over,
      weight: 1,
      method: live ? "LIVE_RESIDUAL_POISSON" : forebetGoals.method,
      provenanceGroup: "FOREBET",
    });
  }
  const dcGoalsOver = dcMean > 0 && goalsLine !== null
    ? (live && resolvedLiveMinute !== null
        ? liveResidualOver(dcMean, currentGoalTotal, resolvedLiveMinute, currentGoalsLine, goalPaceRatio)
        : poissonOver(dcMean, goalsLine))
    : null;
  if (dcGoalsOver !== null) {
    goalsModels.push({
      key: "DIXON_COLES",
      label: live ? "Dixon-Coles live residual" : "Dixon-Coles xG",
      over: dcGoalsOver,
      weight: 0.9,
      method: live ? "LIVE_DC_RESIDUAL" : "DC_XG_POISSON",
      provenanceGroup: knownProvenanceGroup(modelTotals.data?.model_source) ?? "DIXON_COLES_UNKNOWN",
      independentEligible: Boolean(knownProvenanceGroup(modelTotals.data?.model_source)),
    });
  }
  const formRow:any = formTotals.data ?? null;
  const formQuality = String(formRow?.quality ?? "").toUpperCase();
  const formHomeGames = Number(formRow?.home_games ?? 0);
  const formAwayGames = Number(formRow?.away_games ?? 0);
  const formMean =
    formQuality === "FORM_MODELED" &&
    formHomeGames >= 8 &&
    formAwayGames >= 8
      ? (n(formRow?.form_xg_home) ?? 0) + (n(formRow?.form_xg_away) ?? 0)
      : 0;
  const formGoalsOver = formMean > 0 && goalsLine !== null
    ? (live && resolvedLiveMinute !== null
        ? liveResidualOver(formMean, currentGoalTotal, resolvedLiveMinute, currentGoalsLine, goalPaceRatio)
        : poissonOver(formMean, goalsLine))
    : null;
  if (formGoalsOver !== null) {
    goalsModels.push({
      key: "FORM",
      label: live ? "Team Form live residual" : "Team Form expected goals",
      over: formGoalsOver,
      weight: 0.9,
      method: live ? "LIVE_FORM_RESIDUAL" : "FORM_XG_POISSON",
      sources: 1,
      provenanceGroup: knownProvenanceGroup(formRow?.model_source) ?? "TEAM_FORM_UNKNOWN",
      independentEligible: Boolean(knownProvenanceGroup(formRow?.model_source)),
    });
  }
  const multiGoalsOver = p(r.multisource_ou_over);
  if (!live && goalsLine !== null && Math.abs(goalsLine - 2.5) < 0.001 && multiGoalsOver !== null) {
    goalsModels.push({
      key: "MULTI",
      label: "External O/U consensus",
      over: multiGoalsOver,
      weight: multiCount >= 2 ? 0.75 : 0.35,
      sources: Math.max(1, multiCount),
      method: "NATIVE_OU25",
      provenanceGroup: "MULTISOURCE_AGGREGATE",
      independentEligible: false,
    });
  }

  const cornerModels: BinaryModel[] = [];
  const currentCornerTotal =
    n(liveScore.data?.total_corners) ??
    n(liveStats.data?.total_corners) ??
    ((n(shadow?.corners_home) ?? 0) + (n(shadow?.corners_away) ?? 0));
  const avgCorners = n(r.forebet_avg_corners);
  let cornerPaceRatio = 1;
  if (live && resolvedLiveMinute !== null && avgCorners !== null && avgCorners > 0 && currentCornerTotal !== null && resolvedLiveMinute >= 10) {
    const expectedCornersElapsed = avgCorners * Math.max(0.08, resolvedLiveMinute / 95);
    cornerPaceRatio = clamp(currentCornerTotal / expectedCornersElapsed, 0.65, 1.55);
  }
  const forebetCorners = live && resolvedLiveMinute !== null && currentCornerTotal !== null
    ? liveResidualOver(r.forebet_avg_corners, currentCornerTotal, resolvedLiveMinute, currentCornersLine, cornerPaceRatio)
    : currentLineOver(currentCornersLine, r.forebet_avg_corners, 9.5, r.forebet_corners_over);
  if (forebetCorners !== null && forebetCorners !== undefined) {
    cornerModels.push({
      key: "FOREBET",
      label: live ? "Forebet corners live residual" : "Forebet corners",
      over: typeof forebetCorners === "number" ? forebetCorners : forebetCorners.over,
      weight: 1,
      method: live ? "LIVE_CORNERS_RESIDUAL" : forebetCorners.method,
    });
  }

  const goalsAdvice = buildBinaryAdvice({
    marketKey: "GOALS_OU",
    label: "入球大細",
    lineValue: currentGoalsLine,
    overOdds: currentGoalsOver,
    underOdds: currentGoalsUnder,
    models: goalsModels,
    healthOk,
    fresh,
    fallbackMode,
    productionValidated,
  });
  const cornersAdvice = buildBinaryAdvice({
    marketKey: "CORNERS_OU",
    label: "角球大細",
    lineValue: currentCornersLine,
    overOdds: currentCornersOver,
    underOdds: currentCornersUnder,
    models: cornerModels,
    healthOk,
    fresh,
    fallbackMode,
    productionValidated,
  });

  const selection = sideLabel(bestSide, home, away);
  const edgeText = edgePpNow === null ? "—" : ((edgePpNow >= 0 ? "+" : "") + edgePpNow.toFixed(1) + "pp");
  const evText = expectedValuePctNow === null ? "—" : ((expectedValuePctNow >= 0 ? "+" : "") + expectedValuePctNow.toFixed(1) + "%");
  const oddsText = bestOdds === null ? "—" : bestOdds.toFixed(2);
  const priceRead = fallbackMode
    ? (bestOdds === null ? "HKJC current price 未確認" : `參考舊價 ${oddsText}（不可當 current price）`)
    : live
      ? `HKJC live 現價 ${oddsText}`
      : `現價 ${oddsText}`;

  const sourceLineupConfirmed = lineupRowsAnnotated.some((row:any)=>row.confirmed===true);
  const confirmedStatusClaims = uniqueConfirmedClaims(playerStatusRowsAnnotated);
  const unresolvedStatusRows = playerStatusRowsAnnotated.filter((row:any)=>row.fact_status!=="CONFIRMED");
  const confirmedLineupRows = lineupRowsAnnotated.filter((row:any)=>row.fact_status==="CONFIRMED");
  const unresolvedLineupRows = lineupRowsAnnotated.filter((row:any)=>row.fact_status!=="CONFIRMED");
  const lineupConfirmed = confirmedStartingXI(lineupRowsAnnotated);
  // Count only canonically resolved, source-confirmed player claims. Multiple
  // providers describing the same underlying player/status record collapse by
  // record_group rather than becoming false independent corroboration.
  const injuryHome = confirmedStatusClaims.length
    ? confirmedStatusClaims.filter((x:any)=>normalizedSide(x.team_side)==="H").length
    : null;
  const injuryAway = confirmedStatusClaims.length
    ? confirmedStatusClaims.filter((x:any)=>normalizedSide(x.team_side)==="A").length
    : null;
  const humanQuality = human.data?.quality ?? (eventMap.data ? "MAPPED" : "NO_DATA");

  const liveState = live ? {
    minute: resolvedLiveMinute,
    score: scorePair ? `${scorePair.home}-${scorePair.away}` : (liveScore.data?.live_score ?? liveStats.data?.live_score ?? null),
    shadowStatus: shadow?.shadow_status ?? null,
    expectedSide: shadow?.expected_control_side ?? null,
    actualSide: shadow?.actual_control_side ?? null,
    controlScore: n(shadow?.actual_control_score),
    metricCount: Number(shadow?.live_metric_count ?? 0),
    detailStatus: liveStats.data?.detail_status ?? null,
    marketAgeSeconds: liveOddsAgeSeconds,
    stateAdjusted: canStateAdjust,
    prematchTotalMean,
  } : null;

  const movementData = movement.data;
  const movementText = movementData
    ? `${movementData.signal || "COLLECTING"} · ${movementData.movement_side || "—"} · 24H ${movementData.move_24h_pp == null ? "—" : Number(movementData.move_24h_pp).toFixed(1) + "pp"} · ${movementData.model_alignment || "—"}`
    : "未有足夠 odds history";

  const modelSentence = families.length
    ? bestSide
      ? `支持 ${selection} 嘅模型：${supportingFamilies.length ? supportingFamilies.map(x => `${x.label} ${x.edgePp === null ? "" : (x.edgePp >= 0 ? "+" : "") + x.edgePp.toFixed(1) + "pp"}`).join("、") : "暫無"}；未支持：${opposingFamilies.length ? opposingFamilies.map(x => `${x.label} ${x.edgePp === null ? "" : x.edgePp.toFixed(1) + "pp"}`).join("、") : "無"}。`
      : families.map(f => `${f.label}: ${sideLabel(pick(f.probs), home, away)}`).join("；")
    : "目前沒有足夠模型 evidence";
  const marketSentence = market && consensus
    ? `${live ? "HKJC live" : "HKJC"} no-vig H/D/A 為 ${pct(market.home)}/${pct(market.draw)}/${pct(market.away)}；${live && canStateAdjust ? "比分＋分鐘重估後" : "跨 evidence-family"}模型中心為 ${pct(consensus.home)}/${pct(consensus.draw)}/${pct(consensus.away)}。`
    : "市場或模型資料未足以建立可比較機率。";
  const humanSentence = `Phase 2: ${humanQuality}; canonically resolved player-status claims home/away ${injuryHome ?? "unknown"}/${injuryAway ?? "unknown"}; unresolved player-status rows ${unresolvedStatusRows.length}; lineup ${lineupConfirmed ? "confirmed with resolved identities" : sourceLineupConfirmed ? "source-confirmed but identity reconciliation incomplete" : "not confirmed"}.`;
  const liveSentence = liveState
    ? `Phase 3：${liveState.minute ?? "—"}' ${liveState.score || "—"}；Expected-vs-Actual ${liveState.shadowStatus || "WAIT"}，預期控制 ${liveState.expectedSide || "—"}、實際控制 ${liveState.actualSide || "—"}，${liveState.metricCount} 個 live metrics。`
    : "Phase 3：賽事未進入可用 live evidence 狀態。";

  const invalidators: string[] = [];
  if (fallbackMode) invalidators.push("賽事暫不在 canonical active feed；只用 database fallback，投注 action 強制 NO_BET");
  if (!fresh) invalidators.push(live ? "HKJC live 市場價格超過 4 分鐘 freshness 門檻" : "HKJC 市場不新鮮");
  if (!phase1HealthOk && !live) invalidators.push("Phase 1 data health 非 OK");
  if (!phase1HealthOk && live) invalidators.push("Phase 1 coverage 非完整，但即場 market + 可用模型仍可計算方向");
  if (families.length < 2) invalidators.push("獨立 evidence family 少於 2");
  if (!lineupConfirmed && !live) invalidators.push(sourceLineupConfirmed ? "Official XI source 已確認，但球員 identity reconciliation 未完整" : "Official XI 尚未確認");
  if (dispersion !== null && dispersion > 0.18) invalidators.push("模型分歧較大");
  if (!productionValidated) invalidators.push("Phase 5 calibration 未完成：只限制自動注碼，不取消人工 recommendation");
  if (liveState?.shadowStatus && ["CONTRADICTION","REJECT","RISK"].some(k => String(liveState.shadowStatus).toUpperCase().includes(k))) {
    invalidators.push("Live actual 與 pre-match expectation 出現明顯矛盾");
  }

  const headline = bestSide && best.edge !== null
    ? `${selection} · EV ${evText} · 機率差 ${edgeText}`
    : `${home} vs ${away} · 暫未見可執行 Edge`;

  const modelConsensusLabel = families.length >= 3 && agreement >= 0.66 && (dispersion === null || dispersion <= 0.12)
    ? "模型共識較集中"
    : families.length >= 2 && agreement >= 0.5
      ? "模型有一定支持"
      : "模型支持有限";
  const strongestSupport = supportingFamilies[0] || null;
  const strongestOpposition = opposingFamilies[0] || null;
  const professionalSummary = bestSide && best.edge !== null
    ? `${priceRead}；模型估計 ${selection} 勝率 ${pct(bestProb)}，按現價計 EV ${evText}。HKJC no-vig fair 約 ${pct(marketProb)}，機率差 ${edgeText}；${modelConsensusLabel}，${supportingFamilies.length}/${families.length} 個 evidence family 定價高過市場。`
    : `目前市場與可用模型未形成清晰正 Edge；先以資料完整度同價格變化為主。`;
  const supportRead = bestSide
    ? `主要支持：${strongestSupport ? strongestSupport.label + " " + (strongestSupport.edgePp! >= 0 ? "+" : "") + strongestSupport.edgePp!.toFixed(1) + "pp" : "暫無明顯支持"}。`
    : "暫未形成可比較支持。";
  const counterRead = bestSide
    ? `反方／風險：${strongestOpposition ? strongestOpposition.label + " " + strongestOpposition.edgePp!.toFixed(1) + "pp" : "暫無模型明顯反對"}；${invalidators.length ? invalidators.join("；") : "未見額外 data-risk flag"}。`
    : `風險：${invalidators.length ? invalidators.join("；") : "資料不足以建立 Edge"}。`;

  let advice = "PASS：現時未見足夠正 Edge。";
  if (candidate === "DATA_RISK") {
    const why = !market
      ? "HKJC 即場市場未齊，無法計 fair probability"
      : !decisionFamilies.length
        ? "未有可用模型機率"
        : !fresh
          ? "HKJC live 價格超過 4 分鐘，避免用舊價製造假 Edge"
          : live && (!scorePair || resolvedLiveMinute === null)
            ? "缺可靠比分／分鐘，未能按剩餘時間重估"
            : "資料可信度未達計算門檻";
    advice = `暫不下注：${why}。呢個係資料 gate，唔代表場波本身冇投注價值。`;
  } else if (live && bestSide && best.edge !== null) {
    const stateText = canStateAdjust
      ? `${liveState?.score || "—"} / ${liveState?.minute ?? "—"}' 已按剩餘時間重估 H/D/A`
      : "以目前可用模型估值";
    const liveEvidenceText = (liveState?.metricCount || 0) > 0
      ? `${liveState?.metricCount} 項 live metrics，場面控制 ${liveState?.actualSide || "—"}`
      : "暫時主要靠比分、分鐘、即場賠率同賽前模型";
    if (candidate.includes("VALUE_CANDIDATE")) {
      advice = `可考慮下注 ${selection} @ ${oddsText}：現價 EV ${evText}；${stateText}；模型 ${pct(bestProb)} vs HKJC live fair ${pct(marketProb)}（機率差 ${edgeText}），${supportingFamilies.length}/${decisionFamilies.length} 個模型 family 支持；${liveEvidenceText}。`;
    } else if (candidate === "LEAN") {
      advice = `輕注／偏向 ${selection} @ ${oddsText}：現價 EV ${evText}；${stateText}；模型 ${pct(bestProb)} vs HKJC live fair ${pct(marketProb)}（機率差 ${edgeText}）。方向存在，但優勢未到 Value 級。`;
    } else if (candidate === "WATCH") {
      advice = `觀望 ${selection} @ ${oddsText}：現價 EV ${evText}；${stateText}；EV 為正，但機率差 ${edgeText}、模型支持、分歧或信心其中一項未達 Value 門檻，等價位／場面再改善。`;
    } else {
      advice = `暫時跳過：${stateText} 後，按 HKJC live 現價計算，最佳方向 EV 仍然 ≤ 0%，所以唔落注。`;
    }
  }
  else if (candidate === "WATCH") advice = bestSide ? `觀察 ${selection} @ ${oddsText}：現價 EV ${evText}，但獨立 evidence family 太少或模型分歧未收斂，暫未提升至 Value。` : advice;
  else if (candidate === "LEAN") advice = `輕微傾向 ${selection} @ ${oddsText}：現價 EV ${evText}（機率差 ${edgeText}），但未到 Value 級。`;
  else if (candidate.includes("VALUE_CANDIDATE")) advice = `Value 候選 ${selection} @ ${oddsText}：現價 EV ${evText}（機率差 ${edgeText}），${supportingFamilies.length}/${decisionFamilies.length} 個 evidence family 支持。`;
  if (!productionValidated && !["DATA_RISK","NO_EDGE"].includes(candidate)) {
    advice += " Phase 5 calibration 未完成只限制自動 stake sizing；方向同 Edge 照常顯示。";
  }

  const phaseCoverage = {
    phase1: { status: fallbackMode ? "DB_FALLBACK" : (families.length ? "ACTIVE" : "PARTIAL"), evidenceFamilies: families.length },
    phase2: { status: human.data || eventMap.data ? "ACTIVE" : "PARTIAL", quality: humanQuality, lineupConfirmed },
    phase3: { status: live ? "LIVE_ACTIVE" : (scenarios.data.length ? "PREMATCH_SCENARIO_ONLY" : "WAIT"), live: liveState },
    phase4: { status: movementData ? "ACTIVE" : "COLLECTING", movement: movementText },
    phase5: { status: productionValidated ? "VALIDATED" : "CALIBRATION_PENDING" },
    phase6: { status: "NOT_PRODUCTION", note: "scenario rows are Phase 3 context, not a validated simulation engine" },
    phase7: { status: "NOT_BUILT" },
    phase8: { status: "NOT_BUILT" },
    phase9: { status: "ACTIVE_V4", note: "grounded professional story interpreter + deep evidence contract" },
    phase10: { status: "NOT_BUILT" },
  };

  const errors: any = {};
  for (const [k,v] of Object.entries({ human,eventMap,playerStatus,lineups,managers,movement,liveScore,liveStats,liveOdds,upcomingOdds,liveShadow,scenarios,modelTotals,formTotals })) {
    if ((v as any).error) errors[k] = (v as any).error;
  }
  if (playerIdentityError) errors.playerIdentity = playerIdentityError;

  const publicPayload = englishPublicPayload({
    generatedAt: new Date().toISOString(),
    id,
    engine: "FT_INTERPRETER_RULES_V3_HOLISTIC",
    narrationMode: "DETERMINISTIC_GROUNDED",
    match: { home, away, homeEn: r.home_en, awayEn: r.away_en, tournament: r.tournament, kickoff: r.kickoff_hkt },
    decision: {
      productionDecision: r.decision ?? null,
      productionEngine: r.decision_engine_version ?? null,
      action,
      candidateClass: candidate,
      market: "1X2",
      selection: bestSide,
      selectionLabel: selection,
      currentOdds: (!fresh || fallbackMode) ? null : bestOdds,
      referenceOdds: (!fresh || fallbackMode) ? bestOdds : null,
      oddsStatus: (!fresh || fallbackMode) ? "REFERENCE_STALE" : "CURRENT",
      marketFairProbability: marketProb,
      analystConsensusProbability: bestProb,
      candidateEdgePp: edgePpNow,
      expectedValuePct: expectedValuePctNow,
      confidenceScore,
      confidenceLabel,
      recommendationReasons,
      evidenceFamilyCount: decisionFamilies.length,
      supportCount: support,
      valueSupportRatio: agreement,
      dispersion,
      liveAdjusted: Boolean(live && canStateAdjust),
      liveMinute: liveState?.minute ?? null,
      liveScore: liveState?.score ?? null,
      liveMarketAgeSeconds: liveOddsAgeSeconds,
      autoStakeAllowed: productionValidated,
      explanation: live ? advice : null,
    },
    story: {
      headline,
      summary: professionalSummary,
      marketRead: marketSentence,
      modelRead: modelSentence,
      humanRead: humanSentence,
      liveRead: liveSentence,
      movementRead: `Phase 4：${movementText}。`,
      supportRead,
      counterRead,
      riskRead: invalidators.length ? `主要風險/失效條件：${invalidators.join("；")}。` : "目前未見額外 data-risk flag。",
      advice,
      handicapAdvice: handicapAdvice.advice,
      goalsAdvice: goalsAdvice.advice,
      cornersAdvice: cornersAdvice.advice,
    },
    marketAdvice: {
      handicap: handicapAdvice,
      goals: goalsAdvice,
      corners: cornersAdvice,
    },
    evidence: {
      market,
      consensus,
      families: decisionFamilies.map(f => ({ key:f.key, label:f.label, weight:f.weight, sources:f.sources ?? null, provenanceGroup:f.provenanceGroup ?? f.key, memberKeys:f.memberKeys ?? [f.key], independentEligible:f.independentEligible !== false, probabilities:f.probs, pick:pick(f.probs) })),
      supplementalFamilies: families.filter(f => f.independentEligible === false).map(f => ({ key:f.key, label:f.label, provenanceGroup:f.provenanceGroup ?? f.key, reason:"member source-record lineage is not explicit enough to prove independence", probabilities:f.probs })),
      prematchConsensus,
      familySupport,
      phase1Health: {
        status: r.health_status,
        freshness: fresh ? "FRESH" : "STALE",
        upstreamFreshness: r.hkjc_freshness,
        priceObservedAt: live
          ? (liveOddsRow?.odds_updated_at ?? liveOddsRow?.fetched_at ?? r.live_odds_updated_at ?? r.live_fetched_at ?? null)
          : (r.hkjc_price_changed_at ?? r.hkjc_odds_updated_at ?? r.hkjc_fetched_at ?? null),
        fetchedAt: live
          ? (liveOddsRow?.fetched_at ?? r.live_fetched_at ?? null)
          : (r.hkjc_fetched_at ?? null),
        priceAgeSeconds: live ? liveOddsAgeSeconds : prematchPriceAgeSeconds,
        sourceMode: fallbackMode ? "DB_FALLBACK_FAIL_CLOSED" : "CANONICAL_ACTIVE_FEED",
        evidenceChannelCount: r.evidence_channel_count,
        unifiedCoverageStatus: r.unified_coverage_status,
        diagnostics: r.diagnostic_codes ?? [],
        evidenceKey: `hkjc_odds_current:${id}`,
        sourceUrl: r.hkjc_source_url ?? null,
      },
      phase2: {
        quality: humanQuality,
        injuryHome,
        injuryAway,
        lineupConfirmed,
        sourceLineupConfirmed,
        playerRows: playerStatusRowsAnnotated.length,
        confirmedPlayerClaims: confirmedStatusClaims.length,
        unresolvedPlayerRows: unresolvedStatusRows.length,
        lineupRows: lineupRowsAnnotated.length,
        confirmedLineupRows: confirmedLineupRows.length,
        unresolvedLineupRows: unresolvedLineupRows.length,
        managerRows: managers.data.length,
        playerStatusEvidence: playerStatusRowsAnnotated,
        lineupEvidence: lineupRowsAnnotated,
      },
      goalsModelContext: {
        teamForm: formGoalsOver === null ? null : {
          quality: formQuality,
          source: formRow?.model_source ?? null,
          historySource: formRow?.raw?.history_source ?? null,
          externalLatestDate: formRow?.raw?.external_latest_date ?? null,
          fetchedAt: formRow?.fetched_at ?? null,
          homeGames: formHomeGames,
          awayGames: formAwayGames,
          homeVenueGames: Number(formRow?.home_venue_games ?? 0),
          awayVenueGames: Number(formRow?.away_venue_games ?? 0),
          expectedGoalsHome: n(formRow?.form_xg_home),
          expectedGoalsAway: n(formRow?.form_xg_away),
          provenanceGroup: knownProvenanceGroup(formRow?.model_source) ?? "TEAM_FORM_UNKNOWN",
          independentEvidenceEligible: Boolean(knownProvenanceGroup(formRow?.model_source)),
          evidenceKey: `form_predictions:${id}`,
          sourceUrl: formRow?.raw?.source_url ?? null,
          method: live ? "LIVE_FORM_RESIDUAL" : "FORM_XG_POISSON",
        },
        dixonColes: dcGoalsOver === null ? null : {
          quality: modelTotals.data?.quality ?? null,
          source: modelTotals.data?.model_source ?? null,
          league: modelTotals.data?.model_league ?? null,
          fetchedAt: modelTotals.data?.fetched_at ?? null,
          trainingMatches: Number(modelTotals.data?.training_matches ?? 0),
          teamMatchQuality: n(modelTotals.data?.team_match_quality),
          expectedGoalsHome: n(modelTotals.data?.dc_xg_home),
          expectedGoalsAway: n(modelTotals.data?.dc_xg_away),
          provenanceGroup: knownProvenanceGroup(modelTotals.data?.model_source) ?? "DIXON_COLES_UNKNOWN",
          independentEvidenceEligible: Boolean(knownProvenanceGroup(modelTotals.data?.model_source)),
          period: null,
          evidenceKey: `model_predictions:${id}`,
          sourceUrl: modelTotals.data?.raw?.source_url ?? null,
          method: live ? "LIVE_DC_RESIDUAL" : "DC_XG_POISSON",
        },
      },
      phase3: liveState,
      phase4: movementData,
      markets: {
        handicap: handicapAdvice,
        goals: goalsAdvice,
        corners: cornersAdvice,
      },
      totals: {
        goals: goalsAdvice,
        corners: cornersAdvice,
      },
    },
    invalidators,
    phaseCoverage,
    errors,
    governance: {
      rule: "Numbers and candidate selection are deterministic. Narration must not invent odds, probabilities, injuries, lineups or live statistics.",
      calibrationGate: productionValidated ? "PASSED_BY_CURRENT_ENGINE_STATE" : "NOT_PASSED",
      sourceMode: fallbackMode ? "DB_FALLBACK_FAIL_CLOSED" : "CANONICAL_ACTIVE_FEED",
      staking: "No automated stake sizing until Phase 5 calibration and Phase 7 risk controls are validated.",
    },
  });
  return Response.json(publicPayload, {
    headers: { ...cors, "Cache-Control": "public, max-age=20, stale-while-revalidate=40" },
  });
});
