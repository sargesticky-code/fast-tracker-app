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
