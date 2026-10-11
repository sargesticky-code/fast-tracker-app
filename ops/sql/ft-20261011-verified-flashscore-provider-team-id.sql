-- FT-20261011: Verified Flashscore stable team IDs into EXISTING All-in-One alias registry.
-- No external fetch; no extra table/index/cron. Do not mistake raw AU (0/1/3) for a team ID.
WITH observed AS (
  SELECT home_external_id fs_id, home_name fs_name, external_event_id evt, fetched_at
  FROM public.phase15_source_shadow_current WHERE source_key='FLASHSCORE'
  UNION ALL
  SELECT away_external_id, away_name, external_event_id, fetched_at
  FROM public.phase15_source_shadow_current WHERE source_key='FLASHSCORE'
), grounded AS (
  SELECT o.*, m.team_key
  FROM observed o JOIN public.team_name_lookup m
    ON m.source='FLASHSCORE'
   AND m.source_key=public.ft_team_name_key(o.fs_name)
  WHERE o.fs_id ~ '^[A-Za-z0-9]{6,16}$'
), stable AS (
  SELECT lower(fs_id) source_key, min(fs_id) source_id, min(team_key) team_key,
         count(DISTINCT evt)::integer event_count,
         min(fetched_at) first_seen,max(fetched_at) last_seen
  FROM grounded GROUP BY lower(fs_id)
  HAVING count(DISTINCT team_key)=1 AND count(DISTINCT fs_id)=1
), eligible AS (
  SELECT * FROM stable s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.team_alias_registry_v2 r
    WHERE r.source='FLASHSCORE_TEAM_ID' AND r.alias_key=s.source_key)
  AND NOT EXISTS (
    SELECT 1 FROM public.team_name_master m
    WHERE m.source='FLASHSCORE_TEAM_ID' AND m.source_key=s.source_key)
), added_registry AS (
  INSERT INTO public.team_alias_registry_v2
  (source,alias_key,team_key,alias,status,confidence,evidence_count,
   distinct_event_count,verification_method,first_seen_at,last_seen_at,updated_at)
  SELECT 'FLASHSCORE_TEAM_ID',source_key,team_key,source_id,'VERIFIED',0.97,
         event_count,event_count,'EXISTING_FLASH_SHADOW_ID_MATCHES_VERIFIED_SOURCE_NAME',
         first_seen,last_seen,now()
  FROM eligible
  ON CONFLICT(source,alias_key,team_key) DO NOTHING
  RETURNING source,alias,alias_key,team_key,confidence,distinct_event_count,
            first_seen_at,last_seen_at,verification_method
), added_master AS (
  INSERT INTO public.team_name_master
  (source,source_name,source_key,team_key,hkjc_name_en,hkjc_name_zh,status,
   confidence,event_count,first_seen_at,last_seen_at,evidence_sources,updated_at)
  SELECT r.source,r.alias,r.alias_key,r.team_key,
         e.hkjc_name_en,e.hkjc_name_zh,'VERIFIED',r.confidence,
         r.distinct_event_count,r.first_seen_at,r.last_seen_at,
         jsonb_build_array('ALIAS_REGISTRY_V2',r.verification_method),now()
  FROM added_registry r JOIN public.team_entities_v2 e USING(team_key)
  ON CONFLICT(source,source_key,team_key) DO NOTHING
  RETURNING source,source_key,team_key
)
SELECT (SELECT count(*) FROM eligible) eligible,
       (SELECT count(*) FROM added_registry) registered,
       (SELECT count(*) FROM added_master) in_all_in_one_master;
