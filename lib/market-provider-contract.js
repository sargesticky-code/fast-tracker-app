export const PROVIDER_KIND = Object.freeze({
  BOOKMAKER: "BOOKMAKER",
  MARKET_AGGREGATOR: "MARKET_AGGREGATOR",
  PREDICTION_PROVIDER: "PREDICTION_PROVIDER",
  STRENGTH_PROVIDER: "STRENGTH_PROVIDER",
  RESULTS_PROVIDER: "RESULTS_PROVIDER",
  STATS_PROVIDER: "STATS_PROVIDER",
  INTERNAL_MODEL: "INTERNAL_MODEL",
});

export const MARKET = Object.freeze({
  HDA: "HDA",
  ASIAN_HANDICAP: "ASIAN_HANDICAP",
  GOALS: "GOALS",
  BTTS: "BTTS",
  CORNERS: "CORNERS",
});

export const PROVIDERS = Object.freeze({
  HKJC: {
    key: "HKJC",
    label: "Hong Kong Jockey Club",
    kind: PROVIDER_KIND.BOOKMAKER,
    bookmaker: true,
    identityAuthority: true,
    priceAuthority: true,
    markets: [MARKET.HDA, MARKET.ASIAN_HANDICAP, MARKET.GOALS, MARKET.CORNERS],
  },
  BET365: {
    key: "BET365",
    label: "Bet365",
    kind: PROVIDER_KIND.BOOKMAKER,
    bookmaker: true,
    identityAuthority: false,
    priceAuthority: false,
    markets: [MARKET.HDA],
  },
  ODDSMATH: {
    key: "ODDSMATH",
    label: "OddsMath",
    kind: PROVIDER_KIND.MARKET_AGGREGATOR,
    bookmaker: false,
    identityAuthority: false,
    priceAuthority: false,
    markets: [MARKET.HDA],
  },
  FOREBET: {
    key: "FOREBET",
    label: "Forebet",
    kind: PROVIDER_KIND.PREDICTION_PROVIDER,
    bookmaker: false,
    markets: [MARKET.HDA, MARKET.GOALS, MARKET.CORNERS],
  },
  OPTA_POWER: {
    key: "OPTA_POWER",
    label: "Opta Power Rankings",
    kind: PROVIDER_KIND.STRENGTH_PROVIDER,
    bookmaker: false,
    markets: [],
  },
  DIXON_COLES: {
    key: "DIXON_COLES",
    label: "Dixon-Coles",
    kind: PROVIDER_KIND.INTERNAL_MODEL,
    bookmaker: false,
    markets: [MARKET.HDA, MARKET.GOALS, MARKET.ASIAN_HANDICAP],
  },
  PI_RATING: {
    key: "PI_RATING",
    label: "Pi Rating",
    kind: PROVIDER_KIND.INTERNAL_MODEL,
    bookmaker: false,
    markets: [MARKET.HDA, MARKET.ASIAN_HANDICAP],
  },
  TEAM_FORM: {
    key: "TEAM_FORM",
    label: "Team Form",
    kind: PROVIDER_KIND.INTERNAL_MODEL,
    bookmaker: false,
    markets: [MARKET.HDA, MARKET.GOALS],
  },
  FOTMOB: {
    key: "FOTMOB",
    label: "FotMob",
    kind: PROVIDER_KIND.STATS_PROVIDER,
    bookmaker: false,
    markets: [],
  },
  SOFASCORE: {
    key: "SOFASCORE",
    label: "SofaScore",
    kind: PROVIDER_KIND.STATS_PROVIDER,
    bookmaker: false,
    markets: [],
  },
  APWIN: {
    key: "APWIN",
    label: "APWin",
    kind: PROVIDER_KIND.PREDICTION_PROVIDER,
    bookmaker: false,
    markets: [MARKET.HDA],
  },
  ACC: {
    key: "ACC",
    label: "Accumulator Generator",
    kind: PROVIDER_KIND.PREDICTION_PROVIDER,
    bookmaker: false,
    markets: [MARKET.HDA],
  },
  BCL: {
    key: "BCL",
    label: "BetClan",
    kind: PROVIDER_KIND.PREDICTION_PROVIDER,
    bookmaker: false,
    markets: [MARKET.HDA],
  },
  FST: {
    key: "FST",
    label: "FootballSuperTips",
    kind: PROVIDER_KIND.PREDICTION_PROVIDER,
    bookmaker: false,
    markets: [MARKET.HDA],
  },
  PRE: {
    key: "PRE",
    label: "Prematips",
    kind: PROVIDER_KIND.PREDICTION_PROVIDER,
    bookmaker: false,
    markets: [MARKET.HDA],
  },
  STA: {
    key: "STA",
    label: "Statarea",
    kind: PROVIDER_KIND.PREDICTION_PROVIDER,
    bookmaker: false,
    markets: [MARKET.HDA],
  },
});

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function textOrNull(value) {
  const s = String(value ?? "").trim();
  return s || null;
}

export function normalizeMarketQuote(input = {}) {
  const providerKey = textOrNull(input.providerKey);
  const provider = providerKey ? PROVIDERS[providerKey] ?? null : null;
  return {
    canonicalMatchId: textOrNull(input.canonicalMatchId),
    providerKey,
    providerLabel: provider?.label ?? textOrNull(input.providerLabel),
    providerKind: provider?.kind ?? textOrNull(input.providerKind),
    bookmaker: Boolean(provider?.bookmaker),
    market: textOrNull(input.market),
    selection: textOrNull(input.selection),
    line: finiteOrNull(input.line),
    decimalPrice: finiteOrNull(input.decimalPrice),
    observedAt: textOrNull(input.observedAt),
    sourceRecordId: textOrNull(input.sourceRecordId),
    identityConfidence: finiteOrNull(input.identityConfidence),
    freshnessSeconds: finiteOrNull(input.freshnessSeconds),
    status: textOrNull(input.status) ?? "UNKNOWN",
  };
}

export function hkjcQuotesFromMatch(match) {
  const id = match?.id ?? match?.hkjc_event_id ?? null;
  const asOf =
    match?.oddsUpdatedAt ??
    match?.odds_updated_at ??
    match?.updatedAt ??
    match?.generatedAt ??
    null;

  const rows = [
    [MARKET.HDA, "H", null, match?.odds?.home],
    [MARKET.HDA, "D", null, match?.odds?.draw],
    [MARKET.HDA, "A", null, match?.odds?.away],
    [MARKET.GOALS, "OVER", match?.goals?.line, match?.goals?.over],
    [MARKET.GOALS, "UNDER", match?.goals?.line, match?.goals?.under],
    [MARKET.CORNERS, "OVER", match?.corners?.line, match?.corners?.over],
    [MARKET.CORNERS, "UNDER", match?.corners?.line, match?.corners?.under],
    [MARKET.ASIAN_HANDICAP, "HOME", match?.handicap?.line, match?.handicap?.home],
    [MARKET.ASIAN_HANDICAP, "AWAY", match?.handicap?.line, match?.handicap?.away],
  ];

  return rows
    .map(([market, selection, line, decimalPrice]) => normalizeMarketQuote({
      canonicalMatchId: id,
      providerKey: "HKJC",
      market,
      selection,
      line,
      decimalPrice,
      observedAt: asOf,
      status: decimalPrice == null ? "UNKNOWN" : "OBSERVED",
    }))
    .filter((quote) => quote.decimalPrice !== null);
}

export function compareBookmakerQuotes(quotes = []) {
  const usable = quotes
    .map(normalizeMarketQuote)
    .filter((q) =>
      q.bookmaker &&
      q.canonicalMatchId &&
      q.market &&
      q.selection &&
      q.decimalPrice !== null &&
      q.decimalPrice > 1
    );

  const bookmakers = [...new Set(usable.map((q) => q.providerKey).filter(Boolean))];
  const isMultiBookmaker = bookmakers.length >= 2;

  let best = null;
  if (isMultiBookmaker && usable.length) {
    best = usable.reduce((current, quote) =>
      current === null || quote.decimalPrice > current.decimalPrice ? quote : current
    , null);
  }

  return {
    quoteCount: usable.length,
    bookmakerCount: bookmakers.length,
    bookmakers,
    comparisonStatus: isMultiBookmaker ? "MULTI_BOOKMAKER_VERIFIED" : "SINGLE_BOOKMAKER_ONLY",
    bestAvailablePrice: best,
  };
}
