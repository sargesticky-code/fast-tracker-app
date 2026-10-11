-- FT-20261011: idempotent, bounded alias registry + All-in-One master backfill.
-- NO provider HTTP requests; provenance comes solely from already-stored fixtures.
-- Creates no new tables, jobs, aliases without a canonical entity or data sources.
-- Run as one atomic SQL statement. ON CONFLICT DO NOTHING: never replace existing authority.

with observed as (
  select 'FLASHSCORE'::text source,f.home source_name,c.home_en canonical_name,
         f.provider_event_id event_id,f.captured_at observed_at
  from public.flashscore_fixture_current f
  join public.active_canonical_fixture_current c on c.match_id=f.canonical_match_id
  where f.identity_status='EXACT_EXISTING'
    and f.kickoff_utc=c.kickoff_hkt
    and public.ft_team_name_key(f.home)=public.ft_team_name_key(c.home_en)
    and public.ft_team_name_key(f.away)=public.ft_team_name_key(c.away_en)
  union all
  select 'FLASHSCORE',f.away,c.away_en,f.provider_event_id,f.captured_at
  from public.flashscore_fixture_current f
  join public.active_canonical_fixture_current c on c.match_id=f.canonical_match_id
  where f.identity_status='EXACT_EXISTING'
    and f.kickoff_utc=c.kickoff_hkt
    and public.ft_team_name_key(f.home)=public.ft_team_name_key(c.home_en)
    and public.ft_team_name_key(f.away)=public.ft_team_name_key(c.away_en)
  union all
  select 'FOREBET',p.forebet_home_team,c.home_en,p.match_id,p.fetched_at
  from public.forebet_prediction_current p
  join public.active_canonical_fixture_current c using(match_id)
  where p.raw->>'source'='FOREBET'
    and p.match_score>=0.995
    and p.fetched_at>=now()-interval '72 hours'
  union all
  select 'FOREBET',p.forebet_away_team,c.away_en,p.match_id,p.fetched_at
  from public.forebet_prediction_current p
  join public.active_canonical_fixture_current c using(match_id)
  where p.raw->>'source'='FOREBET'
    and p.match_score>=0.995
    and p.fetched_at>=now()-interval '72 hours'
), paired as (
  select o.source,o.source_name,public.ft_team_name_key(o.source_name) source_key,
         ce.team_key,e.hkjc_name_en,e.hkjc_name_zh,o.event_id,o.observed_at
  from observed o
  join public.team_name_lookup ce
    on ce.source='CANONICAL_EN'
   and ce.source_key=public.ft_team_name_key(o.canonical_name)
  join public.team_entities_v2 e using(team_key)
  where public.ft_team_name_key(o.source_name)=public.ft_team_name_key(o.canonical_name)
    and nullif(trim(o.source_name),'') is not null
), safe as (
  select source,source_key,min(source_name) alias,min(team_key) team_key,
         count(distinct event_id)::integer events,
         min(observed_at) first_seen,max(observed_at) last_seen
  from paired group by source,source_key
  having count(distinct team_key)=1 and count(distinct source_name)=1
), eligible as (
  select s.* from safe s
  where not exists (select 1 from public.team_alias_registry_v2 r
                    where r.source=s.source and r.alias_key=s.source_key)
    and not exists (select 1 from public.team_name_master m
                    where m.source=s.source and m.source_key=s.source_key)
), added_registry as (
  insert into public.team_alias_registry_v2
  (source,alias_key,team_key,alias,status,confidence,evidence_count,
   distinct_event_count,verification_method,first_seen_at,last_seen_at,updated_at)
  select source,source_key,team_key,alias,'VERIFIED',
         case when source='FOREBET' then 0.995 else 0.98 end,
         events,events,
         case when source='FOREBET'
              then 'EXISTING_VERIFIED_FOREBET_PUBLICATION_EXACT_TEAM'
              else 'EXISTING_FLASHSCORE_CANONICAL_FIXTURE_EXACT_ID_TIME_TEAMS' end,
         first_seen,last_seen,now()
  from eligible
  on conflict (source,alias_key,team_key) do nothing
  returning source,alias_key,team_key,alias,status,confidence,
            evidence_count,distinct_event_count,first_seen_at,last_seen_at,
            verification_method
), added_master as (
  insert into public.team_name_master
  (source,source_name,source_key,team_key,hkjc_name_en,hkjc_name_zh,status,
   confidence,event_count,first_seen_at,last_seen_at,evidence_sources,updated_at)
  select r.source,r.alias,r.alias_key,r.team_key,e.hkjc_name_en,e.hkjc_name_zh,
         'VERIFIED',r.confidence,r.distinct_event_count,
         r.first_seen_at,r.last_seen_at,
         jsonb_build_array('ALIAS_REGISTRY_V2',r.verification_method),
         now()
  from added_registry r join public.team_entities_v2 e using(team_key)
  on conflict (source,source_key,team_key) do nothing
  returning source,source_name,team_key
)
select (select count(*) from eligible) vetted_eligible,
       (select count(*) from added_registry) added_registry,
       (select count(*) from added_master) added_master,
       coalesce((select jsonb_object_agg(source,n) from
         (select source,count(*) n from added_master group by source) x),'{}'::jsonb)
       as source_breakdown;
