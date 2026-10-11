-- Keep only original cron #11, daily. Do not create new scheduled jobs.
create or replace function private.ft_daily_alias_bulk_and_health()
returns jsonb language plpgsql security invoker
set search_path=private,public,pg_temp as $$
declare d jsonb; m jsonb;
begin
  d:=private.ft_sync_football_data_aliases();
  m:=public.ft_alias_maintenance_v2();
  return jsonb_build_object('football_data',d,'maintenance',m);
end $$;
revoke all on function private.ft_daily_alias_bulk_and_health()
from public,anon,authenticated;
select cron.alter_job(11,command:='select private.ft_daily_alias_bulk_and_health();');
