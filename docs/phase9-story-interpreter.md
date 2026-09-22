# Phase 9 Story Interpreter

Fast Tracker keeps calculation and narration separate.

## Canonical runtime

- `app-match-analysis` — deterministic calculation / governance authority
- `app-match-story` — professional narrative / interpretation layer
- Story engine: `FT_STORY_INTERPRETER_V4`
- Cache: `public.match_interpretations`
- Source of truth: this GitHub repository; deployed Supabase source is mirrored here

## Evidence contract

The story layer can consume verified evidence from:

- HKJC 1X2 prices and no-vig probabilities
- Forebet H/D/A, predicted score and average goals
- Forebet corner direction, O/U probabilities and expected corners
- Dixon-Coles / Pi when validated and available
- Team Form model and sample quality
- Opta strength when matched
- Phase 2 injuries, lineup and manager evidence
- Phase 3 pre-match scenario and live expected-vs-actual state
- Phase 4 odds movement
- Phase 5+ governance status

The cache hash includes deep match-detail evidence. A material data update causes a new interpretation rather than silently reusing an older story.

## Fail-closed behaviour

A match can temporarily disappear from the canonical active feed while other verified rows still exist.

`app-match-analysis` therefore has a direct database fallback. It rebuilds the read-only analysis input from canonical tables such as `matches`, `hkjc_odds_current`, `forebet_predictions`, `model_predictions` and `form_predictions`.

Fallback is deliberately fail-closed:

- candidate class becomes `DATA_RISK`
- action becomes `NO_BET`
- source mode is `DB_FALLBACK_FAIL_CLOSED`
- the story may still explain the available evidence
- fallback evidence can never auto-promote a match to a production bet

This prevents dead detail pages without turning incomplete data into betting instructions.

## Governance

The story model must never invent or override:

- HKJC odds
- fair probabilities
- model probabilities
- edge
- injuries / lineups
- live scores or statistics
- deterministic betting action
- selected market / side

The deterministic result from `app-match-analysis` remains authoritative.

## AI mode

The V4 runtime is provider-agnostic and uses an OpenAI-compatible HTTP contract when AI is enabled.

Required secrets:

- `AI_INTERPRETER_ENABLED=true`
- `AI_API_KEY` or `OPENAI_API_KEY`
- `AI_MODEL`

Optional:

- `AI_BASE_URL`
- `AI_PROVIDER_NAME`

Without these secrets, V4 remains fully usable in `DETERMINISTIC_FALLBACK` mode and still produces a grounded professional story from verified evidence.

## API

`GET /functions/v1/app-match-story?id=<HKJC_EVENT_ID>&lang=zh-HK&style=professional`

Languages:
- `zh-HK`
- `en`

Styles:
- `professional`
- `concise`
- `broadcast`

## Phase 1–10 rule

Missing, unvalidated or calibration-only phases must be labelled accordingly. The interpreter is not allowed to fill a missing phase with invented information.
