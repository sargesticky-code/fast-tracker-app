# Phase 1 continuation — 5 October 2026

Baseline main: `60dcd75231c5620491dce4a1879ba3de00f3661b`.
Review branch: `fix/phase1-missing-probabilities`.

Inspected AGENTS, redesign brief/checklist/handover, market deployment review,
source, open PRs, production tables and real Phase 1 endpoints. This conversation
owns Phase 1; persistent chat dispatch belongs to the dispatcher.

The shared H/D/A gate rejects null, blank, boolean, nonnumeric and out-of-range
values before conversion. Genuine zero remains valid. Preferred-model selection
skips incomplete models in the existing order, preserving valid fallback models.
The homepage now shares the value calculation's probability gate. Missing average
goals remain unknown. Fixtures without models remain visible.

At 2026-10-04 23:28–23:29 UTC, summary/full 48h endpoints returned HTTP 200 with
34 fixtures. Sources were `hkjc-official-direct` and `supabase-canonical-live`.
Full data had 26 modelled fixtures, eight unknown, no incomplete populated H/D/A
objects. Revised calculation on all 34 preserved those counts, with zero invalid
normalized distributions. Partial-model regression fixtures are deterministic,
not claims about current real rows.

All seven local contract/safety checks and static export build passed. Chromium
download returned invalid/truncated ZIPs, so local rendered tests/screenshots
remain unverified. New desktop/mobile regressions are included in existing CI.
No deployment, migration, Edge release or merge occurred.

Phase 0 dependency: production still uses HKJC and Bet365 current/event-map tables
have zero rows. Canonical quote migration remains reviewed/unapplied. Consume the
shared contract when Phase 0 supplies real matched observations. Do not relabel
HKJC as international coverage or invent bookmaker names.

Next bounded gap: homepage silently slices filtered rows to 30; default 24h feed
cannot fully cover tomorrow/+2 days. Verify endpoint window semantics and repair
complete fixture navigation with responsive tests. Preserve identity and freshness.

Inventory flagged RLS disabled on `phase1_identity_deferred_queue`,
`phase1_h2h_provider_event_map`, `phase1_h2h_provider_meetings`. Separate policy
review remains necessary; no access changes applied.

## CI acceptance

Executable head: `af24bd4e4d002e2a2a043f1607a391ea15b02cd4`.
PR: https://github.com/sargesticky-code/fast-tracker-app/pull/42 (draft).
CI run `37244231413` succeeded, including the new desktop/mobile regressions.
Artifact `11318033739`, `dashboard-redesign-4c0deef3ebeaabdacf0d0d32c2287e8839c846e0`.
Both 1440px and 390px regression screenshots inspected: fallback 50/30/20
visible, unknown row retained without a fabricated probability/pick/edge or
null average rendered as zero, no page overflow. These are mocked screenshots.
Real summary/full snapshots had the same 34 canonical IDs, team pairs and actual
kickoff instants (timezone representations differ). No deployed change claimed.

## Iteration 2 — complete fixture navigation

Continue in the same draft PR42; previous executable source/CI acceptance remains
recorded above. No prior change was merged or deployed.

Implemented: default homepage/server read window uses the existing 48h endpoint;
filtered rows are no longer silently truncated to 30. Today/Tomorrow/+2 days use
a runtime clock and Hong Kong dates rather than static build time or a calendar
selection. Calendar selection is a separate date filter; Today always resets the
view to actual today. Upcoming date/weekend/value filters exclude live fixtures;
Live and All retain them. Empty filters no longer promote unrelated fixtures in
the right rail. Dates reaching/exceeding the supplied feed-window end show partial
coverage instead of implying there are no later fixtures. Unknown window metadata
does not become a zero-hour window. Configured feed URL overrides remain intact.

Read-only summary at 2026-10-04 23:41:12 UTC: HTTP 200, 48h, 34 unique fixtures,
three live; Hong Kong dates Oct5=14, Oct6=19, Oct7=1. Provider source remains
`hkjc-official-direct`. No provider/identity/ingestion/schedule/database changes.

Seven local checks and build passed. New desktop/mobile cases use a Los Angeles
browser timezone with a fixed Hong Kong boundary date: 35 upcoming rows survive,
live is separated, tomorrow/+2 and calendar reset work, search reaches row 35,
All contains all 38 fixtures, partial coverage is visible. CI/screenshots pending.
Full +2-day coverage requires a wider actual provider/read window; current API
caps 48h. This change labels the limit and does not fabricate later fixtures.
