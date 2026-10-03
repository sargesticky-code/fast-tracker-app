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

function detailPayload({ confirmedLineup = false, unresolvedLineup = false, playerCase = "missing", historical = false } = {}) {
  return {
    fixture: {
      hkjc_event_id: "FBTEST1",
      home_en: "Northbridge FC",
      away_en: "Riverside United",
      tournament: "Premier League",
      status: historical ? "FINISHED" : "PREEVENT",
      kickoff_hkt: new Date(Date.now() + (historical ? -2 : 1) * 60 * 60 * 1000).toISOString(),
      fetched_at: new Date().toISOString(),
      odds_updated_at: new Date(Date.now() + (historical ? -26 : -0.1) * 60 * 60 * 1000).toISOString(),
      had_home: 2.2,
      had_draw: 3.3,
      had_away: 3.1
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
        lineup_confirmed_at: (confirmedLineup || unresolvedLineup) ? new Date().toISOString() : null
      },
      lineup: confirmedLineup ? [
        {
          id: 1001,
          team_side: "H",
          player_key: "P1001",
          player_name: "Alex Smith",
          starter: true,
          confirmed: true,
          source_name: "API_FOOTBALL",
          source_url: "https://example.test/lineup/1001",
          evidence_key: "phase2_match_lineup_evidence:1001",
          identity_status: "CANONICAL",
          fact_status: "CONFIRMED",
          record_group: "FBTEST1|H|P1001||"
        },
        {
          id: 1002,
          team_side: "H",
          player_key: "P1002",
          player_name: "Jamie Lee",
          starter: false,
          confirmed: true,
          source_name: "API_FOOTBALL",
          source_url: "https://example.test/lineup/1002",
          evidence_key: "phase2_match_lineup_evidence:1002",
          identity_status: "CANONICAL",
          fact_status: "CONFIRMED",
          record_group: "FBTEST1|H|P1002||"
        }
      ] : unresolvedLineup ? [{
        id: 1101,
        team_side: "H",
        player_key: "998877",
        player_name: "Unresolved Official Player",
        starter: true,
        confirmed: true,
        source_name: "FLASHSCORE_OFFICIAL",
        source_url: "https://example.test/lineup/1101",
        evidence_key: "phase2_match_lineup_evidence:1101",
        identity_status: "UNRESOLVED",
        fact_status: "SOURCE_CONFIRMED_IDENTITY_UNRESOLVED",
        record_group: "FBTEST1|H|998877||"
      }] : [{
        id: 1201,
        team_side: "H",
        player_key: "PREDICTED-ALEX",
        player_name: "Alex Smith",
        starter: true,
        confirmed: false,
        source_name: "PREDICTED_XI",
        evidence_key: "phase2_match_lineup_evidence:1201",
        identity_status: "UNRESOLVED",
        fact_status: "UNCONFIRMED",
        record_group: "FBTEST1|H|PREDICTED-ALEX||"
      }],
      playerStatus: playerCase === "confirmed" ? [{
        id: 2001,
        hkjc_event_id: "FBTEST1",
        team_side: "H",
        player_key: "P2001",
        status_type: "INJURY",
        status_value: "Out",
        confirmed: true,
        confidence: 0.95,
        source_name: "API_FOOTBALL",
        source_url: "https://example.test/injury/2001",
        evidence_key: "phase2_player_status_evidence:2001",
        source_link: "https://example.test/injury/2001",
        identity_status: "CANONICAL",
        fact_status: "CONFIRMED",
        record_group: "FBTEST1|H|P2001|injury|out",
        raw: { player_name: "Canonical Player" }
      }] : playerCase === "unresolved" ? [{
        id: 2002,
        hkjc_event_id: "FBTEST1",
        team_side: "A",
        player_key: "1300526",
        status_type: "INJURY",
        status_value: "Doubtful",
        confirmed: true,
        confidence: 0.90,
        source_name: "FOTMOB",
        source_url: "https://www.fotmob.com/match/5181853",
        evidence_key: "phase2_player_status_evidence:2002",
        source_link: "https://www.fotmob.com/match/5181853",
        identity_status: "UNRESOLVED",
        fact_status: "SOURCE_CONFIRMED_IDENTITY_UNRESOLVED",
        record_group: "FBTEST1|A|1300526|injury|doubtful",
        raw: { player_name: "Nico O'Reilly" }
      }] : playerCase === "ambiguous" ? [{
        id: 2003,
        hkjc_event_id: "FBTEST1",
        team_side: "H",
        player_key: "Lukas Provod",
        status_type: "INJURY",
        status_value: "Ankle injury; expected early October return",
        confirmed: false,
        confidence: 0.87,
        source_name: "FotMob",
        source_url: "https://www.fotmob.com/matches/czechia-vs-croatia/2vkax6",
        evidence_key: "phase2_player_status_evidence:2003",
        source_link: "https://www.fotmob.com/matches/czechia-vs-croatia/2vkax6",
        identity_status: "UNRESOLVED",
        fact_status: "UNCONFIRMED",
        record_group: "FBTEST1|H|Lukas Provod|injury|ankle-injury-expected-early-october-return",
        raw: { player_name: "Lukas Provod" }
      }] : [],
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
      candidateClass: "WATCH",
      action: "WATCH",
      expectedValuePct: 5.6,
      candidateEdgePp: 4.2,
      evidenceFamilyCount: 1,
      supportCount: 1,
      dispersion: null
    },
    marketAdvice: {
      goals: {
        market: "GOALS_OU",
        line: 4.5,
        selection: "UNDER",
        selectionLabel: "Under 4.5",
        currentOdds: 1.90,
        referenceOdds: null,
        candidateClass: "WATCH_SINGLE_SOURCE",
        action: "WATCH",
        evidenceFamilyCount: 1,
        supportCount: 1,
        dispersion: null,
        models: [{
          key: "FORM",
          label: "Team Form expected goals",
          over: 0.1436,
          under: 0.8564,
          weight: 0.9,
          sources: 1,
          method: "FORM_XG_POISSON",
          provenanceGroup: "HKJC_RESULTS",
          memberKeys: ["FORM"]
        }]
      },
      corners: {
        candidateClass: "NO_MODEL",
        action: "PASS",
        evidenceFamilyCount: 0,
        models: []
      }
    },
    evidence: {
      phase1Health: {
        sourceMode: "CANONICAL",
        evidenceKey: "hkjc_odds_current:FBTEST1",
        sourceUrl: null,
        priceObservedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        fetchedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString()
      },
      goalsModelContext: {
        teamForm: {
          quality: "FORM_MODELED",
          source: "martj42/international_results + HKJC recent · recency-weighted Team-Form Poisson",
          fetchedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
          homeGames: 14,
          awayGames: 25,
          homeVenueGames: 5,
          awayVenueGames: 9,
          expectedGoalsHome: 1.09304,
          expectedGoalsAway: 1.65055,
          provenanceGroup: "HKJC_RESULTS",
          evidenceKey: "form_predictions:FBTEST1",
          sourceUrl: null,
          method: "FORM_XG_POISSON"
        }
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

async function mockApis(page, { withStory = true, stale = false, legacyAnalysis = false, confirmedLineup = false, unresolvedLineup = false, playerCase = "missing", historicalDetail = false } = {}) {
  await page.route("**/functions/v1/app-phase1-feed?**", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtureFeed()) });
  });
  await page.route("**/functions/v1/app-live-feed**", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generatedAt: new Date().toISOString(), matches: [] }) });
  });
  await page.route("**/functions/v1/app-match-detail?**", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detailPayload({ confirmedLineup, unresolvedLineup, playerCase, historical: historicalDetail })) });
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
  await expect(page.getByText("1 model family", { exact: true })).toBeVisible();
  await expect(page.getByText("Not measurable with <2 families", { exact: true })).toBeVisible();
  await expect(page.getByText("Source fetch", { exact: true })).toBeVisible();
  await expect(page.getByText("Fetch time is separate from the market-price observation shown above", { exact: true })).toBeVisible();
    await expect(page.getByText("WATCH · Under 4.5", { exact: true })).toBeVisible();
    await expect(page.getByText("Team Form expected goals (FORM_XG_POISSON · HKJC_RESULTS)", { exact: true })).toBeVisible();
    await expect(page.getByText("Expected goals 1.09 – 1.65", { exact: true })).toBeVisible();
    await expect(page.getByText("Model expected goals are derived estimates, not observed xG.", { exact: true })).toBeVisible();
    await expect(page.getByText("Goals, corners and handicap recommendations use only their own market-specific evidence. HDA consensus is not reused as a substitute.", { exact: true })).toBeVisible();
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
  await expect(page.getByText("Confirmed lineup with resolved player identities", { exact: true })).toBeVisible();
  await expect(page.getByText("1 confirmed starters · 1 confirmed substitutes/bench")).toBeVisible();
});

test("post-kickoff historical detail overrides cached prematch price", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await mockApis(page, { historicalDetail: true });

  await page.goto("http://127.0.0.1:4173/");
  await page.locator('a[href*="FBTEST1"]').first().click();

  await expect(page.getByText("Stale-price protection is active.")).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#analysis").getByText("Not current")).toBeVisible();
  await expect(page.locator("#analysis").getByText("WATCH / SKIP")).toBeVisible();
});


test("canonical confirmed player status keeps durable source attribution", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await mockApis(page, { playerCase: "confirmed" });

  await page.goto("http://127.0.0.1:4173/");
  await page.locator('a[href*="FBTEST1"]').first().click();

  await expect(page.getByText("Canonical Player", { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Confirmed source + canonical player identity", { exact: true })).toBeVisible();
  await expect(page.getByText(/Evidence: phase2_player_status_evidence:2001/)).toBeVisible();
  const sourceLink = page.locator('#analysis a[href="https://example.test/injury/2001"]');
  await expect(sourceLink).toHaveCount(1);
});

test("source-confirmed player with unresolved identity never becomes a confirmed fact", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await mockApis(page, { playerCase: "unresolved" });

  await page.goto("http://127.0.0.1:4173/");
  await page.locator('a[href*="FBTEST1"]').first().click();

  await expect(page.getByText("Nico O'Reilly", { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Source reports status · player identity unresolved", { exact: true })).toBeVisible();
  await expect(page.getByText("Confirmed source + canonical player identity", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/phase2_player_status_evidence:2002/)).toBeVisible();
});

test("ambiguous unconfirmed injury remains explicitly unresolved", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await mockApis(page, { playerCase: "ambiguous" });

  await page.goto("http://127.0.0.1:4173/");
  await page.locator('a[href*="FBTEST1"]').first().click();

  await expect(page.getByText("Lukas Provod", { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Unconfirmed status · player identity unresolved", { exact: true })).toBeVisible();
  await expect(page.getByText("Confirmed source + canonical player identity", { exact: true })).toHaveCount(0);
});

test("official source lineup with unresolved player identity remains partial", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await mockApis(page, { unresolvedLineup: true });

  await page.goto("http://127.0.0.1:4173/");
  await page.locator('a[href*="FBTEST1"]').first().click();

  await expect(page.getByText("Official lineup source confirmed · player identity reconciliation incomplete", { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Confirmed lineup with resolved player identities", { exact: true })).toHaveCount(0);
});
