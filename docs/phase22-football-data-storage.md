# Phase 22 — Private Football-Data CSV archive

The project is on Supabase Free. On 2026-10-18 Postgres held 3,960 imported match results (~7 MiB table / 410 MB entire DB). The bucket `fast-tracker-ingest` already exists, is private, and has a 5 MiB per-file ceiling. **Do not put bulk historical CSVs in the database**. This phase is optional raw-file storage, not a daily sync or model accuracy release.

## New function

`football-data-archive` only processes exactly one season + league per authenticated request. The caller passes `GET /functions/v1/football-data-archive?season=2526&league=E0` with the existing Vault-backed `x-ft-cron-key` credential. It reuses `ft_internal_cron_key_matches` for authentication. It does not expose any keys and does not accept arbitrary source URLs.

Allowed seasons: `2223,2324,2425,2526`. Allowed leagues are the existing 22 Football-Data current-season division codes. One CSV and a SHA-256 manifest are stored under `fast-tracker-ingest/football-data/history/<season>/<league>.csv` and `.../<league>.manifest.json`. Repeated requests verify existing content and do not overwrite changed historical CSVs; discrepancies need manual investigation. Neither live collector nor model tables are written.

**Operational steps:** Merge only after review and static PR CI. Deploy this **new isolated function** with JWT verification disabled ONLY because it enforces the existing internal Vault-backed cron secret using the RPC; never configure public bucket access. Then invoke from internal, privileged SQL, without copying the secret into client terminals:

```sql
select net.http_get(
  url := 'https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/football-data-archive?season=2526&league=E0',
  headers := jsonb_build_object('x-ft-cron-key',
    (select decrypted_secret from vault.decrypted_secrets where name='fast_tracker_cron_secret')),
  timeout_milliseconds := 55000
);
```

Check the response status via the pg_net response table (or Edge logs) and confirm that **both** objects exist in `storage.objects`, have nonzero size and match the reported SHA-256. Initially archive the 7 major leagues `E0 D1 SP1 I1 F1 N1 P1` for each of the 4 supported seasons, one controlled request per file. Expand to other supported leagues only after confirming available storage and upstream CSV quality. Do not assume every source exists. Never run all seasons as an automatic scheduled job.

**Downstream training:** Current `football_data_matches` remains the bounded 3,960-row hot tier. CSVs in private storage do not automatically become indexed SQL records or increase the production 250-match model sample. Implement a separate, explicit bounded on-demand replay loader with competition-safe matching and chronology checks when needed. Any evaluation using recently imported prior outcomes is RETROSPECTIVE. New prospective forecasts must be frozen before kickoff, with their exact captured source snapshot.

No HKJC code, reactivation, schedule or fallback is included.
