# Fast Tracker — 2026-10-10 Collector next-day recovery checkpoint

## Identified failure
Railway production project 496c4795-e8f6-4f54-9ab0-406981b41669,
service `fast-tracker-dashboard` (collector), rooted at
`services/flashscore-odds-collector`. Earlier deployed application code
iterated days 0..DAYS_AHEAD, but stopped the entire discovery loop as
soon as the 360-fixture MAX_FIXTURES cap was reached. Flashscore's
2026-10-10 board contained 552 events, so no 2026-10-11 fixtures
entered its price query, regardless of DAYS_AHEAD.

Original observed finished snapshot: 360 discoveries, 184 priced
fixtures, all 2026-10-10. The strict Supabase incoming-data publisher
previously rejected snapshots due to an inappropriate total-provider
denominator and an orphaned Phase1 function invocation. Those were
repaired in SQL migrations 20261010152805, 20261010153121,
20261010153239 in the separate football-fast-tracker repo.

## Small fix shipped
[PR46](https://github.com/sargesticky-code/fast-tracker-app/pull/46)
merged as `a926b69f0ddfda770467ee991c29b326aac86d8e` and
deployed to the existing Railway service, deployment
`56dc7163-3d7c-48e2-9bdf-ae9a1696e903`.
A pure-stdlib `day_budget.py` splits the unchanged per-cycle max
of 360 provider quote requests between today's 120 and tomorrow's
240, filtering virtual teams and duplicate exact source IDs.
The source date visit count is <=2; it no longer walks the third day
when the requested Dashboard horizon is only 48 hours.
No separate collector, Supabase job, table, credentials, new API, or
additional bookmaker quote calls. Existing 15-minute internal loop
and Supabase five-minute cached-snapshot polling remain in charge.

GitHub proof run
[38064735122](https://github.com/sargesticky-code/fast-tracker-app/actions/runs/38064735122)
succeeded 6/6 pure deterministic allocation tests and syntax checks;
temporary QA workflow was subsequently deleted.

## Real deployed read-only capture proof
Railway production deploy successful at 2026-10-10T15:45 UTC.
Log lines:
- 2026-10-10 day board 552 events; selected exactly 120.
- 2026-10-11 /tomorrow/ board 363 events; selected exactly 240.
- 360 total events; 202 complete bookmaker 1X2 quotes.
- All priced source items retained unchanged provider event_id,
  source bookmaker, source captured_at and date.

Supabase cached HTTP response for this *same* Railway snapshot:
2026-10-10T15:45:59Z; HTTP 200, 360 discovered, 202 priced.
The read-only strict identity+kickoff cohort:
- 2026-10-10: 89 priced, 25 verified future.
- 2026-10-11: 113 priced, 85 verified future.
- Total: 110 strictly verified *future* price candidates,
  uniquely mapped to existing canonical fixtures. Twenty-eight
  tomorrow prices lack a safe canonical ID, and must stay rejected.

No promise about market freshness forever: underlying quoted price
is valid only when source captured_at remains within the public
fetched-at freshness gate. Do not treat aged cached snapshots as live.

## Still required in release acceptance
After the *natural* 5-minute Supabase cron #38 publication cycle:
check private.ft_flashscore_direct_request_state.last_result
and `public.bet365_current` by fixture date, current source timestamp,
`ft_fast_flashscore_summary(48)` non-null odds, then the
existing public Fast Tracker Dashboard. Do NOT rerun a duplicate scraper
or relax event ID, provider epoch or model freshness gates merely to
boost counts. If the next publication fails, compare next snapshot's
source epoch, upcoming cohort and strict 50+ / 65% quality gate;
rollback the exact collector commit only if the issue is demonstrated.
