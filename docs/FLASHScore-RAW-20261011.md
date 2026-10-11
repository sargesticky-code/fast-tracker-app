# Flashscore raw dashboard cutover — 2026-10-11

## Public behavior
- The dashboard reads one snapshot from the Flashscore collector and presents the source payload as received.
- Dates and competitions are drawn from returned fixtures. Unknown source values remain empty; the UI does not infer times, scores, prices, goals or corner counts.
- Match details retain the original fixture identity and raw quote fields.
- The public client does not request models or auxiliary data services.

## Collector safeguards
- Odds collection uses at most two workers and a bounded phase deadline.
- Browser subprocesses have a watchdog; non-data media assets are blocked.
- The Docker image contains its worker and resource modules. The snapshot endpoint is read-only.

## Production cleanup
- Removed retired provider-specific archives, dependent views, source health rows and collection jobs.
- Kept shared canonical fixture data and native Flashscore collection services.
- Updated canonical database naming without changing fixture identity, foreign keys or indexes.
- Applied schema history remains in `supabase/migrations` so an initialized project can be rebuilt consistently.
- Four retired cloud endpoints remain to be physically deleted; the connected Supabase browser/CLI account currently has no management session available to this task.

## Verification
- Production build succeeds.
- Seven offline collector tests and three mocked browser flows pass.
- These checks do not claim live production response acceptance.
