# 2026-10-13 Fast Tracker: hide completed fixtures, preserve prospective accuracy evidence

## Approval and scope
Owner approved removing concluded matches from the primary dashboard while retaining compact verified historical results and frozen pre-kickoff forecasts for future accuracy checks. This patch targets the existing `release/ft-advisors-fotmob-20261011` frontend. It does not modify Supabase, cron, providers, detail routes, historical records, odds capture, or production settings.

## Source-backed diagnosis
- Before the patch, `components/homepage-client.js` rendered the entire raw `snapshot.discovered` list, and `lib/flashscore-raw-feed.js` deliberately preserved all discovered rows without status filtering.
- Supabase `public.matches` had 332 `PREEVENT` rows including records with already-passed kickoff; do not treat its status alone as a reliable finish confirmation.
- Verified data already exists: `private.ft_verified_flashscore_results` (2,768 rows when inspected) and `private.ft_native_prospective_frozen` (five immutable prospective snapshots). PR #80 and #81 previously merged a compact archive and an English Championship-only prospective pilot. Do not rebuild them.
- Some raw fixture time text has ambiguous/unknown timezone or nonstandard suffixes (for example `13:30FRO`); do not interpret its clock value as UTC or invent a terminal result.

## Change
- Introduce a display-only `showFixtureOnDashboard` gate. Hide explicit terminal/inactive statuses (`FT`, `FINISHED`, `AET`, `PEN`, cancellation/abandonment etc.) immediately when actually supplied by the provider/verified summary.
- If verified absolute kickoff exists, retain up to five hours beyond kickoff to avoid hiding live/extra-time games due to a stale upstream `PREEVENT` status. This is a conservative fallback **not a verified full-time detector**.
- When neither status nor timezone-safe kickoff exists, exclude source calendar days older than yesterday UTC; do not infer sourceTime timezone.
- Apply the filter to homepage listing, dates, competitions, match counts, and search only. The raw event remains retrievable on its detail route and from preserved private archives.
- Pass through verified exact-provider-ID kickoff and explicit status; scores alone do not imply a terminal match.
- Update Playwright baselines to future-relative match dates, add a terminal-status/homepage-vs-detail regression, add deterministic lifecycle checks to `check:raw`.

## Verification and rollout gate
- The GitHub PR CI must pass `npm run build` (including `check:raw` and native model checks) and desktop/mobile Playwright. Treat mocks as mocks; inspect actual production snapshot and rendered pages only after preview/deploy.
- Check a known finished FS event, a live 90+ minute match, a delayed match without a verified kickoff, and the cross-UTC-midnight case. It is impossible to guarantee removal the *minute* of full-time unless a trustworthy terminal status reaches the current feed; if immediate removal is required upstream must emit that source-backed status.
- Do not merge/deploy automatically or change any Supabase migrations/cron on this patch. Rollback = revert this frontend PR/commit.
- Supabase tables listing also raised a separate RLS warning for three older public tables (`phase1_identity_deferred_queue`, `phase1_h2h_provider_event_map`, `phase1_h2h_provider_meetings`); review grants and RLS policies separately before any schema mutation.
