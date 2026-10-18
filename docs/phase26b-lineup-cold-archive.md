# Phase 26b — Archive-only proof (no deletion)

A separate internal Vault-authenticated Edge function `lineup-cold-archive` can export at most 200 rows of `public.phase2_match_lineup_evidence` per call. Rows must have `fetched_at` older than 14 days and must not overlap ANY ID currently in `flashscore_primary_fixture_current`. It writes a UTF-8 newline-delimited JSON text file preserving all source columns, plus manifest with exact IDs and row count, into the already-existing private `fast-tracker-ingest` Storage bucket. This function does not create a new cron or alter any model data.

The file path includes its SHA-256 digest and is immutable (`upsert:false`). It immediately downloads the saved bytes back from Storage, verifies SHA-256 + byte length and compares manifest counts and ID bounds. Any mismatch fails closed. Replays may download and confirm the same object instead of overwriting it. Each run returns a `nextAfter` cursor: you may move to the next batch via the `?after=<nextAfter>` parameter. Do not increase batch size without testing bucket limits (currently 5 MiB per object).

**Operator execution:** only an operator who already has the internal Vault cron key should invoke `POST /functions/v1/lineup-cold-archive?after=0` with the `x-ft-cron-key` header. No CORS for browsers. **No public or anonymous write endpoint**. Never print or expose secrets.

**Current scope:** Archive only, not automatic SQL DELETE and not guaranteed to lower `pg_database_size`. The next phase must use a private manifest ledger and explicit restore verification, and prove the same exact rows are still no longer needed by current/recent match routes before any bounded DELETE. A normal DELETE can leave physical table and index allocations unchanged, so report actual database bytes before and after any future compaction.

No HKJC dependencies, paid services, new scrapers, production schedule changes, or backend match confidence promotion.
