-- Phase 27C: one-time, strictly source-anchored registry synchronization.
-- The all-in-one table has been verified to have 254 new FOREBET source
-- aliases from exact, strictly linked pre-kickoff canonical fixtures.
-- No provisional, fuzzy, presumed, user/browser-local confirmations qualify.
WITH eligible AS (
 SELECT source,alias_key,MIN(verified_team_key) team_key,
   MIN(provider_name) alias,
   MAX(last_observed_at) last_seen_at,
   SUM(observations)::integer evidence_count
 FROM public.football_alias_supertable
 WHERE source='FOREBET'
   AND resolution_status='VERIFIED'
   AND resolution_method='FOREBET_STRICT_TWO_TEAM_EXACT_FIXTURE_SOURCE'
   AND verified_team_key LIKE 'FS_TEAM:%'
 GROUP BY source,alias_key
 HAVING COUNT(DISTINCT verified_team_key)=1
), conflict_free AS (
 SELECT e.* FROM eligible e
 WHERE NOT EXISTS (
   SELECT 1 FROM public.team_alias_registry_v2 x
   WHERE x.source=e.source AND x.alias_key=e.alias_key
     AND x.team_key IS DISTINCT FROM e.team_key)
), added AS (
 INSERT INTO public.team_alias_registry_v2(
  source,alias_key,team_key,alias,status,confidence,
  evidence_count,distinct_event_count,verification_method,
  first_seen_at,last_seen_at,updated_at)
 SELECT source,alias_key,team_key,alias,'VERIFIED',1,
   evidence_count,evidence_count,'FOREBET_STRICT_SOURCE_CANONICAL_EVENT',
   last_seen_at,last_seen_at,now()
 FROM conflict_free
 ON CONFLICT(source,alias_key,team_key) DO NOTHING
 RETURNING 1
)
SELECT count(*)::integer newly_synced_forebet_registry_entries FROM added;
