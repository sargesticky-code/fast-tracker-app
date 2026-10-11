-- Remove ONLY two already-inactive cron definitions that are duplicates
-- of the current active Flashscore source scout job 32. They perform zero
-- active work and are obsolete. Do not touch active odds / live / phase2 jobs.
WITH eligible AS (
 SELECT jobid,jobname FROM cron.job
 WHERE jobid IN (31,33) AND active=false
 AND jobname IN ('phase15-flashscore-scout-6h','phase2-lineup-official-upgrade')
), deleted AS (
 SELECT e.jobid,e.jobname,cron.unschedule(e.jobid) removed FROM eligible e
)
SELECT jobid,jobname,removed FROM deleted ORDER BY jobid;
