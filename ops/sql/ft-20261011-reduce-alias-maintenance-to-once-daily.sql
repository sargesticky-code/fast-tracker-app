-- Reuse original job 11 (no duplicate cron). Its source-independent alias
-- maintenance executed 24x/day with 5 failures in the previous 24h, despite
-- bulk public-domain aliases being stable. Once per day after 23:35 HKT source
-- snapshot is sufficient for the current daily bulk design.
-- Does not remove the master/registry/verification logic or reset aliases.
SELECT cron.alter_job(11, schedule:='45 15 * * *');
