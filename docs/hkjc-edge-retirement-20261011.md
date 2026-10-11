# HKJC Edge retirement – production-safe cleanup (2026-10-11)

## Owner instruction
Remove HKJC as an active source. Never restore HKJC capture, odds, polling, public API fallbacks, or scheduled collection. Preserve verified Flashscore fixture identities, independent bookmaker/model sources, and existing player-statistics feeds.

## Verified state before cleanup
- Supabase project: `hekqxhgjexzxnecwhyao`.
- Four deployed `hkjc-*` Edge Functions (`hkjc-native-probe` v6, `hkjc-live-direct` v15, `hkjc-upcoming-direct` v15, `hkjc-live-targets` v4) contain **only** inert handlers returning HTTP 410 / `RETIRED_SOURCE_ENDPOINT`. `ACTIVE` means deployed, not executing capture.
- Production `cron.job` contains **zero** direct `hkjc-*` targets or HKJC-named jobs.
- Deployed `app-phase1-feed` v95, `app-match-detail` v63, `app-live-feed` v19, `app-match-analysis` v48, `live-score-direct` v15, `phase15-flashscore-scout` v10, `phase3-live-fast` v5 and `live-source-shadow` v12 have zero `hkjc` substrings in their current Edge source. These are source checks, not a blanket assertion about every database view.
- `cron.job` 11 and 41 alias jobs remain inactive; Flashscore score/lineup job 32 stays active.
- Historical `hkjc_event_id` columns still participate in compatibility joins and functions (including `ft_fast_flashscore_summary`). The names do **not** establish active HKJC capture. Do not drop/rename these columns without audited FK+RPC replacement and regression tests.

## Repository cleanup
- On the default `main` branch, old HKJC collector implementations `supabase/functions/hkjc-live-direct/index.ts` and `supabase/functions/hkjc-upcoming-direct/index.ts` were deleted to prevent accidental redeployment of their prior capture logic.
- This cleanup removes the four retired stub source entrypoints from the current release code; history remains recoverable in Git for audit purposes.
- No database records or historical match relationships are deleted; no migration, new collector, new cron, or new spend is introduced.

## Still required for physical undeployment
Removing source files from Git **does not** delete an already deployed Supabase Edge Function. The Supabase MCP connection in this session does not expose an Edge Function deletion operation. Thus the four endpoints may still appear as ACTIVE (but return 410) until explicitly undeployed.

Execute once with an authenticated Supabase CLI, after `supabase functions list --project-ref he kq` using the full project ref (below):

```bash
supabase functions list --project-ref hekqxhgjexzxnecwhyao
supabase functions delete hkjc-native-probe --project-ref hekqxhgjexzxnecwhyao
supabase functions delete hkjc-live-direct --project-ref hekqxhgjexzxnecwhyao
supabase functions delete hkjc-upcoming-direct --project-ref hekqxhgjexzxnecwhyao
supabase functions delete hkjc-live-targets --project-ref hekqxhgjexzxnecwhyao
supabase functions list --project-ref hekqxhgjexzxnecwhyao
```

After physical deletion: verify all four absent from the Edge list; no HKJC direct cron jobs; `app-phase1-feed`, `app-match-detail`, `app-live-feed`, Flashscore score/lineup refresh, and public desktop/mobile pages still work. Do not reintroduce HKJC named endpoints during redeploy.
