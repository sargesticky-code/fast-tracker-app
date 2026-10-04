-- Applied to production as Supabase migration 20261004064222.
-- Keep producer cadence unchanged. Reduce only monitoring/history overlap.

select cron.alter_job(14, schedule => '4,14,24,34,44,54 * * * *');
select cron.alter_job(17, schedule => '5,15,25,35,45,55 * * * *');
select cron.alter_job(8,  schedule => '7,17,27,37,47,57 * * * *');
select cron.alter_job(15, schedule => '9,19,29,39,49,59 * * * *');

-- Rollback schedules:
-- job 14: */2 * * * *
-- job 17: 1-59/2 * * * *
-- job 8:  2,7,12,17,22,27,32,37,42,47,52,57 * * * *
-- job 15: 4,9,14,19,24,29,34,39,44,49,54,59 * * * *
