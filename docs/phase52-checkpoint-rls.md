# Phase 52: internal refresh checkpoint RLS
 n
## Live status (2026-10-18)

Executed using the Supabase migration API against project **Fast Tracker 2026** as
`20261018134046_phase52_secure_internal_refresh_checkpoint_rls`.
The repository migration is retained under the *same version* to avoid a different
migration identity for the already-applied operation.

Preflight verified the table's only explicit ACL was `postgres`, with schema
usage for `service_role` but no table access. `postgres` has BYPASSRLS.
`phase4.refresh_core()` runs as a security invoker owned by `postgres` and is
the inspected function that accesses the singleton checkpoint. No active cron
job explicitly referenced `phase4` when audited.

Postflight verified RLS enabled, one checkpoint row intact, zero policies,
and the Supabase migration ledger containing the phase52 version.

## Verification SQL

```sql
SELECT c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS forced,
       (SELECT count(*) FROM pg_policies
        WHERE schemaname='phase4' AND tablename='refresh_cycle_checkpoint')
         AS policies,
       (SELECT count(*) FROM phase4.refresh_cycle_checkpoint) AS rows_kept
FROM pg_class c
WHERE c.oid='phase4.refresh_cycle_checkpoint'::regclass;

SELECT rolname,
       has_table_privilege(oid,'phase4.refresh_cycle_checkpoint','SELECT') AS can_select,
       has_table_privilege(oid,'phase4.refresh_cycle_checkpoint','UPDATE') AS can_update
FROM pg_roles
WHERE rolname IN ('anon','authenticated','service_role','postgres');
```

Expected: RLS true, 0 client policies, 1 checkpoint row, client-role read/update
false, postgres true. This does **not** imply full runtime smoke-test coverage.

## Rollback (only if a real regression is established)

```sql
ALTER TABLE phase4.refresh_cycle_checkpoint DISABLE ROW LEVEL SECURITY;
```

Only use after identifying a breakage in an explicitly authorized caller. RLS
rollback reduces defense-in-depth. Do not grant broad client policies to
work around permission errors.

## Related outstanding work

Phase 51 is present in the live migration ledger as version 20261018125055
(its repository historical script is named differently). Reconcile this drift
before running any automatic migration replay on a fresh database. Do not
reactivate obsolete model publishers or apply arbitrary destructive cleanup.
