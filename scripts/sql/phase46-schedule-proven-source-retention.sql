-- Phase 46: ONE DAILY authenticated archive-first retention call.
-- The existing FT daily source writer runs 15:35 UTC; this runs 16:25 UTC
-- (00:25 HKT the next day), with no new scraping or other provider reads.
-- Phase45 worker proved 200/no-cold on 2026-10-18; unauthenticated 401, GET 405.
DO $guard$
DECLARE
 v_existing integer;
BEGIN
 IF NOT EXISTS(select 1 from vault.secrets
   where name='fast_tracker_cron_secret')
 THEN RAISE EXCEPTION 'SOURCE_RETENTION_CRON_KEY_MISSING'; END IF;
 SELECT count(*) INTO v_existing
 FROM cron.job WHERE jobname='ft-source-day-archive-retire-once-daily';
 IF v_existing>0 THEN
   RAISE EXCEPTION 'SOURCE_RETENTION_CRON_ALREADY_EXISTS_REVIEW_FIRST';
 END IF;
 PERFORM cron.schedule(
  'ft-source-day-archive-retire-once-daily',
  '25 16 * * *',
  $run$
  select net.http_post(
    url:='https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/source-day-retention',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-ft-cron-key',(select decrypted_secret from vault.decrypted_secrets
        where name='fast_tracker_cron_secret' limit 1)),
    body:='{}'::jsonb,
    timeout_milliseconds:=120000
  );
  $run$
 );
END;
$guard$;
