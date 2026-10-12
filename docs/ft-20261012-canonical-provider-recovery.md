# Fast Tracker — 12 Oct 2026 holistic canonical and bookmaker recovery

## Production evidence
- Before: only 2 canonical upcoming fixtures and 0 fresh bookmaker rows, despite Railway collector discovering 321 events and 88 complete quoted events (83 future). Job 38 ran every 5 minutes and logged `succeeded` but `PREVIOUS_CAPTURE_REJECTED: rows_1 provider_total_88 upcoming_1 distinct_1`.
- **Root cause:** `private.ft_publish_flashscore_collector_snapshot` joined only to already registered `public.matches`; source-shadow evidence held authoritative `FS:` event IDs and provider Unix kickoff epochs but those never became canonical upcoming fixtures. An absolute 10-quote minimum also rejected legitimate quiet-hour snapshots.
- Fix: a bounded, `SECURITY INVOKER`, private SQL function stages only upcoming 48h fixtures already present in the *same downloaded* Railway snapshot and fresh Flashscore source-shadow, with exact FS ID, 10-digit provider epoch within 60s of shadow kickoff, current scheduled status, source-date match and valid names. `ON CONFLICT DO NOTHING` means curated canonical fixtures never overwritten. Active redirect sources excluded.
- Existing `private.ft_publish_flashscore_collector_snapshot` now invokes that staging inside job 38, then validates complete 1X2 prices against **all future provider quote IDs**, not only pre-registered matches, requiring 90% confirmed identity and unique matched rows. 0 future quotes returns a truthful no-upcoming status rather than a fake failure. No extra scraper, cron, alias maintenance, request, or API endpoint.
- At 2026-10-12 01:55 UTC a single existing snapshot staged 312 new unique FS fixtures, 0 past, within 48h, no extra DB size at MB precision (259 MB). The fast 48h summary returned 331 fixtures (HTTP 200, response 620 KB). 312 newly staged have source-fresh shadow; no provider ID conflicts.
- **Natural pg_cron job 38 at 01:58 UTC** reported `CURRENT_HDA_COMMITTED`, published **83/83 verified future bookmaker 1X2 quotes** from the existing 01:46:36 UTC snapshot, with 83 quotes meeting the strict 20-minute freshness gate at the moment checked. Not a manually triggered provider request.
- Railway public/dashboard services still run validated release SHA `36e624a3`. SQL migration already applied in Supabase with version `20261012015445`; **do not reapply** when merging this code.
- Tight gates remain: 20-minute price freshness; source-specific FS fixture ID and Unix epoch; canonical home/away from same Flashscore shadow; source freshness 45 minutes; response snapshot at most 20 minutes old. No inferred probability or identity crosswalk.

## Remaining risks
- The 12-hour `public.matches` and `private.matches` retention jobs (#48/#49) are working as configured. Forebet prediction rows FK-cascade on public matches deletion; current Forebet records declined from 32 to 21 despite 2 verified OU/corner captures remaining. This is normal **under the current policy** but may weaken recent-48h result views and prospective evaluation. Do NOT silently disable retention or recreate a giant historical table; choose a small compact archive before changing the policy.
- Forebet general coverage remains source-limited: current Firecrawl listing captures only 1X2, not all goals/corner markets. Do not infer official values or add a new crawler just to fill blanks.
- 48h summary response is roughly 620 KB for 331 fixtures; monitor downstream browser performance / static CORS and avoid a future N+1 per-match hydration. The existing one indexed RPC is preferable.
- Between fresh 15-minute collector captures and 5-minute DB processing, brief intervals with zero quotes may still occur. Cron success is not the same as new odds capture.
- The direct-provider staged fixtures do not themselves prove FotMob or Forebet team aliases. Do not label unverified human-factor rows as verified or join by team name.

## Rollback
- The database functions are versioned below; rollback only the function definitions using the prior migration, while leaving already registered provider-ID fixtures in place until the 12h/7d retention policy naturally expires.
- Never delete existing user-curated fixtures, relax source guards, or re-enable HKJC. No extra recurring work should be added for recovery.
