#!/usr/bin/env bash
# GetNear oracle + agent: one-shot setup for a fresh Ubuntu 22.04/24.04 VM (Oracle Cloud Always Free or any 1 GB box).
#
# Run as the normal login user (not root), from the unpacked repo root:
#   bash deploy/vm/setup.sh
#
# It is safe to re-run. It never touches your NEAR keys: the agent's restricted key is a credential FILE that you
# copy over yourself (see docs/ORACLE_CLOUD.md).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_USER="$(id -un)"
RUN_HOME="$HOME"

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }

say "1/7 Swap (a 1 GB VM needs it for the dependency build)"
if ! swapon --show | grep -q .; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
else
  echo "swap already present"
fi

say "2/7 System packages"
sudo apt-get update -y
sudo apt-get install -y build-essential python3 curl ca-certificates git iptables-persistent

say "3/7 Node.js 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node --version

say "4/7 pnpm 12.18.0 (the version this repo pins)"
sudo npm install -g pnpm@12.18.0
PNPM_BIN="$(command -v pnpm)"
"$PNPM_BIN" --version

say "5/7 Install only what the oracle and agent need"
cd "$APP_DIR"
"$PNPM_BIN" install --frozen-lockfile --filter "@getnear/oracle..." --filter "@getnear/agent..."

say "6/7 Service configuration"
if [ ! -f /etc/getnear.env ]; then
  sed "s#__HOME__#${RUN_HOME}#g" deploy/vm/env.example | sudo tee /etc/getnear.env >/dev/null
  sudo chmod 640 /etc/getnear.env
  sudo chown root:"$RUN_USER" /etc/getnear.env
  echo "wrote /etc/getnear.env (no secrets in it; edit it if your accounts differ)"
else
  echo "/etc/getnear.env already exists: left untouched"
fi

for unit in getnear-oracle getnear-agent; do
  sed -e "s#__USER__#${RUN_USER}#g" -e "s#__DIR__#${APP_DIR}#g" -e "s#__PNPM__#${PNPM_BIN}#g" -e "s#__HOME__#${RUN_HOME}#g" \
    "deploy/vm/${unit}.service" | sudo tee "/etc/systemd/system/${unit}.service" >/dev/null
done
sudo systemctl daemon-reload

say "7/7 Firewall: open ONLY the oracle's port (38174). The agent port 38175 stays on loopback."
if ! sudo iptables -C INPUT -m state --state NEW -p tcp --dport 38174 -j ACCEPT 2>/dev/null; then
  # Oracle's Ubuntu images ship a REJECT rule near the end of INPUT; insert ours before it.
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 38174 -j ACCEPT
  sudo netfilter-persistent save
fi

sudo systemctl enable getnear-oracle >/dev/null
sudo systemctl restart getnear-oracle
sleep 3
if curl -fsS http://127.0.0.1:38174/health >/dev/null; then
  echo "oracle is up: $(curl -s http://127.0.0.1:38174/health)"
else
  echo "oracle did not answer yet: check 'journalctl -u getnear-oracle -n 50'"
fi

if command -v near >/dev/null || [ -x "${RUN_HOME}/.cargo/bin/near" ]; then
  echo "near-cli-rs found"
else
  echo
  echo "near-cli-rs is NOT installed yet (the agent needs it to sign). Install it, then continue with docs/ORACLE_CLOUD.md step 8."
fi
echo
echo "Next: copy the agent's restricted key file, then: sudo systemctl enable --now getnear-agent"
