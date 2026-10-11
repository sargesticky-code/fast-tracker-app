-- FT-20261011 — Repair identical-provider event identities for visible
-- recent matches. No fuzzy name matching; exact event ID + exact UTC kickoff.
-- This fixes persisted source details; no provider calls, cron or extra capture.
WITH proof AS (
 SELECT s.source_key,s.external_event_id,f.match_id
 FROM public.phase15_source_shadow_current s
 JOIN public.active_canonical_fixture_current f
 ON f.match_id='FS:'||s.external_event_id
 AND f.kickoff_hkt=s.kickoff_utc
 WHERE s.source_key='FLASHSCORE' AND s.match_id IS NULL
 AND f.kickoff_hkt>=now()-interval '6 hours'
 AND f.kickoff_hkt<now()+interval '48 hours'
 AND s.external_event_id ~ '^[A-Za-z0-9]{6,16}$'
), safe AS (
 SELECT source_key,external_event_id,min(match_id) match_id FROM proof
 GROUP BY source_key,external_event_id
 HAVING count(distinct match_id)=1
), updated AS (
 UPDATE public.phase15_source_shadow_current s
 SET match_id=x.match_id,match_confidence=0.995,
     identity_status='VERIFIED_IDENTITY',updated_at=now()
 FROM safe x
 WHERE s.source_key=x.source_key AND s.external_event_id=x.external_event_id
 AND s.match_id IS NULL
 RETURNING s.external_event_id,s.detail_available,s.detail_fetched_at
)
SELECT count(*) linked_source_events,
 count(*) FILTER(WHERE detail_available=true AND detail_fetched_at>now()-interval '24 hours') recent_detail_links
FROM updated;
