import { test, expect } from "@playwright/test";

const BASE_URL = process.env.FAST_TRACKER_PRODUCTION_URL || "https://fast-tracker-public-production.up.railway.app";

const DETAIL_API_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-match-detail";
const PHASE1_API_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-phase1-feed";
const LIVE_API_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-live-feed";
const HDA_TRACE_MATCH_ID = process.env.HDA_TRACE_MATCH_ID || "FB6342";

async function ensureVisibleAfterReloads(page, locatorFactory, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const locator = locatorFactory();
    if (await locator.isVisible().catch(() => false)) return locator;
    if (attempt < attempts - 1) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
    }
  }
  const locator = locatorFactory();
  await expect(locator).toBeVisible({ timeout: 15000 });
  return locator;
}

async function findPredictedControl(request) {
  const feedResponse = await request.get(`${PHASE1_API_URL}?hours=48&view=summary`, { timeout: 45000 });
  expect(feedResponse.ok()).toBeTruthy();
  const feed = await feedResponse.json();
  const candidates = (Array.isArray(feed?.matches) ? feed.matches : [])
    .filter((row) => {
      const kickoff = Date.parse(row?.kickoff || "");
      return row?.id && Number.isFinite(kickoff) && kickoff - Date.now() > 2 * 60 * 60 * 1000;
    })
    .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff))
    .slice(0, 16);

  for (const candidate of candidates) {
    const response = await request.get(`${DETAIL_API_URL}?id=${encodeURIComponent(candidate.id)}`, { timeout: 45000 });
    if (!response.ok()) continue;
    const body = await response.json();
    const lineup = Array.isArray(body?.humanFactors?.lineup) ? body.humanFactors.lineup : [];
    const starters = lineup.filter((row) => row?.starter === true);
    const confirmedStarters = starters.filter((row) => row?.fact_status === "CONFIRMED");
  const sourceConfirmedStarters = starters.filter((row) => row?.confirmed === true);
    const playerMatchStats = Array.isArray(body?.humanFactors?.playerMatchStats) ? body.humanFactors.playerMatchStats : [];
    if (starters.length !== 22 || confirmedStarters.length !== 0 || playerMatchStats.length !== 0) continue;
    const samplePlayer = starters.find((row) => row?.canonical_player_name || row?.player_name);
    if (!samplePlayer) continue;
    return {
      id: candidate.id,
      body,
      samplePlayerName: samplePlayer.canonical_player_name || samplePlayer.player_name,
    };
  }
  return null;
}

async function findMissingLineupControl(request) {
  const feedResponse = await request.get(`${PHASE1_API_URL}?hours=48&view=summary`, { timeout: 45000 });
  expect(feedResponse.ok()).toBeTruthy();
  const feed = await feedResponse.json();
  const candidates = (Array.isArray(feed?.matches) ? feed.matches : [])
    .filter((row) => {
      const kickoff = Date.parse(row?.kickoff || "");
      return row?.id && Number.isFinite(kickoff) && kickoff - Date.now() > 2 * 60 * 60 * 1000;
    })
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))
    .slice(0, 24);

  for (const candidate of candidates) {
    const response = await request.get(`${DETAIL_API_URL}?id=${encodeURIComponent(candidate.id)}`, { timeout: 45000 });
    if (!response.ok()) continue;
    const body = await response.json();
    const lineup = Array.isArray(body?.humanFactors?.lineup) ? body.humanFactors.lineup : [];
    const playerMatchStats = Array.isArray(body?.humanFactors?.playerMatchStats) ? body.humanFactors.playerMatchStats : [];
    if (lineup.length !== 0 || playerMatchStats.length !== 0) continue;
    return { id: candidate.id, candidate, body };
  }
  return null;
}

async function findFreshHdaControl(request) {
  const response = await request.get(`${DETAIL_API_URL}?id=${encodeURIComponent(HDA_TRACE_MATCH_ID)}`, { timeout: 45000 });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const rows = (Array.isArray(body?.marketIntelligence?.value) ? body.marketIntelligence.value : [])
    .filter((row) =>
      row?.provider_id === "BET365" &&
      row?.market_key === "HAD_1X2" &&
      row?.period_key === "FULL_TIME" &&
      ["HOME", "DRAW", "AWAY"].includes(row?.selection_key)
    );
  if (rows.length !== 3) return null;
  if (!rows.every((row) => row?.status === "MODEL_VALIDATION_GAP")) return null;
  const fixture = body?.fixture || {};
  return {
    id: HDA_TRACE_MATCH_ID,
    candidate: {
      id: HDA_TRACE_MATCH_ID,
      home: fixture?.home_en,
      away: fixture?.away_en,
      odds: {
        home: rows.find((row) => row.selection_key === "HOME")?.odds_decimal,
        draw: rows.find((row) => row.selection_key === "DRAW")?.odds_decimal,
        away: rows.find((row) => row.selection_key === "AWAY")?.odds_decimal,
      },
    },
    body,
    rows,
  };
}

test("production exact Flashscore player identity remains fail-closed", async ({ request }) => {
  const response = await request.get(`${DETAIL_API_URL}?id=FB6287`, { timeout: 45000 });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const lineup = body?.humanFactors?.lineup || [];

  const mapped = lineup.find((row) =>
    row?.player_key === "j7xVIm1h" ||
    row?.canonical_player_key === "1646522" ||
    row?.canonical_player_name === "Puso Dithejane"
  );
  expect(mapped).toBeTruthy();
  expect(mapped.identity_status).toBe("CANONICAL");
  expect(mapped.canonical_player_key).toBe("1646522");
  expect(mapped.canonical_player_name).toBe("Puso Dithejane");
  expect(mapped.canonical_identity_method).toBe("EXACT_FLASHSCORE_PLAYER_ID");

  const unresolved = lineup.filter((row) => row?.identity_status === "UNRESOLVED");
  expect(unresolved.length).toBeGreaterThan(0);
});

test("production HDA value API exposes validation gap and capture lineage", async ({ request }) => {
  const control = await findFreshHdaControl(request);
  expect(control).toBeTruthy();
  const rows = control.rows;
  expect(rows).toHaveLength(3);

  const bySelection = new Map(rows.map((row) => [row.selection_key, row]));
  const home = bySelection.get("HOME");
  const draw = bySelection.get("DRAW");
  const away = bySelection.get("AWAY");
  expect(home).toBeTruthy();
  expect(draw).toBeTruthy();
  expect(away).toBeTruthy();

  expect(Number(home.odds_decimal)).toBeCloseTo(Number(control.candidate.odds.home), 5);
  expect(Number(draw.odds_decimal)).toBeCloseTo(Number(control.candidate.odds.draw), 5);
  expect(Number(away.odds_decimal)).toBeCloseTo(Number(control.candidate.odds.away), 5);

  expect(home.status).toBe("MODEL_VALIDATION_GAP");
  expect(home.details?.calculation_version).toBe("PHASE4_HDA_VALUE_V3");
  expect(home.details?.quote_lineage?.canonical_match_id).toBe(control.id);
  expect(home.details?.quote_lineage?.compatibility_verified).toBe(true);
  expect(home.details?.quote_lineage?.source_ts).toBeTruthy();
  expect(home.details?.quote_lineage?.provider_id).toBe("BET365");
  expect(home.details?.model_lineage?.consensus_version).toBe("PHASE4_HDA_CONSENSUS_V4");
  expect(home.details?.model_lineage?.evaluation_evidence?.dixon_coles?.settled_matches).toBe(27);
  expect(home.details?.model_lineage?.evaluation_evidence?.pi?.settled_matches).toBe(27);
  expect(home.details?.model_lineage?.evaluation_evidence?.internal_blend?.settled_matches).toBe(27);
  expect(home.details?.model_lineage?.evaluation_evidence?.internal_blend?.training_cutoff_verified).toBe(false);
  expect(home.details?.release_validation_status).toBe("TRAINING_CUTOFF_UNVERIFIED");
  expect(Number(home.details?.fair_odds_decimal)).toBeGreaterThan(1);
  expect(Number.isFinite(Number(home.probability_edge_pct))).toBe(true);
});

test("production scheduled Bet365 ingest reaches Phase 1 API and rendered homepage", async ({ page, request }) => {
  const response = await request.get(`${PHASE1_API_URL}?hours=24&view=summary`, { timeout: 45000 });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();

  expect(body?.source).toBe("canonical-fixtures-flashscore-bet365");
  expect(body?.systemHealth?.FLASHSCORE_BET365?.status).toBe("OK");
  const observedAt = Date.parse(body?.systemHealth?.FLASHSCORE_BET365?.observedAt || "");
  expect(Number.isFinite(observedAt)).toBe(true);
  expect(Date.now() - observedAt).toBeLessThan(25 * 60 * 1000);

  const matches = Array.isArray(body?.matches) ? body.matches : [];
  const pricedMatch = matches.find((row) =>
    row?.id &&
    row?.odds?.home != null &&
    row?.odds?.draw != null &&
    row?.odds?.away != null &&
    row?.health?.authorityFreshness === "FRESH"
  );
  const renderMatch = pricedMatch || matches.find((row) => row?.id);
  expect(renderMatch).toBeTruthy();
  // Production must fail acceptance when the All-in-One table has no
  // publishable Flashscore HDA; a green CI with blank odds is not success.
  expect(pricedMatch, "Fresh verified Flashscore odds are required for live table acceptance").toBeTruthy();

  if (pricedMatch) {
    expect(pricedMatch.health?.unifiedCoverageStatus).toBe("FLASHSCORE_BET365");
    expect(pricedMatch.health?.missingCanonical1x2).toBe(false);
    expect(pricedMatch.health?.authorityFetchedAt).toBeTruthy();
  } else {
    // A healthy scheduled ingest can briefly have zero publishable future HDA rows
    // while the current captured slate crosses kickoff. The public contract must
    // fail closed rather than reuse stale prices or synthesize odds.
    expect(matches.every((row) =>
      row?.odds?.home == null ||
      row?.odds?.draw == null ||
      row?.odds?.away == null ||
      row?.health?.authorityFreshness !== "FRESH"
    )).toBe(true);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  const allMatches = page.getByRole("button", { name: "All matches", exact: true });
  if (await allMatches.isVisible().catch(() => false)) await allMatches.click();
  const encodedMatchId = encodeURIComponent(renderMatch.id);
  const row = page.locator(`a[href*="${encodedMatchId}"]:visible`).first();
  await expect(row).toBeVisible({ timeout: 20000 });
  await expect(row.getByText(renderMatch.home, { exact: true })).toBeVisible();
  await expect(row.getByText(renderMatch.away, { exact: true })).toBeVisible();
  const marketCells = row.locator(".ft-market-odds > div > span");
  await expect(row.locator(".ft-market-odds small")).toContainText("Flashscore");
  await expect(row.locator(".ft-market-odds small")).toContainText("Bet365 HDA");
  await expect(marketCells).toHaveCount(3);
  for (const [index, key, label] of [[0, "home", "H"], [1, "draw", "D"], [2, "away", "A"]]) {
    await expect(marketCells.nth(index)).toContainText(label);
    await expect(marketCells.nth(index)).toContainText(Number(pricedMatch.odds[key]).toFixed(2));
  }
  await page.screenshot({ path: "test-results/production-all-in-one-flashscore-hda.png", fullPage: true });
});


test("production scheduled live score provenance reaches public rendering", async ({ page, request }) => {
  const response = await request.get(LIVE_API_URL, { timeout: 45000 });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const matches = Array.isArray(body?.matches) ? body.matches : [];
  expect(Number(body?.count ?? matches.length)).toBe(matches.length);
  expect(Array.isArray(body?.liveIds) ? body.liveIds.length : 0).toBe(matches.length);

  if (!matches.length) {
    // A zero-live period is valid; the API must report it explicitly rather than
    // promoting stale score rows.
    expect(body?.liveIds || []).toHaveLength(0);
    return;
  }

  const liveMatch = matches.find((row) => row?.id && row?.live?.score?.capturedAt && row?.live?.score?.source);
  expect(liveMatch).toBeTruthy();
  const score = liveMatch.live.score;
  const capturedAt = Date.parse(score.capturedAt);
  expect(Number.isFinite(capturedAt)).toBe(true);
  expect(Date.now() - capturedAt).toBeLessThan(6 * 60 * 1000);
  expect(score.sourceMatchId).toBeTruthy();
  expect(Number(score.confidence)).toBeGreaterThanOrEqual(0.75);

  if (liveMatch.live?.stats) {
    const statsCapturedAt = Date.parse(liveMatch.live.stats.capturedAt || "");
    expect(Number.isFinite(statsCapturedAt)).toBe(true);
    expect(Date.now() - statsCapturedAt).toBeLessThan(21 * 60 * 1000);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  const allMatches = page.getByRole("button", { name: "All matches", exact: true });
  if (await allMatches.isVisible().catch(() => false)) await allMatches.click();
  const encodedMatchId = encodeURIComponent(liveMatch.id);
  const row = page.locator(`a[href*="${encodedMatchId}"]:visible`).first();
  await expect(row).toBeVisible({ timeout: 20000 });
  await expect(row.locator(".ft-live-tag")).toBeVisible({ timeout: 10000 });
  if (Number.isFinite(Number(score.home)) && Number.isFinite(Number(score.away))) {
    const scorePattern = new RegExp("^" + Number(score.home) + "\\s*-\\s*" + Number(score.away) + "$");
    await expect(row.getByText(scorePattern)).toBeVisible();
  }
});

const devices = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "tablet", width: 1024, height: 1366 },
  { name: "mobile", width: 390, height: 844 },
];

for (const device of devices) {
  test(`production HDA validation gap renders · ${device.name}`, async ({ page, request }) => {
    const control = await findFreshHdaControl(request);
    expect(control).toBeTruthy();

    await page.setViewportSize({ width: device.width, height: device.height });
    await page.goto(`${BASE_URL}/details?id=${encodeURIComponent(control.id)}`, { waitUntil: "domcontentloaded", timeout: 45000 });

    const board = page.locator(".phase4-board");
    if (!(await board.isVisible().catch(() => false))) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
    }
    await expect(board).toBeVisible({ timeout: 20000 });
    await expect(board.getByText("NOT ESTABLISHED", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(board.getByText("WATCH · MODEL VALIDATION GAP", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/PHASE4_HDA_VALUE_V3/).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Predictive release validation is not established/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Evaluation PHASE4_HDA_EVAL_V1: 27 settled internal-blend matches/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Training cutoff UNVERIFIED EXTERNAL MODEL BUILD/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(control.candidate.home, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(control.candidate.away, { exact: true }).first()).toBeVisible();

    await page.screenshot({
      path: `test-results/production-hda-validation-${device.name}.png`,
      fullPage: true,
    });
  });
}

for (const device of devices) {
  test(`production confirmed XI + player stats · ${device.name}`, async ({ page }) => {
    await page.setViewportSize({ width: device.width, height: device.height });
    await page.goto(`${BASE_URL}/details?id=FB6317`, { waitUntil: "domcontentloaded", timeout: 45000 });

    const module = page.getByRole("region", { name: "Professional lineup module" });
    await expect(module).toBeVisible({ timeout: 20000 });
    const confirmedLabel = await ensureVisibleAfterReloads(
      page,
      () => page.getByRole("region", { name: "Professional lineup module" }).getByText("CONFIRMED 11v11", { exact: true }).first()
    );
    await expect(module.getByText(/11\/11 home · 11\/11 away/).first()).toBeVisible({ timeout: 15000 });

    await module.getByRole("button", { name: "Squad", exact: true }).click();
    await expect(module.getByText("Kang-In Lee", { exact: true }).first()).toBeVisible();

    // Real FB6317 contains distinct near-name players and must not collapse them.
    await expect(module.getByText("Tae-Hyun Kim", { exact: true }).first()).toBeVisible();
    await expect(module.getByText("Tae-Hyeon Kim", { exact: true }).first()).toBeVisible();

    await module.getByRole("button", { name: "Match stats", exact: true }).click();
    await expect(module.getByText("Top performers", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(module.getByText(/exact player match stats/i)).toBeVisible();

    await page.screenshot({
      path: `test-results/production-confirmed-${device.name}.png`,
      fullPage: true,
    });
  });

  test(`production missing future lineup remains unknown · ${device.name}`, async ({ page, request }) => {
    const missingControl = await findMissingLineupControl(request);
    expect(missingControl).toBeTruthy();
    const detailBody = missingControl.body;
    expect(Array.isArray(detailBody?.humanFactors?.lineup) ? detailBody.humanFactors.lineup : []).toHaveLength(0);
    expect(Array.isArray(detailBody?.humanFactors?.playerMatchStats) ? detailBody.humanFactors.playerMatchStats : []).toHaveLength(0);

    await page.setViewportSize({ width: device.width, height: device.height });
    await page.goto(`${BASE_URL}/details?id=${encodeURIComponent(missingControl.id)}`, { waitUntil: "domcontentloaded", timeout: 45000 });

    const module = page.getByRole("region", { name: "Professional lineup module" });
    await expect(module).toBeVisible({ timeout: 20000 });
    await expect(module.getByText("Waiting for reliable 11v11 lineups", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(module.getByText(/—\/11 home · —\/11 away · lineup pending/).first()).toBeVisible({ timeout: 15000 });
    await expect(module.getByText("PREDICTED 11v11", { exact: true })).toHaveCount(0);
    await expect(module.getByText("CONFIRMED 11v11", { exact: true })).toHaveCount(0);

    await page.screenshot({
      path: `test-results/production-lineup-pending-${device.name}.png`,
      fullPage: true,
    });
  });

  test(`production predicted XI keeps match stats unknown · ${device.name}`, async ({ page, request }) => {
    const predictedControl = await findPredictedControl(request);
    expect(predictedControl).toBeTruthy();
    const detailBody = predictedControl.body;
    const storedLineup = Array.isArray(detailBody?.humanFactors?.lineup) ? detailBody.humanFactors.lineup : [];
    const starters = storedLineup.filter((row) => row?.starter === true);
    const confirmedStarters = starters.filter((row) => row?.confirmed === true || row?.fact_status === "CONFIRMED");
    expect(starters).toHaveLength(22);
    expect(confirmedStarters).toHaveLength(0);
    expect(Array.isArray(detailBody?.humanFactors?.playerMatchStats) ? detailBody.humanFactors.playerMatchStats : []).toHaveLength(0);
    const samplePlayerName = predictedControl.samplePlayerName;

    await page.setViewportSize({ width: device.width, height: device.height });
    await page.goto(`${BASE_URL}/details?id=${encodeURIComponent(predictedControl.id)}`, { waitUntil: "domcontentloaded", timeout: 45000 });

    const module = page.getByRole("region", { name: "Professional lineup module" });
    await expect(module).toBeVisible({ timeout: 20000 });
    await ensureVisibleAfterReloads(
      page,
      () => page.getByRole("region", { name: "Professional lineup module" }).getByText("PREDICTED 11v11", { exact: true }).first()
    );
    await expect(module.getByText(/11\/11 home · 11\/11 away/).first()).toBeVisible();

    await module.getByRole("button", { name: "Squad", exact: true }).click();
    await expect(module.getByText(samplePlayerName, { exact: true }).first()).toBeVisible();

    await module.getByRole("button", { name: "Match stats", exact: true }).click();
    await expect(module.getByText("Match player stats not available yet", { exact: true })).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: `test-results/production-predicted-${device.name}.png`,
      fullPage: true,
    });
  });
}


const FT014_AUDIT_FIXTURES = [
  { id: "FB6350", window: "recent", home: "Palmeiras", away: "Bahia", expectedLineup: "SOURCE_CONFIRMED_UNRESOLVED" },
  { id: "FB6352", window: "recent", home: "Fluminense", away: "Coritiba", expectedLineup: "SOURCE_CONFIRMED_UNRESOLVED" },
  { id: "FB6351", window: "recent", home: "Santos", away: "Flamengo", expectedLineup: "CONFIRMED" },
  { id: "FS:0CAcmHeT", window: "upcoming", home: "Cheongju FC", away: "Seongnam", expectedLineup: "UNKNOWN" },
  { id: "FB6342", window: "upcoming", home: "Arsenal", away: "Leeds", expectedLineup: "UNKNOWN" },
  { id: "FS:U5MTgNEi", window: "upcoming", home: "Al Kholood", away: "Al Qadsiah", expectedLineup: "UNKNOWN" },
];

function publicLineupSummary(body) {
  const lineup = Array.isArray(body?.humanFactors?.lineup) ? body.humanFactors.lineup : [];
  const starters = lineup.filter((row) => row?.starter === true);
  const confirmedStarters = starters.filter((row) => row?.fact_status === "CONFIRMED");
  const sourceConfirmedStarters = starters.filter((row) => row?.confirmed === true);
  const unresolvedConfirmed = starters.filter((row) => row?.fact_status === "SOURCE_CONFIRMED_IDENTITY_UNRESOLVED");
  const stats = Array.isArray(body?.humanFactors?.playerMatchStats) ? body.humanFactors.playerMatchStats : [];
  const starterKeys = starters.map((row) => [
    row?.team_side || "",
    row?.canonical_player_key || row?.player_key || "",
  ].join(":"));
  const sources = [...new Set(lineup.map((row) => row?.source_name).filter(Boolean))].sort();
  const freshness = lineup.map((row) => row?.source_updated_at).filter(Boolean).sort().at(-1) || null;
  return {
    lineup,
    starters,
    confirmedStarters,
    sourceConfirmedStarters,
    unresolvedConfirmed,
    stats,
    starterKeys,
    sources,
    freshness,
  };
}

for (const fixture of FT014_AUDIT_FIXTURES) {
  for (const device of devices) {
    test(`FT014 fixture audit · ${fixture.window} · ${fixture.id} · ${device.name}`, async ({ page, request }) => {
      const response = await request.get(`${DETAIL_API_URL}?id=${encodeURIComponent(fixture.id)}`, { timeout: 45000 });
      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      expect(body?.fixture?.match_id).toBe(fixture.id);
      expect(body?.fixture?.home_en).toBe(fixture.home);
      expect(body?.fixture?.away_en).toBe(fixture.away);

      const summary = publicLineupSummary(body);
      expect(new Set(summary.starterKeys).size).toBe(summary.starterKeys.length);

      if (fixture.expectedLineup === "CONFIRMED") {
        expect(summary.starters).toHaveLength(22);
        expect(summary.confirmedStarters).toHaveLength(22);
        expect(summary.unresolvedConfirmed).toHaveLength(0);
        for (const row of summary.starters) {
          expect(row?.canonical_player_key).toBeTruthy();
          expect(row?.canonical_player_name).toBeTruthy();
        }
      } else if (fixture.expectedLineup === "SOURCE_CONFIRMED_UNRESOLVED") {
        expect(summary.starters).toHaveLength(22);
        expect(summary.confirmedStarters).toHaveLength(0);
        expect(summary.unresolvedConfirmed).toHaveLength(22);
        expect(summary.sourceConfirmedStarters).toHaveLength(22);
        expect(summary.starters.filter((row) => row?.canonical_player_key)).toHaveLength(0);
      } else {
        expect(summary.lineup).toHaveLength(0);
        expect(summary.stats).toHaveLength(0);
      }

      if (device.name === "desktop") {
        console.log("FT014_AUDIT_EVIDENCE", JSON.stringify({
          id: fixture.id,
          window: fixture.window,
          fixture: {
            match_id: body?.fixture?.match_id,
            home_en: body?.fixture?.home_en,
            away_en: body?.fixture?.away_en,
            kickoff_hkt: body?.fixture?.kickoff_hkt,
            tournament: body?.fixture?.tournament,
          },
          public_api: {
            lineup_rows: summary.lineup.length,
            starter_rows: summary.starters.length,
            canonical_confirmed_starters: summary.confirmedStarters.length,
            source_confirmed_starters: summary.sourceConfirmedStarters.length,
            unresolved_confirmed_starters: summary.unresolvedConfirmed.length,
            player_match_stats: summary.stats.length,
            lineup_sources: summary.sources,
            latest_lineup_source_updated_at: summary.freshness,
            starter_duplicate_count: summary.starterKeys.length - new Set(summary.starterKeys).size,
          },
          source_match_detail: body?.sourceMatchDetail ? {
            source_key: body.sourceMatchDetail?.source_key,
            external_event_id: body.sourceMatchDetail?.external_event_id,
            detail_fetched_at: body.sourceMatchDetail?.detail_fetched_at,
          } : null,
        }));
      }

      await page.setViewportSize({ width: device.width, height: device.height });
      await page.goto(`${BASE_URL}/details?id=${encodeURIComponent(fixture.id)}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      const module = page.getByRole("region", { name: "Professional lineup module" });
      await expect(module).toBeVisible({ timeout: 20000 });

      if (fixture.expectedLineup === "CONFIRMED") {
        await ensureVisibleAfterReloads(
          page,
          () => page.getByRole("region", { name: "Professional lineup module" }).getByText("CONFIRMED 11v11", { exact: true }).first()
        );
        await expect(module.getByText(/11\/11 home · 11\/11 away/).first()).toBeVisible({ timeout: 15000 });
        await module.getByRole("button", { name: "Match stats", exact: true }).click();
        if (summary.stats.length > 0) {
          await expect(module.getByText("Top performers", { exact: true })).toBeVisible({ timeout: 15000 });
        } else {
          await expect(module.getByText("Match player stats not available yet", { exact: true })).toBeVisible({ timeout: 15000 });
        }
      } else if (fixture.expectedLineup === "SOURCE_CONFIRMED_UNRESOLVED") {
        await ensureVisibleAfterReloads(
          page,
          () => page.getByRole("region", { name: "Professional lineup module" }).getByText("Source starting XI exists, but starter identity is unresolved", { exact: true })
        );
        await expect(module.getByText(/source-confirmed row\(s\) await identity/).first()).toBeVisible({ timeout: 15000 });
        await expect(module.getByText("PREDICTED 11v11", { exact: true })).toHaveCount(0);
        await expect(module.getByText("CONFIRMED 11v11", { exact: true })).toHaveCount(0);
      } else {
        await ensureVisibleAfterReloads(
          page,
          () => page.getByRole("region", { name: "Professional lineup module" }).getByText("Waiting for reliable 11v11 lineups", { exact: true })
        );
        await expect(module.getByText(/—\/11 home · —\/11 away · lineup pending/).first()).toBeVisible({ timeout: 15000 });
        await expect(module.getByText("PREDICTED 11v11", { exact: true })).toHaveCount(0);
        await expect(module.getByText("CONFIRMED 11v11", { exact: true })).toHaveCount(0);
      }

      await page.screenshot({
        path: `test-results/ft014-${fixture.window}-${fixture.id.replace(/[^a-z0-9]+/gi, "-")}-${device.name}.png`,
        fullPage: true,
      });
    });
  }
}
