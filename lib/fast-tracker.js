import snapshot from "@/data/app_snapshot.json";

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

export async function getFeed() {
  try {
    const res = await fetch(FEED_URL, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`feed_http_${res.status}`);
    const live = await res.json();
    if (!Array.isArray(live.matches)) throw new Error("feed_shape_invalid");
    return live;
  } catch (_) {
    return {
      generatedAt: snapshot.generatedAt,
      source: "snapshot-fallback",
      windowHours: 24,
      count: snapshot.matches.length,
      matches: snapshot.matches.map(sanitizeFallbackMatch),
    };
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

export function reviewScore(match, nowMs = Date.now()) {
  const gap = divergence(match);
  const coverage = modelCoverageCount(match);
  const fresh = freshness(match, nowMs);

  // Review priority only: data richness + model/market disagreement + freshness.
  // It is deliberately not a betting score.
  const coveragePoints = Math.min(55, coverage * 8);
  const gapPoints = gap ? Math.min(35, Math.abs(gap.value) * 250) : 0;
  const freshPoints = fresh.key === "fresh" ? 10 : fresh.key === "aging" ? 5 : 0;
  return Math.round(coveragePoints + gapPoints + freshPoints);
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
