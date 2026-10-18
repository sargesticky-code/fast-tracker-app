# Fast Tracker — sequential small-job recovery plan (2026-10-18)

Owner approval: improve current providers, no new providers, no paid spend, no HKJC reactivation, protect public production and the independent source hierarchy.

## Phase 26: database capacity and alerts — evidence / boundaries
- 2026-10-18 database ~430.4 MB, 82.1% of 500 MiB (524,288,000 bytes). Alert already sent to approved email once. Existing hourly ChatGPT task updated to warn on NEW 80/85/90/95/99%-tier crossings and read-only transitions; task platform notifications remain disabled.
- 521/521 objects for the existing `private.ft_identity_retired_rows` archive are present in `fast-tracker-ingest`; ledger and object metadata both total **55,433,060 bytes**. Archive ledger counts **104,063** retired rows, staging table now **0**. Metadata size equality is NOT a cryptographic checksum check; no destruction has been authorized solely on that evidence.
- `phase2_match_lineup_evidence`: 99,126 rows, about 93.1 MB total relation size and approximately 40 MB raw JSON. **23,619** rows last fetched more than 14 days ago (52,458 >7d), so it is the leading archive candidate. `phase15_source_shadow_current` ~62.2 MB; `phase2_players` ~44.6 MB. The prior ledger does **not** cover these tables.
- Phase26 preflight SQL checks database, largest relation sizes, archive presence and relative cold lineup count. Read-only only. No new cron, mass delete, row truncation, VACUUM FULL, full-table rewrite or dropping valuable lineup evidence.
- Next safe writable job (not part of this PR): create *lossless*, PRIVATE and size-bounded cold-lineup export with per-object SHA-256 + object re-download and verification, retained-manifest row counts and verified storage readback. Prove current/prematch safeguards. Only after this, prune small verified eligible batches, check real query coverage and measured database size. Existing archive objects may not be reused as proof for these unrelated rows.
- Database physical allocated bytes may not decrease immediately after SQL DELETE, even with normal VACUUM. Never claim usage <80% merely from a row-count drop; measure actual `pg_database_size`, investigate bloat/index/TOAST and plan low-traffic maintenance before VACUUM FULL.

## Next small jobs and acceptance gates
1. **Phase26a — DONE**: auditable read-only capacity preflight, existing 521-object metadata check, and revised hourly alert tier logic; no dangerous writes.
2. **Phase26b — PENDING**: proven cold-lineup backup/restore and bounded reclaim; target <80%, preferred 70–75%; zero missing current lineup fields after cleanup.
3. **Phase27 — PENDING**: authenticated private human-positive/negative pairing review audit ledger, distinguishing pairing QA from source/model probability. Reversible and immutable history; no public anonymous write endpoint.
4. **Phase28 — PENDING**: SportyTrader source kickoff extraction and timezone evidence. Verify actual source HTML/date/times, hold unknown clocks provisional, no blind threshold lowering.
5. **Phase29 — PENDING**: concise Match Details sections and freshness/provenance labels. Require CI, desktop/mobile rendered screenshots and actual deployed version verification.
6. **Phase30 — PENDING**: Football-Data factual last-5/10, goal/corner historical form; replace stale Oct 5 legacy forecast with historical facts, clearly not a forecast.
7. **Phase31 — PENDING**: measured odds up/down freshness coverage and alert semantics, strict same bookmaker+event proof.
8. **Phase32 — PENDING**: collect immutable actual pre-kickoff model forecasts, proper calibration and held-out scores. Do not promote retrospective-only results.

No jobs beyond #1 are claimed complete merely because they are listed. Each future job should use a separate bounded PR, rollback plan, and factual production acceptance. This plan is not a standing background code-execution scheduler.
