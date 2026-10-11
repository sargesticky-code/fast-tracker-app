# Fast Tracker — historical match stats, odds freshness, and Supabase usage (2026-10-12)

## Existing data and fixes
- The canonical 48-hour Phase-1 API exposes historical Flashscore-observed match stats for 28/81 fixtures, including xG in 25. The frontend did not display them.
- UI now displays provider-observed shots, corners, xG, possession and chances with a capture timestamp and NOT FINAL/NOT VERIFIED LIVE semantics. Strict FS event ID; no provider name inference.
- Forebet H/D/A rejects null probabilities rather than coercing null to 0.
- Raw Bet365 prices must be a complete bounded three-way quote captured in the last 20 minutes, and the containing raw snapshot must be within 30 minutes. Hidden stale prices retain source timestamp, never silently treated as current.

## Supabase resource controls
- Single observed DB size ~259 MB. Largest relations by total size: phase2_match_lineup_evidence 49 MB, phase15_source_shadow_current 26 MB, phase2_players 24 MB, odds_snapshots 23 MB and football_alias_supertable 13 MB.
- Eight jobs are active in cron; job 38 can succeed with publisher status UNCHANGED. A successful cron execution is not a fresh quote.
- Reduce raw snapshot browser polling 60s -> 120s (50% fewer periodic requests) and Supabase verified-summary polling 90s -> 240s (62.5% fewer periodic calls). Requests only occur when tab is visible. Existing detail requests remain one per match open; no additional ingestion jobs or tables.
- Keep historical tables and existing SQL identities until a separately evidenced retention dependency audit; deleting them indiscriminately risks past match history.

## Verify
- PR CI Next.js build and Playwright desktop 1440/mobile 390: historical observations and exact timestamps; stale price suppression; fresh bounded HDA; invalid or null Forebet HDA; wrong-ID reject; raw fallback.
- After CI success merge release, explicitly deploy public Railway service only and verify public HTTP and source Edge API.
- Retired HKJC Edge 410 endpoints and missing historical Forebet corner/O-U capture are not solved here; do not re-enable obsolete ingest.
