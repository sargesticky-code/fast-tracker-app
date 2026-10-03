# Dashboard Redesign — Durable Brief

## Goal

Turn Fast Tracker into a clean English football dashboard that is fast to scan on desktop and mobile, while preserving the existing evidence, freshness and fail-closed safety logic.

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

1. fixture identity and live/prematch status;
2. decision/actionability;
3. current relevant price;
4. compact probability/edge context;
5. article conclusion;
6. Models / Team Form / Team News;
7. H2H and deeper evidence;
8. full lineup/statistical tooling.

Deep detail should be expandable rather than removed.

## Safety and truthfulness

- missing data stays unknown, not zero;
- stale prices remain visibly stale;
- unresolved player identity stays unresolved;
- predicted/provisional lineup must not be presented as confirmed;
- source-confirmed but canonically unresolved facts must remain fail-closed;
- correlated/repeated evidence must not be counted as independent;
- public presentation must not imply that a provider/data gap was solved by styling.

## Current review boundary

Work remains on draft PR #2 / branch `homepage-forebet-v1`.

Review-only unless explicitly changed:
- no merge;
- no production deployment;
- no migration application;
- no Edge Function release;
- no generated-feed publication;
- no wider scraping;
- no new paid access/spend.

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
