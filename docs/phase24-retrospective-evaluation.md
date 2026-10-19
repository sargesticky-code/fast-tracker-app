# Phase 24 — Walk-forward evaluation (retrospective-only)

An independent, read-only evaluation engine now accepts existing normalized Football-Data match rows and tests the Dixon–Coles low-score correction and related Power Index on chronologically later matches. This is *not* a production model accuracy or verified-bet release. Old 2025–26 results were imported on 2026-10-18, so source snapshots were not captured before earlier kickoffs. Every output must remain marked **RETROSPECTIVE_ONLY**.

Constraints:
- Seven exact league codes only, fail closed for other competitions.
- For each held-out match, cutoff is UTC start of its date; **same-day and future results cannot train** that fixture (conservative date-level approximation).
- Every model fit uses only games from the same league, source, and last 365 days.
- Show DC and related PI side by side with an empirical Laplace-smoothed league-only H/D/A baseline on exactly the same evaluated fixtures.
- Return Brier and multiclass log-loss, holdout cutoff, eligible/skipped counts and reasons.
- Minimum 180 result rows in the submitted league sample; cap evaluations at 100 matches per call.
- No network requests, cron, storage mutation, SQL inserts or promotion of verified models.
- A full production assessment needs separate genuine pre-kickoff captured and immutable prospective predictions, source and league identity crosschecks, and explicit owner-approved release criteria.

This module is library code only. To evaluate actual stored rows, a subsequent authenticated **read-only**, bounded loader should adapt `football_data_matches` into the existing `{source,league,homeId,awayId,hg,ag,playedAt,capturedAt}` format, matching exact league and oriented source team identity. The loader must never fake pre-match capture timestamps.
