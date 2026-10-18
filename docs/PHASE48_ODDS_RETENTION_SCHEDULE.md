# Phase48 — Stable odds history size without losing market movement

2026-10-18 verified one *real* bounded cold-odds worker:
- Original 6,316 odds rows; 699 older than seven days
- Returned HTTP 200 after storing one 452,527-byte immutable private archive and SHA256 full download/JSON roundtrip
- PostgreSQL exact row JSONB fingerprint and age/active-match checks matched; deleted exactly 699; 5,617 fresh rows remained
- Source health metric FLASHSCORE_BET365 odds_movement still OK; betting capture/odds movement jobs unchanged

Schedule the same audited worker **every six hours, at minute 07 UTC**, at most one 1,000-row batch per invocation. Given ~2,700–3,000 incoming odds snapshots/day, this ceiling of 4,000/day prevents unbounded odds history accumulation without repeated daily scraping; the worker reads and writes only existing Supabase data.

Retain seven full days of hot odds movement, never remove current/recent Flashscore fixtures, never promote unsupported odds values, keep full history in immutable private Storage. Fail closed if backup, SHA256 readback, source per-row MD5, match guards or storage write fails. No new credentials/cron secrets.

**Monitoring:** check cron job and HTTP response (cron SQL success alone does not prove Edge completed), 7-day hot odds counts, archived ledger, db size vs 500MiB. Normal SQL DELETE may only reuse space internally; a future safe tiny-table repack or capacity policy is separate. If a worker error occurs repeatedly, disable the new cron, not the bookmaker collector. Never reintroduce HKJC.
