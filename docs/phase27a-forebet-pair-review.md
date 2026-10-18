# Phase 27A — Forebet owner pairing review

Goal: make Forebet source pairing *reviewable* on a public Fast Tracker match Details page, including provisional one-team / similarity candidates, without letting an anonymous browser modify Supabase predictions.

## User interaction

On match Details, show original Forebet home/away teams beside the exact Flashscore teams, original source link and captured H/D/A or predicted score when present. Actions: **Verify this pairing**, **Undo my pairing verification**, **Reject this pairing locally**, **Undo local rejection**, **Copy correction report** and **Copy verification report**. A manual copied report includes the provider fixture URL + exact Flashscore ID + both teams + kickoff; user can paste it into the trusted project chat for independent validation.

- Reviews are stored **only in browser localStorage**, keyed by **(FOREBET, exact FS fixture ID, exact Forebet URL)** and are mutually exclusive. Changing the source URL cannot silently inherit an earlier confirmation.
- The public dashboard has no authenticated reviewer account. Therefore **no anonymous write path exists**. Neither the review UI nor source feed can upgrade a provisional row to verified, change probabilities, influence model accuracy or create training labels.
- A local rejection suppresses that match's Forebet forecast from the visible detail summary, while preserving original source evidence and other adviser panels. Clear local rejection to see it again.
- If source URL, original names, identity or current source timestamps fail validation, keep original source forecast unchanged and do not expose a misleading review action.

## Minimal read-only edge feed

Isolated `forebet-pair-review` Edge function permits **GET?id=FS:...` only**, returns exactly one source candidate from `forebet_prediction_current` or `forebet_provisional_feed_current`. It refuses ambiguous duplicate records; the provisional path retains similarity/source-clock checks and last-seen freshness. It returns source names, source URL, original HDA/score and an accurate identity status. No new provider, collector, cron, secret, model writes or heavy fan-out. One request per detail-page visit.

## Validation

`node scripts/check-forebet-pair-review.mjs`: validates exact-ID/source URL, contradictory review transitions, honest provisional status, copy receipts, read-only Edge guard and presence of the requested buttons. Existing repo build/Playwright tests must pass. CI passes are **not** production verification: check a real Forebet provisional fixture and a verified Forebet fixture on desktop and mobile after deploying both the Edge function and Railway frontend.

## Follow-up / distinct scope

1. Authenticated owner-only shared ledger and audited review endpoint (Supabase Auth, private review roles/allowlist and immutable history); never add public write endpoints merely to persist a browser click.
2. Use *approved and independently corroborated* owner corrections to improve persistent aliases, with league/home/away/kickoff checks; one click never automatically validates the betting model.
3. Separate collector health diagnostics for Forebet genuine source gaps vs source capture failures and source match gaps. Do not claim review buttons alone will increase predictions.
