"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/card";
import { explorerAccountUrl } from "@getnear/shared";
import { ExternalLink, Lock, ShieldCheck } from "lucide-react";

export default function SettingsPage() {
  const [contractId] = useState("fx-budget.chilliroger-operator.testnet");
  const [daoId] = useState("chilliroger-dao.sputnik-v2.testnet");
  const [agentId] = useState("chilliroger-agent.testnet");
  const [settlementToken, setSettlementToken] = useState("eure.chilliroger-operator.testnet");
  const [autoCapUsdc, setAutoCapUsdc] = useState(100);
  const [maxChunkUsdc, setMaxChunkUsdc] = useState(20);
  const [minIntervalSec, setMinIntervalSec] = useState(60);
  const [isPaused, setIsPaused] = useState(false);
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
    fetch("/api/near")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.contract?.limits) {
          setAutoCapUsdc(Number(d.contract.limits.auto_cap_in) / 1e6);
          setMaxChunkUsdc(Number(d.contract.limits.max_chunk_in) / 1e6);
          setMinIntervalSec(Math.round(Number(d.contract.limits.min_interval_ns) / 1e9));
        }
        if (typeof d?.contract?.isPaused === "boolean") {
          setIsPaused(d.contract.isPaused);
        }
        if (d?.contract?.settlementToken) {
          setSettlementToken(d.contract.settlementToken);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4 font-mono">
      {/* Header */}
      <div>
        <h2 className="text-base font-bold uppercase tracking-wider text-foreground">
          [ OPERATIONS &amp; SECURITY AUDIT // TESTNET ]
        </h2>
        <p className="text-[11px] text-muted">
          Verifiable on-chain parameters, restricted agent keys, and multisig governance rules on NEAR testnet.
        </p>
      </div>

      {/* 1. RPC & Network Health */}
      <Card title="NEAR TESTNET NETWORK HEALTH">
        <div className="space-y-2 pt-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted">Network ID</span>
            <span className="font-semibold text-[#00ec97]">[testnet · STRICTLY ISOLATED]</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Primary RPC</span>
            <span className="text-foreground">https://rpc.testnet.near.org</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Fallback RPC</span>
            <span className="text-foreground">https://test.rpc.fastnear.com</span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="text-muted">RPC Latency</span>
            <span className="font-semibold text-[#00ec97]">
              {rpcStatus === "checking" ? "Pinging..." : `${latencyMs}ms (${rpcStatus.toUpperCase()})`}
            </span>
          </div>
        </div>
      </Card>

      {/* 2. On-Chain Smart Contract Limits */}
      <Card title="FXBUDGET SMART CONTRACT LIMITS">
        <div className="space-y-2 pt-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted">Contract ID</span>
            <a
              href={explorerAccountUrl(contractId)}
              target="_blank"
              rel="noreferrer"
              className="text-[#38bdf8] hover:underline inline-flex items-center gap-1"
            >
              <span>{contractId}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Contract Owner</span>
            <span className="text-foreground">{daoId} (Sputnik DAO)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Auto-Cap Limit</span>
            <span className="font-semibold text-foreground">{autoCapUsdc.toFixed(2)} USDC</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Max Chunk Limit</span>
            <span className="font-semibold text-[#00ec97]">{maxChunkUsdc.toFixed(2)} USDC</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Min Chunk Interval</span>
            <span className="text-foreground">{minIntervalSec} seconds</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Settlement Token (NEP-141)</span>
            <span className="text-foreground">{settlementToken}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Max Order Horizon</span>
            <span className="text-foreground">7 days</span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="text-muted">Contract Paused</span>
            <span className={`font-semibold ${isPaused ? "text-red-400" : "text-[#00ec97]"}`}>
              {isPaused ? "YES (Paused)" : "NO (Active)"}
            </span>
          </div>
        </div>
      </Card>

      {/* 3. Agent Restricted Key Security */}
      <Card title="RESTRICTED AGENT FUNCTION-CALL KEY">
        <div className="space-y-2 pt-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted">Agent Account</span>
            <a
              href={explorerAccountUrl(agentId)}
              target="_blank"
              rel="noreferrer"
              className="text-[#38bdf8] hover:underline inline-flex items-center gap-1"
            >
              <span>{agentId}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Allowed Methods</span>
            <span className="border border-[#00ec97] bg-[#00ec97]/10 px-1.5 py-0.5 text-[#00ec97] font-bold">
              [&quot;execute_chunk&quot;]
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Key Allowance</span>
            <span className="text-foreground">0.25 NEAR (Gas Only)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Deposit Authority</span>
            <span className="text-red-400 font-bold">0 NEAR (Deposit Forbidden)</span>
          </div>
          <div className="border border-border bg-[#090a0f] p-2.5 mt-1 text-[11px] text-muted leading-relaxed">
            <div className="flex items-center gap-1.5 font-bold text-foreground mb-1">
              <Lock className="h-3.5 w-3.5 text-[#38bdf8]" />
              <span>CRYPTOGRAPHIC RESTRICTION</span>
            </div>
            The agent runner&apos;s operational FunctionCall key can call only <code className="text-[#00ec97]">execute_chunk</code> on FxBudget and cannot transfer NEAR or override limits. Supplier balance reduces solely after cross-contract <code className="text-[#00ec97]">ft_transfer</code> callback confirmation; deviation caps remain an on-chain policy check on an agent-reported value.
          </div>
        </div>
      </Card>

      {/* 4. Sputnik DAO Multisig Architecture */}
      <Card title="SPUTNIK DAO MULTISIG GOVERNANCE">
        <div className="space-y-2 pt-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted">DAO Account</span>
            <a
              href={explorerAccountUrl(daoId)}
              target="_blank"
              rel="noreferrer"
              className="text-[#38bdf8] hover:underline inline-flex items-center gap-1"
            >
              <span>{daoId}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Threshold Policy</span>
            <span className="font-semibold text-[#00ec97]">2 of 3 Council Votes ([1, 2])</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Council Members</span>
            <span className="text-foreground">3 Registered Signers</span>
          </div>
          <div className="space-y-1 pt-1 text-[10px] text-muted">
            <div>&bull; chilliroger-council1.testnet</div>
            <div>&bull; chilliroger-council2.testnet</div>
            <div>&bull; chilliroger-council3.testnet</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
