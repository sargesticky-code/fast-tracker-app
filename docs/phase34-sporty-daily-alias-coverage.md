# Phase 34 — SportyTrader calibrated aliases in daily matrix

2026-10-18 database evidence: 353 captured SportyTrader records, 8 with source-verified kickoff, but also **27 existing active calibrated candidate pairings**, 19 with HKT-October-18 kickoffs. Phase 33's daily alias report omitted this calibrated-candidate table entirely, showing just one verified SportyTrader source instead. This is a **reporting omission**, not an incomplete source capture and not proof of independent time verification.

This bounded change adds `private.ft_sportytrader_calibrated_05` to the existing read-only RPC's union. It retains the upstream gates: strong calibration cohort (at least four source-verified anchors, agreement at least 0.90), independently verified Flashscore canonical fixture, oriented names, calibrated kickoff within 60 seconds, unique upstream provisional match, live source, no rejected pairings, no upgrade if verified row exists. Status displayed is always `PROVISIONAL`, never `SOURCE_LINKED` for calibration alone.

No additional scraping, cron, snapshots, aliases, API calls, public writes or historical deletion. The daily table still shows `—` where no eligible link exists.

Acceptance checks:
- Before: HKT Oct 18 matrix SportyTrader fixtures = 1
- Review-only eligible calibrated = 27, 19 today. After SQL redefinition, expected today matrix approximately 20 (potential overlap/fixture changes).
- Function permissions: anon/authenticated cannot execute; service_role can; public GET only.
- Verify live feed and 1 known fixture after applying.
- Date-specific counts may change as kickoff passes; expired candidates should be removed by the scheduled rechecker and/or query predicate.
