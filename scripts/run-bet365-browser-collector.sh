#!/usr/bin/env bash
set -euo pipefail
INTERVAL="${BET365_COLLECT_INTERVAL_SECONDS:-15}"
if ! [[ "$INTERVAL" =~ ^[0-9]+$ ]] || [ "$INTERVAL" -lt 5 ]; then
  echo "BET365_COLLECT_INTERVAL_SECONDS must be an integer >= 5" >&2
  exit 2
fi
while true; do
  if ! npm run --silent collect:bet365-browser; then
    printf '%s collector failed; retaining last good Supabase rows\n' "$(date -Is)" >&2
  fi
  sleep "$INTERVAL"
done
