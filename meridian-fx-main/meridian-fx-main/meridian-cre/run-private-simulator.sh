#!/bin/bash
# Meridian Private Treasury CRE Simulator
# Runs the private treasury CRE workflow in a loop with --broadcast
# Orchestrates privacy-preserving swaps via the Unlink privacy server

LOCKFILE="/tmp/meridian-private-cre.lock"
PRIVACY_URL="${PRIVACY_URL:-http://localhost:38175}"
SLEEP_SECONDS="${SLEEP_SECONDS:-60}"

cd "$(dirname "$0")"
source ../.env 2>/dev/null

echo "========================================"
echo "  Meridian Private Treasury CRE Simulator"
echo "  Privacy server: $PRIVACY_URL"
echo "  Interval: ${SLEEP_SECONDS}s"
echo "  Press Ctrl+C to stop"
echo "========================================"

while true; do
  echo ""
  echo "[$(date)] Running private treasury CRE tick..."

  # flock: skip tick if previous is still running
  # timeout: kill if tick takes >90s
  CRE_BIN="${CRE_BIN:-$(command -v cre || echo /home/claude/bin/cre)}"
  timeout 90 flock -n "$LOCKFILE" \
    "$CRE_BIN" workflow simulate private-treasury --broadcast 2>&1 \
    | tee -a /tmp/private-cre-loop.log \
    || echo "[$(date)] Tick skipped or failed"

  echo "[$(date)] Tick complete."
  sleep "$SLEEP_SECONDS"
done
