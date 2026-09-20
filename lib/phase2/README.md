# Fast Tracker Phase 2 — Human Intelligence

Phase 2 is isolated from Phase 1 betting/value logic and Phase 3 live intelligence.

## Current layer: team identity

The first layer maps an HKJC fixture to trusted external event/team IDs before any squad, player, manager, injury or lineup collection is allowed.

### Fail-closed rules

- HKJC remains the fixture/name authority supplied to this layer.
- Home and away teams must independently satisfy the name threshold.
- Home/away reversal is rejected.
- Kickoff must be within the configured tolerance (default 20 minutes).
- Near-tied candidate events are rejected as `AMBIGUOUS_CANDIDATES`.
- No squad/player crawl should run for `UNRESOLVED` teams.
- Aliases are explicit inputs keyed by external source team ID; this mapper does not self-learn aliases.

### Evidence contract

`buildTeamIdentityEvidence()` emits one row per side with:

- `hkjc_event_id`
- `side`
- `hkjc_team_name`
- `source`
- `source_event_id`
- `source_team_id`
- `source_team_name`
- `source_url`
- `fetched_at`
- `confirmed`
- `confidence`
- `evidence_type`

These rows are designed to be persisted later in an isolated Phase 2 identity/evidence table. Raw source payload/context should also be retained by the ingestion layer.

## Sofascore discovery path

For a target HKJC date only:

1. `GET /api/v1/sport/football/scheduled-events/{date}`
2. Match the HKJC fixture with `matchTeamIdentityEvent()`.
3. Only after `CONFIRMED_IDENTITY`, use `/api/v1/team/{teamId}` and `/api/v1/team/{teamId}/players` in the next Phase 2 layer.

Do not crawl global team/player databases. Respect source rate limits and cache stable IDs.
