# Bet365 Browser Feed — operator runbook

This dashboard no longer treats HKJC as an active betting authority. Existing `hkjc_event_id` columns are retained as opaque canonical keys for compatibility with historical model/lineup data.

## External scraper

Use `joe-bring/bet365-scraper` as a separate local service. Do not copy its source into this repository.

The upstream service requires:
1. Python dependencies from the upstream repository.
2. Its Chrome extension loaded in Chrome.
3. Extension upload URL pointed at the local Flask service (default `http://127.0.0.1:8485/data`).
4. Bet365's in-play page kept open.
5. Football feed available from `http://127.0.0.1:8485/live?sport=1`.

The dashboard collector does not trust unknown/encoded odds. Plain fractional odds such as `2/1` are converted to decimal. Suspended or unrecognized records remain null/raw-only.

## Dashboard collector

Required private environment variables on the collector host:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (or the existing server-side `SUPABASE_SECRET_KEYS`)
- optional `BET365_BROWSER_URL` (defaults to `http://127.0.0.1:8485/live?sport=1`)

Never put a service-role/secret key into Chrome, the extension, client JavaScript, a public repository, or a public environment variable.

Run one collection:

```bash
npm run collect:bet365-browser
```

Validate parser/collector code:

```bash
npm run check:bet365-browser
npm run check:bet365-collector
```

For continuous live collection, run the collector repeatedly from the private browser host. The collector is intentionally not scheduled inside Supabase because Supabase cannot own the required persistent local Chrome session.

## Admission rules

A Bet365 live event is promoted only when:

- it is football;
- event/league/home/away identity is complete;
- one and only one canonical fixture matches exact normalized home/away identity in the live kickoff window;
- market/selection meaning is recognized;
- the market is not suspended;
- odds are decodable without guessing.

A complete HDA board requires all H/D/A selections. Only then is `bet365_current` updated and an HDA movement snapshot may be appended.

Raw current/live evidence is stored in:

- `public.bet365_browser_live_current`
- `public.bet365_browser_quote_current`
- `public.bet365_browser_quote_history`

All three are RLS-enabled and service-only.

## Production cutover completed in Supabase

- `app-phase1-feed` v70 summary: canonical fixtures + Bet365 browser/current data + browser-heartbeat health
- `app-live-feed` v14: Bet365 browser live authority with OK / OK_EMPTY / STALE / MISSING host-state separation
- `app-match-detail`: Bet365 browser live fallback
- `app-match-analysis`: Bet365 browser + `bet365_current`
- pg_cron job 4 (`hkjc-live-direct`) disabled and the Edge Function itself returns 410 Retired
- pg_cron job 7 (`hkjc-upcoming-direct`) disabled and the Edge Function itself returns 410 Retired

Historical HKJC tables and old ID-shaped schemas are retained for provenance/backward compatibility; they are not a target data source for new work.


## Identity bootstrap

The collector resolves observed Bet365 team names through the existing `team_name_master` only when a normalized source key has exactly one VERIFIED canonical team target. The fixture must still resolve uniquely in the live kickoff window. A `BET365_BROWSER` alias is learned only after both conditions pass; no new canonical team key is invented.
