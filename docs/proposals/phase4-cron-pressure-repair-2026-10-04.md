# Phase 4 cron-pressure repair proposal — review only

Status: **PROPOSAL ONLY — DO NOT APPLY WITHOUT SPECIFIC AUTHORIZATION**

Prepared from production evidence on 2026-10-04. This proposal intentionally does **not** change any Phase 4 function body, schema, index, provider, identity rule, value/arb formula, Edge Function, or live/lineup cron.

## Problem demonstrated in production

Current job:

- job id: `23`
- job name: `phase4-market-refresh`
- current schedule: `0,5,10,15,20,25,30,35,40,45,50,55 * * * *`
- command: `select phase4.refresh_core();`

`phase4.refresh_core()` calls, in order:

1. `phase4.refresh_hkjc_quotes()`
2. `phase4.refresh_bet365_quotes()`
3. `phase4.refresh_model_consensus()`
4. `phase4.refresh_value_opportunities()`
5. `phase4.refresh_arb_watch()`
6. `phase4.refresh_arb_opportunities()`

The functions preserve these existing contracts:

- HKJC/Bet365 HAD 1X2 quotes in `phase4.market_quotes_current`
- model consensus in `phase4.model_consensus_current`
- VALUE/WATCH/NO_EDGE decisions in `phase4.value_opportunities_current`
- near-arb watch in `phase4.arb_watch_current`
- fail-closed arbitrage opportunities/legs in `phase4.arb_opportunities_current` and `phase4.arb_legs_current`

No proposal below changes those contracts.

### Runtime evidence

Historical healthy runs of job 23 normally complete in about **0.4–1.2 seconds**.

At 2026-10-04 02:50 UTC, job 23 began `phase4.refresh_core()` and remained active until about 02:52:10 UTC, when Postgres canceled the statement for timeout inside `phase4.refresh_model_consensus()`.

The timed-out statement was the existing insert into `phase4.model_consensus_current` after the function's delete-and-rebuild step.

At 02:52 UTC, six cron jobs started in the same minute, including:

- job 37 — Phase 1 core
- job 36 — FotMob lineups
- job 14 — live layer guard
- job 4 — HTTP task
- job 28 — HTTP task
- job 8 — other scheduled task

Job 36 logged a cron start at 02:52:05 UTC but no corresponding `phase2-fotmob-lineups` v7 Edge request reached Edge.

Similar startup-timeout evidence exists for jobs 6 / 16 / 17 during database-pressure windows.

### Locking evidence

No deadlock or explicit lock-timeout was logged for the Phase 4 failure.

The failure was a **statement timeout**, and other unrelated monitoring/cron statements timed out in the same window.

A later read-only `pg_locks` snapshot showed no persistent locks on:

- `model_consensus_current`
- `market_quotes_current`
- `value_opportunities_current`
- `arb_watch_current`
- `arb_opportunities_current`
- `arb_legs_current`

Therefore the demonstrated evidence supports transient database/cron concurrency pressure, not a persistent relation-lock defect.

## Why a function rewrite is not the first fix

Current Phase 4 tables are small:

- `model_consensus_current`: about 120 KB / ~30 live rows
- `value_opportunities_current`: about 312 KB / ~30 live rows
- `market_quotes_current`: about 2.8 MB / ~2,769 live rows

The Phase 4 refresh normally finishes sub-second. Rewriting consensus/value/arbitrage SQL or adding indexes would therefore be a larger, less demonstrated intervention.

Supabase's current cron guidance recommends spacing jobs when concurrent cron work creates connection pressure.

## Proposed minimal change

Change **only job 23's schedule**. Keep the command and all function bodies unchanged.

### Before

```sql
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'phase4-market-refresh'),
  schedule := '0,5,10,15,20,25,30,35,40,45,50,55 * * * *'
);
```

### Proposed after

```sql
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'phase4-market-refresh'),
  schedule := '0,6,12,16,20,26,30,36,40,46,50,54 * * * *'
);
```

This still runs **12 times per hour**, so average Phase 4 freshness remains five minutes.

Intervals alternate between 4 and 6 minutes.

The proposed minutes are all even and intentionally avoid the nominal schedules for:

- job 6 live-score-direct: odd minutes
- job 17 live-shadow compare: odd minutes
- job 16 live-source-shadow: :03/:08/:13/:18/:23/:28/:33/:38/:43/:48/:53/:58
- job 36 lineups: :22/:52
- job 37 Phase 1 core: :07/:22/:37/:52

Observed cron-start history also shows this exact 12-minute set has the lowest aggregate competing-start count among tested even-minute 12-runs/hour schedules that avoid the live-shadow and :22/:52 windows.

## Data-contract impact

Expected impact: **timing only**.

Unchanged:

- provider quote sources and compatibility rules
- HAD 1X2 settlement key
- HKJC/Bet365 upsert keys
- DC/Pi/Forebet consensus calculation
- source-count thresholds
- VALUE/WATCH/NO_EDGE semantics
- quote freshness thresholds
- arb freshness/minimum ROI rules
- fail-closed arb behavior
- existing live and lineup producer schedules
- canonical fixture/player identity rules
- model quality rules
- public authority-first fixture delivery
- stale-price safety and unknown != zero

Possible visible effect:

- a Phase 4 calculation may occur up to 6 minutes after the previous one instead of exactly 5.
- average cadence remains 5 minutes.

## Baseline before any change

Read-only production baseline captured before proposal:

- active Phase 4 quotes: **337**
- model consensus rows: **30**
- value rows: **30**
- arb watch rows: **0**
- arb opportunity rows: **0**
- consensus/value `calculated_at`: 2026-10-04 03:30:03.792689+00

Zero arb rows are a valid fail-closed state and must not be treated as a recovery failure.

## Rollback

One SQL statement restores the exact current schedule:

```sql
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'phase4-market-refresh'),
  schedule := '0,5,10,15,20,25,30,35,40,45,50,55 * * * *'
);
```

No data rollback, migration rollback, schema rollback, or Edge rollback is required because this proposal changes only scheduling metadata.

## Natural-run acceptance criteria

Do not manually call `phase4.refresh_core()`, lineup producers, or live producers for acceptance.

After an authorized schedule change, observe natural scheduled runs only.

### Phase 4 acceptance

For at least **6 consecutive natural job-23 runs**:

- job 23 starts only on the new schedule
- no job-23 startup timeout
- no statement timeout in `refresh_model_consensus()`
- each run completes successfully
- normal target: <5 seconds
- hard acceptance ceiling: <10 seconds unless the database is demonstrably under unrelated platform maintenance

After those runs:

- `model_consensus_current` remains non-empty when source evidence exists
- `value_opportunities_current` continues recalculating
- `market_quotes_current` active quotes continue updating
- arb watch/opportunity tables remain semantically valid, including legitimate zero-row fail-closed states
- no change in formula/source-count/freshness semantics

### Live/lineup continuity acceptance

Observe natural runs after the schedule change:

- job 6 reaches `live-score-direct` v14 rather than timing out at cron startup
- job 16 reaches `live-source-shadow` v7
- job 17 completes its compare guard without startup timeout
- the next natural job 36 reaches `phase2-fotmob-lineups` v7
- `PHASE2_FOTMOB_LINEUPS` source-health `observed_at` advances naturally
- current-fixture lineup rows appear only when provider/identity evidence supports them
- no manual producer invocation is used to manufacture acceptance

### Public-flow regression checks

During the observation period:

- Phase 1 authority summary remains HTTP 200 and fast
- full feed remains HTTP 200
- current detail remains HTTP 200
- current analysis remains HTTP 200
- no fixture disappears because optional enrichment fails
- stale prices remain non-actionable
- unknown values remain unknown rather than zero

## Independent story/UI acceptance status

Already verified independently of this proposal:

- Railway public service is online, 1/1, zero crashes/recent deployment failures
- real desktop Linux/Chrome homepage request returned HTTP 200
- real Android mobile Chrome homepage requests returned HTTP 200 at about 2.5s
- app-match-detail v20 and app-match-analysis v35 have returned real HTTP 200 responses for FB6240

Not yet claimed:

- no natural app-match-story v29 request has occurred after PR27, so English article runtime acceptance remains pending
- CI/rendered desktop/mobile tests are green, but they are not a substitute for a natural story request

## Rejected larger alternatives for this first repair

Not proposed at this stage:

- rewriting `refresh_model_consensus()`
- replacing delete/rebuild with incremental upserts
- adding indexes
- changing table schemas
- changing job 6/16/17/36 schedules
- reducing Phase 4 to a 10- or 15-minute cadence
- raising compute
- manually forcing refreshes

Those should be reconsidered only if schedule staggering is authorized, naturally exercised, and still fails acceptance.

## Authorization needed to apply

Specific authorization required:

> Approve changing only the `phase4-market-refresh` cron schedule from
> `0,5,10,15,20,25,30,35,40,45,50,55 * * * *`
> to
> `0,6,12,16,20,26,30,36,40,46,50,54 * * * *`,
> with no function/schema/index changes and natural-run verification only.

Until that authorization is given, this file is review documentation only.

## Additional natural-run evidence after PR26/27

Observed after the live I/O bounding release, without any manual producer invocation:

- 2026-10-04 03:13 UTC: `live-source-shadow` v7 reached Edge and returned 503 in **16.7s**.
- 2026-10-04 03:13 UTC: `live-score-direct` v14 reached Edge and returned 503 in **41.3s**.
- 2026-10-04 03:19 UTC: `live-score-direct` v14 reached Edge and returned 503 in **41.5s**.

These are materially below the prior ~150s worker-limit failures, confirming the Edge-side I/O bounding is effective even though the database remains pressured.

Cron-level evidence then shows the remaining upstream problem:

- 03:20: job 23 `phase4-market-refresh` started and hit **job startup timeout** together with jobs 14/4/7.
- 03:21: jobs 6/13/17 hit **job startup timeout**.
- 03:22: job 36 `phase2-fotmob-lineups` started with jobs 37/8/14/4/28; all six hit **job startup timeout** before a v7 lineup Edge request was created.
- 03:23: jobs 6/17/16 hit **job startup timeout**.

This post-release evidence strengthens the schedule-level diagnosis: producer code can execute with bounded failure when Edge is reached, but crowded cron windows can prevent the request from reaching Edge at all.
