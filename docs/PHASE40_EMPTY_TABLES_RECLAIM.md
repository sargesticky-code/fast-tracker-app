# Phase 40 — reclaim four empty table allocations

Four **confirmed empty** relations consumed ~4.15 million bytes:
- `private.multisource_consensus_current` (~1.26 MB)
- `public.team_alias_evidence_v2` (~1.16 MB, mostly unused index allocation)
- `public.team_name_context_master` (~1.00 MB, mostly unused index allocation)
- `public.prediction_fallback_current` (~0.74 MB)

All four had count(*)=0 and zero inbound foreign-key relationships on 2026-10-18. These tables remain in the database for existing/current SQL code to use, with their schema, indexes, RLS, owner and FK definitions preserved. The transaction uses a strict NOWAIT short lock, rechecks every table for zero rows and no inbound FKs, and then runs a single multi-table TRUNCATE. Any source change aborts all four. No user-visible football predictions, player evidence, aliases or live rows are deleted.

Measure physical `pg_database_size` before/after. A cap below 80% is still the goal; savings alone may not reach it. Do not run VACUUM FULL on populated relations, or treat storage freed for internal reuse as proven file-size reclaim.
