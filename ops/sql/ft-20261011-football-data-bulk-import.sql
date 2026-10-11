-- Existing official Football-Data CSV names, bulk no network.
-- Local DIV:<league>:<normalized-name> keys are not official team IDs.
insert into private.team_alias_reference
(source,external_team_id,source_name,source_key,name_role,identity_status,canonical_team_key,provenance)
select 'FOOTBALL_DATA_CSV', 'DIV:'||league_code||':'||public.ft_team_name_key(team),
       team,public.ft_team_name_key(team),'SOURCE_OBSERVED','REFERENCE_ONLY',null,
       'FOOTBALL_DATA_2627_EXISTING_STORED_CSV'
from (
  select distinct league_code, trim(home_team) team from public.football_data_matches
  union
  select distinct league_code, trim(away_team) team from public.football_data_matches
) as n
where nullif(team,'') is not null
on conflict do nothing;
