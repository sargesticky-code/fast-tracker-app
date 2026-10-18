-- Phase 40: compact only four empty allocated tables without dropping schema.
-- Live 2026-10-18 audit confirmed each count(*) = 0 and zero incoming FKs.
-- No "CASCADE", new cron, live data deletion or large table rewriting.
BEGIN;
SET LOCAL lock_timeout='750ms';
SET LOCAL statement_timeout='7000ms';
LOCK TABLE private.multisource_consensus_current,
  public.prediction_fallback_current,
  public.team_alias_evidence_v2,
  public.team_name_context_master IN ACCESS EXCLUSIVE MODE NOWAIT;
DO $guard$
DECLARE
  v_table regclass;
  v_count bigint;
  v_allocation bigint;
  v_fk_count integer;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'private.multisource_consensus_current'::regclass,
    'public.prediction_fallback_current'::regclass,
    'public.team_alias_evidence_v2'::regclass,
    'public.team_name_context_master'::regclass
  ] LOOP
    EXECUTE format('SELECT count(*) FROM ONLY %s',v_table) INTO v_count;
    IF v_count<>0 THEN
      RAISE EXCEPTION 'PHASE40_NONEMPTY_TABLE_%_ROWS_%',v_table,v_count;
    END IF;
    SELECT count(*) INTO v_fk_count FROM pg_constraint
      WHERE contype='f' AND confrelid=v_table;
    IF v_fk_count<>0 THEN
      RAISE EXCEPTION 'PHASE40_REFERENCED_TABLE_%',v_table;
    END IF;
    v_allocation:=pg_total_relation_size(v_table);
    IF v_allocation<400000 THEN
      RAISE EXCEPTION 'PHASE40_ALREADY_COMPACTED_%_BYTES_%',v_table,v_allocation;
    END IF;
  END LOOP;
  EXECUTE 'TRUNCATE TABLE ONLY private.multisource_consensus_current, ONLY public.prediction_fallback_current, ONLY public.team_alias_evidence_v2, ONLY public.team_name_context_master';
END;
$guard$;
COMMIT;
