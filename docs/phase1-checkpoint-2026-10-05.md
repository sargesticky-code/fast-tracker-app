# Phase 1 continuation — 5 October 2026

Baseline main: `60dcd75231c5620491dce4a1879ba3de00f3661b`.
Review branch: `fix/phase1-missing-probabilities`.

Inspected AGENTS, redesign brief/checklist/handover, market deployment review,
source, open PRs, production tables and real Phase 1 endpoints. This conversation
owns Phase 1; persistent chat dispatch belongs to the dispatcher.

The shared H/D/A gate rejects null, blank, boolean, nonnumeric and out-of-range
values before conversion. Genuine zero remains valid. Preferred-model selection
skips incomplete models in the existing order, preserving valid fallback models.
The homepage now shares the value calculation's probability gate. Missing average
goals remain unknown. Fixtures without models remain visible.

At 2026-10-04 23:28–23:29 UTC, summary/full 48h endpoints returned HTTP 200 with
34 fixtures. Sources were `hkjc-official-direct` and `supabase-canonical-live`.
Full data had 26 modelled fixtures, eight unknown, no incomplete populated H/D/A
objects. Revised calculation on all 34 preserved those counts, with zero invalid
normalized distributions. Partial-model regression fixtures are deterministic,
not claims about current real rows.

All seven local contract/safety checks and static export build passed. Chromium
download returned invalid/truncated ZIPs, so local rendered tests/screenshots
remain unverified. New desktop/mobile regressions are included in existing CI.
No deployment, migration, Edge release or merge occurred.

Phase 0 dependency: production still uses HKJC and Bet365 current/event-map tables
have zero rows. Canonical quote migration remains reviewed/unapplied. Consume the
shared contract when Phase 0 supplies real matched observations. Do not relabel
HKJC as international coverage or invent bookmaker names.

Next bounded gap: homepage silently slices filtered rows to 30; default 24h feed
cannot fully cover tomorrow/+2 days. Verify endpoint window semantics and repair
complete fixture navigation with responsive tests. Preserve identity and freshness.

Inventory flagged RLS disabled on `phase1_identity_deferred_queue`,
`phase1_h2h_provider_event_map`, `phase1_h2h_provider_meetings`. Separate policy
review remains necessary; no access changes applied.

## CI acceptance

Executable head: `af24bd4e4d002e2a2a043f1607a391ea15b02cd4`.
PR: https://github.com/sargesticky-code/fast-tracker-app/pull/42 (draft).
CI run `37244231413` succeeded, including the new desktop/mobile regressions.
Artifact `11318033739`, `dashboard-redesign-4c0deef3ebeaabdacf0d0d32c2287e8839c846e0`.
Both 1440px and 390px regression screenshots inspected: fallback 50/30/20
visible, unknown row retained without a fabricated probability/pick/edge or
null average rendered as zero, no page overflow. These are mocked screenshots.
Real summary/full snapshots had the same 34 canonical IDs, team pairs and actual
kickoff instants (timezone representations differ). No deployed change claimed.

## Iteration 2 — complete fixture navigation

Continue in the same draft PR42; previous executable source/CI acceptance remains
recorded above. No prior change was merged or deployed.

Implemented: default homepage/server read window uses the existing 48h endpoint;
filtered rows are no longer silently truncated to 30. Today/Tomorrow/+2 days use
a runtime clock and Hong Kong dates rather than static build time or a calendar
selection. Calendar selection is a separate date filter; Today always resets the
view to actual today. Upcoming date/weekend/value filters exclude live fixtures;
Live and All retain them. Empty filters no longer promote unrelated fixtures in
the right rail. Dates reaching/exceeding the supplied feed-window end show partial
coverage instead of implying there are no later fixtures. Unknown window metadata
does not become a zero-hour window. Configured feed URL overrides remain intact.

Read-only summary at 2026-10-04 23:41:12 UTC: HTTP 200, 48h, 34 unique fixtures,
three live; Hong Kong dates Oct5=14, Oct6=19, Oct7=1. Provider source remains
`hkjc-official-direct`. No provider/identity/ingestion/schedule/database changes.

Seven local checks and build passed. New desktop/mobile cases use a Los Angeles
browser timezone with a fixed Hong Kong boundary date: 35 upcoming rows survive,
live is separated, tomorrow/+2 and calendar reset work, search reaches row 35,
All contains all 38 fixtures, partial coverage is visible. CI/screenshots pending.
Full +2-day coverage requires a wider actual provider/read window; current API
caps 48h. This change labels the limit and does not fabricate later fixtures.

### Iteration 2 acceptance

Final executable head: `3cebf6ee2c0268aa65afdd7b825eb3abbde31fc0`.
CI `37245034168`: SUCCESS; all contracts/build/routes and 36/36 Playwright cases
passed (34.5s). Artifact `11318463911`,
`dashboard-redesign-e6e0d80001924769a5998b7132aec43a7847af2f`.
Desktop 1440px and mobile 390px screenshots reviewed: 35 fixture count retained,
current date labels, partial +2 coverage, search and spacing readable, no overflow.
Screenshots/regression fixtures remain deterministic, not deployed data.

First navigation CI caught search hidden at mobile width; repaired the existing
search field and sticky layout rather than weakening the test. Live-mode right
rail no longer exposes prematch EV as live value.

Read-only 24h-vs-48h comparison: 30 vs 34 canonical IDs, four additional IDs, zero
removed IDs; extra fixtures are on Oct6/Oct7 HKT. Requests were minutes apart, not
a claim of frozen simultaneous snapshots. Provider, fixture IDs, DB and schedules
remain unchanged. No merge/release occurred. PR42 continues as the Phase 1 draft.

Next highest-value unblocked issue: audit homepage value labels against model
family/confidence gates and actual quote freshness. The current homepage filters
nominal EV directly rather than using the existing candidate band; inspect stale,
correlated and single-family cases before changing behavior. Broader bookmaker
coverage and full +2-day window remain Phase 0/provider dependencies.

## Continuation: evidence and freshness gates for homepage Value

Implemented a shared `prematchValueSignal` used by table labels, Value filter/count, featured match and Value rail. Nominal HDA EV remains visible as Reference when source quote freshness cannot be established; only existing VALUE/STRONG_VALUE evidence bands with a complete HDA market, source observation within six hours, FRESH market health and a future prematch fixture qualify. Single independent families remain Watch. Feed fetch timestamps cannot refresh an old quote. Generic odds observation/freshness fields take precedence over legacy HKJC fields for Phase 0 compatibility. The legacy full-feed `inPlay` flag is deliberately not treated as actual live status, because it can indicate future market eligibility.

Read-only genuine full-feed snapshot generated 2026-10-05T04:19:35.522Z: 39 fixtures; shared signal returned 16 Reference, 22 Unavailable, 1 Watch, zero eligible Value. Twelve rows had nominal HDA EV >=4%, illustrating why raw EV alone must not drive the Value filter. No odds, probabilities or fixture identities were written. Contracts (prematch, UI, story, market, real evidence, evidence independence, player identity) and static production build passed locally. Desktop/mobile browser regressions added for supported Value, correlated/single-family Watch, stale source quotes and unknown quote timestamps. Browser CI acceptance is pending publication of this batch; prior 36-case acceptance applies only to the fixture-navigation batch above.

Next: inspect CI screenshots and finish this batch acceptance. Remaining upstream dependency: current source quote observations do not support a fresh public Value candidate; Phase 0 must supply genuinely fresh international quotes with provenance. No migration, feed publication, merge or deployment performed.

### Value batch acceptance

Executable remote head `db5f1629e0d4eee32c6c6c1da02c4628f0436892`, draft PR #42. CI run `37263275591` completed SUCCESS: all contracts, static build/routes and **38/38 rendered desktop/mobile cases (35.9s)**. Artifact `11325810118`, `dashboard-redesign-9bf8ac132c3c9a3c7da698554f5daa41c68215e8`. Inspected `dashboard-value-gates-1440.png` and `dashboard-value-gates-390.png`: distinct Value/Watch/Reference states, only one supported candidate in Value navigation/rail, and no page overflow. No release or public production verification claimed. Next independent Phase 1 issue: audit homepage/detail consistency for market-specific EV and odds movement while Phase 0 repairs quote authority/coverage.

## Iteration 4: displayed HDA quote source

Homepage no longer stamps HKJC onto every HDA quote. Shared `marketSourceLabel` consumes explicit quote-level `bookmakerLabel`/`providerLabel`, or known `providerKey` (existing HKJC/BET365/ODDSMATH contract). Unknown explicit keys fail to Source unverified instead of borrowing legacy health. Existing prematch rows without quote metadata retain HKJC only when legacy HKJC health is present. Live quotes without their own attribution never inherit prematch health. No provider ingestion or identity change.

Real full-feed snapshot 2026-10-05T04:39:48.667Z: 39 rows, all legacy HKJC health attribution, zero quote-level provider metadata; existing attribution remains HKJC. International test quotes are deterministic mocked contract tests, not a claim of real Bet365 coverage. All seven contracts and static build pass locally. Two desktop/mobile source-attribution cases added; browser CI pending. Phase 0 dependency: producers must populate quote-level provider identity when replacing legacy prices. This batch does not synthesize that identity.

Initial attribution CI 37264604324 passed 40/40 cases (26.7s); artifact 11325951884, 1440px/390px quote-source screenshots reviewed with readable source labels and no page overflow. Review exposed an additional cross-provider freshness risk: explicit international odds could inherit HKJC quote time/health. Tightened `prematchValueSignal`: unverified source remains Reference; non-HKJC quotes require their own observedAt and source freshness (generic marketFreshness accepted, legacy hkjcFreshness forbidden). Explicit international regression quote now supplies its own timestamp/freshness; unit contracts verify that both missing timestamp and missing freshness stay Reference. Final follow-up CI pending.

### Final attribution acceptance and iteration 5 mobile meanings

Final source/freshness executable head eb5952f9bd800556ddddb5eaccb1091968fd2642: CI 37264830851 SUCCESS, desktop/mobile quote-source screenshots inspected. Both source label and Value gate now require matching provider evidence rather than inheriting another bookmaker's legacy freshness.

Iteration 5 adds compact mobile-only headings for H/D/A pick, predicted score, average goals, H/D/A model EV and live score. Existing card numbers had lost their meaning when desktop headings were hidden. Desktop columns and all calculations remain unchanged; missing numbers retain dashes. Existing 390px source-attribution flow now asserts the generated label text and visibility. Local prematch/UI checks and build pass; final mobile-label CI pending. No new data request/ingestion, identity/schema/schedule change, merge or deployment.

### Iteration 5 acceptance

Executable head ab2aa3ed46cbe93d4f8cd7e77486774959a5134c: CI 37271080985 SUCCESS, 40/40 browser cases (27.8s), contracts/static build/routes passed. Screenshot artifact 11327534116, dashboard-redesign-b882e50993808d08df21ef203fffd7989bda0997. Inspected 1440px/390px quote-source screenshots: mobile numeric cells now have visible headings without overlap; desktop columns unchanged. Real full-feed read generated 2026-10-05T06:10:42.871Z: 39 fixtures, 39 unique IDs, zero live, 24 valid model triplets, zero predicted-score fields, all 39 average-goals fields unknown. No placeholders filled with invented outputs. Next high-value issue: inspect existing form/internal goal-model output and joins to recover honestly supported predicted-score/average-goals coverage; do not infer a score from H/D/A probabilities alone. Quote/source coverage remains Phase 0 dependency. No merge, DB mutation or deployment.

## Iteration 6: existing goal-model outputs wired to homepage

Found structured Forebet predictedScore/ou25.avgGoals ignored by homepage, plus existing FORM_MODELED per-team expectedGoals. Shared prematchGoalSummary now preserves published score/average-goals fields and otherwise sums valid Team Form expected goals only when its probability triplet and quality gate pass. Explicit source tooltip identifies the goal model. No scores inferred from probabilities, no ingestion or DB mutation. Existing 06:10:42Z real snapshot gains average-goals display on 17/39 rows (previously zero); predicted scores remain unknown when absent. Executable unit checks cover missing/boolean/blank goals and rejected model triplets; desktop/mobile structured-score assertions added. CI acceptance pending.


Iteration 6 acceptance: executable 822a007c8e73783f85b9fe1637820d7f6aa95398, CI 37272765696 SUCCESS, 40-case desktop/mobile suite and build/contracts pass. Artifact 11328912124, dashboard-redesign-468e5c9db33ad38db8e3a8f885e472ae70a7084c; 1440px/390px structured-score screenshots inspected. Fresh real snapshot generated 2026-10-05T06:30:45.814Z: 38 unique fixtures, average-goals coverage 16/38, score coverage zero. Earlier saved snapshot coverage is 17/39, not the 24 valid probability-triplet count. Next inspect detail-page consistency and existing goal-model provenance/freshness, then recover published score source coverage without inventing scores. No release or DB write.

## Iteration 7: homepage/detail goal summary consistency

Detail hero now consumes the same prematchGoalSummary as homepage, including published Forebet score variants and gated average-goals estimates. Its Average goals chip shows source text and an explicit dash when unavailable; predicted-score heading no longer labels every generic supplied score as Forebet. Existing desktop/mobile homepage-to-detail cases assert score 2-1, average goals 2.70 and published-model source. Calculations/provider joins unchanged. Local checks/build pass; CI/rendered acceptance pending. No DB mutation or deployment.

Iteration 7 acceptance: executable 704eb25716d9a3bf7b446f35a7988c172f7b148e; CI 37274487219 SUCCESS (existing 40-case suite, including desktop/mobile homepage-to-detail assertions). Artifact 11329444235, dashboard-redesign-c172a9e7e11c2ce1968cac48cf928ade09fefacf; desktop/mobile detail article hero screenshots inspected: score 2-1 and Average goals 2.70 plus source text fit both layouts. Read-only FB6279 detail generated 2026-10-05T06:50:43.802Z: fixtureSource AUTHORITY_SUMMARY, FORM_MODELED with expected goals 1.14563/1.06879, canonical ID FB6279. No new score synthesized. Next verify deep-only authoritative detail goal hydration when full feed enrichment is unavailable; separately investigate null movement being coerced to Stable/0%. No merge/release/database change.

## Iteration 8: authoritative detail-only goal hydration

Shared goal summary now accepts optional authoritative detail evidence. It requires matching match ID, payload ID and fixture canonical ID; a model row with a conflicting hkjc_event_id is rejected. Existing feed summary remains first choice; missing score/goals can fall back to published structured Forebet outputs or quality/probability-gated Team Form expected goals. This does not merge fixtures, alter odds or use model evidence to rescue missing canonical identity. Real saved FB6279 authoritative response produces 2.21442 expected total goals when feed model fields are absent. Unit tests reject payload/fixture/model identity conflicts. Desktop/mobile detail-only tests added with empty fixture feed and valid authoritative Team Form evidence, requiring 2.73 goals and no invented score. Local check/build passed; CI acceptance pending. No database write or deployment.

Iteration 8 acceptance: executable 435e09b7de362c7a2605bd9fc3da86544fac7b64; CI 37276307386 SUCCESS, 42/42 browser cases (32.2s), contracts/build/routes passed. Artifact 11330576031, dashboard-redesign-abb027186960df6172831c70f8f0ce7d12d01634. Desktop/mobile detail-only screenshots inspected: 2.73 Team Form expected goals displayed, absent score remains absent. Other market/article evidence stays unavailable, and no model data is promoted into a bet recommendation. Screenshot reveals next coherent gap: broader model-availability banner still says NO MODEL/0 inputs despite valid authoritative detail-only Form probabilities. Next hydrate or consistently count strictly matched authoritative prematch models without bypassing price/identity gates. Null odds movement normalization also remains queued. No deployment/DB mutation.

## Iteration 9: authoritative Form model availability

Added authoritativeFormModel requiring matching payload/fixture/model ID, FORM_MODELED quality and valid complete probabilities. Detail core model table can display this Form fallback when feed Form is absent. Hero labels Team Form model available instead of contradictory zero inputs and suppresses fixture NO MODEL banner in that case. Existing decision/EV/evidence-family gates remain untouched. Unit tests reject identity, quality and missing probability cases; detail-only desktop/mobile flows assert availability and absence of false banner. Local checks/build pass; CI pending. Real saved FB6279 canonical detail includes valid FORM_MODELED probabilities, so this is existing-data wiring, not invented model output.
