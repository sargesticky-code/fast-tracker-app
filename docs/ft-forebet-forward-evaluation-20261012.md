# Forebet forward-only evaluation / source coverage — 2026-10-12

## Verified current baseline
- Supabase source_shadow has **1,285** Forebet 1X2 listing rows. Latest ingestion on 2026-10-11; **0** newly refreshed in the preceding two hours at 2026-10-12 06:22 UTC.
- Only **19/1285** rows have strict source mapping `match_confidence >= 0.94` and an assigned fixture. Zero mapped rows were pregame future at audit time. This is **not** evidence that the other 1266 identities are wrong; the canonical 48-hour Flashscore universe and external Forebet listings cover different match/date populations.
- The current `ft_ingest_forebet_firecrawl_batch` only accepts source 1X2, predicted score, average goals and a whitelisted set of listing URLs. It cannot produce missing Over/Under 2.5 or Corners 9.5 just by extending DB columns. No scheduled Forebet ingest exists among 8 active Supabase cron jobs. New source captures require an upstream authorized execution; do not invent them.
- Official Forebet pages confirmed distinct market listings with source fixture detail URLs, including `/en/football-tips-and-predictions-for-today/predictions-under-over-goals` and `/en/football-tips-and-predictions-for-today/corners`. They expose pair probabilities, predicted score and average figures. **No crawling job added** to this release.
- For future use of those markets, source event ID must come from an exact `forebet.com/en/football/matches/...-{eventId}` link. Never merge by club name alone; require stored Forebet mapping to a canonical `FS:` ID, fixture kickoff tolerance, pre-kickoff capture, matching market page provenance, and pair sum in 98–102. Do not mix goals and corners as if they were independent odds from a bookmaker.

## Shipped in this PR
- New **on-demand only**, private SQL function `private.ft_forebet_prospective_assessment()` (versioned migration) checks independent 180-day Forebet archive, selects earliest qualified pre-kickoff 1X2 prediction per exact `FS:` ID, verifies a Flashscore final matching kickoff and captured after kickoff, and suppresses accuracy/Brier/log-loss release until **100** complete outcomes.
- At deploy, **20** archive rows; **15** eligible unique earliest pre-match provider-ID forecast rows; **14** exact verified final results; **1** missing final. The function reports `INSUFFICIENT_PROSPECTIVE_SAMPLE` and evaluation=null; it does **not** claim 14 matches are representative.
- When sample reaches >=100, formulae are labelled multiclass Brier (sum squared on 3 outcomes, 0–2) and probability-floor 0.001 log loss. This threshold is a reporting safeguard, **not proof of predictive validity**, and evaluation still requires missingness and calibration review.
- No new table, external API call, scheduled job, source ingestion, dashboard scoring card, or permission expansion. Anonymous and authenticated execute are revoked.

## Future source enrichment interface — no unverified writes
The upstream authorized collector should pass `source_event_id`, exact `source_url`, market kind `OU25` or `CORNERS95`, `prob_under`, `prob_over`, `pick`, optional `predicted_score`, `avg`, source page URL and `captured_at`. Validate observations atomically, match the already source-verified canonical identity, and only populate missing optional fields in existing `forebet_predictions`. Preserve a distinct market capture timestamp and the original 1X2 capture timestamp in the independent archive.

**Do not deploy a second crawler just because the receiving database function can handle these fields.** The actual low-cost upstream capture execution, provider access permission, freshness evidence and a representative pre-match fixture must be available first. No automatic market coverage is claimed in this PR.

## Rollback / acceptance
- Migration already applied to Supabase; do not reapply automatically. SQL function is read-only. Revert by dropping only `private.ft_forebet_prospective_assessment()` if necessary; historical archive remains unchanged.
- Run `npm run check:raw` (if configured) / repo raw QA, build and public Playwright. Verify function output via SQL, permissions, eight cron jobs and DB size.
