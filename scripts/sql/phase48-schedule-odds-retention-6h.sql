-- Phase 48: bounded OLD ODDS archive-and-retire only (no scraping).
-- Live proof Oct18: 699 expired rows SHA256 archived, downloaded, JSON
-- restored, DB row-MD5 guarded and retired; 5617 recent odds remain.
-- The betting market capture/movement crons are NOT changed.
-- Every six hours processes at most 1000 odds snapshots. 4000/day ceiling
-- safely offsets ~3000/day observed incoming odds rows without looping.
DO $guard$
DECLARE v_count integer;
BEGIN
 IF NOT EXISTS(select 1 from vault.secrets where name='fast_tracker_cron_secret')
 THEN RAISE EXCEPTION 'ODDS_RETENTION_VAULT_KEY_MISSING'; END IF;
 SELECT count(*) INTO v_count FROM cron.job
 WHERE jobname='ft-odds-history-archive-retire-6h';
 IF v_count<>0 THEN RAISE EXCEPTION 'ODDS_RETENTION_JOB_ALREADY_EXISTS'; END IF;
 PERFORM cron.schedule(
  'ft-odds-history-archive-retire-6h',
  '7 */6 * * *',
  $run$
  select net.http_post(
    url:='https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/odds-cold-retire',
    headers:=jsonb_build_object('Content-Type','application/json',
      'x-ft-cron-key',(select decrypted_secret from vault.decrypted_secrets
        where name='fast_tracker_cron_secret' limit 1)),
    body:='{}'::jsonb,timeout_milliseconds:=120000
  );
  $run$
 );
END;
$guard$;
