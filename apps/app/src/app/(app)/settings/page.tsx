"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/card";
import { explorerAccountUrl } from "@getnear/shared";
import { ExternalLink, Lock } from "lucide-react";

export default function SettingsPage() {
  const [contractId] = useState("fx-budget.chilliroger-operator.testnet");
  const [daoId] = useState("chilliroger-dao.sputnik-v2.testnet");
  const [agentId] = useState("chilliroger-agent.testnet");
  const [rpcStatus, setRpcStatus] = useState<"checking" | "online" | "degraded">("checking");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  useEffect(() => {
    const checkRpc = async () => {
      const start = Date.now();
      try {
        const res = await fetch("https://rpc.testnet.near.org/status");
        if (res.ok) {
          setLatencyMs(Date.now() - start);
          setRpcStatus("online");
        } else {
          setRpcStatus("degraded");
        }
      } catch {
        setRpcStatus("degraded");
      }
    };
    checkRpc();
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Operations & Security Audit</h2>
        <p className="text-xs text-muted">
          Verifiable on-chain parameters, restricted agent keys, and multisig governance rules on NEAR testnet.
        </p>
      </div>

      {/* 1. RPC & Network Health */}
      <Card title="NEAR Testnet Network Health">
        <div className="space-y-2 pt-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted">Network ID</span>
            <span className="font-mono font-medium text-foreground">testnet (Strictly Isolated)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Primary RPC</span>
            <span className="font-mono text-zinc-300">https://rpc.testnet.near.org</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Fallback RPC</span>
            <span className="font-mono text-zinc-300">https://test.rpc.fastnear.com</span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="text-muted">RPC Latency</span>
            <span className="font-mono font-medium text-green-400">
              {rpcStatus === "checking" ? "Pinging..." : `${latencyMs}ms (${rpcStatus})`}
            </span>
          </div>
        </div>
      </Card>

      {/* 2. On-Chain Smart Contract Limits */}
      <Card title="FxBudget Smart Contract Limits">
        <div className="space-y-2 pt-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted">Contract ID</span>
            <a
              href={explorerAccountUrl(contractId)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-accent-blue hover:underline inline-flex items-center gap-1"
            >
              <span>{contractId}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Contract Owner</span>
            <span className="font-mono text-foreground">{daoId} (Sputnik DAO)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Auto-Cap Limit</span>
            <span className="font-mono font-semibold text-foreground">100.00 USDC</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Max Chunk Limit</span>
            <span className="font-mono font-semibold text-foreground">20.00 USDC</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Min Chunk Interval</span>
            <span className="font-mono text-foreground">60 seconds</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Max Order Horizon</span>
            <span className="font-mono text-foreground">7 days</span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="text-muted">Contract Paused</span>
            <span className="font-mono font-medium text-green-400">NO (Active)</span>
          </div>
        </div>
      </Card>

      {/* 3. Agent Restricted Key Security */}
      <Card title="Restricted Agent Function-Call Key">
        <div className="space-y-2 pt-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted">Agent Account</span>
            <a
              href={explorerAccountUrl(agentId)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-accent-blue hover:underline inline-flex items-center gap-1"
            >
              <span>{agentId}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Allowed Methods</span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-green-400 font-bold">
              [&quot;execute_chunk&quot;]
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Key Allowance</span>
            <span className="font-mono text-foreground">0.25 NEAR (Gas Only)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Deposit Authority</span>
            <span className="font-mono text-red-400 font-bold">0 NEAR (Deposit Forbidden)</span>
          </div>
          <div className="rounded-lg bg-surface p-2 mt-1 border border-border text-[11px] text-zinc-300">
            <div className="flex items-center gap-1.5 font-medium text-foreground mb-0.5">
              <Lock className="h-3.5 w-3.5 text-accent-blue" />
              <span>Cryptographic Constraint</span>
            </div>
            The agent runner cannot transfer NEAR, drain funds, or change contract state. Its function-call access key
            is hard-restricted at the NEAR protocol level.
          </div>
        </div>
      </Card>

      {/* 4. Sputnik DAO Multisig Architecture */}
      <Card title="Sputnik DAO Multisig Governance">
        <div className="space-y-2 pt-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted">DAO Account</span>
            <a
              href={explorerAccountUrl(daoId)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-accent-blue hover:underline inline-flex items-center gap-1"
            >
              <span>{daoId}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Threshold Policy</span>
            <span className="font-mono font-semibold text-accent-blue">2 of 3 Council Votes ([1, 2])</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Council Members</span>
            <span className="font-mono text-foreground">3 Registered Signers</span>
          </div>
          <div className="space-y-1 pt-1 font-mono text-[10px] text-zinc-400">
            <div>&bull; chilliroger-council1.testnet</div>
            <div>&bull; chilliroger-council2.testnet</div>
            <div>&bull; chilliroger-council3.testnet</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
