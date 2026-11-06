#!/bin/bash
# Meridian CRE Simulator — runs the CRE workflow in a loop with --broadcast
# Reads speed from Oracle API for demo mode (1x = 55s, 10x = 5s)

LOCKFILE="/tmp/meridian-cre.lock"
ORACLE_URL="${ORACLE_URL:-http://localhost:38174}"

cd "$(dirname "$0")"
source ../.env 2>/dev/null

echo "========================================"
echo "  Meridian CRE Simulator"
echo "  Oracle: $ORACLE_URL"
echo "  Press Ctrl+C to stop"
echo "========================================"

while true; do
  # Get speed from Oracle (default 1x = 55s sleep)
  SPEED=$(curl -sf "$ORACLE_URL/api/demo/speed" 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('sleep',55))" 2>/dev/null \
    || echo 55)

  echo ""
  echo "[$(date)] Running CRE tick (next sleep: ${SPEED}s)..."

  # flock: skip tick if previous is still running
  # timeout: kill if tick takes >90s
  CRE_BIN="${CRE_BIN:-$(command -v cre || echo /home/claude/bin/cre)}"
  timeout 90 flock -n "$LOCKFILE" \
    "$CRE_BIN" workflow simulate treasury --broadcast 2>&1 \
    | tee -a /tmp/cre-loop.log \
    || echo "[$(date)] Tick skipped or failed"

  echo "[$(date)] Tick complete."
  sleep "$SPEED"
done
