-- Phase 36C: bounded, low-overhead background lineup retention after live proof.
-- Phase36B manual 601-800 batch was SHA-256 readback verified and atomically
-- deleted. The Edge checks 14d cold, absence from live Flashscore fixtures,
-- and the DB RPC also protects canonical matches with upcoming/recent kickoffs.
-- No secret literals, use existing Supabase Vault x-ft-cron-key.
do $retention_cron$
begin
  if not exists(select 1 from vault.secrets
       where name='fast_tracker_cron_secret') then
    raise exception 'REQUIRED_PRIVATE_CRON_KEY_NOT_CONFIGURED';
  end if;
  if not exists(select 1 from cron.job
       where jobname='ft-lineup-cold-retire-200-hourly' and active) then
    perform cron.schedule(
      'ft-lineup-cold-retire-200-hourly',
      '58 * * * *',
      $run$
      select net.http_post(
        url:='https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/lineup-cold-retire?after=0',
        headers:=jsonb_build_object(
          'Content-Type','application/json',
          'x-ft-cron-key',(select decrypted_secret
            from vault.decrypted_secrets
            where name='fast_tracker_cron_secret' limit 1)),
        body:='{}'::jsonb,
        timeout_milliseconds:=20000);
      $run$
    );
  end if;
end;
$retention_cron$;
