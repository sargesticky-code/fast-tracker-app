with proof as (
  select source_key,min(team_key) target,count(distinct team_key) targets,
         count(distinct source) evidence_sources
  from public.team_name_lookup group by source_key
), evidence as (
  select r.source,r.external_team_id,p.target team_key,p.evidence_sources
  from private.team_alias_reference r
  join proof p on r.source_key=p.source_key and p.targets=1
  where r.source in ('FLASHSCORE_TEAM_ID','FOTMOB_TEAM_ID','REEP_CC0')
  union all
  select source,external_team_id,canonical_team_key,99
  from private.team_alias_reference
  where source in ('FLASHSCORE_TEAM_ID','FOTMOB_TEAM_ID','REEP_CC0')
    and canonical_team_key is not null
), approved as (
  select source,external_team_id,min(team_key) target
  from evidence group by source,external_team_id
  having count(distinct team_key)=1 and max(evidence_sources)>=2
)
update private.team_alias_reference r
set canonical_team_key=a.target,identity_status='LINKED_CANONICAL',updated_at=now()
from approved a
where r.source=a.source and r.external_team_id=a.external_team_id
and r.canonical_team_key is null;