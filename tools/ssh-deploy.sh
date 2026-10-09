#!/bin/bash
# tools/ssh-deploy.sh — push the runtime tree to the box and restart the unit.
#
# Ported from `../Fireline/tools/ssh-deploy.sh`, which ports multiciv's (~200
# deploys without an unnoticed outage). The reasoning behind every guard is in
# DEPLOYING.md; the principles, in the order they earned their place:
#
#   1. ALLOWLIST rsync — only what the server RUNS leaves this machine. `test/`,
#      `tools/`, `specs/`, `reports/`, `debugging/`, `.claude/` and `dev-*.md`
#      never go.
#   2. Runtime state is never touched: the rooms directory belongs to the box.
#   3. One SSH connection (ControlMaster) — one passphrase, no auth storm.
#   4. Provenance guard — this deploys the WORKING TREE, so it says what is
#      about to become public and stops unless HEAD is clean.
#   5. Deploy guard — restart, THEN sleep, is-active and curl /healthz. A
#      crash-looping unit must fail the deploy loudly, not print success.
#   6. Public verification — the loopback check proves our process; only the
#      public one proves nginx, TLS and that no neighbour vhost took the name.
#   7. Shared-box sanity BEFORE the restart, while the old process still serves.
#
# Host identity is NOT in the repo: tools/deploy.env (gitignored) sets DEPLOY,
# APP, SSH_OPTS, SERVICE and PUBLIC_URL. Template: tools/deploy.env.example.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="tools/deploy.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found — copy tools/deploy.env.example and fill it in."
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"
: "${DEPLOY:?deploy.env must set DEPLOY}" "${APP:?deploy.env must set APP}"
: "${SERVICE:=citygrid}" "${SSH_OPTS:=}" "${PUBLIC_URL:=}" "${PORT:=8133}"

SSH="ssh $SSH_OPTS"
SSH_SHOW="$SSH"
MUX_SOCK="${TMPDIR:-/tmp}/citygrid-deploy-%r@%h:%p"
SSH="$SSH -o ControlMaster=auto -o ControlPath=$MUX_SOCK -o ControlPersist=300 -o ServerAliveInterval=30 -o ServerAliveCountMax=6"
cleanup_mux() { ssh -O exit -o ControlPath="$MUX_SOCK" "$DEPLOY" 2>/dev/null || true; }
trap cleanup_mux EXIT

YES=0; [ "${1:-}" = "--yes" ] && YES=1
BRANCH=$(git rev-parse --abbrev-ref HEAD)
SHA=$(git rev-parse --short HEAD)
DIRTY=$(git status --porcelain | grep -vc '^??' || true)
echo "==> Deploying working tree: $BRANCH @ $SHA"
if [ "${DIRTY:-0}" -gt 0 ] && [ "$YES" -eq 0 ]; then
  echo "    !! $DIRTY uncommitted tracked change(s) — they WILL be published"
  read -r -p "    Continue anyway? [y/N] " REPLY
  case "$REPLY" in y|Y|yes|YES) ;; *) echo "    aborted — nothing was sent"; exit 1 ;; esac
fi

# The build hash the join handshake compares is read from client/precache.json,
# so a deploy with a stale manifest refuses every client that has the new code.
echo "==> Refreshing the precache manifest (the build hash the handshake uses)"
node tools/make_precache.mjs >/dev/null

echo "==> Ensuring $APP exists and is owned by the deploy user"
$SSH "$DEPLOY" "sudo mkdir -p $APP && sudo chown -R \$(id -un):\$(id -gn) $APP"

# Shared-box sanity while the OLD process is still serving: a neighbour's broken
# nginx becomes our outage at the next reload, and the port check has to use
# ss's own filter — `grep -w ':8133'` NEVER matches `127.0.0.1:8133`, because a
# colon preceded by a digit is not a word boundary. That bug shipped in two
# deploy scripts on this box before it was caught.
echo "==> Shared-box sanity"
$SSH "$DEPLOY" "
  if command -v nginx >/dev/null 2>&1 && ! sudo nginx -t 2>/dev/null; then
    echo '    !! nginx -t FAILS — the next reload drops EVERY site on this box'
  fi
  owner=\$(sudo ss -ltnpH \"sport = :$PORT\" 2>/dev/null | grep -oE 'users:\(\(\"[^\"]+' | head -1 | cut -d'\"' -f2)
  if [ -n \"\$owner\" ] && [ \"\$owner\" != 'node' ]; then
    echo \"    !! port $PORT is held by '\$owner', not node\"
  fi
  if sudo ss -ltnpH \"sport = :$PORT\" 2>/dev/null | grep -q '0.0.0.0'; then
    echo '    !! the port is bound on 0.0.0.0 — the raw port is public and bypasses TLS'
  fi
  df -h / | awk 'NR==2 && \$5+0 > 90 { print \"    !! disk \" \$5 \" full — a room checkpoint will fail\" }'
  free -m | awk '/^Mem:/ { if (\$7 < 200) print \"    !! only \" \$7 \"MB available — OOM risk\" }'
"

echo "==> Syncing the runtime tree to $DEPLOY:$APP (allowlist)"
rsync -av --no-owner --no-group \
    --exclude '*:Zone.Identifier' \
    --include '/client/***' \
    --include '/engine/***' \
    --include '/shared/***' \
    --include '/worker/***' \
    --include '/server/***' \
    --include '/data/***' \
    --include '/vendor/***' \
    --include '/index.html' \
    --include '/sw.js' \
    --include '/manifest.webmanifest' \
    --include '/package.json' \
    --include '/package-lock.json' \
    --include '/LICENSE' \
    --exclude '*' \
    -e "$SSH" \
    ./ "$DEPLOY:$APP/"

echo "==> Installing deps + restarting $SERVICE"
$SSH "$DEPLOY" \
    "if ! command -v npm >/dev/null 2>&1; then \
       echo 'ERROR: npm not found — Node is not installed (see DEPLOYING.md).'; exit 1; \
     fi && \
     cd $APP && (npm ci --omit=dev 2>/dev/null || npm install --omit=dev) && \
     sudo systemctl restart $SERVICE && \
     sleep 3 && \
     systemctl is-active $SERVICE && \
     curl -fsS http://127.0.0.1:$PORT/healthz >/dev/null && echo '    local /healthz OK'"

if [ -n "$PUBLIC_URL" ]; then
  echo "==> Verifying the PUBLIC endpoint ($PUBLIC_URL)"
  if ! curl -fsS --max-time 15 "$PUBLIC_URL/healthz" >/dev/null; then
    echo "ERROR: the public endpoint did not answer though the local port did —"
    echo "       that means nginx or TLS, not the game (DEPLOYING.md, 'Verify like you mean it')."
    exit 1
  fi
  echo "    public /healthz OK"
fi

echo "==> Deployed + verified serving."
echo "    Logs: $SSH_SHOW $DEPLOY 'journalctl -u $SERVICE -f'"
