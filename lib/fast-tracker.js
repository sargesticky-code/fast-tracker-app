const FEED_URL =
  process.env.FAST_TRACKER_FEED_URL ||
  "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-phase1-feed?hours=24";

export function sanitizeFallbackMatch(match) {
  return {
    ...match,
    odds: { home: null, draw: null, away: null },
    market: null,
    goals: { line: null, over: null, under: null },
    corners: { line: null, over: null, under: null },
    oddsMovement: null,
    liveNow: false,
    live: null,
    updatedAt: null,
    health: {
      ...(match.health || {}),
      hkjcFetchedAt: null,
      hkjcFreshness: "STALE",
      primaryMissingReason: "SNAPSHOT_FALLBACK_NOT_CURRENT",
    },
  };
}

function emptyBootFeed() {
  return {
    generatedAt: null,
    source: "boot-empty",
    windowHours: 24,
    count: 0,
    matches: [],
    systemHealth: {},
  };
}

export async function getFeed() {
  // Railway is currently exported as a static site. Never bake build-time
  // HKJC prices or fixtures into production HTML because they become stale
  // without a redeploy. The client runtime immediately replaces this empty
  // boot payload with the canonical Supabase feed.
  const staticBuild =
    process.env.CF_PAGES === "1" ||
    process.env.CF_PAGES === "true" ||
    process.env.GITHUB_ACTIONS === "true";

  if (staticBuild) return emptyBootFeed();

  try {
    const res = await fetch(FEED_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`feed_http_${res.status}`);
    const live = await res.json();
    if (!Array.isArray(live.matches)) throw new Error("feed_shape_invalid");
    return live;
  } catch (_) {
    return emptyBootFeed();
  }
}

export async function getMatch(id) {
  const feed = await getFeed();
  return feed.matches.find((m) => m.id === id) || null;
}

export function fairMarket(odds) {
  if (!odds?.home || !odds?.draw || !odds?.away) return null;
  const inv = { home: 1 / odds.home, draw: 1 / odds.draw, away: 1 / odds.away };
  const total = inv.home + inv.draw + inv.away;
  return { home: inv.home / total, draw: inv.draw / total, away: inv.away / total };
}

export function preferredModel(match) {
  return match.multi || match.forebet || match.dc || match.pi || match.form || null;
}

function dominantHda(model) {
  if (!model) return null;
  const rows = [
    ["H", Number(model.home)],
    ["D", Number(model.draw)],
    ["A", Number(model.away)],
  ].filter(([, value]) => Number.isFinite(value));
  if (rows.length !== 3) return null;
  rows.sort((a, b) => b[1] - a[1]);
  return rows[0][0];
}

export function modelAgreement(match) {
  const sources = [
    ["FOREBET", match.forebet],
    ["DC", match.dc],
    ["PI", match.pi],
    ["FORM", match.form],
  ].map(([name, model]) => ({ name, side: dominantHda(model) }))
    .filter((row) => row.side);

  const multiSources = Math.max(0, Number(match.multi?.sources || 0));
  const multiSide = dominantHda(match.multi);

  if (sources.length < 2) {
    if (multiSide && multiSources > 0) {
      return {
        key: "multi",
        label: sources.length === 1 ? `1 MODEL + MULTI` : `MULTI ${multiSources} SRC`,
        count: sources.length + multiSources,
        side: multiSide,
        sources,
      };
    }
    return { key: "limited", label: sources.length === 1 ? "1 MODEL" : "NO MODEL", count: sources.length, sources };
  }

  const sides = [...new Set(sources.map((row) => row.side))];
  if (sides.length === 1) {
    return { key: "agree", label: `${sources.length} MODELS AGREE`, count: sources.length, side: sides[0], sources };
  }

  return { key: "split", label: "MODEL SPLIT", count: sources.length, sides, sources };
}

export function modelLabel(match) {
  if (match.multi) return `Multi-source · ${match.multi.sources} sources`;
  if (match.forebet) return "Forebet";
  if (match.dc) return "DC";
  if (match.pi) return "Pi";
  if (match.form) return "Form";
  return "No external model";
}

export function divergence(match) {
  const model = preferredModel(match);
  const market = match.market || fairMarket(match.odds);
  if (!model || !market) return null;
  const diffs = [
    { key: "H", value: model.home - market.home },
    { key: "D", value: model.draw - market.draw },
    { key: "A", value: model.away - market.away },
  ];
  return diffs.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
}

export function valueEdge(match) {
  const model = preferredModel(match);
  const market = match.market || fairMarket(match.odds);
  if (!model || !market) return null;
  const diffs = [
    { key: "H", value: model.home - market.home },
    { key: "D", value: model.draw - market.draw },
    { key: "A", value: model.away - market.away },
  ];
  return diffs.sort((a, b) => b.value - a.value)[0];
}


export function binaryFair(overOdds, underOdds) {
  const over = Number(overOdds);
  const under = Number(underOdds);
  if (!Number.isFinite(over) || !Number.isFinite(under) || over <= 1 || under <= 1) return null;
  const overInv = 1 / over;
  const underInv = 1 / under;
  const total = overInv + underInv;
  return { over: overInv / total, under: underInv / total };
}

function sameLine(value, target) {
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n - target) < 0.001;
}

export function goalsValueEdge(match) {
  const model = match.forebetDetail?.goalsCurrentLine;
  const market = binaryFair(match.goals?.over, match.goals?.under);
  if (!model || !market || model.over == null || model.under == null) return null;
  if (!sameLine(match.goals?.line, model.line)) return null;
  const diffs = [
    { key: "O", value: Number(model.over) - market.over, model },
    { key: "U", value: Number(model.under) - market.under, model },
  ];
  return diffs.sort((a, b) => b.value - a.value)[0];
}

export function cornersValueEdge(match) {
  const model = match.forebetDetail?.cornersCurrentLine;
  const market = binaryFair(match.corners?.over, match.corners?.under);
  if (!model || !market || model.over == null || model.under == null) return null;
  if (!sameLine(match.corners?.line, model.line)) return null;
  const diffs = [
    { key: "O", value: Number(model.over) - market.over, model },
    { key: "U", value: Number(model.under) - market.under, model },
  ];
  return diffs.sort((a, b) => b.value - a.value)[0];
}

export function lineComparisonStatus(match, market) {
  const isGoals = market === "goals";
  const currentRaw = isGoals ? match.goals?.line : match.corners?.line;
  const current = Number(currentRaw);
  const model = isGoals ? match.forebetDetail?.goalsCurrentLine : match.forebetDetail?.cornersCurrentLine;
  const reference = isGoals ? match.forebetDetail?.ou25 : match.forebetDetail?.corners95;
  const hasReference = Boolean(reference && (
    reference.over != null ||
    reference.under != null ||
    reference.avgGoals != null ||
    reference.avgCorners != null
  ));

  if (!Number.isFinite(current)) {
    return { key: "no-market", comparable: false, currentLine: null, modelLine: model?.line ?? null, label: "HKJC NO LINE" };
  }
  if (!model) {
    return {
      key: hasReference ? "unmodelled-line" : "missing",
      comparable: false,
      currentLine: current,
      modelLine: null,
      label: hasReference ? `HKJC ${current} · 未有同線模型` : "NO DATA",
    };
  }
  if (!sameLine(current, model.line)) {
    return {
      key: "mismatch",
      comparable: false,
      currentLine: current,
      modelLine: model.line,
      label: `MODEL ${model.line} ≠ HKJC ${current}`,
    };
  }
  return {
    key: model.derived ? "derived" : "native",
    comparable: true,
    currentLine: current,
    modelLine: model.line,
    derived: Boolean(model.derived),
    native: Boolean(model.native),
    method: model.method || null,
    label: model.derived ? "同線 · DERIVED" : "同線 · FOREBET",
  };
}

export function binarySideName(key) {
  return key === "O" ? "大" : "細";
}

export function binaryOdds(market, key) {
  return key === "O" ? market?.over : market?.under;
}

export function modelCoverageCount(match) {
  let count = 0;
  if (match.forebet) count += 1;
  if (match.dc) count += 1;
  if (match.pi) count += 1;
  if (match.form) count += 1;
  if (match.multi) count += Math.max(1, Number(match.multi.sources || 0));
  return count;
}

export function dataAgeMinutes(match, nowMs = Date.now()) {
  const sourceTime =
    match.liveNow ? (match.live?.fetchedAt || match.health?.hkjcFetchedAt || match.updatedAt) :
    (match.health?.hkjcFetchedAt || match.updatedAt);
  if (!sourceTime) return Infinity;
  const t = new Date(sourceTime).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return Math.max(0, Math.round((nowMs - t) / 60000));
}

export function freshness(match, nowMs = Date.now()) {
  const age = dataAgeMinutes(match, nowMs);
  if (!Number.isFinite(age)) return { key: "missing", label: "未知更新", age };
  if (age <= 90) return { key: "fresh", label: age < 2 ? "剛更新" : `${age}m前`, age };
  if (age <= 360) return { key: "aging", label: `${Math.round(age / 60)}h前`, age };
  return { key: "stale", label: age < 1440 ? `${Math.round(age / 60)}h前` : `${Math.round(age / 1440)}d前`, age };
}

export function reviewPriority(match, nowMs = Date.now()) {
  const gap = divergence(match);
  const edge = valueEdge(match);
  const agreement = modelAgreement(match);
  const coverage = modelCoverageCount(match);
  const fresh = freshness(match, nowMs);
  const rawMove = Math.abs(Number(match.oddsMovement?.rawOddsChangePct));
  const kickoffMs = new Date(match.kickoff).getTime();
  const hoursToKickoff = Number.isFinite(kickoffMs) ? (kickoffMs - nowMs) / 3600000 : Infinity;

  // Review priority only. This is NOT a probability, betting rating, or expected return.
  // It answers: "which match contains the most time-sensitive, information-rich signals to inspect first?"
  const coveragePoints = Math.min(20, coverage * 3);
  const divergencePoints = gap ? Math.min(22, Math.abs(gap.value) * 180) : 0;
  const positiveEdgePoints = edge && edge.value > 0 ? Math.min(18, edge.value * 120) : 0;
  const movementPoints = Number.isFinite(rawMove) ? Math.min(18, Math.max(0, rawMove - 5) * 1.2) : 0;
  const disagreementPoints = agreement.key === "split" ? 12 : agreement.key === "agree" ? 4 : 0;
  const freshnessPoints = fresh.key === "fresh" ? 8 : fresh.key === "aging" ? 3 : -18;
  const urgencyPoints =
    hoursToKickoff >= 0 && hoursToKickoff <= 3 ? 12 :
    hoursToKickoff <= 6 ? 8 :
    hoursToKickoff <= 12 ? 4 : 0;

  const score = Math.max(0, Math.min(100, Math.round(
    coveragePoints +
    divergencePoints +
    positiveEdgePoints +
    movementPoints +
    disagreementPoints +
    freshnessPoints +
    urgencyPoints
  )));

  const reasons = [];
  if (edge?.value >= 0.10) reasons.push("STRONG EDGE");
  else if (edge?.value >= 0.05) reasons.push("VALUE");
  if (Number.isFinite(rawMove) && rawMove >= 10) reasons.push("MOVE");
  if (agreement.key === "split") reasons.push("MODEL SPLIT");
  if (hoursToKickoff >= 0 && hoursToKickoff <= 3) reasons.push("SOON");
  if (fresh.key === "stale" || fresh.key === "missing") reasons.push("DATA RISK");

  const band =
    fresh.key === "stale" || fresh.key === "missing" ? "risk" :
    score >= 75 ? "p1" :
    score >= 55 ? "p2" :
    score >= 35 ? "p3" : "p4";

  return { score, band, reasons, hoursToKickoff };
}

export function reviewScore(match, nowMs = Date.now()) {
  return reviewPriority(match, nowMs).score;
}

export function formatPct(value) {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export function formatOdds(value) {
  return value == null ? "—" : Number(value).toFixed(2);
}

export function formatKickoff(value) {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatUpdated(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function sideName(match, key) {
  if (key === "H") return match.homeZh || match.home;
  if (key === "A") return match.awayZh || match.away;
  return "和";
}

export function unifiedCoverageStatus(match) {
  const status = match?.health?.unifiedCoverageStatus;
  if (status) return String(status);
  const count = modelCoverageCount(match);
  if (count >= 6) return "DATA_RICH";
  if (count > 0) return "PARTIAL_MODEL_COVERAGE";
  return "HKJC_ONLY";
}

export function coverageStatusMeta(match) {
  const status = unifiedCoverageStatus(match);
  const map = {
    DATA_RICH: { label: "DATA RICH", tone: "rich" },
    PARTIAL_MODEL_COVERAGE: { label: "部分模型", tone: "partial" },
    HKJC_ONLY: { label: "HKJC ONLY", tone: "warn" },
    PIPELINE_COVERAGE_GAP: { label: "PIPELINE GAP", tone: "danger" },
    IDENTITY_BLOCK: { label: "配對封鎖", tone: "danger" },
    HKJC_STALE_OR_MISSING: { label: "HKJC STALE", tone: "danger" },
  };
  return map[status] || { label: status.replaceAll("_", " "), tone: "partial" };
}

export function hasCoverageGap(match) {
  return unifiedCoverageStatus(match) !== "DATA_RICH";
}

export function coverage(match) {
  const count = modelCoverageCount(match);
  if (count >= 6) return "DATA RICH";
  if (count > 0) return "MODEL DATA";
  return "HKJC ONLY";
}
