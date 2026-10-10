-- Retry ingestion off the crowded quarter-hour slots. Existing edge handler
-- skips exact already-published snapshots and rate-limits only successful writes.
select cron.alter_job(38::bigint, schedule := '2,7,12,17,22,27,32,37,42,47,52,57 * * * *');
