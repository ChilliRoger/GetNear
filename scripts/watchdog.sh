#!/bin/bash
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
set -a && [ -f .env ] && source .env && set +a

check_restart() {
  local name=$1 port=$2 dir=$3 cmd=$4
  if ! curl -sf "http://localhost:$port" > /dev/null 2>&1; then
    echo "[$(date)] $name DOWN on :$port — restarting..."
    fuser -k $port/tcp 2>/dev/null; sleep 2
    cd "$ROOT_DIR/$dir"
    nohup $cmd > /tmp/${name}.log 2>&1 &
    sleep 5
    if curl -sf "http://localhost:$port" > /dev/null 2>&1; then
      echo "[$(date)] $name restarted OK"
    else
      echo "[$(date)] $name FAILED to restart"
    fi
    cd "$ROOT_DIR"
  fi
}

check_restart "app" 3100 "apps/app" "npx next dev -p 3100"
check_restart "oracle" 38174 "apps/oracle" "npx tsx src/index.ts"
check_restart "agent" 38175 "apps/agent" "npx tsx src/index.ts"
