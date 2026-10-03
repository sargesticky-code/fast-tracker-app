# Fast Tracker App — Agent Working Rules

These rules apply to work on the dashboard redesign, especially draft PR #2 / branch `homepage-forebet-v1`.

## Start every session by reading

1. `AGENTS.md`
2. `docs/DASHBOARD_REDESIGN.md`
3. `docs/REDESIGN_CHECKLIST.md`
4. the newest `docs/dashboard-redesign-handover-*.md`
5. the current PR description, branch head, CI status and recent changed files

Do not treat each request as a new project.

## Default working mode

Work autonomously in small, bounded UI batches.

Do not ask the user to repeat decisions already recorded in the repository or PR.

If a minor detail is ambiguous:
- inspect the current implementation and rendered output;
- follow the existing Fast Tracker navy/blue/yellow public design system;
- choose the safest reasonable interpretation;
- preserve current data/safety semantics;
- record the assumption in the handover;
- continue.

Ask a clarification question only when work is genuinely blocked and no safe repository-grounded choice exists.

## Required batch loop

For each UI batch:

1. inspect the current implementation and latest rendered evidence;
2. make the smallest coherent change;
3. preserve existing data/provider logic unless the task explicitly requires otherwise;
4. run the existing checks and build;
5. run the rendered desktop/mobile Playwright flow;
6. inspect the generated screenshots;
7. fix concrete regressions before moving on;
8. update `docs/REDESIGN_CHECKLIST.md`;
9. append/update the dashboard redesign handover with exact head, CI/artifact and next concrete UI gap.

When the current bounded batch passes, continue to the next concrete UI gap already identified in the checklist/handover unless doing so would broaden scope.

## Public UI priorities

Keep these easy to scan:
- match identity and status;
- decision/actionability state;
- current market prices;
- article conclusion/summary;
- key Models, Form and Team News context;
- stale/unknown/safety context.

Use progressive disclosure for:
- full evidence article;
- deep model rows;
- detailed H2H;
- full lineup tooling;
- secondary evidence.

Never hide stale, unknown, unresolved, safety or fail-closed context when it materially changes interpretation.

## Preserve

- English public presentation;
- navy/blue/yellow visual system;
- football-only public navigation;
- keyboard accessibility;
- mobile readability;
- full statistics access;
- exact unknown/no-data reasons;
- evidence/provenance safety semantics;
- diagnostics under `/system`.

## Do not do without explicit instruction

- merge the draft PR;
- deploy Railway or Cloudflare production;
- deploy Edge Functions;
- apply Supabase migrations;
- publish generated feeds;
- change credentials;
- buy paid access or spend money;
- expand scraping/provider scope;
- replace unknown values with invented defaults;
- treat provider names as independent evidence when they share an underlying observation.

## Verification language

Distinguish clearly between:
- mocked/deterministic rendered fixture verification;
- actual stored data verification;
- real endpoint/public preview verification;
- production verification.

Never claim a public or production flow was verified when only mocked rendered checks passed.
