-- FT-20261011: promote only new source-name variants backed by an existing
-- VERIFIED Flashscore provider TEAM_ID mapping. No fuzzy string similarity.
WITH observed AS (
 SELECT home_external_id provider_id,home_name source_name,external_event_id event_id,
        fetched_at FROM public.phase15_source_shadow_current WHERE source_key='FLASHSCORE'
 UNION ALL
 SELECT away_external_id,away_name,external_event_id,fetched_at
 FROM public.phase15_source_shadow_current WHERE source_key='FLASHSCORE'
), resolved AS (
 SELECT o.*,r.team_key
 FROM observed o JOIN public.team_name_lookup r
 ON r.source='FLASHSCORE_TEAM_ID'
 AND r.source_key=public.ft_team_name_key(o.provider_id)
 WHERE nullif(trim(o.source_name),'') IS NOT NULL
), safe AS (
 SELECT public.ft_team_name_key(source_name) source_key,
        min(source_name) source_name,min(team_key) team_key,
        count(DISTINCT event_id)::integer event_count,
        min(fetched_at) first_seen,max(fetched_at) last_seen
 FROM resolved GROUP BY public.ft_team_name_key(source_name)
 HAVING count(DISTINCT team_key)=1 AND count(DISTINCT source_name)=1
), eligible AS (
 SELECT * FROM safe s
 WHERE NOT EXISTS(SELECT 1 FROM public.team_alias_registry_v2 r
  WHERE r.source='FLASHSCORE' AND r.alias_key=s.source_key)
 AND NOT EXISTS(SELECT 1 FROM public.team_name_master m
  WHERE m.source='FLASHSCORE' AND m.source_key=s.source_key)
), registered AS (
 INSERT INTO public.team_alias_registry_v2
 (source,alias_key,team_key,alias,status,confidence,evidence_count,
  distinct_event_count,verification_method,first_seen_at,last_seen_at,updated_at)
 SELECT 'FLASHSCORE',source_key,team_key,source_name,'VERIFIED',0.975,
        event_count,event_count,
        'EXACT_PROVIDER_TEAM_ID_TO_PREVERIFIED_CANONICAL_TEAM',
        first_seen,last_seen,now()
 FROM eligible ON CONFLICT(source,alias_key,team_key) DO NOTHING
 RETURNING source,alias_key,team_key,alias,status,confidence,
           distinct_event_count,first_seen_at,last_seen_at,verification_method
), mastered AS (
 INSERT INTO public.team_name_master
 (source,source_name,source_key,team_key,hkjc_name_en,hkjc_name_zh,status,
  confidence,event_count,first_seen_at,last_seen_at,evidence_sources,updated_at)
 SELECT r.source,r.alias,r.alias_key,r.team_key,e.hkjc_name_en,e.hkjc_name_zh,
        'VERIFIED',r.confidence,r.distinct_event_count,r.first_seen_at,r.last_seen_at,
        jsonb_build_array('ALIAS_REGISTRY_V2',r.verification_method),now()
 FROM registered r JOIN public.team_entities_v2 e USING(team_key)
 ON CONFLICT(source,source_key,team_key) DO NOTHING
 RETURNING source_name
)
SELECT (SELECT count(*) FROM eligible) eligible_names,
       (SELECT count(*) FROM registered) added_registry,
       (SELECT count(*) FROM mastered) added_master;
