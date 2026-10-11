-- Deduplicate the same Flashscore Scout Edge endpoint.
-- The retained #32 hourly force=1 scan continues to capture confirmed
-- lineups and observed statistics. Oddsmaker capture is an independent
-- Railway process and is intentionally unaffected.
-- Strict job-name guards make this safe if IDs vary in other environments.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobid=31
    AND jobname='phase15-flashscore-scout-6h'
    AND schedule='17 */6 * * *')
  THEN PERFORM cron.alter_job(job_id:=31,active:=false); END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobid=33
    AND jobname='phase2-lineup-official-upgrade'
    AND schedule='42 * * * *')
  THEN PERFORM cron.alter_job(job_id:=33,active:=false); END IF;
END $$;

-- Roll back ONLY with exact job identity verified:
-- SELECT cron.alter_job(job_id:=31,active:=true);
-- SELECT cron.alter_job(job_id:=33,active:=true);
-- #32 phase2-lineup-source-refresh remains on '12 * * * *'.
-- #23 Phase 4 core schedule unchanged. #38 HDA publication unchanged.
