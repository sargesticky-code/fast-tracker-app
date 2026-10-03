# Fast Tracker Product Goal and Acceptance Checklist

## Product goal

**Dashboard-first priority — 3 October 2026:** visible public UI work takes precedence over further expansive provider/provenance audits in this review batch. Existing statistics are adequate to build the coherent public experience now; unresolved data/source gaps remain explicit and must not be filled with invented values.

Fast Tracker is being built as a mature, English-first football intelligence website. The public product should be information-dense, responsive and easy to scan, using Forebet as a structure/usability reference while keeping Fast Tracker's own navy/blue/yellow identity and its own information architecture.

The target is not a cosmetic homepage. The product must connect real fixtures, canonical identities, market prices, model evidence, team/player context, live state and readable recommendation articles into one coherent public flow.

Public presentation is English from now on. Source-native names, raw provider fields and historic records may remain internally where needed, but public labels, navigation, match details, recommendations, explanatory copy and release/phase reports must be readable English.

Internal engineering codes, phase machinery, source-health diagnostics and raw coverage/debug data belong in internal views such as `/system`, not the public homepage.

## Historical foundations to preserve and audit

Do not invent replacement phases. Reuse and verify the existing work:

- **Phase 1** — canonical fixtures/odds, Forebet and internal prediction families, team form, H2H, value/market calculations and odds movement.
- **Phase 2** — team/player identity, lineups, injuries/suspensions, managers and human-factor evidence. Missing evidence is unknown, never zero strength. Confirmed and predicted lineups must remain distinct. Unresolved injury/player identity must remain distinct from confirmed player status.
- **Graph Sandwich / Human Factors / FHRE** — contextual and regime/live analysis layers that augment, but do not overwrite, independent evidence families.
- **Phase 3** — live score/stat freshness, expected-vs-actual state and live recommendation gating.
- **Story / interpretation layer** — deterministic evidence-grounded analysis first; AI narration may rewrite only supplied evidence and must never invent or override calculations.

## Product acceptance checklist

### 1. Public product and deployment

- [x] English public homepage on PR #2 has league/date/live/value navigation, search, combined H/D/A probability strip, HDA/goals/corners market-price switching, predictions, live-score presentation, match detail links and planned ad positions. Production cutover is still separate.
- [x] Responsive desktop/mobile homepage → filters → match detail sections → evidence article flows are verified on the PR-head rendered artifact; production URL verification remains separate.
- [x] Internal engineering/coverage diagnostics moved out of the public homepage and available in `/system`.
- [x] Lower public match-detail sections (model consensus, goals/corners, team form, H2H, human factors and lineups) use the same English navy/blue/yellow visual system and preserve unknown/fail-closed states.
- [x] Progressive disclosure keeps decision/status, bookmaker price, article conclusion, model consensus, team form and Team News immediately scannable while full article evidence, deep model rows, H2H meeting detail and the full lineup tool remain keyboard-accessible on demand.
- [x] Goals/Corners no-model and no-line states are compact without hiding the HKJC market identity, line, Over/Under prices, quote/freshness state or exact missing-model reason; supported market-specific probability rows remain rich.
- [x] Goals and Corners keep independent model gates: one market's probability evidence never upgrades or substitutes for the other market.
- [x] Full lineup tooling follows the decision/intelligence flow instead of preceding it; the main Team News safety/unknown state stays visible in the public flow.
- [x] Empty-state density is compact for Market Comparison and Recent Form: no-model/no-comparable-price and no-history states show the exact reason plus safety/freshness without rendering fake zero metrics.
- [x] Partial Market/Form coverage keeps available real statistics rich while compressing only the missing model/side state; populated cases retain the full existing panels.
- [x] Rendered responsive verification now covers populated, partial and empty Market/Form states on desktop and mobile.
- [x] Suitable maintained open-source components are used where they reduce bespoke UI risk (including Lucide icons, DayPicker and Playwright-rendered review checks).
- [ ] Repository branches, PRs and deployment targets are audited before releases.
- [ ] Railway/Cloudflare roles are verified from current configuration and reachable deployment evidence; a failure on a standby target is not treated as the sole release blocker.
- [ ] PR #2 remains unmerged until build/render/data-flow verification passes.

### 2. Comprehensive football and bookmaker data

- [x] Inventory current audited providers and market coverage with working/partial/missing status in `docs/provider-inventory.md`; continue extending as new sources are added.
- [ ] Do not call one bookmaker feed “multi-bookmaker”.
- [ ] HKJC remains a distinct named bookmaker/source where applicable.
- [ ] Add multiple distinct authorized bookmaker sources only when real feeds and rights/credentials exist.
- [ ] Canonical provider/market/line/price/as-of contract is implemented in branch code and reviewed SQL; production migration/application remains pending.
- [ ] Support HDA, Asian handicap, goals, BTTS and corners where the source genuinely supplies them.
- [ ] Show meaningful cross-bookmaker comparison and best available price only when at least two distinct bookmaker observations exist.
- [ ] Show odds movement only from genuine timestamped historical observations.
- [ ] If a source requires credentials, subscription or spend, record the exact dependency and continue independent work elsewhere.

### 3. Match intelligence

- [ ] Canonical match joins connect form, home/away records, goals/xG, H2H, lineups, injuries/suspensions, live scores and live stats.
- [ ] Audited goals evidence now carries source/provenance/fetch context and market as-of; continue normalizing the same contract across every evidence family.
- [ ] Observed facts and derived estimates are explicitly distinguished.
- [x] English article explicitly labels Team Form/Dixon-Coles expected goals as model estimates, not observed xG.
- [x] Current article/Phase 2 path keeps missing player-status/injury evidence unknown rather than zero; continue auditing other evidence families.
- [x] Confirmed versus predicted lineups remain distinct, including row-level confirmed evidence when event-map metadata is absent.
- [x] Player/injury unresolved identity audited in review: source-confirmed rows require canonical `phase2_players` identity before becoming confirmed facts; unresolved and unconfirmed rows remain explicit.

### 4. Market-specific recommendations

- [ ] Recommendation logic distinguishes: negative/no value; weak or conflicting evidence; stale/missing/unusable data.
- [x] Independent evidence families remain independent in the audited HDA/goals paths; Team Form goals is a distinct family and single-source evidence remains WATCH.
- [x] HDA consensus is not borrowed to manufacture confidence for unrelated markets; goals wiring/test coverage now enforces its own model families.
- [ ] HDA, Asian handicap, goals, BTTS and corners use market-specific prices, lines and calculations.
- [ ] No confidence, probability, injury, xG, quote or historical result is invented.
- [ ] Watch / skip / unavailable states explain why.

### 5. Recommendation articles

Each substantial match preview/article must include:

- [x] Readable English headline and conclusion are rendered in the public evidence article, with a coordinated responsive editorial layout on PR #2.
- [ ] Match context.
- [ ] Specific sourced statistics with period/sample size.
- [ ] Team/lineup/injury news with confirmed/predicted/unresolved status.
- [ ] Bookmaker, market, line, price and as-of timestamp.
- [ ] Reasoning connecting evidence to the selected market.
- [ ] Counterevidence, model disagreement and uncertainty.
- [ ] Clear watch/skip/unavailable explanation when no actionable recommendation exists.
- [ ] Separation of factual observations, model estimates and editorial conclusion.
- [ ] Links/keys back to stored evidence/source records.
- [ ] Cached/versioned output tied to a data snapshot/hash.
- [ ] Stale recommendation marking after material evidence/price changes.

### 6. Quality and verification

- [ ] Verify multi-bookmaker comparison against real distinct bookmaker rows.
- [ ] Verify article claims against stored evidence.
- [ ] Verify canonical identity joins and unresolved-identity behaviour.
- [x] Fixture tests verify missing-English-story and stale-price fail-closed behavior; FB6114 adds real missing-provider/player-status and zero-H2H evidence verification.
- [ ] Market-specific stale/family gates and Team Form goals wiring are fixture-tested; real FB6231 verifies a fresh single-family goals calculation, but a real fresh >=2-family goals fixture is still required before Value-path verification.
- [x] Desktop and mobile homepage-to-filters-to-detail-sections-to-article flows pass Playwright on the PR artifact, including English-only public copy, horizontal-overflow checks, decision-before-full-lineup ordering, and keyboard Enter open/close verification for article/model/H2H/full-lineup disclosures.
- [ ] Verify actual public and preview URLs. PR CI now publishes desktop/mobile rendered screenshots as a durable review artifact; this is not a production-deployment claim.
- [ ] Record recommendation outcomes/calibration only where genuine historical results permit it.
- [ ] Do not advertise a win rate or success claim that has not been measured.
- [ ] A phase is complete only when there is an artifact plus appropriate verification.

## Change discipline

Major changes are holistic alterations, not isolated visual patches. Before changing a component, audit its upstream data, identity/freshness dependencies, market calculations, article/evidence consumers and rendered user flow. Batch related changes into reviewable commits/PRs. Each progress report should state: what changed, why, verification/evidence, remaining gaps and the next dependency-ordered step.

Routine development, testing, debugging and transitions between already agreed phases are authorized without repeated “continue?” prompts. Real access, credential, spending and production-release gates still require their genuine controls.


### Deployment/migration review

- [x] Production market-quote migration review artifact exists with prerequisites, access-policy checks, validation sequence and non-destructive recovery steps.
- [ ] Production market-quote migration applied — **approval required; not performed**.
- [ ] Updated analysis/sync Edge Functions deployed — **production release gate; not performed**.


### Canonical sync freshness/application

- [ ] Uploaded core artifact hashes match applied canonical-table hashes after a successful sync. Current production is behind for model/form because the latest sync timed out on HKJC odds.
- [x] Review code batches HKJC odds writes to reduce the observed statement-timeout failure mode.
- [ ] Production sync fix deployed and latest model/form/Forebet availability artifacts successfully applied — **production deployment gate; not performed**.


### Source-record traceability

- [x] Audited player-status and lineup evidence has durable table-row evidence keys in review.
- [x] Stored source links are exposed when present; absent links remain unavailable rather than inferred.
- [x] Player/injury facts require source confirmation + canonical player identity before `CONFIRMED`.
- [x] Overlapping human evidence is grouped by canonical player/status record rather than provider label.
- [x] Unknown model lineage and multi-source aggregates with unproven member lineage cannot create an independent evidence vote.
- [x] Missing Dixon-Coles training-period dates remain explicitly unknown.
- [ ] Live score/stat/player evidence has the same durable record-key + duplicate-observation lineage contract.
- [ ] Complete field-by-field English article provenance census beyond the audited market/model/player claims.
- [ ] External player-ID ingestion map for FOTMOB/Flashscore to canonical `phase2_players` — exact upstream identity dependency, not solved by fuzzy promotion.

- [x] Rendered responsive coverage includes populated/partial/empty Goals/Corners states on desktop and mobile, including keyboard expansion of secondary market metadata and homepage → detail → markets → article flow.

## Recovery delivery gate — 2026-10-03

- Baseline source: `b3d20007bcddd44c0b63dd3311564e375f2392c9`.
- PR #3 head `a07a51b37d8a0e8641dbb4de833f702c31fea299` is a CI-only verification carrier, not deployed patched source.
- Carrier CI run `37125963662` passed the exact baseline blob gate, `git apply --check`, exact patched blob gate, contracts, static build and 26/26 Playwright cases.
- Exact patched source blobs verified by CI:
  - homepage `5ad4b81c66fb47d088f9e7cacf42021c7ff516b3`
  - detail `66e1222e7653e8b01f881544c32bffbc13eb1abe`
  - lineup `52d46439bfdf085f4cd8e0ba5ce05da5ebc6c52b`
  - story `bb018da84110b4782632fdf9deb9fa1ab34b0875`
  - recovery source contract `61c44d21b01a27557efc424aeca83eb3e2fb3cf7`
  - recovery browser flow `c16e89712ffd43dfded19f3ddf314f20dfebdf24`
- Screenshot artifact: GitHub Actions artifact `11274697692`, name `dashboard-redesign-61465eb5f2890d4353c295474508013aebb83f7c`, digest `sha256:4d808ad56eb28871332dd757751d6db2f66f9b03ac7d2feae7d8780b35d48786`.
- Exact CI screenshots were visually reviewed on desktop and 390px mobile. No overlap, raw escape text, misleading 0/11 state, or obvious empty-state integration break was found.
- Cloudflare non-production branch builds are disabled; review branches are CI/review only. Railway production service `fast-tracker-public` remains sourced from `main` only.
- Safety gates remain fail-closed: unknown is not zero; unresolved canonical fixture/player identity is not promoted; stale/reference-only prices remain non-actionable / NO_BET.
- Still outstanding before dashboard delivery: production Phase-1 RPC 57014 tail latency; live story fix not released/verified against the real endpoint; current canonical fixture/feed recovery not proven; real-device/live mobile acceptance remains separate from deterministic CI mobile coverage.
- No merge, production/preview deployment, Edge release, migration, DB write, generated feed publication, access expansion or spending is authorized by this checkpoint.

## Focused PR4 source review acceptance — 2026-10-03

- Reviewed source base remains `b3d20007bcddd44c0b63dd3311564e375f2392c9`.
- PR #4 source revision `acf362499f0f0ce293a975be24b0ff004eb962a2` was reviewed against the exact base and its directly affected dependencies.
- Six executable source/test blobs at that revision:
  - homepage `74f9487aef1d3ea82f8857866c0a4ed55d622d76`
  - detail `66e1222e7653e8b01f881544c32bffbc13eb1abe`
  - lineup `52d46439bfdf085f4cd8e0ba5ce05da5ebc6c52b`
  - story `bb018da84110b4782632fdf9deb9fa1ab34b0875`
  - recovery source contract `83f51b47d38399a35a03fb709c07b43a9bc307b5`
  - recovery browser flow `0495f7e99426dab2279c585824ec0d29c06bf8f8`
- One actionable review defect was found and fixed before acceptance: after a successful fixture refresh followed by an outage, retained rows were visible without an explicit stale/freshness warning. The UI now labels them as cached and states that freshness is unknown until refresh recovers.
- Race precedence is now covered in both orders: a fresh Phase-1 fixture survives a later `fixtureSource=MISSING` detail response, and a later fresh Phase-1 fixture can recover the route after the missing-detail state was shown. Detail/lineup identity remains fail-closed while canonical detail identity is unresolved.
- Source-confirmed unresolved lineup/player rows remain outside confirmed XI counts; unresolved counts render `—/11` or resolved-only counts, never a false zero.
- Story numeric guards use `num(...)` before Corners/avg-goals formatting and do not enter missing-object dereference branches.
- Revised CI-only carrier head: `a499db6e49c23803720d4f2aeeaf7cbced0f6151`.
- Revised carrier CI run `37127248110`: SUCCESS; exact baseline/apply/blob/doc checks, contracts, static build, and 29/29 Playwright cases passed in 26.2s.
- Revised screenshot artifact: `11275733021`, name `dashboard-redesign-f1e9d88a19e94465037d2e40a7b0b486cfff30fc`, digest `sha256:ce5380478ab1de3521160903a26156013cc099e82748ff3325c48c892ab5973e`.
- PR #3 remains a CI verification carrier; neither carrier head is deployed patched source.
- CI screenshots and browser cases remain deterministic/mocked coverage, not evidence that the live Supabase feed/story or real mobile device is healthy.
- Open delivery gaps remain: Phase-1 production RPC 57014 tail latency, unreleased/unverified live story fix, live canonical fixture/feed recovery, and real-device/live-data mobile acceptance.
- Cloudflare non-production branch builds remain disabled and Railway production remains sourced from `main` only.
- No merge, production/preview deployment, Edge release, migration, DB write, feed publication, access expansion or spending is authorized by this acceptance.

## Visual acceptance and unreleased live checks — 2026-10-03

- Exact executable source commit under review: `d89e89621a12135d78976d5766cfc41b935614b5`.
- CI-only carrier head: `b174b2d95a2f2fd4dc773fc50827f619c0d85dd3`.
- CI run `37127767797`: SUCCESS.
- Recovery/browser total: 32/32 Playwright cases.
- Visual artifact: `11276045021`, name `dashboard-redesign-0992a339fc281bb85440a8da272a6cfb1cd56ed7`, digest `sha256:3e63c46601d5273acde0eee90cebe9e4fac204e4be14f1ddf5d623daaae8da1b`.
- The artifact now contains desktop and 390px-mobile screenshots for:
  - cached fixture list after feed outage, with explicit freshness-unknown warning;
  - fresh Phase-1 fixture resolving before a later `fixtureSource=MISSING` detail response;
  - `fixtureSource=MISSING` resolving first and a later fresh Phase-1 fixture recovering the route.
- Visual review found no clipping/overlap or false zero identity count in these six recovery screenshots. Both race orders finish with the fresh match card visible while the detail/lineup identity gate stays fail-closed.
- Read-only unreleased live check at 2026-10-03 ~13:55 UTC:
  - Phase-1 feed was reachable and returned `count=86` with four live matches and fresh live layers; this shows the earlier feed timeout was intermittent, not permanently recovered.
  - The live story endpoint for `FB6114` still returned `story_internal_error: Cannot read properties of null (reading 'corners')`, as expected because the reviewed story fix has not been released.
  - A current live-feed ID `FB6174` still returned `fixtureSource=MISSING` from `app-match-detail` despite auxiliary model/player evidence, so the canonical fixture/detail acceptance gap remains real.
- Real-device mobile acceptance is still open: the available browser connector does not expose device/viewport emulation for the live deployed app, and the reviewed source is not released. CI mobile screenshots are deterministic mocked coverage only.
- No merge, deployment, Edge release, migration, DB write, feed publication, access expansion or spending occurred.

## Railway production release attempt — 2026-10-03

- Reviewed source was integrated through PR #4 into `homepage-forebet-v1` at merge commit `70770f5ae074ca59dab5794a4e7a7bf4ae6ad049`.
- PR #2 was then merged into `main` at `fbdef8f700b2417d22cb1f390e7b8e189e3f2e1e`.
- Integrated PR-to-main CI run `37128306385` succeeded: contracts/build/static routes passed and the repository's standard rendered flow completed 22/22 Playwright cases.
- Existing recovery carrier evidence remains `37127767797` with 32/32 mocked recovery/browser cases.
- Railway service `fast-tracker-public` remains connected to repo `sargesticky-code/fast-tracker-app`, branch `main`, domain `https://fast-tracker-public-production.up.railway.app/`.
- Railway connector action `redeploy` created deployment `a432e2a6-3055-42d4-8532-6d67a8a918ee`, but Railway explicitly recorded `reason=redeploy` and commit `cf4e3a0d7e7af46d026aef2a50c81703a17f92f0`: it replayed the old snapshot instead of pulling current `main`.
- The environment deploy workflow was also triggered after a no-op build-command update, but no fresh service deployment was created because there was no staged source change.
- Public verification after these attempts still showed the old Chinese dashboard, not the navy/blue/yellow English redesign. Therefore the reviewed dashboard is merged to GitHub `main` but is **not yet deployed on Railway**.
- Smallest release blocker: Railway needs a manual **Deploy latest commit** / equivalent fresh-source build for existing service `fast-tracker-public`, targeting current `main`; ordinary Redeploy is insufficient because it reuses the previous snapshot.
- Live gaps remain open: intermittent Phase-1 RPC 57014 tail latency, unreleased Supabase story null-corners fix, canonical fixture/detail gaps, and real-device mobile acceptance.
- No DB migration/write, Edge Function release, feed publication, new access or new paid resource was performed.

## Cloudflare production usability checkpoint — 2026-10-03

- Active online redesign URL: `https://fast-tracker-app.sargesticky.workers.dev/`.
- Source repair commit: `e9f0f0a2f46138f8efca68528be0a6e5b2ecb5b9` (`components/homepage-client.js` blob `3399ab53825911bd55d5e66b23f8a786172e19af`).
- Cloudflare production build `0e392a43-0761-414a-a123-ff75067695cf` completed successfully for that commit, version `53b3ae17-8780-4360-abcf-b7176adef84a`.
- The canonical Phase-1 endpoint was read directly at ~14:52 UTC and returned `source=supabase-canonical-live`, `count=74`, with current HKJC/live health. The feed was slow enough that browser navigation did not become ready within 10 seconds on one attempt; it later returned successfully.
- The previous public “No fixtures are available” state was therefore not a genuine zero-feed condition. It was a misleading boot/loading presentation while the static Cloudflare page waited for the client runtime feed.
- The homepage now renders `Loading current fixtures… / Waiting for the live fixture feed.` during that interval. After the live request completes, it renders real current fixtures and live rows; this was verified directly on the public URL.
- Real route verification used `FB6175`: homepage row → `/details/?id=FB6175&ui=homepage-v1` rendered the current detail view and the `#analysis` article section. Safety gates remained fail-closed for stale/reference-only price and incomplete model evidence.
- The public detail/article path is usable but remains partly bilingual because some backend recommendation/team-label evidence is Chinese. No Edge/story release was performed to rewrite those source narratives.
- The browser connector exposes navigation/read/screenshot but no press/click action, so live filter buttons were confirmed rendered but were not interactively clicked in this public-browser pass; their behavior remains covered by the accepted CI/browser suite rather than this live pass.
- Railway source-link failure remains a separate hypothesis: Railway still reports repo `sargesticky-code/fast-tracker-app` branch `main`, while recent Railway deployments are old-commit redeploys. No Railway settings inspection has yet proven why fresh GitHub pushes are not creating new source deployments.
- Remaining live dependencies: intermittent Phase-1 RPC tail latency, production route-guard health-marker failure on the old Railway URL, unreleased story null-corners fix, canonical fixture/detail gaps for some events, partly bilingual detail narrative, and real-device mobile acceptance.
- No DB write/migration, Edge release, feed publication, access expansion, new resource or spending occurred.


## English story-summary cache selector review — 2026-10-04

- [x] Review source now prefers cached `match_interpretations` rows with `language = en` instead of `zh-HK` for the public Phase-1 story summary.
- [x] Missing English cache remains missing; review code does not translate or reuse a Chinese cached summary as English.
- [ ] GitHub CI must pass `check:story`, full build/static-route checks and affected rendered homepage → detail → article tests before this review can be accepted.
- [ ] Real live English-cache availability remains to be measured read-only; deterministic CI fallback coverage does not prove current production cache completeness.
- [ ] Production remains unchanged until a separate authorized release gate.


### English story-summary bounded review result — 2026-10-04

- [x] Phase-1 feed review code selects cached public story summaries with `language=en`; it does not reuse `zh-HK` cache rows as English.
- [x] Deterministic English fallback uses English team names and structured decision/market/status fields instead of copying source-language story prose.
- [x] Non-English commentary body text and raw source-language invalidators are excluded from English narrative output; no translation or fabricated evidence is introduced.
- [x] English O/U labels are derived from structured OVER/UNDER selection and line values.
- [x] GitHub CI source head `ea071a9844d72432aaa5d94f663fe2f0ec166a69`, run `37136039808`, passed all contracts/build/static routes and `22/22` rendered public-flow tests.
- [x] Review artifact: `11278278901`, digest `sha256:db9bad0cf295f29fc960ea6dba68db3eb938ada154b0a871503439f025532fe7`.
- [ ] Real production remains unchanged and still shows the prior mixed-language deterministic story in read-only snapshots; release/live verification is a separate gate.
- [ ] Real English-cache availability and substantive attributable-English-article coverage remain product gaps; this language-boundary repair does not claim those broader goals are complete.


### Real English article availability measurement — 2026-10-04

- [x] Fresh production evidence was collected once rather than relying on the earlier browser snapshot.
- [x] Current full Phase-1 feed and summary reads were measured as unavailable under 90–150s tail/resource pressure; the public homepage correctly fell back to `Fixture feed temporarily unavailable` / fixture count unknown rather than displaying false zero fixtures.
- [x] Real FB6175 detail remained readable with canonical identity and safety gates, but its deployed article/story presentation is still mixed-language.
- [x] FB6175 attribution check: FOTMOB fixture context and HKJC market identity are visible, but no substantive attributable English commentary/article was verified; the public article evidence row showed unavailable provenance for that narrative claim surface.
- [x] Fresh story refresh chronology for deployed `app-match-story` v27 on FB6175 was recorded: last successful response 15:42:38 UTC, followed by repeated 504/546/500 failures through 16:09 UTC. A visible retained article is therefore not treated as a fresh cache-hit proof.
- [x] FB6156/FB6152 failures are classified as read-path/resource failures, **not** as absent English cache.
- [x] Refreshed sample result: substantive attributable English cached article = 0 verified; absent cache = 0 safely proven; mixed-language deployed output = verified; PR #6 deterministic English fallback remains unreleased and is not counted as deployed proof.
- [x] One real desktop FB6175 flow remained readable and a browser screenshot was captured; real mobile acceptance remains unavailable because the connector cannot set a mobile viewport.
- [ ] Homepage-summary → detail/article consistency cannot currently be verified because the fresh homepage feed/summary does not resolve.
- [ ] Exact blocker: production read-path reliability (Phase-1/detail/story hitting DB/REST/Edge tail and resource limits) prevents truthful fixture-level cache-hit/absence measurement.
- [ ] Smallest next task: isolate the dominant slow read/RPC/enrichment call using existing logs/read-only timing, then prepare at most one non-production performance patch if evidence supports it; do not broaden into bookmaker/provider work.
- [ ] PR #6 remains unreleased; no production release claim follows from its green CI.


### Read-path saturation isolation — 2026-10-04

- [x] PR #6 docs-only head `43642e8540f9c17ede34c9227e1a9faabebcd2fc` passed CI `37137366644`; English repair remains unreleased.
- [x] Authority-scope migration `20261003151456` exonerated: post-scope RPC was initially healthy (p50 ~0.76s), and remained p50 ~1.46s / p95 ~6.99s until the later saturation onset.
- [x] Saturated authority RPC measured at p50 ~127.64s / p95 ~146.85s, max ~148.3s.
- [x] Direct REST degradation independently confirmed on `hkjc_upcoming_current`, `model_predictions`, `form_predictions`, and `forebet_predictions` (degraded p95 ~137–140s), while `live_stats_current` remained ~1.05s p95.
- [x] Postgres saturation evidence begins around 15:45 UTC: repeated statement timeouts, cron startup timeouts and SSL accept failures.
- [x] Phase-1 summary source topology proves enrichment fanout is not the primary cause because summary mode fails before enrichment; analysis shares the authority RPC and detail separately hits the degraded REST surfaces.
- [x] One review-only containment patch prepared: 15s PostgREST read deadline, automatic DB retries disabled, 45s story upstream deadline, and fail-closed analysis fallback with explicit `read_failure_not_fixture_absence` semantics.
- [x] Identity, unknown-not-zero, stale/reference gates, recommendation math, evidence independence and provenance safeguards remain unchanged.
- [x] PR #7 closed unmerged because raw-main CI stopped on the known pre-existing English-story contract; the contract was not weakened.
- [ ] Draft PR #8 `review/read-path-failfast-v2` is the canonical performance review, stacked on PR #6. Source/test head before docs: `c115b4c21445a33f99239ab0728f3121aa599c77`.
- [ ] Run/assess the established PR Build Verification on the updated PR #8 head, then retarget PR #8 from temporary `main` back to `review/english-story-summary-v1` for a performance-only review diff.
- [ ] Do not deploy either PR. After review verification, next task is read-only identification of the scheduled workload/cron family responsible for the ~15:45 database-capacity saturation.


### Read-path containment review verification

- [x] Canonical patch is draft PR #8, stacked on PR #6; PR #7 is closed/unmerged.
- [x] Verified head `8a9e7e6eef3d71ea3d988acb553b05f271aaf8e6` passed GitHub run `37138137494`.
- [x] New real-evidence contract assertions confirm 15s bounded PostgREST reads, disabled automatic DB retries, explicit read-failure-not-fixture-absence semantics, authority-RPC degradation provenance, and bounded story upstream reads.
- [x] Provider/market, evidence independence, player identity, build/static routes and rendered desktop/mobile flows remained green; Playwright public flow = `22/22`.
- [x] Artifact `11280045244`, digest `sha256:98844a8f0ecd50e9884dba00c28ff606d8c1c1c16fe3bac34b27df387dae33c1`.
- [x] PR #8 base restored to `review/english-story-summary-v1` after workflow verification so its active review diff remains performance-only.
- [ ] Production is unchanged; no claim is made that the containment patch has reduced live latency.
- [ ] Next bounded task: read-only map cron job IDs active during the 15:45–16:15 saturation window to their functions/runtime distributions and identify one dominant workload family before proposing any schedule/DB change.


### Cron/workload diagnosis + frontend backpressure review — 2026-10-04

- [x] Cron startup-timeout IDs mapped from Postgres logs. Highest counts: jobs 17/6 = 13 each, 14/4 = 10 each, 16 = 6, 28/8 = 5 each; broad distribution argues against one proven cron trigger.
- [x] Known commands/functions mapped where evidence is direct or cadence+Edge-path correlation is strong: live shadow guard, live score, live layer guard, HKJC live, live source shadow, Phase 4 quotes/core, Phase 3 identity, Phase 1 core, HKJC upcoming, Polymarket discovery/verify, Flashscore scout, lineup snapshot.
- [x] Exact job 8/job 36 catalog ownership remains unknown because one bounded `cron.job` catalog read failed with connection timeout; no retry loop was used.
- [x] Healthy cron work was generally short; lower-frequency Phase 4 quotes/Flashscore jobs were longer (~22–24s average) but not shown to be the trigger.
- [x] Cron jobs in the saturated window mainly fail to start; surviving HKJC/live-score cron-triggered functions still completed in ~4–6s.
- [x] Public-read overlap is the strongest sustained load signal: 15:45 bucket = 30 live-feed + 20 Phase-1 + 15 detail starts, with p50 ~90–150s, while source had no in-flight coalescing.
- [x] Causality boundary preserved: frontend polling is demonstrated as a saturation amplifier, not proven as the initial trigger. Selective query contention/global capacity remain hypotheses; no sampled deadlock-specific log evidence.
- [x] Draft PR #9 prepared on PR #8: homepage/detail request lanes are single-flight with bounded browser deadlines; polling cadences and all fixture/model/provenance/stale-price semantics remain unchanged.
- [ ] GitHub PR Build Verification must pass on PR #9 before review acceptance.
- [ ] PR #9 must remain unreleased and be restored to PR #8 as base after CI verification.
- [ ] Next diagnostic after green CI: one read-only pre-15:45 query/wait-source review if database diagnostics are available; do not alter schedules or DB settings based on correlation alone.


### Frontend backpressure verification result

- [x] Draft PR #9 is stacked on PR #8; PR #6/#8/#9 remain unreleased.
- [x] Verified head `d5282260685f2b6957f04000129b5e6b1616dfcd` passed GitHub run `37139054527`.
- [x] Real-evidence safety checks now guard homepage single-flight + 15s deadline and detail per-lane single-flight with bounded live/full/detail/analysis/story reads.
- [x] English story/provider/independence/player identity/static route contracts remained green.
- [x] Rendered desktop/mobile public flow = `22/22` passed in 26.9s.
- [x] Artifact `11279722987`, digest `sha256:88382bc9eff1facfdde3c13648a59c46b8c2268e84ab2981b009b31b3a2132ea`.
- [x] PR #9 base restored to `review/read-path-failfast-v2` after CI, preserving the review stack.
- [ ] Production remains unchanged; no live-latency/concurrency improvement is claimed.
- [ ] Initial 15:45 trigger remains unresolved; polling is proven as an amplifier, not proven as the initiating cause.
- [ ] Next bounded task: one read-only 15:44–15:48 wait/query-fingerprint review if diagnostics are available; otherwise stop and leave the initiating DB event unknown.


### Transition fingerprint + behavior-proof gate — 2026-10-04

- [x] One bounded 15:44–15:48 Postgres-log transition pass completed; no further generic root-cause retries planned.
- [x] Earliest captured slowdown: `ft_refresh_live_layer_guard()` ~22.16s at 15:44:22 and ~21.50s at 15:46:21.
- [x] First captured statement-timeout fingerprints: `ft_internal_app_phase1_feed` 15:46:40, `phase4_value_api` 15:46:50, `phase2_match_lineup_evidence` 15:46:51; cron startup failures and SSL resets follow around 15:48.
- [x] By 15:48:19, even the postgres-exporter `pg_stat_activity` connection-count query timed out, supporting broad DB/connection pressure at that stage.
- [x] No historical wait-event / blocking-PID / lock graph is available; initiating event remains **unknown**.
- [x] Existing 22 mocked flows were insufficient to prove delayed coalescing, timeout cleanup/retry, stale ordering, unavailable-vs-absent or English-summary/detail fallback coherence.
- [x] Cross-lane race fixed on review branch: delayed Phase-1 cannot resurrect canonical-missing fixture or override authoritative stale/terminal detail/source label.
- [x] Browser deadlines aligned outside PR #8 server bounds: homepage/full/detail 20s; analysis 35s; story 65s. Live remains single-flight with no shorter client timeout because source-controlled server bound is missing.
- [x] Five new delayed/concurrency/truthfulness Playwright cases added; English-story-unavailable flow extended with homepage cached-summary evidence.
- [ ] Draft PR #10 must pass established GitHub CI including the expanded rendered behavior suite.
- [ ] PR #10 base must be restored to PR #9 after CI verification; all PRs remain unreleased.
- [ ] Missing dependency: source-controlled `app-live-feed` implementation and historical 15:44–15:48 wait/lock diagnostics.
- [ ] Release requires separate explicit authorization; release order PR6→PR8→PR9→PR10, rollback reverse order.


### Final behavior-proof gate — PR #10

- [x] First behavior CI `37139922622`: 25/27; two test-design failures identified and corrected, not accepted as proof.
- [x] Second CI `37140175069`: 30/31; isolated one real remaining duplicate detail request.
- [x] Source trace demonstrated two detail consumers on the route: `MatchDetailClient` + `LineupPanel`.
- [x] Shared `lib/single-flight-fetch.js` now deduplicates both consumers using `match-detail:${matchId}` and returns cloned responses safely.
- [x] Final verified source/test head `691cf5557d5db28d97b45c4970edacda0ee734c3` passed CI `37140371900`.
- [x] Final rendered behavior suite = **31/31 passed** in 24.0s.
- [x] Delayed feed/detail/live/analysis/story lanes are behavior-tested for coalescing while pending.
- [x] Abort/deadline cleanup is behavior-tested to permit a later retry without stale overwrite.
- [x] Transport unavailable versus conclusive canonical absence is behavior-tested.
- [x] Delayed Phase-1 cannot resurrect canonical-missing or override authoritative stale/terminal detail.
- [x] Homepage fixture identity/predicted score → English detail fallback coherence is tested; PR #6 source contract remains the guard for English cached story-summary selection because the redesigned homepage does not render storySummary itself.
- [x] All English/provider/model-independence/player-identity/stale-price safety contracts remained green.
- [x] Artifact `11280132390`, digest `sha256:fd09c8802a336cf12d2664e3214e892afe7375bca6bf53cd554cd588a94eae2e`.
- [x] PR #10 restored to PR #9 as base; review stack remains PR6→PR8→PR9→PR10.
- [x] Initiating 15:44–15:48 DB event remains unknown; no more generic root-cause probes without new historical wait/lock evidence.
- [ ] Production unchanged. Explicit release authorization is still required.
- [ ] Missing source dependency: deployed `app-live-feed` implementation is not present in this repo, so server-side live-read deadline behavior remains unreviewed.
- [ ] Next action without release authorization: review only. With explicit authorization: release PR6→PR8→PR9→PR10 and run one bounded homepage/detail acceptance sample, then stop.
