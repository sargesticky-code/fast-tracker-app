# Dashboard Redesign Checklist

## Completed foundation

- [x] English public homepage
- [x] Today / Live / Value / Tomorrow / All football navigation
- [x] navy / blue / yellow public visual system
- [x] desktop prediction board
- [x] mobile match-card layout
- [x] HDA / Goals / Corners switching using existing feed values
- [x] match-detail visual coordination
- [x] evidence article visual coordination
- [x] lower detail redesign: Models / Goals & Corners / Form / H2H / Team News / Lineups
- [x] public engineering labels moved away from main UI
- [x] diagnostics retained under `/system`
- [x] mobile progressive disclosure
- [x] keyboard-accessible native disclosures
- [x] stale/unknown/safety context kept visible where material
- [x] desktop/mobile Playwright flow
- [x] screenshot artifacts in PR CI

## Current next bounded UI gap

- [ ] Compress low-value empty states on mobile without hiding the exact reason

Focus first on:
- Market Comparison when no real comparable value signal exists;
- Team Form when no recent history exists.

Desired behavior:
- concise summary in the normal page flow;
- optional expansion for explanation/detail;
- full statistics remain immediately available when real data exists;
- unknown/no-model/no-history reason remains explicit;
- do not convert absence into zero or implied neutrality.

## After that

- [ ] Inspect latest desktop/mobile screenshot artifact for spacing/overflow/hierarchy regressions
- [ ] verify branch/public preview only if an existing safe preview path is available
- [ ] preserve current mocked fixture rendered coverage
- [ ] keep real endpoint/public verification claims separate

## Out of scope for this redesign continuation

- provider expansion
- wider scraping
- paid access
- unresolved FotMob/Flashscore canonical identity work
- bookmaker coverage expansion
- unapplied migrations
- production deployment
- PR merge

## Session completion checklist

Before stopping a redesign session, record:
- exact source branch head;
- CI run/result;
- screenshot artifact id/name when available;
- what changed;
- what was deliberately not changed;
- mocked vs real verification status;
- next concrete UI gap.

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

## Phase 2 authority review — 2026-10-05

- [x] Both public detail and analysis consume eligible authoritative display rows in review code.
- [x] Confirmed 11v11 requires exact distinct canonical starters, independent of event-map timestamp.
- [x] Current database conflict census and proposed ranking SELECT verified read-only.
- [ ] Confirmed-first view SQL release (review SQL only; not applied).
- [ ] PR CI rendered desktop/mobile partial-XI checks and screenshot review (local Chromium download blocked).
- [ ] Real endpoint verification after separately authorized release.

Resume from `docs/phase2-human-intelligence-checkpoint-2026-10-05.md`.
