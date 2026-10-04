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
const hkjcUpcoming = fs.readFileSync("supabase/functions/hkjc-upcoming-direct/index.ts", "utf8");
const hkjcLive = fs.readFileSync("supabase/functions/hkjc-live-direct/index.ts", "utf8");
const lineupPanel = fs.readFileSync("components/lineup-panel.js", "utf8");
const singleFlight = fs.readFileSync("lib/single-flight-fetch.js", "utf8");
const publicLogic = fs.readFileSync("lib/fast-tracker.js", "utf8");

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
  [analysis.includes('one("form_predictions")'), "goals analysis must query the validated Team Form model directly"],
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
  [phase1Feed.includes('hkjc-upcoming-direct?mode=summary') && phase1Feed.includes('winner = await upstreamPromise') && phase1Feed.includes('winner = await snapshotPromise') && phase1Feed.includes('semantics: "read_failure_not_fixture_absence"'), "homepage summary must prefer direct HKJC upstream and use the authority snapshot only as fallback"],
  [phase1Feed.includes('primaryMissingReason: "SUMMARY_AUTHORITY_ONLY"') && phase1Feed.includes('HKJC fixture authority is available; model enrichment is temporarily unavailable.'), "authority-only summary must preserve unknown model evidence rather than invent predictions"],
  [phase1Feed.includes('if (ageMinutes > 60) return { status: "STALE"') && phase1Feed.includes('if (ageMinutes > 30) return { status: "AGING"'), "authority snapshot freshness must not treat multi-hour HKJC data as fresh"],
  [phase1Feed.includes('const pricesFresh = freshness.status === "FRESH"') && phase1Feed.includes('market: pricesFresh ? noVig') && phase1Feed.includes('HKJC price snapshot is stale; fixture identity only'), "stale authority snapshot must preserve identity while suppressing prices and actionability"],
  [phase1Feed.includes('forebet: null') && phase1Feed.includes('dc: null') && phase1Feed.includes('pi: null') && phase1Feed.includes('form: null') && phase1Feed.includes('multi: null'), "authority-only summary must keep unavailable model channels null rather than zero"],
  [phase1Feed.includes('decision: null') && phase1Feed.includes('decisionEdge: null'), "authority-only summary must not fabricate betting decisions or edge"],
  [[hkjcUpcoming,hkjcLive].every((src)=>src.includes("DB_TIMEOUT_MS = 12_000") && src.includes("db: { retry:false }") && src.includes("global: { fetch: boundedDbFetch }")), "HKJC authority refresh functions must bound database operations and disable retry amplification"],
  [hkjcUpcoming.includes('mode")==="summary"') && hkjcUpcoming.includes('HKJC_OFFICIAL_GRAPHQL_READ_ONLY') && hkjcUpcoming.includes('requests:1'), "HKJC upcoming must expose a database-free one-request summary mode"],
  [hkjcLive.includes('mode")==="summary"') && hkjcLive.includes('gql(["HAD","EHA"],9000)') && hkjcLive.includes('mode:"summary"'), "HKJC live must expose a database-free bounded summary mode"],
  [liveFeedApi.includes('hkjc-live-direct?mode=summary') && liveFeedApi.includes('marketSource = "HKJC_DIRECT_UPSTREAM"') && liveFeedApi.includes('marketSource = "DATABASE_SNAPSHOT"'), "live feed must prefer direct HKJC authority and use DB only as fallback"],
  [!liveFeedApi.includes('error: String(error?.message') && liveFeedApi.includes('reason: "db_read_failed"'), "public live read-health must avoid exposing raw database error text"],
  [detail.includes('fetchWithDeadline(LIVE_FEED_URL') && detail.includes("35000"), "live client deadline must remain outside the bounded two-phase live server read window"],
  [[phase1Feed, detailApi, analysis, storyApi].every((src) => src.includes("db: { retry:false }")), "public read APIs must disable automatic PostgREST retries during saturation"],
  [analysis.includes('error:"analysis_read_unavailable"') && analysis.includes('semantics:"read_failure_not_fixture_absence"'), "analysis must distinguish upstream read failure from genuine fixture absence"],
  [analysis.includes('app-phase1-feed?hours=48&view=summary') && analysis.includes('summaryMatchToAnalysisRow') && analysis.indexOf('readSummaryAuthority(sbUrl,id)') < analysis.indexOf('db.rpc("ft_internal_app_phase1_feed"'), "analysis must prefer the bounded authority summary before the congested 48h RPC"],
  [analysis.includes('many("prediction_evidence_current","private")') && analysis.includes('forebetEvidenceHda=evidenceRow') && analysis.includes('modelTotals.data?.quality==="MODELED"'), "analysis must recover stored Forebet/internal model evidence without treating aggregate availability as independence"],
  [analysis.includes('"AUTHORITY_RPC_DEGRADED"'), "analysis fail-closed fallback must retain authority-RPC degradation provenance"],
  [storyApi.includes("AbortSignal.timeout(UPSTREAM_READ_TIMEOUT_MS)"), "story upstream analysis/detail reads must have a bounded deadline"],
  [storyApi.includes("AI_READ_TIMEOUT_MS = 15_000") && storyApi.includes("AbortSignal.timeout(AI_READ_TIMEOUT_MS)"), "optional AI story fetch must have its own bounded deadline"],
  [homepage.includes("let refreshInFlight = false") && homepage.includes("AbortSignal.timeout(20000)"), "homepage polling must remain single-flight with a browser deadline outside the 15s server read bound"],
  [detail.includes("const requestsInFlight = {") && detail.includes("if (cancelled || requestsInFlight.live) return;"), "detail live polling must coalesce overlapping requests"],
  [detail.includes('fetchWithDeadline(LIVE_FEED_URL + "?_=" + Date.now()') && detail.includes("35000"), "live polling must stay single-flight with a client deadline outside the reviewed server bound"],
  [detail.includes("requestsInFlight.match") && detail.includes("requestsInFlight.detail") && detail.includes("requestsInFlight.analysis") && detail.includes("requestsInFlight.story"), "detail full/detail/narrative lanes must remain single-flight"],
  [detail.includes("authoritativeDetailBlocksFeed") && detail.includes("canonicalMissing || authoritativeDetailBlocksFeed"), "delayed feed responses must not overwrite conclusive missing or authoritative stale detail state"],
  [detail.includes("singleFlightFetch(`match-detail:${matchId}`") && lineupPanel.includes("singleFlightFetch(`match-detail:${matchId}`"), "match detail and lineup consumers must share one page-level detail request"],
  [singleFlight.includes("const inFlight = new Map()") && singleFlight.includes("response.clone()"), "shared single-flight fetch must deduplicate consumers without sharing a consumed Response body"],
  [detail.includes("DETAIL_SUMMARY_FEED_URL") && detail.includes("view=summary"), "detail route Phase-1 refresh must use the bounded summary feed rather than full enrichments"],
  [detail.includes("let liveApplied = false") && detail.includes("if (liveApplied && previous?.live)") && detail.includes("if (!liveApplied)"), "newer live state must remain ahead of a later summary response"],
  [detail.includes("20000") && detail.includes("35000") && detail.includes("70000") && detail.includes("120000"), "browser deadlines must remain outside the corresponding bounded server-stage windows"],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error("Real-evidence safety contract failed:");
  for (const message of failed) console.error("- " + message);
  process.exit(1);
}
console.log("Real-evidence safety contract passed");
