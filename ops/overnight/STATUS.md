# Overnight repair status

Last updated: 2026-10-17 02:04 HKT

- Current cycle: FT-OVERNIGHT-001 complete; exact-ID canonical fallback repair is built and verified locally.
- Production remains at Railway commit `f6ac341b5e6d85ad7ad7dc9cdef4e360b7aa83a0`; no deployment or Supabase mutation occurred.
- Live counts: 135 strict Forebet forecasts; 67 one-team accepted; 14 tentative. Fresh raw discovery omitted 16 accepted and 4 tentative canonical fixture IDs.
- Work branch: `codex/overnight-001-forebet`; [PR #134](https://github.com/sargesticky-code/fast-tracker-app/pull/134) is open for review. Relevant exact-commit GitHub workflows passed.
- Scheduler: active Codex heartbeat is registered through 09:00 HKT on 2026-10-17; next scheduled cycle is 02:30 HKT. Previous daily 05:30 Fast Tracker heartbeat is paused to prevent overlap.
- Next task: FT-OVERNIGHT-002 — inspect identity-countercheck and revocation behavior for one-team accepted Forebet rows.
