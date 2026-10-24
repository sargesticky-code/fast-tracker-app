-- Checked 2026-10-24: conservative cleanup and capacity reporting only.
-- Rebuild a bloated 40-row odds snapshot index set: 6 MB -> ~72 kB.
-- This migration is not a bulk purge and does not bypass archive verification.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '12000ms';
REINDEX TABLE public.odds_snapshots;

-- Archive each of 200 old lineup rows to Storage, read back, verify SHA-256,
-- and perform a guarded, exact-row delete inside the existing Edge RPC.
-- 4 batches/hour; never delete unarchived evidence.
SELECT cron.schedule('ft-lineup-cold-retire-200-hourly','2,17,32,47 * * * *',
 $job$
 SELECT net.http_post(
   url:='https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/lineup-cold-retire?after=0',
   headers:=jsonb_build_object('Content-Type','application/json',
     'x-ft-cron-key',(select decrypted_secret from vault.decrypted_secrets
       where name='fast_tracker_cron_secret' limit 1)),
   body:='{}'::jsonb,timeout_milliseconds:=20000
 );
 $job$
);

-- PostgreSQL database-size trend (500 MiB reference only; excludes WAL).
SELECT cron.schedule('ft-db-capacity-6h','15 */6 * * *',$job$
with usage as (
 select pg_database_size(current_database())::bigint db_bytes,
        524288000::bigint reference_limit_bytes
), calc as (
 select db_bytes,reference_limit_bytes,round(db_bytes*100.0/reference_limit_bytes,1) pct
 from usage
)
insert into public.source_health(source,metric,value_text,status,notes,observed_at,raw)
select 'SUPABASE_DATABASE','capacity_500mb',pct::text,
 case when pct>=90 then 'CRITICAL' when pct>=80 then 'WARNING' else 'OK' end,
 'Database size warning at 80% of reference 500 MB. This is pg_database_size only; actual Supabase disk usage also includes WAL.',
 now(),jsonb_build_object(
  'bytes',db_bytes,'reference_limit_bytes',reference_limit_bytes,
  'percent_of_reference_limit',pct,'warning_threshold_pct',80,
  'critical_threshold_pct',90,'accounting_scope','pg_database_size_excludes_WAL')
from calc
on conflict(source,metric) do update set
 value_text=excluded.value_text,status=excluded.status,notes=excluded.notes,
 observed_at=excluded.observed_at,raw=excluded.raw;
$job$);