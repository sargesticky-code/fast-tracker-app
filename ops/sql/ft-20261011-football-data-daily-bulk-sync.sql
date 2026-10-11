-- Bulk refresh from existing official Football-Data snapshots.
-- One call per day through existing cron job #11; ZERO HTTP requests.
create or replace function private.ft_sync_football_data_aliases()
returns jsonb language plpgsql security invoker
set search_path=private,public,pg_temp as $$
declare affected integer; total_rows integer; linked_rows integer;
begin
  insert into private.team_alias_reference
    (source,external_team_id,source_name,source_key,name_role,
     identity_status,canonical_team_key,provenance)
  select 'FOOTBALL_DATA_CSV',
    'DIV:'||league_code||':'||public.ft_team_name_key(team),
    team,public.ft_team_name_key(team),'SOURCE_OBSERVED',
    'REFERENCE_ONLY',null,'FOOTBALL_DATA_2627_EXISTING_STORED_CSV'
  from (
    select distinct league_code,trim(home_team) team from public.football_data_matches
    union
    select distinct league_code,trim(away_team) team from public.football_data_matches
  ) as n
  where nullif(team,'') is not null
  on conflict do nothing;
  get diagnostics affected=row_count;

  with proof as (
    select source_key,min(team_key) target,
      count(distinct team_key) targets,count(distinct source) providers
    from public.team_name_lookup group by source_key
  )
  update private.team_alias_reference as r
  set canonical_team_key=p.target,identity_status='LINKED_CANONICAL',updated_at=now()
  from proof p
  where r.source='FOOTBALL_DATA_CSV'
    and r.source_key=p.source_key
    and r.canonical_team_key is null and p.targets=1 and p.providers>=2;

  update private.team_alias_reference as r
  set canonical_team_key=v.team_key,identity_status='LINKED_CANONICAL',updated_at=now()
  from public.team_name_lookup as v
  where r.source='FOOTBALL_DATA_CSV' and v.source='FOOTBALL_DATA'
    and r.source_key=v.source_key and r.canonical_team_key is null;

  select count(*),count(*) filter(where canonical_team_key is not null)
    into total_rows,linked_rows from private.team_alias_reference
    where source='FOOTBALL_DATA_CSV';
  return jsonb_build_object('source','FOOTBALL_DATA_CSV',
    'source_requests',0,'new_alias_rows',affected,
    'total_alias_rows',total_rows,'linked_alias_rows',linked_rows);
end $$;
revoke all on function private.ft_sync_football_data_aliases()
from public,anon,authenticated;
