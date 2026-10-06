import fs from "node:fs";

const analysis = fs.readFileSync("supabase/functions/app-match-analysis/index.ts", "utf8");
const detail = fs.readFileSync("components/match-detail-client.js", "utf8");
const homepage = fs.readFileSync("components/homepage-client.js", "utf8");
const article = fs.readFileSync("components/evidence-article.js", "utf8");
const sync = fs.readFileSync("supabase/functions/sync-fast-tracker/index.ts", "utf8");
const detailApi = fs.readFileSync("supabase/functions/app-match-detail/index.ts", "utf8");
const phase1Feed = fs.readFileSync("supabase/functions/app-phase1-feed/index.ts", "utf8");
const storyApi = fs.readFileSync("supabase/functions/app-match-story/index.ts", "utf8");
const liveFeedApi = fs.readFileSync("supabase/functions/app-live-feed/index.ts", "utf8");
const cloudIngest = fs.readFileSync("supabase/functions/flashscore-bet365-ingest/index.ts", "utf8");
const hkjcUpcoming = fs.readFileSync("supabase/functions/hkjc-upcoming-direct/index.ts", "utf8");
const hkjcLive = fs.readFileSync("supabase/functions/hkjc-live-direct/index.ts", "utf8");
const lineupPanel = fs.readFileSync("components/lineup-panel.js", "utf8");
const singleFlight = fs.readFileSync("lib/single-flight-fetch.js", "utf8");
const publicLogic = fs.readFileSync("lib/fast-tracker.js", "utf8");
const fotmobLineups = fs.readFileSync("supabase/functions/phase2-fotmob-lineups/index.ts", "utf8");
const liveScoreDirect = fs.readFileSync("supabase/functions/live-score-direct/index.ts", "utf8");
const liveSourceShadow = fs.readFileSync("supabase/functions/live-source-shadow/index.ts", "utf8");

const checks = [
  [analysis.includes("function statusIsTerminal"), "analysis must recognize terminal match states"],
  [analysis.includes("prematchPriceAgeSeconds"), "analysis must calculate prematch price age"],
  [analysis.includes("!kickoffStarted"), "prematch price must not remain actionable after kickoff"],
  [analysis.includes("prematchPriceAgeSeconds <= 6 * 60 * 60"), "prematch price-age ceiling must be enforced"],
  [analysis.includes('currentOdds: (!fresh || fallbackMode) ? null : bestOdds'), "stale HDA price must not be exposed as current"],
  [analysis.includes('oddsStatus: (!fresh || fallbackMode) ? "REFERENCE_STALE" : "CURRENT"'), "stale HDA price must be labelled reference-only"],
  [analysis.includes('else if (decisionFamilies.length < 2) candidate = "WATCH"'), "HDA value classification must require at least two independent families"],
  [analysis.includes('if (!usable || !opts.fresh || opts.fallbackMode)'), "Asian handicap must fail closed when market/model/freshness is unusable"],
  [analysis.includes('else if (!models.length) candidateClass = "NO_MODEL"'), "binary market advice must distinguish no model from no edge"],
  [analysis.includes('oneWith(coreDb,"form_prediction_current")'), "goals analysis must query the validated Team Form model directly in the critical evidence lane"],
  [analysis.includes('formQuality === "FORM_MODELED"'), "Team Form goals input must pass the model quality gate"],
  [analysis.includes('formHomeGames >= 8') && analysis.includes('formAwayGames >= 8'), "Team Form goals input must preserve minimum sample-size gates"],
  [analysis.includes('key: "FORM"') && analysis.includes('method: live ? "LIVE_FORM_RESIDUAL" : "FORM_XG_POISSON"'), "Team Form xG must remain a distinct market-specific goals family"],
  [analysis.includes("collapseCorrelatedBinaryModels(rawModels)"), "binary market evidence must collapse correlated source groups before Value gating"],
  [analysis.includes("collapseCorrelatedFamilies(families)"), "HDA evidence must collapse correlated source groups before consensus/value gating"],
  [analysis.includes('knownProvenanceGroup(modelTotals.data?.model_source)'), "Dixon-Coles goals provenance must come from the actual model source"],
  [analysis.includes('knownProvenanceGroup(formRow?.model_source)'), "Team Form goals provenance must come from the actual model source"],
  [detail.includes("priceObservedAt = fixture.odds_updated_at"), "detail fallback must use actual quote observation timestamp"],
  [detail.includes("fallbackStale || previousStarted"), "stale authoritative detail must replace cached prematch price state"],
  [article.includes("confirmedStarters"), "article must distinguish starters from confirmed bench rows"],
  [article.includes("kickoffStarted"), "article must independently fail closed after kickoff"],
  [sync.includes('batchSize=300'), "sync upsert helper must support bounded batch sizing"],
  [sync.includes('"hkjc_event_id",false,50)'), "HKJC odds sync must use smaller batches after observed statement timeout"],
  [detailApi.includes('identity_status:identityStatus') && detailApi.includes('const identityStatus=canonical?"CANONICAL":"UNRESOLVED"'), "detail API must expose canonical player identity state"],
  [detailApi.includes('fact_status:factStatus'), "detail API must distinguish source confirmation from canonical fact confirmation"],
  [detailApi.includes('forebetEvidenceFallback(predictionEvidence.data)') && detailApi.includes('source:"PREDICTION_EVIDENCE_CURRENT"') && detailApi.includes('source_key:"FOREBET"'), "detail Forebet fallback must reuse stored prediction evidence without inventing a second source"],
  [analysis.includes('uniqueConfirmedClaims(playerStatusRowsAnnotated)'), "analysis must deduplicate overlapping player-status records by claim fingerprint"],
  [analysis.includes('row.fact_status!=="CONFIRMED"'), "analysis must exclude unresolved player identity from confirmed human-factor counts"],
  [analysis.includes('evidenceKey: `form_predictions:${id}`') && analysis.includes('evidenceKey: `model_predictions:${id}`'), "model claims must carry durable source-record evidence keys"],
  [article.includes("Confirmed source + canonical player identity"), "article must label canonical confirmation explicitly"],
  [article.includes("Source reports status · player identity unresolved"), "article must label source-confirmed unresolved identity explicitly"],
  [article.includes("Evidence: {row.evidenceKey}"), "article must render durable player evidence keys"],
  [publicLogic.includes("independentEligible:false"), "public value logic must exclude aggregates with unproven source-record independence"],
  [[phase1Feed, detailApi, analysis, storyApi].every((src) => src.includes("DB_READ_TIMEOUT_MS = 15_000")), "public read APIs must enforce the bounded 15s PostgREST deadline"],
  [liveFeedApi.includes("DB_READ_TIMEOUT_MS = 15_000") && liveFeedApi.includes("global: { fetch: boundedDbFetch }"), "live feed must enforce the same bounded 15s PostgREST deadline"],
  [liveFeedApi.includes("db: { retry: false }"), "live feed must disable built-in PostgREST retries during saturation"],
  [liveFeedApi.includes('readHealth[lane]') && liveFeedApi.includes('status: "UNAVAILABLE"'), "live feed enrichment failures must remain distinguishable from absent data"],
  [liveFeedApi.includes('semantics: "read_failure_not_fixture_absence"'), "live feed top-level failure must explicitly remain distinct from fixture absence"],
  [cloudIngest.includes('MAX_AGE_MS = 20 * 60 * 1000') && cloudIngest.includes('identity = "AMBIGUOUS"') && cloudIngest.includes('identity === "VERIFIED"') && cloudIngest.includes('ft_replace_bookmaker_current_generic') && cloudIngest.includes('ft_insert_market_snapshots_generic') && cloudIngest.includes('market:"ML"'), "cloud bookmaker ingest must fail closed on stale/ambiguous identity and persist only verified market snapshots"],
  [!phase1Feed.includes('bet365_browser_live_current') && !liveFeedApi.includes('bet365_browser_live_current') && !detailApi.includes('bet365_browser_live_current') && !analysis.includes('bet365_browser_live_current'), "active public consumers must not depend on the retired Bet365 browser tables"],
  [analysis.includes('bookmaker_home_odds: null') && analysis.includes('const hdcAuthority:any = live ? null') && analysis.includes('const currentGoalsLine = live ? null') && analysis.includes('const currentCornersLine = live ? null'), "live analysis must not calculate EV from prematch/reference bookmaker prices when no verified in-play market exists"],
  [liveFeedApi.includes('"live_detail_shadow_feed_current"') && liveFeedApi.includes('shadowDetail: shadowDetailMap.get') && liveFeedApi.includes('provenance: "SHADOW_PROVIDER_DETAIL"'), "live feed must expose verified provider events as a separate shadowDetail evidence lane"],
  [liveFeedApi.includes('String(row.detail_status || "").toUpperCase() !== "CAPTURED"') && liveFeedApi.includes('age > 10') && liveFeedApi.includes('!events.length'), "shadowDetail evidence must fail closed on stale, unconfirmed or event-empty provider detail"],
  [detail.includes('match.live?.shadowDetail') && detail.includes('liveShadowEvents') && detail.includes('EVENTS <b>') && detail.includes('"CAPTURED_NO_METRICS"') && detail.includes('"no metrics"'), "public live UI must distinguish verified events from unavailable stats"],
  [detail.includes("Provider event evidence only · not promoted to xG, shots, corners or model inputs"), "public live UI must state that shadow event evidence is not promoted into model/stat inputs"],
  [homepage.includes("NEXT_PUBLIC_FAST_TRACKER_LIVE_FEED_URL") && homepage.includes("function mergeLiveOverlay") && homepage.includes('liveById.get(String(authority.id ?? ""))') && homepage.includes("if (!liveRow?.live) return authority") && homepage.includes("live: liveRow.live"), "homepage must promote current live evidence only when it matches a canonical fixture id"],
  [homepage.includes("setInterval(refreshLiveOverlay, 30000)") && homepage.includes("cache: \"no-store\""), "homepage live overlay must refresh independently without replacing authority cadence"],
  [phase1Feed.includes('"FLASHSCORE_BET365"') && phase1Feed.includes('"cloud_ingest"') && phase1Feed.includes('CANONICAL_FIXTURES_FLASHSCORE_BET365') && !phase1Feed.includes('hkjc-upcoming-direct?mode=summary'), "homepage summary must use canonical fixtures plus the cloud Flashscore/Bet365 authority without retired HKJC upstream"],
  [phase1Feed.includes('primaryMissingReason: "SUMMARY_AUTHORITY_ONLY"') && phase1Feed.includes('forebet: null') && phase1Feed.includes('dc: null') && phase1Feed.includes('pi: null') && phase1Feed.includes('form: null') && phase1Feed.includes('multi: null'), "authority-only summary must preserve unknown model evidence rather than invent predictions"],
  [phase1Feed.includes('if (ageMinutes > 60) return { status: "STALE"') && phase1Feed.includes('if (ageMinutes > 30) return { status: "AGING"'), "bookmaker authority freshness must not treat multi-hour price data as fresh"],
  [phase1Feed.includes('const pricesFresh = freshness.status === "FRESH"') && phase1Feed.includes('market: pricesFresh ? noVig') && phase1Feed.includes('Bet365 price snapshot is stale or unavailable; fixture identity only'), "stale cloud bookmaker snapshot must preserve identity while suppressing prices and actionability"],
  [phase1Feed.includes('forebet: null') && phase1Feed.includes('dc: null') && phase1Feed.includes('pi: null') && phase1Feed.includes('form: null') && phase1Feed.includes('multi: null'), "authority-only summary must keep unavailable model channels null rather than zero"],
  [phase1Feed.includes('decision: null') && phase1Feed.includes('decisionEdge: null'), "authority-only summary must not fabricate betting decisions or edge"],
  [phase1Feed.includes('lightweightFullRecovery') && phase1Feed.includes('prediction_evidence_feed_current') && phase1Feed.includes('quality==="MODELED"'), "full-feed degradation must recover canonical evidence without promoting unmodeled DC/Pi"],
  [analysis.includes('createReadClientWithTimeout') && analysis.includes('optionalDb') && detailApi.includes('createReadClientWithTimeout') && detailApi.includes('AUTHORITY_SUMMARY'), "detail and analysis must isolate optional enrichment pressure from canonical fixture/model recovery"],
  [[hkjcUpcoming,hkjcLive].every((src)=>src.includes('error: "source_retired"') && src.includes('replacement: "FLASHSCORE_BET365"') && src.includes('status: 410')), "retired HKJC authority functions must remain hard tombstones pointing to the cloud replacement"],
  [hkjcUpcoming.includes('source: "hkjc-upcoming-direct"') && hkjcUpcoming.includes('replacement: "FLASHSCORE_BET365"') && hkjcUpcoming.includes('status: 410'), "HKJC upcoming must remain retired and unable to collect new authority data"],
  [hkjcLive.includes('source: "hkjc-live-direct"') && hkjcLive.includes('replacement: "FLASHSCORE_BET365"') && hkjcLive.includes('status: 410'), "HKJC live must remain retired and unable to collect new authority data"],
  [liveFeedApi.includes('from("live_score_feed_current")') && liveFeedApi.includes('FLASHSCORE_BET365_REFERENCE') && liveFeedApi.includes('NO_VERIFIED_IN_PLAY_BOOKMAKER_ODDS') && liveFeedApi.includes('PREMATCH_OR_NON_LIVE_REFERENCE_ONLY') && !liveFeedApi.includes('bet365_browser_live_current'), "live feed must admit live fixtures from fresh score identity and keep cloud bookmaker prices reference-only until verified in-play"],
  [!liveFeedApi.includes('error: String(error?.message') && liveFeedApi.includes('reason: "db_read_failed"'), "public live read-health must avoid exposing raw database error text"],
  [detail.includes('fetchWithDeadline(LIVE_FEED_URL') && detail.includes("35000"), "live client deadline must remain outside the bounded two-phase live server read window"],
  [[phase1Feed, detailApi, analysis, storyApi].every((src) => src.includes("db: { retry:false }")), "public read APIs must disable automatic PostgREST retries during saturation"],
  [analysis.includes('error:"analysis_read_unavailable"') && analysis.includes('semantics:"read_failure_not_fixture_absence"'), "analysis must distinguish upstream read failure from genuine fixture absence"],
  [analysis.includes('app-phase1-feed?hours=48&view=summary') && analysis.includes('summaryMatchToAnalysisRow') && analysis.indexOf('readSummaryAuthority(sbUrl,id)') < analysis.indexOf('db.rpc("ft_internal_app_phase1_feed_generic"'), "analysis must prefer the bounded authority summary before the congested 48h RPC"],
  [analysis.includes('prediction_evidence_feed_current') && analysis.includes('forebetEvidenceHda=evidenceRow') && analysis.includes('modelTotals.data?.quality==="MODELED"'), "analysis must recover stored Forebet/internal model evidence before optional fan-out without treating aggregate availability as independence"],
  [analysis.includes('"AUTHORITY_RPC_DEGRADED"'), "analysis fail-closed fallback must retain authority-RPC degradation provenance"],
  [storyApi.includes("AbortSignal.timeout(UPSTREAM_READ_TIMEOUT_MS)"), "story upstream analysis/detail reads must have a bounded deadline"],
  [storyApi.includes("AI_READ_TIMEOUT_MS = 15_000") && storyApi.includes("AbortSignal.timeout(AI_READ_TIMEOUT_MS)"), "optional AI story fetch must have its own bounded deadline"],
  [homepage.includes("let refreshInFlight = false") && homepage.includes("AbortSignal.timeout(20000)"), "homepage polling must remain single-flight with a browser deadline outside the 15s server read bound"],
  [detail.includes("const requestsInFlight = {") && detail.includes("if (cancelled || requestsInFlight.live) return;"), "detail live polling must coalesce overlapping requests"],
  [detail.includes('fetchWithDeadline(LIVE_FEED_URL + "?_=" + Date.now()') && detail.includes("35000"), "live polling must stay single-flight with a client deadline outside the reviewed server bound"],
  [detail.includes("requestsInFlight.match") && detail.includes("requestsInFlight.detail") && detail.includes("requestsInFlight.analysis") && detail.includes("requestsInFlight.story"), "detail full/detail/narrative lanes must remain single-flight"],
  [fotmobLineups.includes("DETAIL_TIMEOUT_MS=5_000") && fotmobLineups.includes("DETAIL_CONCURRENCY=3") && fotmobLineups.includes("await mapLimit(picked,DETAIL_CONCURRENCY"), "FotMob lineup producer must bound provider latency and avoid sequential detail starvation"],
  [liveScoreDirect.includes("DB_READ_TIMEOUT_MS = 8_000") && liveScoreDirect.includes("UPSTREAM_TIMEOUT_MS = 20_000") && liveScoreDirect.includes("db:{retry:false}") && liveScoreDirect.includes("global:{fetch:boundedDbFetch}"), "live-score-direct must bound DB/upstream I/O without retry amplification"],
  [liveSourceShadow.includes("DB_READ_TIMEOUT_MS = 8_000") && liveSourceShadow.includes("IDENTITY_CONCURRENCY = 3") && liveSourceShadow.includes("await mapLimit(identityRows,IDENTITY_CONCURRENCY") && liveSourceShadow.includes("await mapLimit(liveDetailCandidates.slice(0,2),2"), "live-source-shadow must bound DB/provider I/O and avoid sequential identity/detail starvation"],
  [liveSourceShadow.includes("function flattenFotmobHeaderEvents") && liveSourceShadow.includes("events:flattenFotmobHeaderEvents(detail?.header?.events)") && !liveSourceShadow.includes("events:Array.isArray(detail?.header?.events)?detail.header.events:[]"), "live-source-shadow must accept grouped FotMob header events without treating real events as no-metrics"],
  [liveSourceShadow.includes("const liveGaps=Math.max(0,liveTargets-liveMatched)") && liveSourceShadow.includes("prewarm provider coverage") && liveSourceShadow.includes("is non-blocking before kickoff"), "live-source-shadow must not escalate prewarm-only provider gaps into live coverage alerts"],
  [liveSourceShadow.includes('db.from("team_aliases")') && liveSourceShadow.includes('.in("source",["FOTMOB","SOFASCORE"])') && liveSourceShadow.includes('.gte("confidence",0.94)'), "live-source-shadow must reuse only active high-confidence provider aliases rather than lowering identity thresholds"],
  [phase1Feed.includes("fullRpcDb = createReadClientWithTimeout(supabaseUrl,serverKey,8_000)") && phase1Feed.includes("const [evidenceResult,modelResult,lineupResult,sourceDetailResult]=await Promise.all"), "full-feed fallback must abandon the congested RPC quickly and recover evidence/model in parallel"],
  [detail.includes("authoritativeDetailBlocksFeed") && detail.includes("canonicalMissing || authoritativeDetailBlocksFeed"), "delayed feed responses must not overwrite conclusive missing or authoritative stale detail state"],
  [detail.includes("singleFlightFetch(`match-detail:${matchId}`") && lineupPanel.includes("singleFlightFetch(`match-detail:${matchId}`"), "match detail and lineup consumers must share one page-level detail request"],
  [singleFlight.includes("const inFlight = new Map()") && singleFlight.includes("response.clone()"), "shared single-flight fetch must deduplicate consumers without sharing a consumed Response body"],
  [detail.includes("DETAIL_SUMMARY_FEED_URL") && detail.includes("view=summary"), "detail route Phase-1 refresh must use the bounded summary feed rather than full enrichments"],
  [detail.includes("let liveApplied = false") && detail.includes("if (liveApplied && previous?.live)") && detail.includes("if (!liveApplied)"), "newer live state must remain ahead of a later summary response"],
  [detail.includes("20000") && detail.includes("35000") && detail.includes("70000") && detail.includes("120000"), "browser deadlines must remain outside the corresponding bounded server-stage windows"],
  [detailApi.includes('joinMethod:"EXACT_FOTMOB_PLAYER_ID"') && detailApi.includes('playerMatchStatsById.get(key)') && detailApi.includes('source.startsWith("FOTMOB")'), "lineup player match stats must join by exact FotMob player id rather than fuzzy names"],
  [phase1Feed.includes('if (ageMinutes > 20) return { status: "STALE", ageMinutes };') && phase1Feed.includes('const bookmakerHealthy=bet365HeartbeatStatus==="OK"') && phase1Feed.includes('const b:any=bookmakerHealthy ? (bet365ById.get(id)||null) : null;'), "Phase 1 summary must suppress bookmaker odds when the cloud source is stale or unhealthy"],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error("Real-evidence safety contract failed:");
  for (const message of failed) console.error("- " + message);
  process.exit(1);
}
console.log("Real-evidence safety contract passed");
