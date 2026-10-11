-- Production migration 20261009142753 (already applied on 2026-10-09).
-- Service-only read adapters. Do not add private to PostgREST exposed schemas.
-- PostgreSQL 17 security_invoker keeps underlying owner privilege escalation out.

create view public.prediction_evidence_feed_current
with (security_invoker = true) as
select * from private.prediction_evidence_feed_current;

create view public.multisource_consensus_feed_current
with (security_invoker = true) as
select * from private.multisource_consensus_feed_current;

revoke all on public.prediction_evidence_feed_current from public, anon, authenticated;
revoke all on public.multisource_consensus_feed_current from public, anon, authenticated;
grant select on public.prediction_evidence_feed_current to service_role;
grant select on public.multisource_consensus_feed_current to service_role;
