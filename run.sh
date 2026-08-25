#!/usr/bin/env bash
# Serve the client with no build step. Ctrl-C to stop.
set -euo pipefail
cd "$(dirname "$0")"
exec node tools/serve.mjs "${1:-8123}"
