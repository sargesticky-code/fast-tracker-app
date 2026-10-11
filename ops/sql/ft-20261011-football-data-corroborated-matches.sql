with proof as (select source_key,min(team_key) key,count(distinct team_key) targets,count(distinct source) providers from public.team_name_lookup group by source_key)
update private.team_alias_reference r
set canonical_team_key=p.key,identity_status='LINKED_CANONICAL',updated_at=now()
from proof p
where r.source='FOOTBALL_DATA_CSV' and r.source_key=p.source_key and r.canonical_team_key is null and p.targets=1 and p.providers>=2;