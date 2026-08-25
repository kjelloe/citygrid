#!/usr/bin/env bash
# The suite, run twice. A slice is not done until it is green both times —
# a test that passes only on a warm second run is a test that hides a bug.
#
# Read the FAIL COUNT, not the exit code (CLAUDE.md).
set -uo pipefail

cd "$(dirname "$0")"

fail=0
for run in 1 2; do
  echo "=== run $run ==="
  if ! node --test 'test/**/*.test.js'; then
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo
  echo "SUITE RED — do not proceed to the gate."
  exit 1
fi

echo
echo "SUITE GREEN (twice)."
