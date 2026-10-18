# Phase 42 — Small transaction to reclaim archived source-day allocation

Phase 41 has already archived all **14/14** rows, into 14 private immutable Storage objects (17,143,970 bytes), each re-downloaded with SHA-256 comparison and read-only SQL source JSONB MD5 + full 11-field restore replay validation. The production snapshot table still held all 14 records, occupying ~4.77 MB allocated TOAST.

**One-time** bounded SQL locks only the ~4.77MB snapshot table NOWAIT, verifies row count exactly 14, exactly four Oct17–18 recent rows, immutable Storage object presence for each source/day and all row source MD5s, then copies recent rows into a temporary table. It transactionally TRUNCATEs only the historical snapshot table, restores the four recent records, and checks full JSONB row fingerprint equality before COMMIT. If ANY guard fails, the transaction rolls back entirely. Historical older 10 records remain securely in Storage; they are not lost, but no longer in the hot database.

No new cron, capture, provider, semantic accuracy change, paid resource, or other table mutation. The existing writer `private.ft_archive_source_day(date)` continues nightly, and fresh snapshots can be archived when >2d later, but an automated archive-first retention job is **not** enabled here.

Expected physical saving of roughly 2–3 MB (not guaranteed until post-query). Goal <80% requires further safe work; DO NOT perform broad VACUUM FULL of live data.
