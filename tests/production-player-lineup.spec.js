import { test, expect } from "@playwright/test";

const BASE_URL = process.env.FAST_TRACKER_PRODUCTION_URL || "https://fast-tracker-public-production.up.railway.app";

const devices = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "tablet", width: 1024, height: 1366 },
  { name: "mobile", width: 390, height: 844 },
];

for (const device of devices) {
  test(`production confirmed XI + player stats · ${device.name}`, async ({ page }) => {
    await page.setViewportSize({ width: device.width, height: device.height });
    await page.goto(`${BASE_URL}/details?id=FB6373`, { waitUntil: "domcontentloaded", timeout: 45000 });

    const module = page.getByRole("region", { name: "Professional lineup module" });
    await expect(module).toBeVisible({ timeout: 20000 });
    await expect(module.getByText("CONFIRMED 11v11", { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(module.getByText(/11\/11 home · 11\/11 away/).first()).toBeVisible({ timeout: 15000 });

    await module.getByRole("button", { name: "Squad", exact: true }).click();
    await expect(module.getByText("Alexis Sabella", { exact: true }).first()).toBeVisible();

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
    await page.goto(`${BASE_URL}/details?id=FB6402`, { waitUntil: "domcontentloaded", timeout: 45000 });

    const module = page.getByRole("region", { name: "Professional lineup module" });
    await expect(module).toBeVisible({ timeout: 20000 });
    await expect(module.getByText("PREDICTED 11v11", { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(module.getByText(/11\/11 home · 11\/11 away/).first()).toBeVisible();

    await module.getByRole("button", { name: "Squad", exact: true }).click();
    await expect(module.getByText("Santiago Giménez", { exact: true }).first()).toBeVisible();

    await module.getByRole("button", { name: "Match stats", exact: true }).click();
    await expect(module.getByText("Match player stats not available yet", { exact: true })).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: `test-results/production-predicted-${device.name}.png`,
      fullPage: true,
    });
  });
}
