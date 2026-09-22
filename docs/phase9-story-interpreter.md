# Phase 9 Story Interpreter

Fast Tracker keeps calculation and narration separate.

## Runtime

- Supabase Edge Function: `app-match-story`
- Deterministic source: `app-match-analysis`
- AI framework: `vercel/ai@7.0.109`
- Provider adapter: `@ai-sdk/openai-compatible@3.0.53`
- Schema validation: `zod@3.25.76`
- Cache: `public.match_interpretations`

## Governance

The language model is an interpretation layer only. It must not invent or override:

- HKJC odds
- fair probabilities
- model probabilities
- edge
- injuries / lineups
- live scores or statistics
- deterministic betting action
- selected market / side

If AI is disabled or unavailable, the function returns a deterministic story built from `app-match-analysis` so the detail page stays usable.

## Environment

AI is opt-in. Configure these Supabase Edge Function secrets before enabling it:

- `AI_INTERPRETER_ENABLED=true`
- `AI_API_KEY` (or `OPENAI_API_KEY`)
- `AI_MODEL`
- optional `AI_BASE_URL`
- optional `AI_PROVIDER_NAME`

The provider path is OpenAI-compatible, so a compatible hosted provider can be swapped without changing the dashboard contract.

## API

`GET /functions/v1/app-match-story?id=<HKJC_EVENT_ID>&lang=zh-HK&style=professional`

Supported language:
- `zh-HK`
- `en`

Supported style:
- `professional`
- `concise`
- `broadcast`

## Phase 1-10 rule

The story engine reads `phaseCoverage` from the deterministic analysis. Missing or unvalidated phases must be described as missing / collecting / pending rather than hallucinated into the story.
