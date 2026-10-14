# Dashboard Redesign — Durable Brief

## Goal

Deliver a useful, source-backed English football dashboard that is fast to scan on desktop and mobile. Featured is the default view; Other remains fully searchable. Preserve evidence, freshness, exact identity, and fail-closed safety logic.

## Visual system

- Forebet-inspired information density, but not a copy;
- Fast Tracker navy / blue / yellow identity;
- compact football-first navigation;
- clear hierarchy before decoration;
- readable tablet/mobile layouts;
- public-facing copy rather than engineering labels;
- icons/diagrams where they reduce reading effort.

## Information hierarchy

Always prioritize:

1. fixture identity and source-confirmed live/result status;
2. actual score, clearly separated from predicted score;
3. validated price and its freshness state;
4. provider forecast, when available;
5. concise recent form;
6. team news, H2H, and deeper match evidence;
7. lineup and player detail.

Deep detail should be expandable rather than removed.

Featured competitions use reviewed identities or explicit mappings. Unknown or ambiguous competitions stay in Other. Within Featured, sort live fixtures first, then competition priority, verified kickoff proximity, available evidence coverage, and stable fixture ID. Search, date, competition, and status filters apply consistently to both views.

For historical statistics, show the source, sample size, date range, and team-side availability. Exclude future matches and the target fixture from historical calculations. Keep provider forecasts, historical frequencies, internal model output, and actual results visibly distinct.

## Safety and truthfulness

- missing data stays unknown, not zero;
- stale prices remain visibly stale;
- unresolved player identity stays unresolved;
- predicted/provisional lineup must not be presented as confirmed;
- source-confirmed but canonically unresolved facts must remain fail-closed;
- correlated/repeated evidence must not be counted as independent;
- public presentation must not imply that a provider/data gap was solved by styling.

## Current review boundary

The current integration target is the verified `release/ft-advisors-fotmob-20261011` head. Draft PR #86 is an older conflicted review and is not treated as current release evidence.

Prepare frontend, existing-provider pipeline, API/query, and migration changes for review. Production merge, deployment, migration application, Edge Function release, schedule changes, service removal, and paid services each require separate explicit approval. Preserve the read-only public product and existing source-safety rules. HKJC remains retired; do not add providers, speculative models, or expanded scraping.

## Verification contract

The existing PR workflow is the default gate.

Each meaningful UI batch should preserve:
- static build success;
- public route checks;
- desktop rendered flow;
- mobile rendered flow;
- keyboard open/close behavior for disclosures;
- stale/unknown/safety assertions;
- screenshot artifacts for visual inspection.

Mocked Playwright fixture coverage must be described as mocked/deterministic verification, not real endpoint or production verification.
