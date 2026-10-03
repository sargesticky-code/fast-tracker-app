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
