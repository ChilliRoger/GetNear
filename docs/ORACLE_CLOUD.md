# Hosting the oracle and agent for free

Plan A: an **Oracle Cloud "Always Free" VM** (runs 24/7). Plan B: **your own PC + a free Cloudflare Tunnel** (live while your PC is on).
Both make the Vercel dashboard show recorded rate history, the agent's live decisions and settlements.

Only ONE port is public: the oracle's `38174`, which is read-only and also forwards the agent's read-only routes
(`/agent/status`, `/agent/fills`, `/agent/decisions`). The agent itself listens on loopback only and its control route
(`POST /trigger`) is not reachable from outside.

> Free-tier terms change. Check Oracle's Always Free page before relying on it. In 2026 the Ampere (ARM) allowance was
> reduced, so use the **AMD micro** shape below (VM.Standard.E2.1.Micro, 1 GB RAM); Oracle can also reclaim idle free VMs.

---

## Plan A: Oracle Cloud Always Free VM

### 1. Create the VM (in your browser, about 10 minutes)
1. Sign up at cloud.oracle.com (a card is required for identity verification; Always Free resources are not charged).
2. Console menu → **Compute → Instances → Create instance**.
3. Image: **Canonical Ubuntu 22.04**. Shape: **VM.Standard.E2.1.Micro** (shown as "Always Free-eligible").
4. Networking: keep the default VCN, make sure **Assign a public IPv4 address** is on.
5. SSH keys: choose **Generate a key pair** and download the private key (`ssh-key-….key`), or paste your own public key.
6. Create. When it shows **Running**, note the **public IP**.
7. Open the port: **Networking → Virtual Cloud Networks → your VCN → Security Lists → Default → Add Ingress Rule**:
   Source CIDR `0.0.0.0/0`, IP protocol TCP, destination port `38174`.

### 2. Upload the code (from your PC, in the repo folder)
The repo is private, so send a tarball instead of giving the VM GitHub access:

```bash
git archive --format=tar.gz -o getnear.tgz HEAD
scp -i /path/to/ssh-key.key getnear.tgz ubuntu@<PUBLIC_IP>:~
```

### 3. Run the setup script (on the VM)
```bash
ssh -i /path/to/ssh-key.key ubuntu@<PUBLIC_IP>
mkdir -p getnear && tar -xzf getnear.tgz -C getnear && cd getnear
bash deploy/vm/setup.sh
```
It adds swap, installs Node 22 + pnpm 12.18.0, installs only the oracle/agent dependencies, writes `/etc/getnear.env`
(no secrets), installs the two systemd services, opens port 38174, and starts the oracle.

### 4. Check the oracle from your PC
```bash
curl http://<PUBLIC_IP>:38174/health
curl http://<PUBLIC_IP>:38174/prices/current
```

### 5. Install near-cli-rs on the VM (the agent signs with it)
Follow the install instructions in the near-cli-rs README (https://github.com/near/near-cli-rs) for Linux, then check
`~/.cargo/bin/near --version` (or edit `NEAR_CLI_PATH` in `/etc/getnear.env`).

### 6. Copy the agent's restricted key FILE (never paste a key in chat)
On your PC the agent's key lives in `~/.near-credentials/testnet/chilliroger-agent.testnet/`. Copy that folder to the same
place on the VM:

```bash
scp -i /path/to/ssh-key.key -r ~/.near-credentials/testnet/chilliroger-agent.testnet \
    ubuntu@<PUBLIC_IP>:~/.near-credentials/testnet/
ssh -i /path/to/ssh-key.key ubuntu@<PUBLIC_IP> "chmod -R go-rwx ~/.near-credentials"
```
Copy only the **restricted function-call key** file (the one limited to `execute_chunk`), not any FullAccess key.

### 7. Start the agent
```bash
sudo systemctl enable --now getnear-agent
journalctl -u getnear-agent -f          # Ctrl+C to leave
curl http://<PUBLIC_IP>:38174/agent/status
```
**Stop the agent on your PC first** (`pnpm agent:start` window) so two agents never run at once.

### 8. Point the Vercel dashboard at the VM (from your PC, in the repo)
```bash
vercel env add ORACLE_URL production        # value: http://<PUBLIC_IP>:38174
vercel env add AGENT_API_URL production     # value: http://<PUBLIC_IP>:38174/agent
vercel deploy --prod --yes --scope chillirogers-projects
```
Then open https://getnear-psi.vercel.app: the rate bar, history and the agent feed are live.

### Troubleshooting
- `curl` to the public IP hangs: the Security List rule (step 1.7) or the VM firewall is missing (the setup script adds the latter).
- Oracle logs: `journalctl -u getnear-oracle -n 50`. Agent logs: `journalctl -u getnear-agent -n 50`.
- Public NEAR RPC returns `429`: normal on free endpoints; the agent retries and fails over automatically.

---

## Plan B: your PC + a free Cloudflare Tunnel

1. Keep the oracle and agent running on your PC (`pnpm --filter @getnear/oracle dev` and `pnpm agent:start`).
2. Install `cloudflared` (Cloudflare's free tunnel client) and run, with no account needed for a quick tunnel:
   ```bash
   cloudflared tunnel --url http://localhost:38174
   ```
   It prints an `https://<random>.trycloudflare.com` address. Check Cloudflare's current terms for quick tunnels.
3. Set the Vercel variables to that address (the URL changes each time you restart the tunnel):
   ```bash
   vercel env add ORACLE_URL production        # https://<random>.trycloudflare.com
   vercel env add AGENT_API_URL production     # https://<random>.trycloudflare.com/agent
   vercel deploy --prod --yes --scope chillirogers-projects
   ```
4. The dashboard shows live data only while your PC and the tunnel are running. For a stable address you need a free
   Cloudflare account and a domain (named tunnel).
