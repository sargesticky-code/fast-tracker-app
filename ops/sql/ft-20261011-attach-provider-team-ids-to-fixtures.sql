-- FT-20261011: attach original provider IDs to EXISTING Flashscore fixture raw payload.
-- Trust only independent shadow records with SAME event id, exact kickoff and both names.
-- Never change canonical_match_id, source freshness timestamps or odds.
WITH evidence AS (
 SELECT f.provider_event_id,s.home_external_id home_id,s.away_external_id away_id,s.fetched_at
 FROM public.flashscore_fixture_current f
 JOIN public.phase15_source_shadow_current s
   ON s.source_key='FLASHSCORE' AND s.external_event_id=f.provider_event_id
 WHERE f.kickoff_utc=s.kickoff_utc
   AND public.ft_team_name_key(f.home)=public.ft_team_name_key(s.home_name)
   AND public.ft_team_name_key(f.away)=public.ft_team_name_key(s.away_name)
   AND s.home_external_id~'^[A-Za-z0-9]{6,16}$'
   AND s.away_external_id~'^[A-Za-z0-9]{6,16}$'
   AND NOT f.raw ? 'flashscore_home_team_id'
   AND NOT f.raw ? 'flashscore_away_team_id'
), unique_evidence AS (
 SELECT provider_event_id,min(home_id) home_id,min(away_id) away_id,
        max(fetched_at) source_fetched_at
 FROM evidence GROUP BY provider_event_id
 HAVING count(DISTINCT home_id)=1 AND count(DISTINCT away_id)=1
), updated AS (
 UPDATE public.flashscore_fixture_current f
 SET raw=coalesce(f.raw,'{}'::jsonb) ||
    jsonb_build_object('flashscore_home_team_id',e.home_id,
                       'flashscore_away_team_id',e.away_id,
                       'team_id_origin','SHADOW_MATCH_ID_EXACT_KICKOFF_BOTH_NAMES',
                       'team_id_source_fetched_at',e.source_fetched_at)
 FROM unique_evidence e WHERE f.provider_event_id=e.provider_event_id
 RETURNING f.provider_event_id
)
SELECT (SELECT count(*) FROM unique_evidence) qualified_fixture_ids,
       (SELECT count(*) FROM updated) enriched_fixture_rows;
