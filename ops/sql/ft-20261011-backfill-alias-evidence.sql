-- FT-20261011: narrow evidence lineage for the 120 already-added verified aliases.
-- No external fetch, no new tables, only pre-existing canonical fixture evidence.
with stored as (
  select 'FLASHSCORE'::text source,f.home alias,
         public.ft_team_name_key(f.home) alias_key,'H'::text side,
         f.canonical_match_id match_id,f.provider_event_id provider_id,
         f.league tournament,c.kickoff_hkt kickoff_at,f.captured_at observed_at,
         'EXISTING_FLASHSCORE_CANONICAL_FIXTURE_EXACT_ID_TIME_TEAMS'::text method
  from public.flashscore_fixture_current f
  join public.active_canonical_fixture_current c on c.match_id=f.canonical_match_id
  where f.identity_status='EXACT_EXISTING' and f.kickoff_utc=c.kickoff_hkt
    and public.ft_team_name_key(f.home)=public.ft_team_name_key(c.home_en)
    and public.ft_team_name_key(f.away)=public.ft_team_name_key(c.away_en)
  union all
  select 'FLASHSCORE',f.away,public.ft_team_name_key(f.away),'A',
         f.canonical_match_id,f.provider_event_id,f.league,c.kickoff_hkt,f.captured_at,
         'EXISTING_FLASHSCORE_CANONICAL_FIXTURE_EXACT_ID_TIME_TEAMS'
  from public.flashscore_fixture_current f
  join public.active_canonical_fixture_current c on c.match_id=f.canonical_match_id
  where f.identity_status='EXACT_EXISTING' and f.kickoff_utc=c.kickoff_hkt
    and public.ft_team_name_key(f.home)=public.ft_team_name_key(c.home_en)
    and public.ft_team_name_key(f.away)=public.ft_team_name_key(c.away_en)
  union all
  select 'FOREBET',p.forebet_home_team,public.ft_team_name_key(p.forebet_home_team),'H',
         p.match_id,p.match_id,p.forebet_league_short,c.kickoff_hkt,p.fetched_at,
         'EXISTING_VERIFIED_FOREBET_PUBLICATION_EXACT_TEAM'
  from public.forebet_prediction_current p
  join public.active_canonical_fixture_current c using(match_id)
  where p.raw->>'source'='FOREBET' and p.match_score>=0.995
    and p.fetched_at>=now()-interval '72 hours'
    and public.ft_team_name_key(p.forebet_home_team)=public.ft_team_name_key(c.home_en)
  union all
  select 'FOREBET',p.forebet_away_team,public.ft_team_name_key(p.forebet_away_team),'A',
         p.match_id,p.match_id,p.forebet_league_short,c.kickoff_hkt,p.fetched_at,
         'EXISTING_VERIFIED_FOREBET_PUBLICATION_EXACT_TEAM'
  from public.forebet_prediction_current p
  join public.active_canonical_fixture_current c using(match_id)
  where p.raw->>'source'='FOREBET' and p.match_score>=0.995
    and p.fetched_at>=now()-interval '72 hours'
    and public.ft_team_name_key(p.forebet_away_team)=public.ft_team_name_key(c.away_en)
), traced as (
 select s.*,r.team_key,r.confidence from stored s
 join public.team_alias_registry_v2 r
 on r.source=s.source and r.alias_key=s.alias_key
 and r.alias=s.alias and r.status='VERIFIED'
 and r.verification_method=s.method
), added as (
 insert into public.team_alias_evidence_v2
 (source,alias,alias_key,team_key,hkjc_event_id,team_side,tournament,kickoff_hkt,
  evidence_type,confidence,observed_at,raw)
 select source,alias,alias_key,team_key,match_id,side,tournament,kickoff_at,
        method,confidence,observed_at,
        jsonb_build_object('source','ALREADY_STORED_FIXTURE','provider_event_id',provider_id,
          'canonical_match_id',match_id,'source_name',alias,'provenance',method)
 from traced
 on conflict do nothing
 returning source
)
select count(*) added_evidence,coalesce(jsonb_object_agg(source,n),'{}'::jsonb) sources
from (select source,count(*) n from added group by source) sums;
