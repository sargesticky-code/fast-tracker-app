-- FT-20261011: add the already-collected FotMob provider team IDs to the
-- SAME private all-in-one alias reference (no new network collection/table).
-- Forebet verified names remain in team_name_master and the unified view.
ALTER TABLE private.team_alias_reference
 DROP CONSTRAINT IF EXISTS team_alias_reference_source_check;
ALTER TABLE private.team_alias_reference
 ADD CONSTRAINT team_alias_reference_source_check
 CHECK (source IN ('REEP_CC0','FLASHSCORE_TEAM_ID',
                  'FOTMOB_TEAM_ID','FOREBET_REFERENCE'));

WITH sides AS (
 SELECT home_external_id external_id,home_name source_name
 FROM public.phase15_source_shadow_current WHERE source_key='FOTMOB'
 UNION ALL
 SELECT away_external_id,away_name
 FROM public.phase15_source_shadow_current WHERE source_key='FOTMOB'
), canonical_anchors AS (
 SELECT s.external_id,m.team_key
 FROM sides s JOIN public.team_name_lookup m ON m.source='FOTMOB'
  AND m.source_key=public.ft_team_name_key(s.source_name)
 WHERE nullif(s.external_id,'') IS NOT NULL
), agreed AS (
 SELECT external_id,min(team_key) team_key
 FROM canonical_anchors GROUP BY external_id
 HAVING count(distinct team_key)=1
), unique_names AS (
 SELECT external_id,public.ft_team_name_key(source_name) source_key,
        min(source_name) source_name
 FROM sides WHERE nullif(external_id,'') IS NOT NULL
   AND nullif(trim(source_name),'') IS NOT NULL
 GROUP BY external_id,public.ft_team_name_key(source_name)
), inserted AS (
 INSERT INTO private.team_alias_reference
 (source,external_team_id,source_name,source_key,name_role,identity_status,
  canonical_team_key,provenance)
 SELECT 'FOTMOB_TEAM_ID',n.external_id,n.source_name,n.source_key,
        'SOURCE_OBSERVED',
        CASE WHEN a.team_key IS NULL THEN 'REFERENCE_ONLY'
             ELSE 'LINKED_CANONICAL' END,
        a.team_key,'EXISTING_PHASE15_FOTMOB_SHADOW'
 FROM unique_names n LEFT JOIN agreed a USING(external_id)
 ON CONFLICT(source,external_team_id,source_key) DO NOTHING
 RETURNING identity_status
)
SELECT count(*) added,
       count(*) FILTER(WHERE identity_status='LINKED_CANONICAL') linked
FROM inserted;
