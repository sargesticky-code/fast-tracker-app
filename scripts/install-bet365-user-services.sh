#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
USER_DIR="$HOME/.config/systemd/user"
ENV_DIR="$HOME/.config/fast-tracker"
mkdir -p "$USER_DIR" "$ENV_DIR"

install -m 0644 "$ROOT/ops/systemd/bet365-scraper.service" "$USER_DIR/bet365-scraper.service"
install -m 0644 "$ROOT/ops/systemd/bet365-collector.service" "$USER_DIR/bet365-collector.service"

if [ ! -f "$ENV_DIR/bet365.env" ]; then
  cat > "$ENV_DIR/bet365.env" <<'EOF'
SUPABASE_URL=https://hekqxhgjexzxnecwhyao.supabase.co
# Put the private service-role/secret key below on the Linux host only.
# Never commit this file.
SUPABASE_SERVICE_ROLE_KEY=
EOF
  chmod 600 "$ENV_DIR/bet365.env"
fi

systemctl --user daemon-reload
cat <<EOF
Installed user services.

Before starting:
  1. Run scripts/install-bet365-browser-host.sh
  2. Put the private Supabase service key in $ENV_DIR/bet365.env
  3. Load the upstream Chrome extension and keep Bet365 In-Play open

Then enable:
  systemctl --user enable --now bet365-scraper.service
  systemctl --user enable --now bet365-collector.service

Inspect:
  systemctl --user status bet365-scraper.service bet365-collector.service
  journalctl --user -u bet365-scraper.service -u bet365-collector.service -f
EOF
