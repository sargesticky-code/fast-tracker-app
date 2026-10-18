# Phase 36B — After-use cold-lineup archive and deletion

## Why

The public lineup table holds player rows and 30+ MB repeated FLASHSCORE raw JSON. Details display needs team, player, shirt, position, formation coordinates and verified/predicted status. Large historical stores are not needed on live dashboard after the match. Prior exact 600-row archive/retirement passed.

## Safe independent worker
- Supabase Edge `lineup-cold-retire`, authenticated by the **existing** `x-ft-cron-key` secret matcher and service_role; no browser access and **POST only**. No new secrets, API tokens or paid provider.
- One request touches at most 200 source rows, only those last captured >14 days ago and absent from the current live Flashscore table.
- **Before ANY delete**, export exact full records to private Storage object `fast-tracker-ingest/lineup-cold/v3/*`, immutable SHA-256 filename and manifest. Read back the complete object and verify SHA-256, byte length, record count and ID range.
- Separate service_role-only `ft_retire_verified_lineup_batch` performs single-transaction atomic deletion after checking object path/digest/size, all exact IDs unique, every source row's match/source/player/fetched_at/raw fingerprint unchanged, >14d age and no live fixture or canonical fixture kickoff within last 48h. Any mismatch ROLLS BACK all deletions.
- Archive remains in private Storage for optional manual restore. Source data's pre-existing predicted-vs-confirmed status is preserved in backups; data arriving after match does not recreate old rows unless the source refresh elects to refetch.
- First test must run manually on one batch. No hourly cron is installed by this PR; only schedule when live archive/restore and capacity tests are green. Original archive-only v2 worker remains deployed and unmodified.
- A normal DELETE frees logical rows but may not reduce physical database size immediately. No VACUUM FULL near quota (82+%) without headroom and off-peak lock planning.
- Each batch's archive object is immutable; if service/network retries after deletion, next iteration sees a different candidate ID range. Unexpected RPC response never claims deletion success.
