-- Phase 39: reclaim 6.16 MiB allocated by an EMPTY private snapshot table.
-- Production preflight on 2026-10-18: count(*)=0, no incoming FKs,
-- no user triggers, no active relation locks, total bytes 6,160,384.
-- Keep the relation, indexes, RLS, FKs, owner and all model function contracts.
-- Single transaction; NOWAIT prevents competing with model activity.
-- Never apply when any row has arrived since the last preflight.
BEGIN;
SET LOCAL lock_timeout='750ms';
SET LOCAL statement_timeout='5000ms';
LOCK TABLE private.prematch_prediction_snapshot IN ACCESS EXCLUSIVE MODE NOWAIT;
DO $guard$
DECLARE
  v_count bigint;
  v_size bigint;
  v_ref_fks integer;
BEGIN
  SELECT count(*) INTO v_count FROM private.prematch_prediction_snapshot;
  IF v_count<>0 THEN
    RAISE EXCEPTION 'NOT_EMPTY_NO_TRUNCATE count=%',v_count;
  END IF;
  SELECT count(*) INTO v_ref_fks
    FROM pg_constraint
    WHERE contype='f'
      AND confrelid='private.prematch_prediction_snapshot'::regclass;
  IF v_ref_fks<>0 THEN
    RAISE EXCEPTION 'REFERENCED_TABLE_NO_TRUNCATE incoming_fk=%',v_ref_fks;
  END IF;
  v_size:=pg_total_relation_size('private.prematch_prediction_snapshot'::regclass);
  IF v_size<4194304 THEN
    RAISE EXCEPTION 'EMPTY_TABLE_ALREADY_RECLAIMED size=%',v_size;
  END IF;
  -- TRUNCATE is transactional and releases relation/index allocation.
  -- The locked table has exactly zero rows; no match or forecast data is deleted.
  EXECUTE 'TRUNCATE TABLE ONLY private.prematch_prediction_snapshot';
END;
$guard$;
COMMIT;
-- No VACUUM FULL, no CASCADE, no table drop, no other objects touched.
