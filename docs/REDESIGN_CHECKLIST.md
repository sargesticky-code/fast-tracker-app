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
