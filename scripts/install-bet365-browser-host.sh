#!/usr/bin/env bash
set -euo pipefail

UPSTREAM_URL="https://github.com/joe-bring/bet365-scraper.git"
UPSTREAM_COMMIT="2061deba22a465c66579c4c7fdf5c9ba46dfb835"
INSTALL_ROOT="${BET365_SCRAPER_HOME:-$HOME/.local/share/fast-tracker/bet365-scraper}"
VENV="$INSTALL_ROOT/.venv"

mkdir -p "$(dirname "$INSTALL_ROOT")"
if [ ! -d "$INSTALL_ROOT/.git" ]; then
  git clone --filter=blob:none "$UPSTREAM_URL" "$INSTALL_ROOT"
fi
git -C "$INSTALL_ROOT" fetch --depth=1 origin "$UPSTREAM_COMMIT"
git -C "$INSTALL_ROOT" checkout --detach "$UPSTREAM_COMMIT"

python3 -m venv "$VENV"
"$VENV/bin/python" -m pip install --upgrade pip
# Upstream README documents these runtime packages; its referenced requirements.txt
# is not present at the pinned public revision, so install only the documented set.
"$VENV/bin/pip" install flask flask-cors pytz

cat <<EOF
Bet365 scraper host installed at:
  $INSTALL_ROOT

Start API:
  $VENV/bin/python $INSTALL_ROOT/local_api.py

Chrome extension directory:
  $INSTALL_ROOT/chrome_extention

Then:
  1. Load that directory as an unpacked Chrome extension.
  2. Set its upload target to http://127.0.0.1:8485/data
  3. Keep Bet365 In-Play open.
  4. Verify http://127.0.0.1:8485/live?sport=1
  5. From fast-tracker-app, run: npm run collect:bet365-browser

No Supabase secret is written by this installer.
EOF
