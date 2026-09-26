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

function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function hasMultisourceDetail(match) {
  const ou = match?.multisourceDetail?.ou25;
  const btts = match?.multisourceDetail?.btts;
  return Boolean(match?.multi) || [
    ou?.over, ou?.under, btts?.yes, btts?.no,
  ].some((value) => Number.isFinite(Number(value)));
}

export function dataCoverageMatrix(match) {
  const hkjcReady = [
    match?.odds?.home,
    match?.odds?.draw,
    match?.odds?.away,
  ].every(finitePositive);

  const powerReady =
    Number.isFinite(Number(match?.power?.home)) &&
    Number.isFinite(Number(match?.power?.away));

  const contextReady = Boolean(
    match?.sourceContext &&
    (
      Number.isFinite(Number(match.sourceContext.matchConfidence)) ||
      match.sourceContext.detailAvailable ||
      match.sourceContext.lineupAvailable
    )
  );

  return [
    { key: "hkjc", short: "HK", label: "HKJC", available: hkjcReady },
    { key: "forebet", short: "FB", label: "Forebet", available: Boolean(match?.forebet || match?.forebetDetail?.predictedScore) },
    { key: "dc", short: "DC", label: "Dixon-Coles", available: Boolean(match?.dc || match?.dcDetail?.available) },
    { key: "pi", short: "PI", label: "Pi Rating", available: Boolean(match?.pi || match?.piDetail?.available) },
    { key: "form", short: "FM", label: "Team Form", available: Boolean(match?.form || match?.formDetail) },
    { key: "power", short: "PW", label: "Power", available: powerReady },
    { key: "multi", short: "MS", label: "Multi-source", available: hasMultisourceDetail(match) },
    { key: "context", short: "CTX", label: "Context", available: contextReady },
    { key: "engine", short: "ENG", label: "Engine", available: Boolean(match?.decision) },
  ];
}

export function dataCompleteness(match) {
  const channels = dataCoverageMatrix(match);
  const available = channels.filter((row) => row.available).length;
  const total = channels.length;
  const missing = channels.filter((row) => !row.available);
  const percent = total ? Math.round((available / total) * 100) : 0;
  return { channels, available, total, missing, percent };
}

export function dataCoverageSummary(matches) {
  const rows = Array.isArray(matches) ? matches : [];
  const template = dataCoverageMatrix({});
  const counts = Object.fromEntries(template.map((row) => [row.key, 0]));

  for (const match of rows) {
    for (const channel of dataCoverageMatrix(match)) {
      if (channel.available) counts[channel.key] += 1;
    }
  }

  return template.map((channel) => ({
    ...channel,
    count: counts[channel.key] || 0,
    total: rows.length,
    percent: rows.length ? Math.round(((counts[channel.key] || 0) / rows.length) * 100) : 0,
  }));
}

function compactDiagnosticCode(code) {
  const key = String(code || "UNKNOWN").toUpperCase();
  const known = {
    SOURCE_ABSENT: "ABSENT",
    FIXTURE_ONLY: "FIXTURE",
    IDENTITY_BLOCK: "IDENTITY",
    NO_MODEL_ROW: "NO MODEL",
    NO_MATCHED_SOURCE: "NO MATCH",
    NO_SOURCE_ROW: "NO SOURCE",
    NO_FORM_MODEL: "NO FORM",
    NO_POWER_ROW: "NO POWER",
    PARTIAL_POWER_ROW: "PARTIAL",
    NO_CONTEXT_ROW: "NO CTX",
    NO_MATCH_CONFIDENCE: "NO MATCH",
    MISSING_PRICE: "NO PRICE",
    MISSING_CANONICAL_1X2: "NO 1X2",
    CHECK_STALE: "STALE",
    NO_EVIDENCE: "NO EVID",
    NO_DECISION: "NO DEC",
    PIPELINE_COVERAGE_GAP: "PIPELINE",
    SOURCE_COVERAGE_GAP: "SOURCE GAP",
    PARTIAL_MODEL_COVERAGE: "PARTIAL",
  };
  return known[key] || key.replaceAll("_", " ").slice(0, 12);
}

function diagnosticAge(value, nowMs = Date.now()) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  const minutes = Math.max(0, Math.round((nowMs - ms) / 60000));
  if (minutes < 60) return minutes + "m";
  if (minutes < 1440) return Math.round(minutes / 60) + "h";
  return Math.round(minutes / 1440) + "d";
}

function diagnosticResult(channel, available, code, detail = null, nowMs = Date.now()) {
  const channelMeta = dataCoverageMatrix({}).find((row) => row.key === channel) || {
    key: channel,
    short: String(channel || "?").slice(0, 3).toUpperCase(),
    label: channel,
  };
  return {
    ...channelMeta,
    available,
    code: available ? "OK" : String(code || "UNKNOWN").toUpperCase(),
    shortReason: available ? "OK" : compactDiagnosticCode(code),
    detail,
    checkedAt: nowMs,
  };
}

export function dataGapDiagnostic(match, channelKey, nowMs = Date.now()) {
  const channel = dataCoverageMatrix(match).find((row) => row.key === channelKey);
  if (!channel) return diagnosticResult(channelKey, false, "UNKNOWN", null, nowMs);
  if (channel.available) return diagnosticResult(channelKey, true, "OK", null, nowMs);

  const health = match?.health || {};

  if (channelKey === "hkjc") {
    const missingCanonical = Boolean(health.missingCanonical1x2);
    const stale = String(health.hkjcFreshness || "").toUpperCase() === "STALE";
    const age = Number(health.hkjcFetchAgeMinutes);
    const detail = [
      stale ? "HKJC stale" : null,
      Number.isFinite(age) ? Math.round(age) + "m age" : null,
    ].filter(Boolean).join(" · ") || null;
    return diagnosticResult(channelKey, false, missingCanonical ? "MISSING_CANONICAL_1X2" : "MISSING_PRICE", detail, nowMs);
  }

  if (channelKey === "forebet") {
    const checkFreshness = String(health.forebetCheckFreshness || "").toUpperCase();
    const code = checkFreshness === "STALE"
      ? "CHECK_STALE"
      : health.forebetCoverageStatus || health.forebetReason || health.forebetState || "SOURCE_ABSENT";
    const detail = [
      health.forebetState || null,
      health.forebetReason && health.forebetReason !== code ? health.forebetReason : null,
      diagnosticAge(health.forebetCheckedAt, nowMs) ? "checked " + diagnosticAge(health.forebetCheckedAt, nowMs) : null,
    ].filter(Boolean).join(" · ") || null;
    return diagnosticResult(channelKey, false, code, detail, nowMs);
  }

  if (channelKey === "dc" || channelKey === "pi") {
    const detailRow = channelKey === "dc" ? match?.dcDetail : match?.piDetail;
    const code = detailRow?.missingReason || health.dcPiCoverageStatus || health.internalModelQuality || "NO_MODEL_ROW";
    const detail = [
      detailRow?.quality || health.internalModelQuality || null,
      Number(detailRow?.trainingMatches) > 0 ? Number(detailRow.trainingMatches) + " training" : null,
      Number.isFinite(Number(detailRow?.teamMatchQuality)) ? Math.round(Number(detailRow.teamMatchQuality) * 100) + "% identity" : null,
    ].filter(Boolean).join(" · ") || null;
    return diagnosticResult(channelKey, false, code, detail, nowMs);
  }

  if (channelKey === "form") {
    const code = health.formCoverageStatus || health.formQuality || match?.formDetail?.quality || "NO_FORM_MODEL";
    const homeGames = Number(match?.formDetail?.home?.modelGames || 0);
    const awayGames = Number(match?.formDetail?.away?.modelGames || 0);
    const detail = homeGames || awayGames ? "sample " + homeGames + "/" + awayGames : null;
    return diagnosticResult(channelKey, false, code, detail, nowMs);
  }

  if (channelKey === "power") {
    const power = match?.power;
    const code = power ? (power.coverage || "PARTIAL_POWER_ROW") : "NO_POWER_ROW";
    const detail = power
      ? [
          power.source || null,
          Number.isFinite(Number(power.homeConfidence)) ? "H " + Math.round(Number(power.homeConfidence) * 100) + "%" : null,
          Number.isFinite(Number(power.awayConfidence)) ? "A " + Math.round(Number(power.awayConfidence) * 100) + "%" : null,
        ].filter(Boolean).join(" · ") || null
      : null;
    return diagnosticResult(channelKey, false, code, detail, nowMs);
  }

  if (channelKey === "multi") {
    const code = health.multisourceCoverageStatus || health.multisourceMatchReason || health.multisourceMatchStatus || "NO_MATCHED_SOURCE";
    const detail = [
      health.multisourceMatchStatus || null,
      health.multisourceMatchReason && health.multisourceMatchReason !== code ? health.multisourceMatchReason : null,
      Number(health.multisourceSourceCountTotal) > 0 ? Number(health.multisourceSourceCountTotal) + " sources checked" : null,
    ].filter(Boolean).join(" · ") || null;
    return diagnosticResult(channelKey, false, code, detail, nowMs);
  }

  if (channelKey === "context") {
    const context = match?.sourceContext;
    if (!context) return diagnosticResult(channelKey, false, "NO_CONTEXT_ROW", "FotMob shadow context absent", nowMs);
    const code = context.identityStatus || "NO_MATCH_CONFIDENCE";
    const detail = [
      Number.isFinite(Number(context.matchConfidence)) ? Math.round(Number(context.matchConfidence) * 100) + "% match" : null,
      context.detailAvailable ? "detail" : "fixture only",
      context.lineupAvailable ? "lineup" : null,
    ].filter(Boolean).join(" · ") || null;
    return diagnosticResult(channelKey, false, code, detail, nowMs);
  }

  if (channelKey === "engine") {
    const evidence = Number(health.evidenceChannelCount || 0);
    const code = evidence === 0 ? "NO_EVIDENCE" : "NO_DECISION";
    const detail = [
      health.unifiedCoverageStatus || null,
      health.fallbackStatus || null,
      evidence + " evidence",
    ].filter(Boolean).join(" · ") || null;
    return diagnosticResult(channelKey, false, code, detail, nowMs);
  }

  return diagnosticResult(channelKey, false, "UNKNOWN", null, nowMs);
}

export function dataGapReasonSummary(matches, channelKey, nowMs = Date.now()) {
  const counts = new Map();
  for (const match of Array.isArray(matches) ? matches : []) {
    const diagnostic = dataGapDiagnostic(match, channelKey, nowMs);
    if (diagnostic.available) continue;
    const existing = counts.get(diagnostic.code) || {
      code: diagnostic.code,
      shortReason: diagnostic.shortReason,
      count: 0,
    };
    existing.count += 1;
    counts.set(diagnostic.code, existing);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

function actionResult(key, label, tone, detail = null, diagnostic = null) {
  return { key, label, tone, detail, diagnostic };
}

export function dataGapAction(match, channelKey, nowMs = Date.now()) {
  const diagnostic = dataGapDiagnostic(match, channelKey, nowMs);
  if (diagnostic.available) {
    return actionResult("READY", "已就緒", "ready", "No action", diagnostic);
  }

  const code = String(diagnostic.code || "UNKNOWN").toUpperCase();
  const health = match?.health || {};

  if (channelKey === "hkjc") {
    if (code.includes("STALE")) return actionResult("REFRESH_SOURCE", "重抓 HKJC", "refresh", "等下一輪 price refresh", diagnostic);
    return actionResult("WAIT_MARKET", "等 HKJC 更新", "wait", "等市場/賠率重新出現", diagnostic);
  }

  if (code.includes("IDENTITY") || code.includes("ALIAS")) {
    return actionResult("FIX_ALIAS", "修 Alias", "fix", "檢查隊名 identity / mapping", diagnostic);
  }

  if (channelKey === "forebet") {
    if (code === "CHECK_STALE") return actionResult("REFRESH_SOURCE", "重抓 Forebet", "refresh", "下一輪重新抓取", diagnostic);
    if (code.includes("FIXTURE")) return actionResult("WAIT_PREDICTION", "等 Prediction", "wait", "fixture 已有，等預測資料", diagnostic);
    if (code.includes("ABSENT") || code.includes("SOURCE")) return actionResult("WAIT_CAPTURE", "等下一輪抓取", "wait", "source 暫未有可用 prediction", diagnostic);
    return actionResult("REFRESH_SOURCE", "重抓 Forebet", "refresh", "重新檢查 source coverage", diagnostic);
  }

  if (channelKey === "dc" || channelKey === "pi") {
    const detailRow = channelKey === "dc" ? match?.dcDetail : match?.piDetail;
    const training = Number(detailRow?.trainingMatches || 0);
    if (training > 0 && training < 8) {
      return actionResult("BUILD_SAMPLE", "補 Model Sample", "wait", training + " training matches", diagnostic);
    }
    if (code.includes("NO_MODEL") || code.includes("MODEL") || code.includes("QUALITY")) {
      return actionResult("RERUN_MODEL", "重跑 Model", "rerun", "等模型 lane 重新產生 prediction", diagnostic);
    }
    return actionResult("CHECK_MODEL", "檢查 Model Lane", "check", "查看 model quality / training coverage", diagnostic);
  }

  if (channelKey === "form") {
    const homeGames = Number(match?.formDetail?.home?.modelGames || 0);
    const awayGames = Number(match?.formDetail?.away?.modelGames || 0);
    if (homeGames < 3 || awayGames < 3) {
      return actionResult("BUILD_SAMPLE", "補 Form Sample", "wait", "等更多已完場樣本", diagnostic);
    }
    return actionResult("RERUN_MODEL", "重跑 Form", "rerun", "重新建立 Team Form prediction", diagnostic);
  }

  if (channelKey === "power") {
    if (code.includes("NO_POWER") || !match?.power) {
      return actionResult("WAIT_CAPTURE", "等 Power 抓取", "wait", "等 Power/Opta lane 更新", diagnostic);
    }
    return actionResult("REMATCH_SOURCE", "重做 Power Matching", "fix", "檢查 team mapping / coverage", diagnostic);
  }

  if (channelKey === "multi") {
    if (code.includes("NO_MATCH") || code.includes("MATCH")) {
      return actionResult("REMATCH_SOURCE", "重做 Source Matching", "fix", "重新匹配 multi-source fixture", diagnostic);
    }
    if (code.includes("SOURCE") || code.includes("ABSENT")) {
      return actionResult("WAIT_CAPTURE", "等 Source 抓取", "wait", "等下一輪 multi-source capture", diagnostic);
    }
    return actionResult("REFRESH_SOURCE", "重抓 Multi-source", "refresh", "重新建立 source consensus", diagnostic);
  }

  if (channelKey === "context") {
    const context = match?.sourceContext;
    if (!context) return actionResult("WAIT_CONTEXT", "等 Context 抓取", "wait", "FotMob shadow context 未到", diagnostic);
    if (!context.detailAvailable) return actionResult("WAIT_DETAIL", "等 Detail", "wait", "fixture matched；等 detail/lineup", diagnostic);
    if (!context.lineupAvailable) return actionResult("WAIT_LINEUP", "等 Lineup", "wait", "detail 已有；lineup 未公布", diagnostic);
    return actionResult("REMATCH_SOURCE", "重做 Context Matching", "fix", "檢查 external fixture identity", diagnostic);
  }

  if (channelKey === "engine") {
    const evidence = Number(health.evidenceChannelCount || 0);
    if (code === "NO_EVIDENCE" || evidence === 0) {
      return actionResult("WAIT_UPSTREAM", "等上游 Evidence", "wait", "模型/source 未齊，Engine 暫不出 decision", diagnostic);
    }
    return actionResult("RERUN_ENGINE", "重跑 Engine", "rerun", evidence + " evidence available", diagnostic);
  }

  if (code.includes("STALE")) return actionResult("REFRESH_SOURCE", "重抓 Source", "refresh", "source data stale", diagnostic);
  if (code.includes("PIPELINE")) return actionResult("CHECK_PIPELINE", "檢查 Pipeline", "check", "查看 ingest / transform lane", diagnostic);
  return actionResult("CHECK_SOURCE", "檢查 Source", "check", diagnostic.detail || diagnostic.code, diagnostic);
}

export function dataGapActionSummary(matches, channelKey, nowMs = Date.now()) {
  const counts = new Map();
  for (const match of Array.isArray(matches) ? matches : []) {
    const action = dataGapAction(match, channelKey, nowMs);
    if (action.key === "READY") continue;
    const existing = counts.get(action.key) || {
      key: action.key,
      label: action.label,
      tone: action.tone,
      count: 0,
    };
    existing.count += 1;
    counts.set(action.key, existing);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
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


export function matchDetailHref(id, ui = null) {
  const safeId = encodeURIComponent(String(id ?? "").trim());
  if (!safeId) return "/";
  const uiPart = ui ? "&ui=" + encodeURIComponent(String(ui)) : "";
  return "/details/?id=" + safeId + uiPart;
}
