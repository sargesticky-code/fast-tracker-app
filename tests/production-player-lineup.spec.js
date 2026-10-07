import { test, expect } from "@playwright/test";

const BASE_URL = process.env.FAST_TRACKER_PRODUCTION_URL || "https://fast-tracker-public-production.up.railway.app";

const DETAIL_API_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-match-detail";

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
  expect(home.details?.release_validation_status).toBe("NOT_ESTABLISHED");
  expect(home.details?.quote_lineage?.canonical_match_id).toBe("FB6355");
  expect(home.details?.quote_lineage?.compatibility_verified).toBe(true);
  expect(home.details?.quote_lineage?.source_ts).toBeTruthy();
  expect(home.details?.model_lineage?.consensus_version).toBe("PHASE4_HDA_CONSENSUS_V3");
  expect(home.details?.model_lineage?.evaluation_evidence?.dixon_coles?.settled_matches).toBe(0);
  expect(home.details?.model_lineage?.evaluation_evidence?.pi?.settled_matches).toBe(0);
  expect(Number(home.details?.fair_odds_decimal)).toBeGreaterThan(1);
  expect(Number.isFinite(Number(home.probability_edge_pct))).toBe(true);
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
    await expect(board).toBeVisible({ timeout: 20000 });
    await expect(board.getByText("NOT ESTABLISHED", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(board.getByText("WATCH · MODEL VALIDATION GAP", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/PHASE4_HDA_VALUE_V3/).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Predictive release validation is not established/i).first()).toBeVisible({ timeout: 15000 });

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
    await expect(module.getByText("CONFIRMED 11v11", { exact: true }).first()).toBeVisible({ timeout: 15000 });
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

  test(`production predicted XI keeps match stats unknown · ${device.name}`, async ({ page }) => {
    await page.setViewportSize({ width: device.width, height: device.height });
    await page.goto(`${BASE_URL}/details?id=FS:EorMYH1s`, { waitUntil: "domcontentloaded", timeout: 45000 });

    const module = page.getByRole("region", { name: "Professional lineup module" });
    await expect(module).toBeVisible({ timeout: 20000 });
    const predictedLabel = module.getByText("PREDICTED 11v11", { exact: true }).first();
    if (!(await predictedLabel.isVisible().catch(() => false))) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
      await expect(module).toBeVisible({ timeout: 20000 });
    }
    await expect(predictedLabel).toBeVisible({ timeout: 15000 });
    await expect(module.getByText(/11\/11 home · 11\/11 away/).first()).toBeVisible();

    await module.getByRole("button", { name: "Squad", exact: true }).click();
    await expect(module.getByText("Everton Morelli", { exact: true }).first()).toBeVisible();

    await module.getByRole("button", { name: "Match stats", exact: true }).click();
    await expect(module.getByText("Match player stats not available yet", { exact: true })).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: `test-results/production-predicted-${device.name}.png`,
      fullPage: true,
    });
  });
}
