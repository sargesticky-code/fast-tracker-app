# Phase 47 — Bounded, provable old odds retention

Audit 2026-10-18 11:35 UTC:
- `public.odds_snapshots` holds 6,316 historical observations, 267 fixtures, about 24 MiB allocated, all FLASHSCORE_BET365/ML.
- 699 observations from Oct6–9 are older than seven days; none are linked to currently active Flashscore fixtures.
- October 17 and 18 account for 5,611 fresh observations. These are needed for the odds-up/down UI and **must remain** in the hot database.
- No daily scheduled Odds archival currently exists. An unbounded market snapshot table will exceed the 500MiB database quota even if source-day and lineup history are controlled.

**Phase 47 (archive mechanism):**
- Strict service_role-only, SECURITY INVOKER SQL candidate RPC selects only confirmed ML odds snapshots older than **7 days**, never a current/recent Flashscore fixture, max **1,000** source rows in a single request. Returns full source row JSONB and MD5 of `to_jsonb(row)::text`.
- Cron-key authenticated POST-only `odds-cold-retire` Edge worker creates a private immutable Storage object `odds-history/v1/ID-ID-SHA256.jsonl.txt`, with all original rows, manifest, per-row MD5; downloads entire archive and SHA256-verifies byte count and JSON restore roundtrip **before calling any delete**.
- Service_role-only SQL retirement rechecks immutable object presence/digest/size, age >7d, source=FLASHSCORE_BET365, market=ML, source-row MD5 for EVERY ID and that no fixture has current/upcoming kickoff. Deletes exactly the matched 1–1000 rows or rolls back entire batch. Adds a small private ledger of proof paths.
- No new bookmaker scraping, odds fetching, alias association, model/forebet ingestion, public writes, paid services, or HKJC.
- This job should only be scheduled after one real live archive/retire batch is verified with source counts, intact current movement and Storage SHA256; schedule enough passes to offset new snapshot volume while avoiding unnecessary requests. Assess one bounded 1,000-row pass every 6h vs one daily multi-pass worker later.
- SQL DELETE frees logically reusable space; **physical** database size need not shrink. A small-table-only conditional repack might be needed later if old TOAST/index allocation keeps quota high. Do not VACUUM FULL live odds while space is tight.

Rollback: disable the new odds-retire schedule (if ever enabled); keep archives untouched. Do not restore all old snapshots into hot DB by default, as it would negate the quota improvement.
