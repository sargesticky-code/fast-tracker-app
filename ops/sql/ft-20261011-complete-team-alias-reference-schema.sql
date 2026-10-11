-- 2026-10-11 applied in production. Source-reference catalogue, not an extra capture pipeline.
-- Repeatable DDL, no extra cron, service or provider requests.
CREATE TABLE IF NOT EXISTS private.team_alias_reference (
 source text NOT NULL CHECK(source IN ('REEP_CC0','FLASHSCORE_TEAM_ID','FOREBET_REFERENCE')),
 external_team_id text NOT NULL,
 source_name text NOT NULL,
 source_key text NOT NULL,
 country text,
 wikidata_qid text,
 flashscore_team_id text,
 fotmob_team_id text,
 name_role text NOT NULL,
 identity_status text NOT NULL DEFAULT 'REFERENCE_ONLY'
   CHECK(identity_status IN ('REFERENCE_ONLY','LINKED_CANONICAL')),
 canonical_team_key text REFERENCES public.team_entities_v2(team_key),
 provenance text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(source,external_team_id,source_key)
);
CREATE INDEX IF NOT EXISTS team_alias_reference_name_lookup_idx
 ON private.team_alias_reference(source,source_key);
CREATE INDEX IF NOT EXISTS team_alias_reference_fs_team_id_idx
 ON private.team_alias_reference(flashscore_team_id)
 WHERE flashscore_team_id IS NOT NULL AND flashscore_team_id<>'';
CREATE INDEX IF NOT EXISTS team_alias_reference_canonical_idx
 ON private.team_alias_reference(canonical_team_key) WHERE canonical_team_key IS NOT NULL;
REVOKE ALL ON TABLE private.team_alias_reference FROM PUBLIC,anon,authenticated;
ALTER TABLE private.team_alias_reference ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE VIEW private.all_in_one_team_alias_lookup
WITH (security_invoker=true) AS
SELECT source,source_name,source_key,NULL::text external_team_id,
 team_key canonical_team_key,status lookup_status,
 'VERIFIED_MASTER'::text record_origin,NULL::text country
FROM public.team_name_master
UNION ALL
SELECT source,source_name,source_key,external_team_id,canonical_team_key,
 identity_status,'COMPLETE_SOURCE_REFERENCE'::text,country
FROM private.team_alias_reference;
REVOKE ALL ON private.all_in_one_team_alias_lookup FROM PUBLIC,anon,authenticated;

-- Reep chunks are in ../reep-full-20261011/chunk_001.json through chunk_024.json
-- Each list row [entity_id,source_name,country,wikidata_qid,flashscore_id,fotmob_id,name_role].
-- Import a chunk with parameterized JSON array via jsonb_array_elements and
-- ON CONFLICT(source,external_team_id,source_key) DO NOTHING. No canonical promotion
-- happens at import time. Do not use the public team_entities table as a staging table.
-- Single-batch replay after initial import returned 0 inserted.
