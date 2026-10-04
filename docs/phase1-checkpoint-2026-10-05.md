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
