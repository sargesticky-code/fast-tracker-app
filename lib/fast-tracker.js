const FEED_URL =
  process.env.FAST_TRACKER_FEED_URL ||
  "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-phase1-feed?hours=24";

export function sanitizeFallbackMatch(match) {
  return {
    ...match,
    odds: { home: null, draw: null, away: null },
    market: null,
    handicap: { line: null, home: null, away: null },
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
    // Do not let a slow upstream block the public HTML response. The client
    // refresh lane will retry canonical data after hydration.
    const res = await fetch(FEED_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
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
  // Agreement is counted by provenance-distinct evidence families, not by
  // algorithm/provider labels. Aggregates with unknown member lineage are
  // supplemental only and cannot create another independent vote.
  const sources = prematchHdaFamilies(match)
    .map((family) => ({ name: family.key, provenanceGroup: family.provenanceGroup, side: dominantHda(family.probs) }))
    .filter((row) => row.side);

  if (sources.length < 2) {
    return { key: "limited", label: sources.length === 1 ? "1 EVIDENCE FAMILY" : "NO INDEPENDENT MODEL", count: sources.length, sources };
  }

  const sides = [...new Set(sources.map((row) => row.side))];
  if (sides.length === 1) {
    return { key: "agree", label: `${sources.length} EVIDENCE FAMILIES AGREE`, count: sources.length, side: sides[0], sources };
  }

  return { key: "split", label: "EVIDENCE FAMILY SPLIT", count: sources.length, sides, sources };
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

function provenanceGroup(sourceValue, fallback) {
  const source = String(sourceValue || "").toLowerCase();
  if (source.includes("forebet")) return "FOREBET";
  if (source.includes("brazilianfootball") || source.includes("brazil serie b full-league")) return "BRAZILIANFOOTBALL_SHARED";
  if (source.includes("football-data.co.uk") || source.includes("football data co uk")) return "FOOTBALL_DATA_CO_UK";
  if (source.includes("martj42")) return "MARTJ42_INTERNATIONAL_RESULTS";
  if (source.includes("hkjc")) return "HKJC_RESULTS";
  return fallback;
}

function collapseProvenanceFamilies(items) {
  const grouped = new Map();
  for (const item of items.filter((row) => row.independentEligible !== false)) {
    const key = item.provenanceGroup || item.key;
    grouped.set(key, [...(grouped.get(key) || []), item]);
  }
  return [...grouped.entries()].map(([group, members]) => {
    if (members.length === 1) return { ...members[0], provenanceGroup: group, memberKeys: [members[0].key] };
    const totalWeight = members.reduce((sum, row) => sum + Number(row.weight || 0), 0);
    const probs = weightedTriplets(members);
    return {
      key: members.map((row) => row.key).join("+"),
      probs,
      weight: totalWeight > 0 ? totalWeight / members.length : 1,
      provenanceGroup: group,
      memberKeys: members.map((row) => row.key),
    };
  }).filter((row) => row.probs);
}

function normalizedProbability(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const p = n > 1.5 ? n / 100 : n;
  return p >= 0 && p <= 1 ? p : null;
}

function normalizedTriplet(model) {
  if (!model) return null;
  const home = normalizedProbability(model.home);
  const draw = normalizedProbability(model.draw);
  const away = normalizedProbability(model.away);
  if (home == null || draw == null || away == null) return null;
  const total = home + draw + away;
  if (!(total > 0)) return null;
  return { home: home / total, draw: draw / total, away: away / total };
}

function averageTriplets(items) {
  const rows = items.filter(Boolean);
  if (!rows.length) return null;
  return {
    home: rows.reduce((sum, row) => sum + row.home, 0) / rows.length,
    draw: rows.reduce((sum, row) => sum + row.draw, 0) / rows.length,
    away: rows.reduce((sum, row) => sum + row.away, 0) / rows.length,
  };
}

function prematchHdaFamilies(match) {
  const rows = [];
  const forebet = normalizedTriplet(match?.forebet);
  const dc = normalizedTriplet(match?.dc);
  const pi = normalizedTriplet(match?.pi);
  const form = normalizedTriplet(match?.form);
  const multi = normalizedTriplet(match?.multi);
  const internal = averageTriplets([dc, pi]);
  if (forebet) rows.push({ key:"FOREBET", probs:forebet, weight:1, provenanceGroup:"FOREBET" });
  if (internal) rows.push({
    key:"INTERNAL",
    probs:internal,
    weight:1,
    provenanceGroup:provenanceGroup(match?.dcDetail?.source || match?.piDetail?.source, "INTERNAL_UNKNOWN"),
  });
  if (form) rows.push({
    key:"FORM",
    probs:form,
    weight:0.9,
    provenanceGroup:provenanceGroup(match?.formDetail?.source, "FORM_UNKNOWN"),
  });
  if (multi) {
    const sources = Math.max(0, Number(match?.multi?.sources || 0));
    rows.push({
      key:"MULTI",
      probs:multi,
      weight:sources >= 2 ? 0.75 : 0.35,
      sources,
      provenanceGroup:"MULTISOURCE_AGGREGATE",
      independentEligible:false,
    });
  }
  return collapseProvenanceFamilies(rows);
}

function weightedTriplets(items) {
  const totalWeight = items.reduce((sum, row) => sum + Number(row.weight || 0), 0);
  if (!(totalWeight > 0)) return null;
  return {
    home: items.reduce((sum, row) => sum + row.probs.home * row.weight, 0) / totalWeight,
    draw: items.reduce((sum, row) => sum + row.probs.draw * row.weight, 0) / totalWeight,
    away: items.reduce((sum, row) => sum + row.probs.away * row.weight, 0) / totalWeight,
  };
}

function outcomeValue(row, key) {
  return key === "H" ? row?.home : key === "D" ? row?.draw : key === "A" ? row?.away : null;
}

function candidateBand({ expectedValue, edge, familyCount, supportRatio, dispersion, odds = null, calibrationReady = false }) {
  if (!Number.isFinite(expectedValue) || expectedValue <= 0 || !Number.isFinite(edge) || edge <= 0) return "PASS";
  if (familyCount < 2) return "WATCH";
  if (Number.isFinite(dispersion) && dispersion > 0.18) return "WATCH";
  const longShotCalibrationCap = !calibrationReady && Number.isFinite(Number(odds)) && Number(odds) >= 8;
  if (!longShotCalibrationCap && expectedValue >= 0.08 && edge >= 0.06 && supportRatio >= 0.66 && (!Number.isFinite(dispersion) || dispersion <= 0.12)) return "STRONG_VALUE";
  if (expectedValue >= 0.04 && edge >= 0.03 && supportRatio >= 0.50 && (!Number.isFinite(dispersion) || dispersion <= 0.15)) return "VALUE";
  if (expectedValue >= 0.02 && edge >= 0.015) return "LEAN";
  return "WATCH";
}

export function valueEdge(match) {
  const families = prematchHdaFamilies(match);
  const consensus = weightedTriplets(families);
  const market = match?.market || fairMarket(match?.odds);
  if (!consensus || !market) return null;

  const rows = [
    { key:"H", modelProbability:consensus.home, marketProbability:market.home, odds:Number(match?.odds?.home) },
    { key:"D", modelProbability:consensus.draw, marketProbability:market.draw, odds:Number(match?.odds?.draw) },
    { key:"A", modelProbability:consensus.away, marketProbability:market.away, odds:Number(match?.odds?.away) },
  ].filter((row) => Number.isFinite(row.odds) && row.odds > 1)
    .map((row) => ({
      ...row,
      value: row.modelProbability - row.marketProbability,
      expectedValue: row.modelProbability * row.odds - 1,
    }))
    .sort((a,b) => b.expectedValue - a.expectedValue);

  const best = rows[0];
  if (!best) return null;
  const familyValues = families
    .map((family) => outcomeValue(family.probs, best.key))
    .filter((value) => Number.isFinite(value));
  const supportCount = familyValues.filter((probability) => probability > best.marketProbability).length;
  const supportRatio = familyValues.length ? supportCount / familyValues.length : 0;
  const dispersion = familyValues.length >= 2 ? Math.max(...familyValues) - Math.min(...familyValues) : null;

  return {
    ...best,
    familyCount: families.length,
    supportCount,
    supportRatio,
    dispersion,
    band: candidateBand({
      expectedValue: best.expectedValue,
      edge: best.value,
      familyCount: families.length,
      supportRatio,
      dispersion,
      odds: best.odds,
      calibrationReady: Boolean(match?.decision) && !String(match.decision).toUpperCase().includes("CALIBRATION"),
    }),
    model: consensus,
  };
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

function poissonOver(meanValue, lineValue) {
  const mean = Number(meanValue);
  const line = Number(lineValue);
  if (!Number.isFinite(mean) || !Number.isFinite(line) || mean <= 0 || line < 0) return null;
  const threshold = Math.floor(line) + 1;
  let term = Math.exp(-mean);
  let cdf = term;
  for (let k = 1; k < threshold; k += 1) {
    term *= mean / k;
    cdf += term;
  }
  return Math.min(0.999, Math.max(0.001, 1 - cdf));
}

function weightedBinaryCandidate(models, market, overOddsValue, underOddsValue, calibrationReady = false) {
  const valid = models.filter((row) => row?.independentEligible !== false && Number.isFinite(row?.over) && row.over >= 0 && row.over <= 1 && Number(row.weight) > 0);
  const totalWeight = valid.reduce((sum,row) => sum + row.weight, 0);
  if (!market || !(totalWeight > 0)) return null;
  const modelOver = valid.reduce((sum,row) => sum + row.over * row.weight, 0) / totalWeight;
  const modelUnder = 1 - modelOver;
  const overOdds = Number(overOddsValue);
  const underOdds = Number(underOddsValue);
  const rows = [
    {
      key:"O",
      modelProbability:modelOver,
      marketProbability:market.over,
      odds:overOdds,
    },
    {
      key:"U",
      modelProbability:modelUnder,
      marketProbability:market.under,
      odds:underOdds,
    },
  ].filter((row) => Number.isFinite(row.odds) && row.odds > 1)
    .map((row) => ({
      ...row,
      value:row.modelProbability - row.marketProbability,
      expectedValue:row.modelProbability * row.odds - 1,
    }))
    .sort((a,b) => b.expectedValue - a.expectedValue);
  const best = rows[0];
  if (!best) return null;
  const familyValues = valid.map((row) => best.key === "O" ? row.over : 1 - row.over);
  const supportCount = familyValues.filter((probability) => probability > best.marketProbability).length;
  const supportRatio = familyValues.length ? supportCount / familyValues.length : 0;
  const dispersion = familyValues.length >= 2 ? Math.max(...familyValues) - Math.min(...familyValues) : null;
  return {
    ...best,
    familyCount:valid.length,
    supportCount,
    supportRatio,
    dispersion,
    band:candidateBand({
      expectedValue:best.expectedValue,
      edge:best.value,
      familyCount:valid.length,
      supportRatio,
      dispersion,
      odds:best.odds,
      calibrationReady,
    }),
    model:{ over:modelOver, under:modelUnder },
    models:valid,
  };
}

export function goalsValueEdge(match) {
  const market = binaryFair(match?.goals?.over, match?.goals?.under);
  const line = Number(match?.goals?.line);
  if (!market || !Number.isFinite(line)) return null;

  const models = [];
  const forebet = match?.forebetDetail?.goalsCurrentLine;
  if (forebet && sameLine(line, forebet.line) && Number.isFinite(Number(forebet.over))) {
    models.push({ key:"FOREBET", over:Number(forebet.over), weight:1, method:forebet.method || null, provenanceGroup:"FOREBET" });
  }

  const dcHome = Number(match?.dcDetail?.expectedGoals?.home);
  const dcAway = Number(match?.dcDetail?.expectedGoals?.away);
  const dcMean = dcHome + dcAway;
  if (Number.isFinite(dcHome) && Number.isFinite(dcAway) && dcMean > 0) {
    const over = poissonOver(dcMean, line);
    if (over != null) models.push({ key:"DIXON_COLES", over, weight:0.9, method:"DC_XG_POISSON", provenanceGroup:provenanceGroup(match?.dcDetail?.source, "DIXON_COLES_UNKNOWN") });
  }

  const multiOver = normalizedProbability(match?.multisourceDetail?.ou25?.over);
  if (Math.abs(line - 2.5) < 0.001 && multiOver != null) {
    const sources = Math.max(1, Number(match?.multi?.sources || 1));
    models.push({ key:"MULTI", over:multiOver, weight:sources >= 2 ? 0.75 : 0.35, sources, method:"NATIVE_OU25", provenanceGroup:"MULTISOURCE_AGGREGATE", independentEligible:false });
  }

  const calibrationReady = Boolean(match?.decision) && !String(match.decision).toUpperCase().includes("CALIBRATION");
  const candidate = weightedBinaryCandidate(models, market, match?.goals?.over, match?.goals?.under, calibrationReady);
  return candidate ? { ...candidate, line } : null;
}

export function cornersValueEdge(match) {
  const market = binaryFair(match?.corners?.over, match?.corners?.under);
  const line = Number(match?.corners?.line);
  if (!market || !Number.isFinite(line)) return null;
  const models = [];
  const forebet = match?.forebetDetail?.cornersCurrentLine;
  if (forebet && sameLine(line, forebet.line) && Number.isFinite(Number(forebet.over))) {
    models.push({ key:"FOREBET", over:Number(forebet.over), weight:1, method:forebet.method || null });
  }
  const calibrationReady = Boolean(match?.decision) && !String(match.decision).toUpperCase().includes("CALIBRATION");
  const candidate = weightedBinaryCandidate(models, market, match?.corners?.over, match?.corners?.under, calibrationReady);
  return candidate ? { ...candidate, line } : null;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function poissonMass(k, lambda) {
  if (k < 0 || lambda < 0) return 0;
  if (lambda === 0) return k === 0 ? 1 : 0;
  let term = Math.exp(-lambda);
  if (k === 0) return term;
  for (let i = 1; i <= k; i += 1) term *= lambda / i;
  return term;
}

function parseAsianHandicapLine(value) {
  const raw = String(value ?? "").trim().replace(/−/g, "-").replace(/＋/g, "+");
  if (!raw) return null;
  const parts = raw.split("/").map((part) => Number(part.trim())).filter(Number.isFinite);
  if (!parts.length || parts.length > 2) return null;
  return parts;
}

function prematchScoreDiffDistribution(prior, totalMeanValue) {
  if (!prior) return [];
  const totalMean = clampNumber(Number(totalMeanValue) || 2.7, 1.2, 5.2);
  const homeShare = clampNumber(0.5 + (prior.home - prior.away) * 0.58, 0.16, 0.84);
  const lambdaHome = Math.max(0, totalMean * homeShare);
  const lambdaAway = Math.max(0, totalMean * (1 - homeShare));
  const diffMap = new Map();
  let mass = 0;

  for (let homeGoals = 0; homeGoals <= 10; homeGoals += 1) {
    const ph = poissonMass(homeGoals, lambdaHome);
    for (let awayGoals = 0; awayGoals <= 10; awayGoals += 1) {
      const probability = ph * poissonMass(awayGoals, lambdaAway);
      if (probability <= 0) continue;
      const diff = homeGoals - awayGoals;
      diffMap.set(diff, (diffMap.get(diff) || 0) + probability);
      mass += probability;
    }
  }

  if (!(mass > 0)) return [];
  return [...diffMap.entries()].map(([diff, probability]) => ({
    diff,
    probability: probability / mass,
  }));
}

function asianSettlementNet(diff, homeLine, odds, side) {
  const adjustedHome = diff + homeLine;
  const margin = side === "HOME" ? adjustedHome : -adjustedHome;
  if (margin > 1e-9) return odds - 1;
  if (margin < -1e-9) return -1;
  return 0;
}

function asianExpectedValue(distribution, homeLines, oddsValue, side) {
  const odds = Number(oddsValue);
  if (!distribution.length || !homeLines.length || !Number.isFinite(odds) || odds <= 1) return null;
  let expectedValue = 0;
  for (const row of distribution) {
    const settlement = homeLines.reduce(
      (sum, line) => sum + asianSettlementNet(row.diff, line, odds, side),
      0,
    ) / homeLines.length;
    expectedValue += row.probability * settlement;
  }
  return expectedValue;
}

function formatHandicapLines(lines) {
  return lines.map((line) => {
    const value = Math.abs(line) < 1e-9 ? 0 : line;
    return value > 0 ? "+" + value : String(value);
  }).join("/");
}

export function handicapValueEdge(match) {
  const families = prematchHdaFamilies(match);
  const consensus = weightedTriplets(families);
  const lines = parseAsianHandicapLine(match?.handicap?.line);
  const homeOdds = Number(match?.handicap?.home);
  const awayOdds = Number(match?.handicap?.away);
  if (!consensus || !lines || !Number.isFinite(homeOdds) || !Number.isFinite(awayOdds) || homeOdds <= 1 || awayOdds <= 1) return null;

  const dcHome = Number(match?.dcDetail?.expectedGoals?.home);
  const dcAway = Number(match?.dcDetail?.expectedGoals?.away);
  const dcMean = Number.isFinite(dcHome) && Number.isFinite(dcAway) ? dcHome + dcAway : null;
  const forebetMean = Number(match?.forebetDetail?.ou25?.avgGoals);
  const totalMean = Number.isFinite(forebetMean) && forebetMean > 0
    ? forebetMean
    : Number.isFinite(dcMean) && dcMean > 0 ? dcMean : 2.7;

  const consensusDistribution = prematchScoreDiffDistribution(consensus, totalMean);
  const homeExpectedValue = asianExpectedValue(consensusDistribution, lines, homeOdds, "HOME");
  const awayExpectedValue = asianExpectedValue(consensusDistribution, lines, awayOdds, "AWAY");
  const selection = (homeExpectedValue ?? -999) >= (awayExpectedValue ?? -999) ? "HOME" : "AWAY";
  const expectedValue = selection === "HOME" ? homeExpectedValue : awayExpectedValue;
  const odds = selection === "HOME" ? homeOdds : awayOdds;
  if (!Number.isFinite(expectedValue)) return null;

  const familyExpectedValues = families
    .map((family) => {
      const distribution = prematchScoreDiffDistribution(family.probs, totalMean);
      return asianExpectedValue(distribution, lines, odds, selection);
    })
    .filter(Number.isFinite);
  const supportCount = familyExpectedValues.filter((value) => value > 0).length;
  const familyCount = familyExpectedValues.length;
  const supportRatio = familyCount ? supportCount / familyCount : 0;
  const dispersion = familyCount >= 2
    ? Math.max(...familyExpectedValues) - Math.min(...familyExpectedValues)
    : null;

  let band = "PASS";
  if (expectedValue > 0) {
    if (familyCount < 2) band = "WATCH";
    else if (Number.isFinite(dispersion) && dispersion > 0.18) band = "WATCH";
    else if (expectedValue >= 0.12 && supportRatio >= 0.75 && (!Number.isFinite(dispersion) || dispersion <= 0.12)) band = "STRONG_VALUE";
    else if (expectedValue >= 0.05 && supportRatio >= 0.50 && (!Number.isFinite(dispersion) || dispersion <= 0.15)) band = "VALUE";
    else if (expectedValue >= 0.02) band = "LEAN";
    else band = "WATCH";
  }

  const home = match?.homeZh || match?.home || "主隊";
  const away = match?.awayZh || match?.away || "客隊";
  const selectionLabel = selection === "HOME"
    ? home + " " + formatHandicapLines(lines)
    : away + " " + formatHandicapLines(lines.map((line) => -line));

  return {
    key: selection,
    selection,
    selectionLabel,
    line: match?.handicap?.line ?? null,
    odds,
    expectedValue,
    value: null,
    band,
    familyCount,
    supportCount,
    supportRatio,
    dispersion,
    homeExpectedValue,
    awayExpectedValue,
    totalMean,
    method: "MODEL_DERIVED_SCORE_DISTRIBUTION",
  };
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
    { key: "human", short: "HF", label: "Human Factors", available: Boolean(match?.humanFactors || match?.lineupStrength || match?.sourceContext?.lineupStrength) },
    { key: "gs", short: "GS", label: "Graph Sandwich", available: Boolean(match?.graphSandwich || match?.gsSignal || match?.sandwich) },
    { key: "fhre", short: "FH", label: "FHRE", available: Boolean(match?.fhre || match?.liveModel?.fhre || match?.regimeModel) },
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
    MODEL_FAIL_CLOSED: "FAIL CLOSED",
    SPARSE_GRAPH_REJECTED: "SPARSE GRAPH",
    FORM_INSUFFICIENT: "FORM LOW",
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
    const quality = String(detailRow?.quality || health.internalModelQuality || "").toUpperCase();
    if (
      code === "MODEL_FAIL_CLOSED" ||
      quality.includes("SPARSE_GRAPH") ||
      quality.includes("INSUFFICIENT") ||
      (training > 0 && training < 8)
    ) {
      return actionResult(
        "BUILD_SAMPLE",
        "補 Model Sample",
        "wait",
        quality.includes("SPARSE_GRAPH") ? "sparse graph · 保持 fail-closed" : training > 0 ? training + " training matches" : "模型樣本不足",
        diagnostic,
      );
    }
    if (code.includes("NO_MODEL") || code.includes("MODEL") || code.includes("QUALITY")) {
      return actionResult("RERUN_MODEL", "重跑 Model", "rerun", "等模型 lane 重新產生 prediction", diagnostic);
    }
    return actionResult("CHECK_MODEL", "檢查 Model Lane", "check", "查看 model quality / training coverage", diagnostic);
  }

  if (channelKey === "form") {
    const homeGames = Number(match?.formDetail?.home?.modelGames || 0);
    const awayGames = Number(match?.formDetail?.away?.modelGames || 0);
    if (code === "FORM_INSUFFICIENT" || homeGames < 3 || awayGames < 3) {
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

function actionGroup(tone) {
  if (tone === "fix" || tone === "check") return "intervene";
  if (tone === "rerun" || tone === "refresh") return "rerun";
  if (tone === "wait") return "wait";
  return "other";
}

function actionGroupRank(group) {
  if (group === "intervene") return 0;
  if (group === "rerun") return 1;
  if (group === "wait") return 2;
  return 3;
}

export function matchGapActions(match, nowMs = Date.now()) {
  return dataCompleteness(match).missing
    .map((channel) => ({
      channel,
      action: dataGapAction(match, channel.key, nowMs),
    }))
    .filter((row) => row.action?.key && row.action.key !== "READY");
}

export function dataActionQueue(matches, nowMs = Date.now()) {
  const groups = new Map();

  for (const match of Array.isArray(matches) ? matches : []) {
    for (const row of matchGapActions(match, nowMs)) {
      const action = row.action;
      const key = action.key;
      const existing = groups.get(key) || {
        key,
        label: action.label,
        tone: action.tone,
        group: actionGroup(action.tone),
        gapCount: 0,
        matchIds: new Set(),
        channels: new Set(),
      };
      existing.gapCount += 1;
      existing.matchIds.add(String(match.id || match.hkjcEventId || ""));
      existing.channels.add(row.channel.short);
      groups.set(key, existing);
    }
  }

  return [...groups.values()]
    .map((row) => ({
      key: row.key,
      label: row.label,
      tone: row.tone,
      group: row.group,
      gapCount: row.gapCount,
      matchCount: row.matchIds.size,
      channels: [...row.channels].sort(),
    }))
    .sort((a, b) => {
      const groupDelta = actionGroupRank(a.group) - actionGroupRank(b.group);
      if (groupDelta) return groupDelta;
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
      return a.label.localeCompare(b.label);
    });
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
  const edgeEv = Number(edge?.expectedValue);
  const positiveEdgePoints = Number.isFinite(edgeEv) && edgeEv > 0 ? Math.min(18, edgeEv * 90) : 0;
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
  if (edge?.band === "STRONG_VALUE") reasons.push("STRONG VALUE");
  else if (edge?.band === "VALUE") reasons.push("VALUE");
  else if (edge?.band === "LEAN") reasons.push("LEAN");
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

export function leagueDisplayName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "賽事";

  // HKJC name_ch is the display authority. Keep Chinese names intact unless a
  // familiar Hong Kong football shorthand is clearer on a compact dashboard.
  const chineseShort = {
    "英格蘭超級聯賽": "英超",
    "英格蘭冠軍聯賽": "英冠",
    "英格蘭甲組聯賽": "英甲",
    "英格蘭乙組聯賽": "英乙",
    "女子英格蘭超級聯賽": "英女超",
    "德國甲組聯賽": "德甲",
    "德國乙組聯賽": "德乙",
    "女子德國甲組聯賽": "德女甲",
    "西班牙甲組聯賽": "西甲",
    "西班牙乙組聯賽": "西乙",
    "女子西班牙甲組聯賽": "西女甲",
    "意大利甲組聯賽": "意甲",
    "意大利乙組聯賽": "意乙",
    "女子意大利甲組聯賽": "意女甲",
    "法國甲組聯賽": "法甲",
    "法國乙組聯賽": "法乙",
    "荷蘭甲組聯賽": "荷甲",
    "荷蘭乙組聯賽": "荷乙",
    "女子荷蘭甲組聯賽": "荷女甲",
    "葡萄牙超級聯賽": "葡超",
    "比利時甲組聯賽": "比甲",
    "蘇格蘭超級聯賽": "蘇超",
    "南韓職業聯賽": "韓職",
    "日本乙組聯賽": "日乙",
    "墨西哥超級聯賽": "墨超",
    "女子墨西哥超級聯賽": "墨女超",
    "美國職業聯賽": "美職",
    "女子美國職業聯賽": "美女職",
    "巴西甲組聯賽": "巴甲",
    "巴西乙組聯賽": "巴乙",
    "阿根廷甲組聯賽": "阿甲",
    "烏拉圭甲組聯賽": "烏甲",
    "女子阿根廷甲組聯賽": "阿女甲",
    "非國盃外圍賽": "非國盃外",
    "中北美國家聯賽": "中北國聯",
    "歐洲國家聯賽": "歐國聯",
    "歐洲聯賽冠軍盃": "歐聯",
    "歐霸盃": "歐霸",
    "歐洲協會聯賽": "歐協聯",
    "女子歐洲聯賽冠軍盃": "女歐聯",
    "U21歐洲國家盃外圍賽": "歐U21外",
    "U21歐國外": "歐U21外",
    "女子世界青年盃": "女世青盃",
    "女子世青盃": "女世青盃",
    "女子日本聯賽盃": "女日聯盃",
    "智利盃": "智利盃",
    "東盟盃": "東盟盃",
    "國際賽": "國際賽",
    "海灣盃": "海灣盃",
    "亞運男足": "亞運男足",
    "亞運女足": "亞運女足",
  };
  if (chineseShort[raw]) return chineseShort[raw];
  if (/[\u3400-\u9fff]/.test(raw)) return raw;

  const key = raw.toUpperCase();
  const codeNames = {
    EPL: "英超",
    EPLW: "英女超",
    WSL: "英女超",
    ED1: "英冠",
    ED2: "英甲",
    ED3: "英乙",
    GSL: "德甲",
    GSLW: "德女甲",
    DEW: "德女甲",
    DE1: "德甲",
    DFL: "荷甲",
    DFLW: "荷女甲",
    NLW: "荷女甲",
    NL1: "荷甲",
    DF2: "荷乙",
    NL2: "荷乙",
    SFL: "西甲",
    SF2: "西乙",
    SFLW: "西女甲",
    ESW: "西女甲",
    ISA: "意甲",
    ISAW: "意女甲",
    FFL: "法甲",
    FF2: "法乙",
    PFL: "葡超",
    BFL: "比甲",
    SPL: "蘇超",
    SALW: "瑞女超",
    SPLW: "蘇女超",
    MXL: "墨超",
    MXLW: "墨女超",
    MLS: "美職",
    MLSW: "美女職",
    JD2: "日乙",
    KD1: "韓職",
    KD1W: "韓女聯",
    BD1: "巴甲",
    BD2: "巴乙",
    BD1W: "巴女甲",
    APL: "阿甲",
    APLW: "阿女甲",
    UD1: "烏甲",
    UCL: "歐聯",
    UEL: "歐霸",
    UEC: "歐協聯",
    UCLW: "女歐聯",
    UECW: "女歐霸",
    ENL: "歐國聯",
    E2Q: "歐U21外",
    GUC: "海灣盃",
    INT: "國際賽",
    AMF: "亞運男足",
    AWF: "亞運女足",
    UWW: "女世青盃",
    AEC: "東盟盃",
    ANQ: "非洲盃外",
    CNL: "中北國聯",
    ELT: "英錦賽",
    JEC: "日皇盃",
    UDC: "烏拉圭盃",
    CNY: "賀歲盃",
    AC2: "亞冠2",
    AGC: "阿根廷盃",
    AT1: "奧甲",
    AUC: "阿聯盃",
    AVC: "澳洲盃",
    CHC: "智利盃",
    DK1: "丹超",
    ELC: "英聯盃",
    ELCW: "英女聯盃",
    FVL: "芬超",
    GD2: "德乙",
    JD1: "日職",
    JLCW: "女日聯盃",
    KD2: "韓K2",
    LBC: "自由盃",
    MD1: "墨甲",
    MLC: "北美聯賽盃",
    NTL: "挪超",
    NTLW: "挪女超",
    QSC: "卡星盃",
    RFCW: "俄女盃",
    RPL: "俄超",
    SAC: "沙特盃",
    SAL: "瑞典超",
    SU1: "瑞士超",
    TL1: "土超",
    ULP: "烏拉圭聯",
    UPP: "烏拉圭盃",
    USL: "美冠聯",
  };
  if (codeNames[key]) return codeNames[key];

  // Internal tournament identifiers are useful for matching but not for users.
  if (/^[A-Z0-9]{2,8}$/.test(key)) return "其他賽事";
  return "其他賽事";
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
