#!/usr/bin/env bash
# Run the game: the client over HTTP and the rooms over a socket. Ctrl-C to stop.
#
# ONE server since M12. `tools/serve.mjs` was a second static server with its
# own header set, which is how `serve_smoke` came to exist — it found that the
# server a PLAYER uses sent a Content-Security-Policy that blocked the page's
# importmap while every other gate stood up its own throwaway server and never
# saw it. Two servers for one tree is two chances to be wrong about one tree.
#
# Everything else comes from the environment, which is what a systemd unit can
# set: HOST, PORT, ROOMS_DIR, KEEP_FOR_DAYS, TRUST_PROXY, ALLOWED_ORIGINS. See
# DEPLOYING.md; `server/config.js` is where the defaults and the reasons live.
set -euo pipefail
cd "$(dirname "$0")"
exec node server/index.js "${1:-8123}"
