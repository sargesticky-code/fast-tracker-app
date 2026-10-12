# FT security: internal Edge collector cron authentication — 2026-10-12

## Threat and approved scope
The three internal data collectors `phase15-flashscore-scout`, `phase15-source-scout` (FotMob) and `phase2-fotmob-lineups` previously had `verify_jwt=false` and did not perform explicit request authentication. Thus anyone with their public Edge URLs could initiate bounded but expensive upstream fetches and privileged internal writes; successful cron records alone do not mitigate unauthorized triggering.

## Minimal change
- Preserve the current job #32 timing, all 8 active jobs, the existing source/lineup enrichment logic, and public unauthenticated **read-only** dashboards.
- Reuse the **already existing** `fast_tracker_cron_secret` held in Supabase Vault. Never put its *value* in GitHub, migration literals, code or logs. Existing key length was verified at least 32 characters without returning it.
- Job #32 adds the secret from Vault to the `x-ft-cron-key` HTTP header inside each of its three `pg_net` GETs. No token is placed in a URL/query parameter. A guarded migration refuses unexpected job name, cadence, number of calls, missing secret or previous partial cutover.
- Each of the three collectors rejects requests with a missing/incorrect header before any source query or upstream fetch. The received key is checked by a narrow service-role-only `public.ft_internal_cron_key_matches(text)` RPC using a digest comparison to the secret inside Vault; only a boolean is returned. RPC EXECUTE revoked from PUBLIC/anon/authenticated. `SECURITY DEFINER` is limited to this narrow comparison, with pinned search path and no table writes.
- Edge functions keep `verify_jwt=false` **deliberately** because existing pg_net calls authenticate through the custom Vault header rather than JWT. Do **not** treat `verify_jwt=false` alone as a vulnerability after handler-side checks.
- Existing `Forebet` source remains untouched; `forebet-firecrawl-collector` already separately requires exact service-key bearer auth. Other old/decommissioned functions are out of scope.

## Release
1. GitHub PR CI must pass static contract/build/Playwright.
2. Apply guarded migration first, so the existing old functions harmlessly ignore newly-added headers; confirm new function rejects test key, accepts the already-held Vault key without revealing it, anon EXECUTE=false, active jobs=8, job32 includes 3 header expressions.
3. Redeploy **exact live source** for Flashscore scout, and branch source for both FotMob functions, with one authentication guard each. Production response shape, source persistence and latest versions must be checked. The archived live Flashscore scout source is tracked in the PR for drift control.
4. Invoke one unauthenticated GET on each endpoint; assert HTTP 401 and no source-health writes. Invoke authorized requests solely from SQL using Vault-backed request headers; verify HTTP 200 and normal health updates. Check natural job32 cycle and relevant data stays fresh.
5. If any callback fails authorization, **first** restore the original job32 command (remove only the 3 `headers:=` expressions), **then** restore previous Edge function versions, or redeploy verified historical code. Do not rotate Vault key or delete tables to roll back.

## Caveat
This addresses three identified, actively scheduled ingestion endpoints. It does not claim every legacy/optional Edge function is safe, nor does it eliminate upstream provider terms/availability risks. Continue reviewing less-used endpoints separately, anchored to actual invocation logs.
