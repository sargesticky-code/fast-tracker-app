const { test, expect } = require("@playwright/test");

function fixtureFeed() {
  const kickoff = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  return {
    generatedAt: new Date().toISOString(),
    source: "E2E_FIXTURE",
    windowHours: 24,
    matches: [{
      id: "FBTEST1",
      home: "Northbridge FC",
      away: "Riverside United",
      league: "Premier League",
      kickoff,
      liveNow: false,
      odds: { home: 2.2, draw: 3.3, away: 3.1 },
      market: { home: 0.421, draw: 0.281, away: 0.298 },
      forebet: { home: 0.48, draw: 0.27, away: 0.25, score: "2-1", avgGoals: 2.7 },
      dc: { home: 0.46, draw: 0.28, away: 0.26 },
      pi: { home: 0.45, draw: 0.29, away: 0.26 },
      form: { home: 0.47, draw: 0.27, away: 0.26 },
      multi: { home: 0.46, draw: 0.28, away: 0.26 },
      goals: { line: 2.5, over: 1.88, under: 1.92 },
      corners: { line: 9.5, over: 1.90, under: 1.90 },
      updatedAt: new Date().toISOString(),
      health: { hkjcFreshness: "FRESH" }
    }],
    systemHealth: {}
  };
}

function detailPayload({ confirmedLineup = false } = {}) {
  return {
    fixture: {
      hkjc_event_id: "FBTEST1",
      home_en: "Northbridge FC",
      away_en: "Riverside United",
      tournament: "Premier League",
      kickoff_hkt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    },
    h2h: {
      h2h_games: 4,
      quality: "H2H_OK",
      source: "FOTMOB_VERIFIED",
      home_wins: 2,
      draws: 1,
      away_wins: 1
    },
    models: {
      forebet: {
        predicted_score: "2-1",
        avg_goals: 2.7
      },
      form: {
        home_games: 8,
        away_games: 8,
        home_venue_games: 4,
        away_venue_games: 4,
        form_xg_home: 1.62,
        form_xg_away: 1.11,
        model_source: "HKJC_TEAM_FORM"
      },
      internal: {
        training_matches: 240,
        model_source: "DIXON_COLES_PI"
      }
    },
    humanFactors: {
      eventMap: {
        match_quality: 0.97,
        lineup_confirmed_at: null
      },
      lineup: [{
        team_side: "HOME",
        player_name: "Alex Smith",
        starter: true,
        confirmed: confirmedLineup,
        source_name: confirmedLineup ? "FLASHSCORE_OFFICIAL" : "PREDICTED_XI"
      }],
      playerStatus: [],
      managers: []
    },
    scenario: []
  };
}

function analysisPayload() {
  return {
    generatedAt: new Date().toISOString(),
    decision: {
      market: "HDA",
      selection: "H",
      selectionLabel: "Northbridge FC",
      currentOdds: 2.2,
      oddsStatus: "CURRENT",
      candidateClass: "VALUE_CANDIDATE",
      action: "VALUE_CANDIDATE",
      expectedValuePct: 5.6,
      candidateEdgePp: 4.2
    },
    evidence: {
      phase1Health: {
        sourceMode: "CANONICAL",
        oddsUpdatedAt: new Date().toISOString()
      }
    },
    story: {
      advice: "Northbridge FC is a value candidate at the current HKJC price.",
      marketRead: "The HDA price implies a lower fair home probability than the independent model centre.",
      modelRead: "Forebet, Dixon-Coles/Pi and Team Form lean home, with moderate dispersion.",
      humanRead: "The lineup is predicted rather than confirmed.",
      counterRead: "The away side retains enough model probability to keep this below a strong-value threshold."
    },
    invalidators: ["Lineup not confirmed", "Price movement may remove the edge"],
    governance: { sourceMode: "CANONICAL" }
  };
}

function storyPayload() {
  return {
    generatedAt: new Date().toISOString(),
    engine: { name: "FT_STORY_INTERPRETER_V5", mode: "DETERMINISTIC_FALLBACK" },
    cache: { hit: false, analysisHash: "test-snapshot-hash" },
    bettingAdvice: {
      oddsStatus: "CURRENT",
      selectionLabel: "Northbridge FC",
      currentOdds: 2.2
    },
    governance: { sourceMode: "CANONICAL" },
    story: {
      headline: "Northbridge vs Riverside: home value, but lineup confirmation still matters",
      executiveSummary: "The home case is supported by several independent model families, while the provisional lineup remains an important uncertainty.",
      thesis: "Northbridge FC is a value candidate at 2.20, not a certainty.",
      marketInterpretation: "The current HKJC HDA price is the observed price used for this recommendation.",
      modelConsensusInterpretation: "Independent model families lean home without eliminating away-side risk.",
      humanFactorsInterpretation: "The available XI is provisional and is not treated as confirmed.",
      counterCase: "A lineup downgrade or adverse price move would weaken the case."
    },
    invalidators: ["Lineup not confirmed", "Fresh price required"],
    commentary: []
  };
}

async function mockApis(page, { withStory = true, stale = false, legacyAnalysis = false, confirmedLineup = false } = {}) {
  await page.route("**/functions/v1/app-phase1-feed?**", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtureFeed()) });
  });
  await page.route("**/functions/v1/app-live-feed**", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generatedAt: new Date().toISOString(), matches: [] }) });
  });
  await page.route("**/functions/v1/app-match-detail?**", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detailPayload({ confirmedLineup })) });
  });
  await page.route("**/functions/v1/app-match-analysis?**", async route => {
    const payload = analysisPayload();
    if (stale) {
      payload.decision.oddsStatus = "STALE";
      payload.decision.candidateClass = "DATA_RISK";
      payload.decision.action = "NO_BET";
      payload.evidence.phase1Health.sourceMode = "DB_FALLBACK_FAIL_CLOSED";
      payload.governance.sourceMode = "DB_FALLBACK_FAIL_CLOSED";
    }
    if (legacyAnalysis) {
      payload.story = {
        advice: "舊中文建議不可直接顯示",
        marketRead: "舊中文市場解讀",
        modelRead: "舊中文模型解讀",
        humanRead: "舊中文人為因素",
        counterRead: "舊中文反方"
      };
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
  await page.route("**/functions/v1/app-match-story?**", async route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("lang")).toBe("en");
    if (!withStory) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "story_unavailable" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(storyPayload()) });
  });
}

for (const device of [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "mobile", viewport: { width: 390, height: 844 } }
]) {
  test(device.name + " homepage to English evidence article", async ({ page }) => {
    page.on("pageerror", error => console.log("PAGEERROR:", error.stack || error.message));
    page.on("console", msg => {
      if (msg.type() === "error") console.log("BROWSER_ERROR:", msg.text());
    });
    await page.setViewportSize(device.viewport);
    await mockApis(page);

    await page.goto("http://127.0.0.1:4173/");
    await expect(page.getByText("Mathematical Football Predictions and Statistics")).toBeVisible();
    await expect(page.getByText("Northbridge FC").first()).toBeVisible();

    const matchLink = page.locator('a[href*="FBTEST1"]').first();
    await expect(matchLink).toBeVisible();
    await matchLink.click();

    await expect(page).toHaveURL(/details.*FBTEST1/);
    await expect(page.getByText("FAST TRACKER MATCH ANALYSIS")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Northbridge vs Riverside: home value, but lineup confirmation still matters")).toBeVisible();
    await expect(page.getByText("Hong Kong Jockey Club")).toBeVisible();
    await expect(page.getByText("Predicted / provisional lineup")).toBeVisible();
    await expect(page.getByText("This is unknown coverage, not zero injuries.")).toBeVisible();
    await expect(page.getByText("Home 8 / Away 8 matches · venue 4/4")).toBeVisible();
    await expect(page.locator("#analysis").getByText("2.20", { exact: true })).toBeVisible();
    await expect(page.getByText("A lineup downgrade or adverse price move would weaken the case.")).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });
}

test("article remains readable when English story cache/upstream is unavailable", async ({ page }) => {
  page.on("pageerror", error => console.log("PAGEERROR:", error.stack || error.message));
  await page.setViewportSize({ width: 1280, height: 820 });
  await mockApis(page, { withStory: false, legacyAnalysis: true });

  await page.goto("http://127.0.0.1:4173/");
  await page.locator('a[href*="FBTEST1"]').first().click();

  await expect(page.getByText("FAST TRACKER MATCH ANALYSIS")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Northbridge FC vs Riverside United: evidence-based match analysis")).toBeVisible();
  await expect(page.getByText("No verified player-status evidence is currently available. This is unknown coverage, not zero injuries.")).toBeVisible();
  await expect(page.getByText("舊中文建議不可直接顯示")).toHaveCount(0);
});

test("stale market data disables an actionable article price", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await mockApis(page, { stale: true });

  await page.goto("http://127.0.0.1:4173/");
  await page.locator('a[href*="FBTEST1"]').first().click();

  await expect(page.getByText("Stale-price protection is active.")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Not current")).toBeVisible();
  await expect(page.getByText("WATCH / SKIP")).toBeVisible();
});

test("confirmed lineup evidence is honored without event-map timestamp", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await mockApis(page, { confirmedLineup: true });

  await page.goto("http://127.0.0.1:4173/");
  await page.locator('a[href*="FBTEST1"]').first().click();

  await expect(page.getByText("FAST TRACKER MATCH ANALYSIS")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Confirmed lineup", { exact: true })).toBeVisible();
  await expect(page.getByText("1 confirmed rows · 0 provisional/unconfirmed rows")).toBeVisible();
});
