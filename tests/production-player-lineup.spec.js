import { test, expect } from "@playwright/test";

const BASE_URL = process.env.FAST_TRACKER_PRODUCTION_URL || "https://fast-tracker-public-production.up.railway.app";

const DETAIL_API_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-match-detail";
const PHASE1_API_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-phase1-feed";

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
    const confirmedStarters = starters.filter((row) => row?.confirmed === true || row?.fact_status === "CONFIRMED");
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
  const response = await request.get(`${DETAIL_API_URL}?id=FB6355`, { timeout: 45000 });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const rows = body?.marketIntelligence?.value || [];
  expect(rows).toHaveLength(3);

  const home = rows.find((row) => row?.selection_key === "HOME");
  expect(home).toBeTruthy();
  expect(home.status).toBe("MODEL_VALIDATION_GAP");
  expect(home.details?.calculation_version).toBe("PHASE4_HDA_VALUE_V3");
  expect(home.details?.quote_lineage?.canonical_match_id).toBe("FB6355");
  expect(home.details?.quote_lineage?.compatibility_verified).toBe(true);
  expect(home.details?.quote_lineage?.source_ts).toBeTruthy();
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
  await expect(row.getByText("BET365 HDA", { exact: true })).toBeVisible();
  if (!pricedMatch) {
    const oddsText = await row.locator(".ft-market-odds").innerText();
    expect(oddsText).not.toMatch(/\b[HDA]\s+\d+\.\d+/);
  }
});

const devices = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "tablet", width: 1024, height: 1366 },
  { name: "mobile", width: 390, height: 844 },
];

for (const device of devices) {
  test(`production HDA validation gap renders · ${device.name}`, async ({ page }) => {
    await page.setViewportSize({ width: device.width, height: device.height });
    await page.goto(`${BASE_URL}/details?id=FB6355`, { waitUntil: "domcontentloaded", timeout: 45000 });

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
