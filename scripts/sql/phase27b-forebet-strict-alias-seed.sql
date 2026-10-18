-- Phase 27B: one-time, bounded, additive FOREBET identity alias import.
-- Only source records already matched to an EXACT Flashscore canonical event
-- by strict Forebet V2 matching. No provisional source links qualify.
-- Do not delete, overwrite or silently change verified aliases.
-- Source names are joined to exactly one existing FS_TEAM:... identity.
WITH linked AS (
 SELECT f.match_id,f.league AS canonical_league,f.kickoff_hkt,
        p.forebet_league_short AS source_league,p.forebet_detail_url AS source_url,
        p.forebet_home_team,p.forebet_away_team,f.home_en,f.away_en,p.fetched_at
 FROM public.forebet_prediction_current p
 JOIN public.flashscore_primary_fixture_current f ON f.match_id=p.canonical_event_id
 WHERE p.canonical_event_id LIKE 'FS:%'
   AND p.forebet_detail_url LIKE 'https://www.forebet.com/en/football/matches/%'
   AND p.forebet_home_team IS NOT NULL AND p.forebet_away_team IS NOT NULL
   AND p.forebet_league_short IS NOT NULL AND btrim(p.forebet_league_short)<>''
   AND p.fetched_at <= f.kickoff_hkt AND p.fetched_at >= f.kickoff_hkt-interval '72 hours'
), legs AS (
 SELECT match_id,source_league,canonical_league,source_url,kickoff_hkt,fetched_at,
        'H' AS side,forebet_home_team AS source_name,home_en AS canonical_name FROM linked
 UNION ALL
 SELECT match_id,source_league,canonical_league,source_url,kickoff_hkt,fetched_at,
        'A',forebet_away_team,away_en FROM linked
), native AS (
 SELECT source_name,MIN(team_key) AS team_key
 FROM public.team_name_master
 WHERE source='CANONICAL_EN' AND status='VERIFIED' AND team_key LIKE 'FS_TEAM:%'
 GROUP BY source_name HAVING COUNT(DISTINCT team_key)=1
), prepared AS (
 SELECT l.*,n.team_key,
        public.ft_team_name_key(l.source_league) AS competition_key,
        NULLIF(regexp_replace(lower(l.source_name),'[^a-z0-9]','','g'),'') AS alias_key
 FROM legs l JOIN native n ON n.source_name=l.canonical_name
), unique_identity AS (
 SELECT alias_key,MIN(team_key) AS team_key FROM prepared
 WHERE alias_key IS NOT NULL
 GROUP BY alias_key HAVING COUNT(DISTINCT team_key)=1
), safe_rows AS (
 SELECT p.alias_key, p.competition_key,p.team_key, MIN(p.source_name) provider_name,
   MIN(p.source_league) source_competition,MIN(p.canonical_league) canonical_competition,
   MIN(p.canonical_name) canonical_name_en,
   COUNT(DISTINCT p.match_id)::integer observations,MIN(p.match_id) source_event_id_example,
   MIN(p.source_url) source_detail_url,MAX(p.fetched_at) last_observed_at,
   jsonb_build_object('strict_source_fixture',true,
     'fixture_sample',MIN(p.match_id),'sample_forebet_url',MIN(p.source_url),
     'source_league',MIN(p.source_league),'canonical_name',MIN(p.canonical_name),
     'source_provenance','FOREBET_VERIFIED_V2_EXACT_FLASHscore_EVENT',
     'owner_default_assumption','DISPLAY_MATCHES_UNLESS_CORRECTED') AS evidence
 FROM prepared p JOIN unique_identity ui ON ui.alias_key=p.alias_key AND ui.team_key=p.team_key
 WHERE p.competition_key IS NOT NULL
   AND NOT EXISTS(
      SELECT 1 FROM public.football_alias_supertable x
      WHERE x.source='FOREBET' AND x.alias_key=p.alias_key
      AND x.resolution_status='VERIFIED'
      AND x.verified_team_key IS DISTINCT FROM p.team_key)
   AND NOT EXISTS(
      SELECT 1 FROM public.team_alias_registry_v2 x
      WHERE x.source='FOREBET' AND x.alias_key=p.alias_key
      AND x.status='VERIFIED' AND x.team_key IS DISTINCT FROM p.team_key)
 GROUP BY p.alias_key,p.competition_key,p.team_key
), inserted AS (
 INSERT INTO public.football_alias_supertable(
  source,alias_key,competition_key,provider_team_id,provider_name,
  source_competition,canonical_competition,verified_team_key,canonical_name_en,
  resolution_status,confidence,resolution_method,observations,
  source_event_id_example,source_detail_url,last_observed_at,evidence)
 SELECT 'FOREBET',alias_key,competition_key,'',provider_name,source_competition,
  canonical_competition,team_key,canonical_name_en,'VERIFIED',1,
  'FOREBET_STRICT_TWO_TEAM_EXACT_FIXTURE_SOURCE',observations,
  source_event_id_example,source_detail_url,last_observed_at,evidence
 FROM safe_rows
 ON CONFLICT(source,alias_key,competition_key,provider_team_id) DO NOTHING
 RETURNING 1
)
SELECT count(*)::int AS new_forebet_source_aliases FROM inserted;
