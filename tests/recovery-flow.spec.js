const { test, expect } = require("@playwright/test");

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function routeRecoveryApis(page, { feed = "outage", detailCase = "missing" } = {}) {
  await page.route("**/functions/v1/app-phase1-feed?**", route => {
    if (feed === "outage") {
      return json(route, {
        error: "feed_unavailable",
        message: "rpc_error:57014:canceling statement due to statement timeout"
      }, 503);
    }
    if (feed === "empty") {
      return json(route, {
        generatedAt: new Date().toISOString(),
        source: "RECOVERY_TEST_EMPTY",
        windowHours: 24,
        matches: [],
        systemHealth: {}
      });
    }
    return json(route, { generatedAt: new Date().toISOString(), matches: [] });
  });

  await page.route("**/functions/v1/app-live-feed**", route =>
    json(route, { generatedAt: new Date().toISOString(), matches: [] })
  );

  await page.route("**/functions/v1/app-match-detail?**", route => {
    const unresolvedLineup = [{
      id: 901,
      hkjc_event_id: "FBRECOVERY",
      team_side: "H",
      player_key: "unresolved-player",
      player_name: "Source Confirmed Player",
      starter: true,
      confirmed: true,
      fact_status: "SOURCE_CONFIRMED_IDENTITY_UNRESOLVED",
      identity_status: "UNRESOLVED",
      source_name: "FLASHSCORE_OFFICIAL"
    }];
    const fixture = detailCase === "unresolved" ? {
      hkjc_event_id: "FBRECOVERY",
      home_en: "Northbridge FC",
      away_en: "Riverside United",
      tournament: "Recovery League",
      status: "PREEVENT",
      kickoff_hkt: new Date(Date.now() + 3600000).toISOString(),
      fetched_at: new Date().toISOString(),
      odds_updated_at: new Date().toISOString(),
      selling: true,
      live_eligible: false,
      had_home: null, had_draw: null, had_away: null,
      hil_line: null, hil_over: null, hil_under: null,
      chl_line: null, chl_over: null, chl_under: null
    } : null;
    return json(route, {
      generatedAt: new Date().toISOString(),
      id: "FBRECOVERY",
      fixture,
      fixtureSource: fixture ? "UPCOMING" : "MISSING",
      models: {
        form: { quality: "FORM_MODELED", home_games: 8, away_games: 8 },
        forebet: null, internal: null, opta: null, multisource: null
      },
      humanFactors: {
        summary: null, eventMap: null, playerStatus: [],
        lineup: unresolvedLineup, lineupStrength: [], managers: []
      },
      scenario: [],
      marketIntelligence: { mode: "DETECT_ONLY", value: [], arbitrage: [] }
    });
  });

  await page.route("**/functions/v1/app-match-analysis?**", route =>
    json(route, { error: "analysis_unavailable_for_recovery_fixture" }, 503)
  );
  await page.route("**/functions/v1/app-match-story?**", route =>
    json(route, { error: "story_unavailable_for_recovery_fixture" }, 503)
  );
}

test("feed outage is not presented as a successful zero-fixture feed", async ({ page }) => {
  await routeRecoveryApis(page, { feed: "outage" });
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.getByText("Fixture feed temporarily unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText(/Fixture counts remain unknown until the next successful source refresh/)).toBeVisible();
  await expect(page.getByText("No fixtures are available in the current feed.", { exact: true })).toHaveCount(0);
  await expect(page.locator(".ft-result-count")).toContainText("feed unavailable");
});

test("successful HTTP 200 empty feed remains a genuine zero-fixture state", async ({ page }) => {
  await routeRecoveryApis(page, { feed: "empty" });
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.getByText("No fixtures are available in the current feed.", { exact: true })).toBeVisible();
  await expect(page.getByText("Fixture feed temporarily unavailable", { exact: true })).toHaveCount(0);
  await expect(page.locator(".ft-result-count")).toContainText("0 matches shown");
});

test("missing canonical fixture exits loading and unresolved lineup identity stays unknown", async ({ page }) => {
  await routeRecoveryApis(page, { feed: "outage", detailCase: "missing" });
  await page.goto("http://127.0.0.1:4173/details/?id=FBRECOVERY");

  await expect(page.getByText("Canonical fixture is unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText("Loading match data…", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Identity gate active/)).toBeVisible();

  const summary = page.locator("details.lineup-tool-disclosure > summary");
  await expect(summary).toContainText("CANONICAL FIXTURE UNRESOLVED");
  await expect(summary).toContainText("—/11 home");
  await expect(summary).not.toContainText("0/11 home");
});

test("source-confirmed unresolved player identity is not counted as 0/11", async ({ page }) => {
  await routeRecoveryApis(page, { feed: "outage", detailCase: "unresolved" });
  await page.goto("http://127.0.0.1:4173/details/?id=FBRECOVERY");

  await expect(page.getByText("Northbridge FC", { exact: true }).first()).toBeVisible();
  const summary = page.locator("details.lineup-tool-disclosure > summary");
  await expect(summary).toContainText("IDENTITY RECONCILIATION");
  await expect(summary).toContainText("—/11 home");
  await expect(summary).toContainText("identity not complete");
  await expect(summary).not.toContainText("0/11 home");
});
