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
