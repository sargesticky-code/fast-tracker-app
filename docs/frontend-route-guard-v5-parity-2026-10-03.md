# Frontend Route Guard v5 Parity Review — 2026-10-03

## Purpose

Persist the exact already-deployed `frontend-route-guard` v5 source in Git without changing production behavior.

## Source identities

- Repository baseline: `main` at `6c826bad04e7f31bb61a8e0a2816124dc4129872`.
- Previous repository file blob: `f651fb5cb6ff3d255f4ffb225e45bc3c695aed37`.
- Deployed Edge Function: `frontend-route-guard` v5.
- Deployed platform digest: `108c3b70282d48359a57f7815fe5b530a59877903e37b388f67837666f87aee4`.
- Exact deployed source persisted as Git blob: `98625ce90965c4d08c4c1f44a7b82b387bd41d0d`.
- Source-sync commit: `cd92c5c2ada3138ecac926aab80126d5711a382f`.
- Captured pre-v5 production identity: v4 digest `69a5048eeb6b8c4c59f7b740b4768c565890ab40334a788c4f0d15c1ca8297b6`.

## Why drift existed

v5 was deployed directly during the already-authorized bounded production recovery because the active public host had moved to Cloudflare static/query routing while the guard still enforced Railway-style route behavior. The production recovery was interrupted before the exact deployed v5 bytes were persisted back to Git. This PR closes that source-control drift only.

## Exact behavioral delta from repository v4

1. Health-page acceptance includes `Data Health`, `系統狀態`, or `FAST TRACKER 2026 · 後台`.
2. Representative match probes use `/details/?id=<event>`.
3. Supported query route `/match/?id=<event>` remains checked.
4. Static `/match/<event>` probes are removed.
5. The hard-404 requirement for an arbitrary missing path is removed because Cloudflare static/SPA fallback may return the app shell.
6. Legacy-match marker validation tied to the removed route is removed.
7. Healthy-note wording now says representative detail/query/health routes were validated.
8. Guard telemetry version advances from `CONTENT_AWARE_V3` to `CONTENT_AWARE_V4_STATIC` in both success and exception payloads.

No feed, recommendation, model, identity, bookmaker, price, freshness or edge logic changes are present in this diff.

## Rollback identity

This source-sync review does not alter production. If the repository sync were rejected, the branch can simply be closed and production remains on deployed v5. If v5 itself ever required a runtime rollback in a separately authorized action, the captured prior runtime identity is v4 digest `69a5048eeb6b8c4c59f7b740b4768c565890ab40334a788c4f0d15c1ca8297b6` and the prior repository source is blob `f651fb5cb6ff3d255f4ffb225e45bc3c695aed37`.

## Open acceptance dependencies

- Homepage summary-mode latency is improved in a small sample but not fully characterized.
- Full `app-phase1-feed` enrichment retains multi-second tail latency.
- Real desktop/mobile product acceptance remains open beyond current browser and deterministic CI evidence.
- Ultimate football-intelligence acceptance remains open: provider completeness, canonical identity gaps, real multi-bookmaker overlap, market-specific evidence and article/source traceability.
