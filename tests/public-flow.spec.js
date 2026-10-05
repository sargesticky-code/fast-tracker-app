const { test, expect } = require("@playwright/test");
const fs = require("fs");
fs.mkdirSync("test-results", { recursive: true });

for (const width of [1440, 390]) {
  test(`homepage attributes displayed bookmaker quotes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const feed = fixtureFeed();
    const base = feed.matches[0];
    feed.matches = [
      { ...base, id: "FBLEGACYSOURCE", home: "Legacy Source FC" },
      { ...base, id: "FBINTSOURCE", home: "International Source FC", forebetDetail: { predictedScore: "3-1", ou25: { avgGoals: 3.4 } }, odds: { ...base.odds, providerKey: "BET365", observedAt: new Date(Date.now() - 60000).toISOString(), freshness: "FRESH" } },
      { ...base, id: "FBUNKNOWNSOURCE", home: "Unknown Source FC", health: {}, odds: { ...base.odds, providerKey: "UNRESOLVED" } },
    ];
    await page.route("**/functions/v1/app-phase1-feed?**", route => route.fulfill({ json: feed }));
    await page.route("**/functions/v1/app-live-feed**", route => route.fulfill({ json: { matches: [] } }));
    await page.goto("http://127.0.0.1:4173/");
    await expect(page.locator('.ft-match-row[href*="FBLEGACYSOURCE"] .ft-market-odds')).toContainText("HKJC HDA");
    await expect(page.locator('.ft-match-row[href*="FBINTSOURCE"] .ft-market-odds')).toContainText("Bet365 HDA");
    await expect(page.locator('.ft-match-row[href*="FBINTSOURCE"] [data-label="Predicted score"]')).toHaveText("3-1");
    await expect(page.locator('.ft-match-row[href*="FBINTSOURCE"] .ft-goal-number')).toHaveText("3.40");
    await expect(page.locator('.ft-match-row[href*="FBUNKNOWNSOURCE"] .ft-market-odds')).toContainText("Source unverified HDA");
    if (width === 390) {
      for (const label of ["H/D/A pick", "Predicted score", "Average goals", "H/D/A model EV", "Live score"]) {
        const cell = page.locator(`.ft-match-row [data-label="${label}"]`).first();
        await expect(cell).toBeVisible();
        expect(await cell.evaluate(el => getComputedStyle(el, "::before").content)).toBe(`"${label}"`);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: `test-results/dashboard-quote-source-${width}.png`, fullPage: true });
  });
}

for (const width of [1440, 390]) {
  test(`prematch Value requires current quote and independent evidence at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const feed = fixtureFeed();
    const base = feed.matches[0];
    const quotedAt = new Date(Date.now() - 60000).toISOString();
    const fresh = { ...base, home: "Supported Value FC", id: "FBVALUE", forebet: { home: .6, draw: .2, away: .2 }, form: { home: .59, draw: .21, away: .2 }, formDetail: { source: "HKJC_RESULTS" }, dc: null, pi: null, multi: null, health: { hkjcFreshness: "FRESH", hkjcPriceChangedAt: quotedAt } };
    feed.matches = [
      fresh,
      { ...fresh, id: "FBWATCH", home: "Single Source FC", forebet: null },
      { ...fresh, id: "FBREFERENCE", home: "Old Quote FC", updatedAt: new Date().toISOString(), health: { hkjcFreshness: "FRESH", hkjcFetchedAt: new Date().toISOString(), hkjcPriceChangedAt: new Date(Date.now() - 15 * 3600000).toISOString() } },
      { ...fresh, id: "FBUNKNOWNQUOTE", home: "Unknown Quote FC", health: { hkjcFreshness: "FRESH", hkjcFetchedAt: new Date().toISOString() } }
    ];
    await page.route("**/functions/v1/app-phase1-feed?**", route => route.fulfill({ json: feed }));
    await page.route("**/functions/v1/app-live-feed**", route => route.fulfill({ json: { matches: [] } }));
    await page.goto("http://127.0.0.1:4173/");
    await expect(page.locator(".ft-match-row")).toHaveCount(4);
    await expect(page.locator(".ft-match-row.is-value")).toHaveCount(1);
    const watch = page.locator('.ft-match-row[href*="FBWATCH"]');
    const reference = page.locator('.ft-match-row[href*="FBREFERENCE"]');
    await expect(watch.locator(".ft-value-state")).toContainText("Watch");
    await expect(reference.locator(".ft-value-state")).toContainText("Reference");
    await expect(reference.locator(".ft-market-odds")).toContainText("HKJC HDA · Reference");
    await expect(reference.locator(".ft-edge")).not.toHaveText("—");
    if (width === 1440) await expect(page.locator(".ft-value-rail a")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: `test-results/dashboard-value-gates-${width}.png`, fullPage: true });
    await page.locator(".ft-sports").getByRole("button", { name: "Value", exact: true }).click();
    await expect(page.locator(".ft-match-row")).toHaveCount(1);
    await expect(page.locator(".ft-match-row")).toContainText("Supported Value FC");
  });
}

test.describe("prematch fixture navigation", () => {
  test.use({ timezoneId: "America/Los_Angeles" });
  for (const width of [1440, 390]) {
    test(`complete coverage and Hong Kong dates at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.clock.setFixedTime(new Date("2026-10-04T23:00:00Z"));
      const feed = fixtureFeed();
      const base = feed.matches[0];
      feed.generatedAt = "2026-10-04T23:00:00Z";
      feed.windowHours = 48;
      feed.matches = Array.from({ length: 35 }, (_, i) => ({ ...base, id: `FBNAV${i}`, home: `Upcoming Club ${i}`, kickoff: "2026-10-05T10:00:00+08:00" }));
      feed.matches.push(
        { ...base, id: "FBNAVLIVE", home: "Live Club", liveNow: true, kickoff: "2026-10-05T06:00:00+08:00" },
        { ...base, id: "FBNAVTOMORROW", home: "Tomorrow Club", kickoff: "2026-10-06T20:00:00+08:00" },
        { ...base, id: "FBNAVPLUS2", home: "Plus Two Club", kickoff: "2026-10-07T06:00:00+08:00" }
      );
      await page.route("**/functions/v1/app-phase1-feed?**", route => {
        expect(new URL(route.request().url()).searchParams.get("hours")).toBe("48");
        return route.fulfill({ json: feed });
      });
      await page.route("**/functions/v1/app-live-feed**", route => route.fulfill({ json: { matches: [] } }));
      await page.goto("http://127.0.0.1:4173/");
      await expect(page.locator(".ft-match-row")).toHaveCount(35);
      await expect(page.locator('.ft-match-row[href*="FBNAV34"]')).toHaveCount(1);
      await expect(page.locator('.ft-match-row[href*="FBNAVLIVE"]')).toHaveCount(0);
      await page.screenshot({ path: `test-results/dashboard-navigation-today-${width}.png` });
      await page.locator(".ft-sports").getByRole("button", { name: "Live", exact: true }).click();
      await expect(page.locator(".ft-match-row")).toHaveCount(1);
      await expect(page.locator(".ft-match-row")).toContainText("Live Club");
      if (width === 1440) {
        await expect(page.locator(".ft-value-rail a")).toHaveCount(0);
        await expect(page.locator(".ft-featured-meta").getByText("—", { exact: true })).toBeVisible();
      }
      await page.locator(".ft-daybar").getByRole("button", { name: "Tomorrow", exact: true }).click();
      await expect(page.locator(".ft-match-row")).toHaveCount(1);
      await expect(page.locator(".ft-match-row")).toContainText("Tomorrow Club");
      await page.locator(".ft-daybar").getByRole("button", { name: "+2 days", exact: true }).click();
      await expect(page.locator(".ft-match-row")).toContainText("Plus Two Club");
      await expect(page.getByText(/Partial date coverage:/)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
      await page.screenshot({ path: `test-results/dashboard-navigation-plus2-${width}.png`, fullPage: true });
      if (width === 1440) {
        await page.locator('.ft-calendar [data-day="2026-10-06"] button').click();
        await expect(page.locator(".ft-match-row")).toContainText("Tomorrow Club");
      }
      await page.locator(".ft-sports").getByRole("button", { name: "Today", exact: true }).click();
      await expect(page.locator(".ft-match-row")).toHaveCount(35);
      await page.locator(".ft-sports").getByRole("button", { name: "All matches", exact: true }).click();
      await expect(page.locator(".ft-match-row")).toHaveCount(38);
      await page.getByPlaceholder("Search team, league or match...").fill("Upcoming Club 34");
      await expect(page.locator(".ft-match-row")).toHaveCount(1);
    });
  }
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`prematch missing probabilities and fallback at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const feed = fixtureFeed();
    const first = feed.matches[0];
    first.multi = { home: null, draw: 0.3, away: 0.2 };
    first.forebet = null;
    first.dc = null;
    first.pi = null;
    first.expectedGoals = null;
    first.form = { home: 0.5, draw: 0.3, away: 0.2 };
    feed.matches.push({ ...first, id: "FBTEST2", home: "Unknown Model FC", form: null });
    await page.route("**/functions/v1/app-phase1-feed?**", route => route.fulfill({ json: feed }));
    await page.route("**/functions/v1/app-live-feed**", route => route.fulfill({ json: { matches: [] } }));
    await page.goto("http://127.0.0.1:4173/");
    const valid = page.locator(".ft-match-row").filter({ hasText: "Northbridge FC" });
    const unknown = page.locator(".ft-match-row").filter({ hasText: "Unknown Model FC" });
    await expect(valid.locator(".ft-prob-numbers")).toHaveText("H 50%D 30%A 20%");
    await expect(unknown.locator(".ft-prob-numbers")).toHaveText("H —%D —%A —%");
    await expect(unknown.locator(".ft-pred-pill")).toHaveText("—");
    await expect(unknown.locator(".ft-edge")).toHaveText("—");
    await expect(valid.locator(".ft-goal-number")).toHaveText("—");
    await expect(unknown).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: `test-results/dashboard-prematch-unknown-${viewport.width}.png`, fullPage: true });
  });
}

function fixtureFeed(dataCase = "empty", totalsCase = "partial", totalsStale = false) {
  const kickoff = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const richSide = (side) => ({
    recent: [
      { result: side === "home" ? "W" : "D", opponent: "Harbour City", gf: side === "home" ? 2 : 1, ga: 1, venue: side === "home" ? "H" : "A", kickoff: new Date(Date.now() - 2 * 86400000).toISOString() },
      { result: "W", opponent: "Metro Athletic", gf: 2, ga: 0, venue: side === "home" ? "A" : "H", kickoff: new Date(Date.now() - 6 * 86400000).toISOString() },
      { result: side === "home" ? "D" : "L", opponent: "Union Town", gf: 1, ga: side === "home" ? 1 : 2, venue: side === "home" ? "H" : "A", kickoff: new Date(Date.now() - 10 * 86400000).toISOString() }
    ],
    modelGames: side === "home" ? 12 : 10,
    venueGames: side === "home" ? 6 : 5,
    ppg: side === "home" ? 2.1 : 1.5,
    expectedGoals: side === "home" ? 1.72 : 1.28,
    wins: side === "home" ? 7 : 4,
    draws: side === "home" ? 3 : 3,
    losses: side === "home" ? 2 : 3,
    goalsFor: side === "home" ? 20 : 14,
    goalsAgainst: side === "home" ? 11 : 13
  });
  const formDetail = dataCase === "populated"
    ? { quality: "FORM_MODELED", source: "HKJC_RESULTS", home: richSide("home"), away: richSide("away") }
    : dataCase === "partial"
      ? { quality: "INSUFFICIENT_PARTIAL_HISTORY", source: "HKJC_RESULTS", home: richSide("home"), away: null }
      : { quality: "INSUFFICIENT_HISTORY", source: "HKJC_RESULTS", home: null, away: null };
  const totals = totalsCase === "empty"
    ? { goals: { line: null, over: null, under: null }, corners: { line: null, over: null, under: null } }
    : { goals: { line: 2.5, over: 1.88, under: 1.92 }, corners: { line: 9.5, over: 1.90, under: 1.90 } };
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
      goals: totals.goals,
      corners: totals.corners,
      updatedAt: new Date(Date.now() - (totalsStale ? 8 : 0.1) * 60 * 60 * 1000).toISOString(),
      health: { hkjcFreshness: totalsStale ? "STALE" : "FRESH", hkjcPriceChangedAt: new Date(Date.now() - (totalsStale ? 8 : 0.1) * 3600000).toISOString() },
      storySummary: {
        matchScript: { predictedScore: "2-1", shapeKey: "BALANCED" },
        editorialAlignment: { support: 1, contradict: 0 }
      },
      formDetail
    }],
    systemHealth: {}
  };
}

function detailPayload({ confirmedLineup = false, unresolvedLineup = false, playerCase = "missing", historical = false, dataCase = "empty" } = {}) {
  const marketIntelligence = dataCase === "populated"
    ? {
        mode: "VALUE_DETECT",
        value: [{
          provider_id: "HKJC",
          selection_key: "HOME",
          odds_decimal: 2.20,
          expected_roi_pct: 5.6,
          model_prob: 0.48,
          market_prob_devig: 0.421,
          probability_edge_pct: 5.9,
          model_source_count: 3,
          quote_age_seconds: 45,
          status: "WATCH"
        }],
        arbitrage: [],
        nearArbitrage: { status: "NO_WATCH", distance_to_arb_pct: 4.8 }
      }
    : dataCase === "partial"
      ? {
          mode: "PRICE_ONLY",
          status: "MODEL_UNAVAILABLE",
          reason: "COMPARABLE_PRICES_PRESENT_MODEL_UNAVAILABLE",
          value: [],
          arbitrage: [],
          nearArbitrage: {
            status: "NEAR_ARB_WATCH",
            distance_to_arb_pct: 1.4,
            best_home_provider: "HKJC",
            best_home_odds: 2.20,
            best_draw_provider: "BOOK_B",
            best_draw_odds: 3.35,
            best_away_provider: "BOOK_C",
            best_away_odds: 3.15
          }
        }
      : {
          mode: "DETECT_ONLY",
          status: "NO_COMPARABLE_PRICES",
          reason: "NO_MODEL_OR_COMPARABLE_PRICE",
          value: [],
          arbitrage: []
        };
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
        id: 354829,
        team_side: "A",
        player_key: "bNACfOft",
        player_name: "Yamada",
        starter: true,
        confirmed: true,
        source_name: "FLASHSCORE_OFFICIAL",
        source_url: "https://www.flashscore.com/match/8OLLPC5C/#/match-summary/lineups",
        evidence_key: "phase2_match_lineup_evidence:354829",
        identity_status: "UNRESOLVED",
        fact_status: "SOURCE_CONFIRMED_IDENTITY_UNRESOLVED",
        record_group: "FB6131|A|unresolved:yamada||"
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
        id: 178,
        hkjc_event_id: "FB5829",
        team_side: "A",
        player_key: "APIF:108643",
        status_type: "MISSING FIXTURE",
        status_value: "Leg Injury",
        confirmed: true,
        confidence: 0.95,
        source_name: "API_FOOTBALL",
        source_url: "https://v3.football.api-sports.io/injuries",
        evidence_key: "phase2_player_status_evidence:178",
        source_link: "https://v3.football.api-sports.io/injuries",
        identity_status: "CANONICAL",
        fact_status: "CONFIRMED",
        record_group: "FB5829|A|canonical:apif-108643|missing-fixture|leg-injury",
        raw: { player_name: "G. Segal" }
      }] : playerCase === "unresolved" ? [{
        id: 586,
        hkjc_event_id: "FB6115",
        team_side: "A",
        player_key: "1300526",
        status_type: "INJURY",
        status_value: "Doubtful",
        confirmed: true,
        confidence: 0.90,
        source_name: "FOTMOB",
        source_url: "https://www.fotmob.com/match/5181853",
        evidence_key: "phase2_player_status_evidence:586",
        source_link: "https://www.fotmob.com/match/5181853",
        identity_status: "UNRESOLVED",
        fact_status: "SOURCE_CONFIRMED_IDENTITY_UNRESOLVED",
        record_group: "FB6115|A|unresolved:nico-oreilly|injury|doubtful",
        raw: { player_name: "Nico O'Reilly" }
      }] : playerCase === "ambiguous" ? [{
        id: 32,
        hkjc_event_id: "FB5749",
        team_side: "H",
        player_key: "Lukas Provod",
        status_type: "INJURY",
        status_value: "Ankle injury; expected early October return",
        confirmed: false,
        confidence: 0.87,
        source_name: "FotMob",
        source_url: "https://www.fotmob.com/matches/czechia-vs-croatia/2vkax6",
        evidence_key: "phase2_player_status_evidence:32",
        source_link: "https://www.fotmob.com/matches/czechia-vs-croatia/2vkax6",
        identity_status: "UNRESOLVED",
        fact_status: "UNCONFIRMED",
        record_group: "FB5749|H|unresolved:lukas-provod|injury|ankle-injury-expected-early-october-return",
        raw: { player_name: "Lukas Provod" }
      }] : [],
      managers: []
    },
    scenario: [],
    marketIntelligence
  };
}

function analysisPayload(totalsCase = "partial") {
  const supportedGoals = {
    market: "GOALS_OU",
    line: 2.5,
    selection: "OVER",
    selectionLabel: "Over 2.5",
    currentOdds: 1.88,
    candidateClass: "WATCH_SINGLE_SOURCE",
    action: "WATCH",
    evidenceFamilyCount: 1,
    supportCount: 1,
    dispersion: null,
    models: [{
      key: "FORM",
      label: "Team Form expected goals",
      over: 0.56,
      under: 0.44,
      weight: 0.9,
      sources: 1,
      method: "FORM_XG_POISSON",
      provenanceGroup: "HKJC_RESULTS",
      memberKeys: ["FORM"]
    }]
  };
  const supportedCorners = {
    market: "CORNERS_OU",
    line: 9.5,
    selection: "OVER",
    selectionLabel: "Over 9.5",
    currentOdds: 1.90,
    candidateClass: "WATCH_SINGLE_SOURCE",
    action: "WATCH",
    evidenceFamilyCount: 1,
    supportCount: 1,
    dispersion: null,
    models: [{
      key: "FOREBET",
      label: "Forebet corners",
      over: 0.54,
      under: 0.46,
      weight: 1,
      sources: 1,
      method: "FOREBET_CORNERS",
      provenanceGroup: "FOREBET",
      memberKeys: ["FOREBET"]
    }]
  };
  const noModel = (market) => ({
    market,
    candidateClass: "NO_MODEL",
    action: "PASS",
    evidenceFamilyCount: 0,
    models: []
  });
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
      goals: totalsCase === "empty" ? noModel("GOALS_OU") : supportedGoals,
      corners: totalsCase === "populated" ? supportedCorners : noModel("CORNERS_OU")
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

async function mockApis(page, { withStory = true, stale = false, legacyAnalysis = false, confirmedLineup = false, unresolvedLineup = false, playerCase = "missing", historicalDetail = false, dataCase = "empty", totalsCase = "partial", totalsStale = false } = {}) {
  await page.route("**/functions/v1/app-phase1-feed?**", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtureFeed(dataCase, totalsCase, totalsStale)) });
  });
  await page.route("**/functions/v1/app-live-feed**", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generatedAt: new Date().toISOString(), matches: [] }) });
  });
  await page.route("**/functions/v1/app-match-detail?**", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detailPayload({ confirmedLineup, unresolvedLineup, playerCase, historical: historicalDetail, dataCase })) });
  });
  await page.route("**/functions/v1/app-match-analysis?**", async route => {
    const payload = analysisPayload(totalsCase);
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
    await expect(page.getByRole("button", { name: "HDA" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Goals" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Corners" })).toBeVisible();
    await expect(page.getByText("HKJC HDA").first()).toBeVisible();
    await page.getByRole("button", { name: "Goals" }).click();
    await expect(page.getByText(/Goals 2\.5/).first()).toBeVisible();
    await page.screenshot({ path: `test-results/dashboard-${device.name}-home.png`, fullPage: true });

    const matchLink = page.locator('a[href*="FBTEST1"]').first();
    await expect(matchLink).toBeVisible();
    await matchLink.click();

    await expect(page).toHaveURL(/details.*FBTEST1/);
    await expect(page.getByText("FAST TRACKER MATCH ANALYSIS")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Northbridge vs Riverside: home value, but lineup confirmation still matters")).toBeVisible();
    await expect(page.getByText("Hong Kong Jockey Club")).toBeVisible();
    await expect(page.locator("#analysis").getByText("2.20", { exact: true })).toBeVisible();
    await expect(page.locator("#analysis .ft-article-safety-strip").getByText("Predicted / provisional lineup", { exact: true })).toBeVisible();
    await expect(page.getByText("Unknown — not zero absences", { exact: true })).toBeVisible();

    await expect(page.getByRole("navigation", { name: "Match detail sections" })).toBeVisible();
    await expect(page.getByText("Which models support the current position?", { exact: true })).toBeVisible();
    await expect(page.getByText("Goals and corners", { exact: true })).toBeVisible();
    await expect(page.getByText("Recent form comparison", { exact: true })).toBeVisible();
    await expect(page.getByText("Previous meetings", { exact: true })).toBeVisible();
    await expect(page.getByText("Human factors and lineups", { exact: true })).toBeVisible();

    const lineupTool = page.locator("details.lineup-tool-disclosure");
    const lineupToolSummary = lineupTool.locator(":scope > summary");
    await expect(lineupToolSummary.getByText("FULL LINEUP TOOL", { exact: true })).toBeVisible();
    expect(await lineupTool.evaluate(el => el.open)).toBe(false);
    const decisionBeforeLineup = await page.evaluate(() => {
      const decision = document.querySelector(".detail-decision-board");
      const lineup = document.querySelector("details.lineup-tool-disclosure");
      return Boolean(decision && lineup && (decision.compareDocumentPosition(lineup) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    expect(decisionBeforeLineup).toBe(true);

    const articleDetails = page.locator("#analysis details.ft-article-deep");
    const articleSummary = articleDetails.locator(":scope > summary");
    await expect(articleSummary.getByText("Full evidence article", { exact: true })).toBeVisible();
    expect(await articleDetails.evaluate(el => el.open)).toBe(false);
    await expect(page.getByText("1 model family", { exact: true })).toBeHidden();
    await articleSummary.focus();
    await page.keyboard.press("Enter");
    expect(await articleDetails.evaluate(el => el.open)).toBe(true);
    await expect(page.getByText("1 model family", { exact: true })).toBeVisible();
    await expect(page.getByText("Not measurable with <2 families", { exact: true })).toBeVisible();
    await expect(page.getByText("Source fetch", { exact: true })).toBeVisible();
    await expect(page.getByText("Fetch time is separate from the market-price observation shown above", { exact: true })).toBeVisible();
    await expect(page.getByText("WATCH · Over 2.5", { exact: true })).toBeVisible();
    await expect(page.getByText("Team Form expected goals (FORM_XG_POISSON · HKJC_RESULTS)", { exact: true })).toBeVisible();
    await expect(page.getByText("Expected goals 1.09 – 1.65", { exact: true })).toBeVisible();
    await expect(page.getByText("Model expected goals are derived estimates, not observed xG.", { exact: true })).toBeVisible();
    await expect(page.getByText("Goals, corners and handicap recommendations use only their own market-specific evidence. HDA consensus is not reused as a substitute.", { exact: true })).toBeVisible();
    await expect(page.getByText("A lineup downgrade or adverse price move would weaken the case.")).toBeVisible();

    const h2hDetails = page.locator("details.h2h-deep-dive");
    const h2hSummary = h2hDetails.locator(":scope > summary");
    await expect(h2hSummary.getByText("Meeting details", { exact: true })).toBeVisible();
    expect(await h2hDetails.evaluate(el => el.open)).toBe(false);
    await h2hSummary.focus();
    await page.keyboard.press("Enter");
    expect(await h2hDetails.evaluate(el => el.open)).toBe(true);

    const modelDetails = page.locator("details.model-detail-disclosure");
    const modelSummary = modelDetails.locator(":scope > summary");
    await expect(modelSummary.getByText("Model detail", { exact: true })).toBeVisible();
    expect(await modelDetails.evaluate(el => el.open)).toBe(false);
    await modelSummary.focus();
    await page.keyboard.press("Enter");
    expect(await modelDetails.evaluate(el => el.open)).toBe(true);
    await expect(page.getByText("Open model details", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Team news" }).click();
    await expect(page.locator("#team-news")).toBeVisible();
    await expect(page.getByText("Confirmed absences", { exact: true })).toBeVisible();
    await expect(page.getByText("Official XI", { exact: true })).toBeVisible();

    await page.screenshot({ path: `test-results/dashboard-${device.name}-detail-expanded.png`, fullPage: true });

    await articleSummary.focus();
    await page.keyboard.press("Enter");
    expect(await articleDetails.evaluate(el => el.open)).toBe(false);
    await h2hSummary.focus();
    await page.keyboard.press("Enter");
    expect(await h2hDetails.evaluate(el => el.open)).toBe(false);
    await modelSummary.focus();
    await page.keyboard.press("Enter");
    expect(await modelDetails.evaluate(el => el.open)).toBe(false);

    await lineupToolSummary.focus();
    await page.keyboard.press("Enter");
    expect(await lineupTool.evaluate(el => el.open)).toBe(true);
    await expect(lineupTool.getByRole("button", { name: "Formation" })).toBeVisible();
    await lineupToolSummary.focus();
    await page.keyboard.press("Enter");
    expect(await lineupTool.evaluate(el => el.open)).toBe(false);

    const renderedText = await page.locator("body").innerText();
    expect(renderedText).not.toMatch(/[\u3400-\u9fff]/);

    await expect(page.getByLabel("Advertisement placeholder").first()).toBeVisible();
    await page.screenshot({ path: `test-results/dashboard-${device.name}-detail-article.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });
}

for (const totalsCase of ["populated", "partial", "empty"]) {
  for (const device of [
    { name: "desktop", viewport: { width: 1440, height: 900 } },
    { name: "mobile", viewport: { width: 390, height: 844 } }
  ]) {
    test(device.name + " " + totalsCase + " goals and corners hierarchy", async ({ page }) => {
      await page.setViewportSize(device.viewport);
      await mockApis(page, { dataCase: "populated", totalsCase, totalsStale: totalsCase === "partial" });

      await page.goto("http://127.0.0.1:4173/");
      await page.getByRole("button", { name: "Corners" }).click();
      await page.locator('a[href*="FBTEST1"]').first().click();

      const totals = page.locator("#market-totals");
      await expect(totals.getByText("Goals and corners", { exact: true })).toBeVisible({ timeout: 10000 });

      if (totalsCase === "populated") {
        await expect(totals.locator(".totals-row-compact")).toHaveCount(0);
        await expect(totals.getByText("Over 2.5", { exact: true })).toBeVisible();
        await expect(totals.getByText("Over 9.5", { exact: true })).toBeVisible();
        await expect(totals.getByText(/Supported market-specific probability evidence/)).toHaveCount(2);
      } else if (totalsCase === "partial") {
        await expect(totals.locator(".totals-row-compact")).toHaveCount(1);
        await expect(totals.getByText("No supported Corners probability", { exact: true })).toBeVisible();
        await expect(totals.getByText("Corners model gate: NO_MODEL — no supported probability evidence is available.", { exact: true })).toBeVisible();
        await expect(totals.getByText("STALE / REFERENCE ONLY", { exact: true })).toBeVisible();
        await expect(totals.getByText("Over 9.5 · 1.90", { exact: true })).toBeVisible();
        await expect(totals.getByText("Under 9.5 · 1.90", { exact: true })).toBeVisible();
        const details = totals.locator("details.totals-state-details");
        expect(await details.evaluate(el => el.open)).toBe(false);
        await details.locator(":scope > summary").focus();
        await page.keyboard.press("Enter");
        expect(await details.evaluate(el => el.open)).toBe(true);
        await expect(details.getByText(/Market: Corners O\/U · Line 9.5/)).toBeVisible();
      } else {
        await expect(totals.locator(".totals-row-compact")).toHaveCount(2);
        await expect(totals.getByText("No HKJC Goals line", { exact: true })).toBeVisible();
        await expect(totals.getByText("No HKJC Corners line", { exact: true })).toBeVisible();
        await expect(totals.getByText("HKJC line is unavailable; no same-line model comparison can be made.", { exact: true })).toHaveCount(2);
        await expect(totals.getByText("Line —", { exact: true })).toHaveCount(2);
        await expect(totals.getByText(/Over — · —/)).toHaveCount(2);
        await expect(totals.getByText(/Under — · —/)).toHaveCount(2);
        await expect(totals.getByText("CURRENT OBSERVATION", { exact: true })).toHaveCount(2);
      }

      await page.getByRole("link", { name: "Article" }).click();
      await expect(page.getByText("FAST TRACKER MATCH ANALYSIS")).toBeVisible();
      const articleDetails = page.locator("#analysis details.ft-article-deep");
      await articleDetails.locator(":scope > summary").focus();
      await page.keyboard.press("Enter");
      expect(await articleDetails.evaluate(el => el.open)).toBe(true);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(2);
      await page.screenshot({ path: `test-results/dashboard-${device.name}-${totalsCase}-goals-corners.png`, fullPage: true });
    });
  }
}

for (const stateCase of ["populated", "partial", "empty"]) {
  for (const device of [
    { name: "desktop", viewport: { width: 1440, height: 900 } },
    { name: "mobile", viewport: { width: 390, height: 844 } }
  ]) {
    test(device.name + " " + stateCase + " market and form hierarchy", async ({ page }) => {
      await page.setViewportSize(device.viewport);
      await mockApis(page, { dataCase: stateCase });

      await page.goto("http://127.0.0.1:4173/");
      await page.getByRole("button", { name: "Goals" }).click();
      await expect(page.getByText(/Goals 2\.5/).first()).toBeVisible();
      await page.locator('a[href*="FBTEST1"]').first().click();
      await expect(page.getByText("Value and price comparison", { exact: true })).toBeVisible({ timeout: 10000 });
      await expect(page.getByText("Recent form comparison", { exact: true })).toBeVisible();

      if (stateCase === "populated") {
        await expect(page.locator(".phase4-board")).toBeVisible();
        await expect(page.getByText("Northbridge FC", { exact: true }).first()).toBeVisible();
        await expect(page.getByText("MULTI-SOURCE", { exact: true })).toBeVisible();
        await expect(page.locator("#team-form .team-form-row:not(.team-form-row-empty)")).toHaveCount(2);
        await expect(page.locator("#team-form").getByText("NO USABLE HISTORY", { exact: true })).toHaveCount(0);
      } else if (stateCase === "partial") {
        const marketState = page.locator(".compact-market-state");
        await expect(marketState.getByText("PRICE COVERAGE ONLY", { exact: true })).toBeVisible();
        await expect(marketState.getByText("Prices exist, but no model-backed value signal is available", { exact: true })).toBeVisible();
        await expect(marketState.getByText("Quote age unavailable", { exact: true })).toBeVisible();
        await expect(page.locator("#team-form").getByText("PARTIAL HISTORY", { exact: true })).toBeVisible();
        await expect(page.locator("#team-form .team-form-row-empty")).toHaveCount(1);
        await expect(page.locator("#team-form .team-form-row:not(.team-form-row-empty)")).toHaveCount(1);
        const coverage = marketState.locator("details.compact-state-details");
        expect(await coverage.evaluate(el => el.open)).toBe(false);
        await coverage.locator(":scope > summary").focus();
        await page.keyboard.press("Enter");
        expect(await coverage.evaluate(el => el.open)).toBe(true);
        await expect(coverage.getByText(/Best price legs:/)).toBeVisible();
      } else {
        const marketState = page.locator(".compact-market-state");
        await expect(marketState.getByText("NO COMPARABLE VALUE", { exact: true })).toBeVisible();
        await expect(marketState.getByText("No usable model / comparable price combination", { exact: true })).toBeVisible();
        await expect(marketState.getByText("NO MODEL OR COMPARABLE PRICE", { exact: true })).toBeVisible();
        await expect(marketState.getByText("Quote age unavailable", { exact: true })).toBeVisible();
        await expect(marketState.getByText("No value inferred", { exact: true })).toBeVisible();
        await expect(page.locator("#team-form").getByText("NO USABLE HISTORY", { exact: true })).toBeVisible();
        await expect(page.locator("#team-form").getByText("Recent form is unavailable for both teams", { exact: true })).toBeVisible();
        await expect(page.locator("#team-form").getByText("Missing history remains unknown and is not scored as 0.", { exact: false })).toBeVisible();
        const formCoverage = page.locator("#team-form details.compact-state-details");
        expect(await formCoverage.evaluate(el => el.open)).toBe(false);
        await formCoverage.locator(":scope > summary").focus();
        await page.keyboard.press("Enter");
        expect(await formCoverage.evaluate(el => el.open)).toBe(true);
        await expect(formCoverage.getByText("Quality: INSUFFICIENT SAMPLE", { exact: true })).toBeVisible();
      }

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(2);
      await page.screenshot({ path: `test-results/dashboard-${device.name}-${stateCase}-market-form.png`, fullPage: true });
    });
  }
}

test("article remains readable when English story cache/upstream is unavailable", async ({ page }) => {
  page.on("pageerror", error => console.log("PAGEERROR:", error.stack || error.message));
  await page.setViewportSize({ width: 1280, height: 820 });
  await mockApis(page, { withStory: false, legacyAnalysis: true });

  await page.goto("http://127.0.0.1:4173/");
  const homepageRow = page.locator('a[href*="FBTEST1"]').first();
  await expect(homepageRow.getByText("Northbridge FC", { exact: true })).toBeVisible();
  await expect(homepageRow.getByText("Riverside United", { exact: true })).toBeVisible();
  await expect(homepageRow.getByText("2-1", { exact: true })).toBeVisible();
  await homepageRow.click();

  await expect(page.getByText("FAST TRACKER MATCH ANALYSIS")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Northbridge FC vs Riverside United: evidence-based match analysis")).toBeVisible();
  await expect(page.getByText("Unknown — not zero absences", { exact: true })).toBeVisible();
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
  await expect(page.locator("#analysis .ft-article-safety-strip").getByText("Confirmed lineup with resolved player identities", { exact: true })).toBeVisible();
  await page.locator("#analysis details.ft-article-deep > summary").click();
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

  const article = page.locator("#analysis");
  await article.locator("details.ft-article-deep > summary").click();
  await expect(article.getByText(/G\. Segal/)).toBeVisible({ timeout: 10000 });
  await expect(article.getByText("Confirmed source + canonical player identity", { exact: true })).toBeVisible();
  await expect(article.getByText(/Evidence: phase2_player_status_evidence:178/)).toBeVisible();
  const sourceLink = page.locator('#analysis a[href="https://v3.football.api-sports.io/injuries"]');
  await expect(sourceLink).toHaveCount(1);
});

test("source-confirmed player with unresolved identity never becomes a confirmed fact", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await mockApis(page, { playerCase: "unresolved" });

  await page.goto("http://127.0.0.1:4173/");
  await page.locator('a[href*="FBTEST1"]').first().click();

  const article = page.locator("#analysis");
  await article.locator("details.ft-article-deep > summary").click();
  await expect(article.getByText(/Nico O'Reilly/)).toBeVisible({ timeout: 10000 });
  await expect(article.getByText("Source reports status · player identity unresolved", { exact: true })).toBeVisible();
  await expect(article.getByText("Confirmed source + canonical player identity", { exact: true })).toHaveCount(0);
  await expect(article.getByText(/phase2_player_status_evidence:586/)).toBeVisible();
});

test("ambiguous unconfirmed injury remains explicitly unresolved", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await mockApis(page, { playerCase: "ambiguous" });

  await page.goto("http://127.0.0.1:4173/");
  await page.locator('a[href*="FBTEST1"]').first().click();

  const article = page.locator("#analysis");
  await article.locator("details.ft-article-deep > summary").click();
  await expect(article.getByText("H · Lukas Provod", { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(article.getByText("Unconfirmed status · player identity unresolved", { exact: true })).toBeVisible();
  await expect(article.getByText("Confirmed source + canonical player identity", { exact: true })).toHaveCount(0);
});

test("official source lineup with unresolved player identity remains partial", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await mockApis(page, { unresolvedLineup: true });

  await page.goto("http://127.0.0.1:4173/");
  await page.locator('a[href*="FBTEST1"]').first().click();

  await expect(page.locator("#analysis .ft-article-safety-strip").getByText("Official lineup source confirmed · player identity reconciliation incomplete", { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Confirmed lineup with resolved player identities", { exact: true })).toHaveCount(0);
});


for (const lane of ["feed", "detail", "live", "analysis", "story"]) {
  test(`delayed ${lane} lane coalesces repeated refresh triggers`, async ({ page }) => {
    if (lane === "analysis" || lane === "story") {
      await page.addInitScript(() => {
        const nativeSetTimeout = window.setTimeout.bind(window);
        const nativeSetInterval = window.setInterval.bind(window);
        window.setTimeout = (fn, ms, ...args) => nativeSetTimeout(fn, ms === 600 ? 20 : ms, ...args);
        window.setInterval = (fn, ms, ...args) => nativeSetInterval(fn, ms === 300000 ? 80 : ms, ...args);
      });
    }

    let laneCalls = 0;
    let releaseGate;
    const gate = new Promise((resolve) => { releaseGate = resolve; });
    const maybeDelay = async (route, payload, status = 200) => {
      laneCalls += 1;
      await gate;
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
    };

    await page.route("**/functions/v1/app-phase1-feed?**", async (route) => {
      if (lane === "feed") {
        const url = new URL(route.request().url());
        expect(url.searchParams.get("view")).toBe("summary");
        return maybeDelay(route, fixtureFeed());
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtureFeed()) });
    });
    await page.route("**/functions/v1/app-match-detail?**", async (route) => {
      if (lane === "detail") return maybeDelay(route, detailPayload());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detailPayload()) });
    });
    await page.route("**/functions/v1/app-live-feed**", async (route) => {
      const payload = { generatedAt: new Date().toISOString(), matches: [] };
      if (lane === "live") return maybeDelay(route, payload);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
    });
    await page.route("**/functions/v1/app-match-analysis?**", async (route) => {
      if (lane === "analysis") return maybeDelay(route, analysisPayload());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(analysisPayload()) });
    });
    await page.route("**/functions/v1/app-match-story?**", async (route) => {
      if (lane === "story") return maybeDelay(route, storyPayload());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(storyPayload()) });
    });

    await page.goto("http://127.0.0.1:4173/details/?id=FBTEST1", { waitUntil: "domcontentloaded" });
    await expect.poll(() => laneCalls).toBe(1);

    if (lane === "feed" || lane === "detail" || lane === "live") {
      await page.evaluate(() => {
        window.dispatchEvent(new Event("pageshow"));
        window.dispatchEvent(new Event("pageshow"));
        window.dispatchEvent(new Event("pageshow"));
      });
    } else {
      await page.waitForTimeout(220);
    }

    expect(laneCalls).toBe(1);
    releaseGate();
    await page.waitForTimeout(80);
  });
}

test("deadline cleanup permits a later retry and an aborted old response cannot overwrite it", async ({ page }) => {
  await page.addInitScript(() => {
    const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
    Object.defineProperty(AbortSignal, "timeout", {
      configurable: true,
      value: (ms) => nativeTimeout(Math.min(Number(ms) || 0, 80)),
    });
  });

  let feedCalls = 0;
  await page.route("**/functions/v1/app-phase1-feed?**", async (route) => {
    feedCalls += 1;
    if (feedCalls === 1) {
      const oldFeed = fixtureFeed();
      oldFeed.matches[0].home = "Old Feed FC";
      oldFeed.matches[0].homeEn = "Old Feed FC";
      await new Promise((resolve) => setTimeout(resolve, 250));
      try {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(oldFeed) });
      } catch {}
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtureFeed()) });
  });
  await page.route("**/functions/v1/app-match-detail?**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "detail_unavailable" }) });
  });
  await page.route("**/functions/v1/app-live-feed**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generatedAt: new Date().toISOString(), matches: [] }) });
  });
  await page.route("**/functions/v1/app-match-analysis?**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "analysis_unavailable" }) });
  });
  await page.route("**/functions/v1/app-match-story?**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "story_unavailable" }) });
  });

  await page.goto("http://127.0.0.1:4173/details/?id=FBTEST1", { waitUntil: "domcontentloaded" });
  await expect.poll(() => feedCalls).toBe(1);
  await page.waitForTimeout(140);
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await expect.poll(() => feedCalls).toBeGreaterThanOrEqual(2);

  await expect(page.getByText("Northbridge FC", { exact: true }).first()).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(250);
  await expect(page.getByText("Old Feed FC", { exact: true })).toHaveCount(0);
});

test("live deadline cleanup permits a later live refresh after an aborted hang", async ({ page }) => {
  await page.addInitScript(() => {
    const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
    Object.defineProperty(AbortSignal, "timeout", {
      configurable: true,
      value: (ms) => nativeTimeout(Math.min(Number(ms) || 0, 80)),
    });
  });

  let liveCalls = 0;
  await page.route("**/functions/v1/app-phase1-feed?**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtureFeed()) });
  });
  await page.route("**/functions/v1/app-match-detail?**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "detail_unavailable" }) });
  });
  await page.route("**/functions/v1/app-live-feed**", async (route) => {
    liveCalls += 1;
    if (liveCalls === 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      try {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generatedAt: new Date().toISOString(), matches: [] }) });
      } catch {}
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        generatedAt: new Date().toISOString(),
        readHealth: { market: { status: "OK" }, score: { status: "OK" } },
        matches: [{
          id: "FBTEST1",
          live: {
            fetchedAt: new Date().toISOString(),
            score: { text: "1-0", home: 1, away: 0, minute: 52, status: "LIVE" }
          }
        }]
      })
    });
  });
  await page.route("**/functions/v1/app-match-analysis?**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "analysis_unavailable" }) });
  });
  await page.route("**/functions/v1/app-match-story?**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "story_unavailable" }) });
  });

  await page.goto("http://127.0.0.1:4173/details/?id=FBTEST1", { waitUntil: "domcontentloaded" });
  await expect.poll(() => liveCalls).toBe(1);
  await page.waitForTimeout(140);
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await expect.poll(() => liveCalls).toBeGreaterThanOrEqual(2);
  await expect(page.getByText("SUPABASE LIVE · ≤1m source", { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("1-0", { exact: true }).first()).toBeVisible();
});

test("transport-unavailable detail remains unavailable rather than becoming fixture-absent", async ({ page }) => {
  await page.route("**/functions/v1/app-phase1-feed?**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "phase1_unavailable" }) });
  });
  await page.route("**/functions/v1/app-live-feed**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generatedAt: new Date().toISOString(), matches: [] }) });
  });
  await page.route("**/functions/v1/app-match-detail?**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "detail_unavailable" }) });
  });

  await page.goto("http://127.0.0.1:4173/details/?id=FBTEST1");
  await expect(page.getByText("Match data is currently unavailable", { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Canonical fixture is unavailable", { exact: true })).toHaveCount(0);
});

test("conclusive canonical absence cannot be overwritten by a delayed older feed", async ({ page }) => {
  await page.route("**/functions/v1/app-phase1-feed?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtureFeed()) });
  });
  await page.route("**/functions/v1/app-live-feed**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generatedAt: new Date().toISOString(), matches: [] }) });
  });
  await page.route("**/functions/v1/app-match-detail?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        fixtureSource: "MISSING",
        fixture: null,
        models: {},
        humanFactors: { lineup: [], playerStatus: [] }
      })
    });
  });

  await page.goto("http://127.0.0.1:4173/details/?id=FBTEST1", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Canonical fixture is unavailable", { exact: true })).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(450);
  await expect(page.getByText("Canonical fixture is unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText("Northbridge FC", { exact: true })).toHaveCount(0);
});

test("authoritative stale detail remains ahead of a delayed prematch feed", async ({ page }) => {
  await page.route("**/functions/v1/app-phase1-feed?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtureFeed()) });
  });
  await page.route("**/functions/v1/app-live-feed**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generatedAt: new Date().toISOString(), matches: [] }) });
  });
  await page.route("**/functions/v1/app-match-detail?**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detailPayload({ historical: true })) });
  });
  await page.route("**/functions/v1/app-match-analysis?**", async (route) => {
    const payload = analysisPayload();
    payload.decision.oddsStatus = "STALE";
    payload.decision.candidateClass = "DATA_RISK";
    payload.decision.action = "NO_BET";
    payload.evidence.phase1Health.sourceMode = "DB_FALLBACK_FAIL_CLOSED";
    payload.governance.sourceMode = "DB_FALLBACK_FAIL_CLOSED";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
  await page.route("**/functions/v1/app-match-story?**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "story_unavailable" }) });
  });

  await page.goto("http://127.0.0.1:4173/details/?id=FBTEST1", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("SUPABASE DETAIL · fixture fallback", { exact: true })).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(450);
  await expect(page.getByText("SUPABASE DETAIL · fixture fallback", { exact: true })).toBeVisible();
  await expect(page.getByText("SUPABASE · fresh", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Stale-price protection is active.")).toBeVisible();
});
