"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/card";
import { LiveQuoteCard } from "@/components/live-quote-card";
import { TokenBalanceCard } from "@/components/token-balance-card";
import { useToast } from "@/components/toast-provider";
import { useNearWallet } from "@/lib/near-wallet";
import { explorerAccountUrl } from "@getnear/shared";
import {
  Shield,
  ExternalLink,
  Play,
  RefreshCw,
  Vote,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Activity,
} from "lucide-react";

interface ContractOrder {
  id: number;
  requester: string;
  recipient?: string;
  invoice_ref?: string | null;
  pair_label: string;
  total_in: string;
  executed_in: string;
  pending_in?: string;
  target_out?: string;
  settled_out?: string;
  pending_out?: string;
  max_chunk_in: string;
  deadline_ns: number;
  max_dev_bps: number;
  status: "Pending" | "Active" | "Completed" | "Expired" | "Cancelled";
  last_chunk_ns: number;
  chunks_count: number;
}

interface ContractLimits {
  auto_cap_in: string;
  max_chunk_in: string;
  min_interval_ns: number;
  max_horizon_ns: number;
}

interface DaoProposal {
  id: number;
  proposer: string;
  description: string;
  kind: Record<string, unknown>;
  status: "InProgress" | "Approved" | "Rejected" | "Removed" | "Expired" | "Moved";
  votes: Record<string, "Approve" | "Reject" | "Remove">;
  submission_time: string;
}

interface AgentFill {
  id: number;
  order_id: number;
  chunk_index: number;
  idempotency_key?: string | null;
  amount_in: string;
  settlement_out?: string | null;
  simulated_out: string;
  recipient?: string | null;
  quote_ref: string;
  deviation_bps: number;
  tx_hash: string | null;
  explorer_url: string | null;
  ft_transfer_tx_hash?: string | null;
  ft_transfer_url?: string | null;
  settlement_status?: string | null;
  failure_reason?: string | null;
  is_simulated: boolean;
  timestamp: number;
}

interface AgentDecision {
  id: number;
  order_id: number;
  timestamp: number;
  score: number;
  decision: string;
  reason: string;
  chunk_size: string;
  deviation_bps?: number;
}

export default function DashboardPage() {
  const { accountId, connect, availableAccounts, signAndSendTransaction } = useNearWallet();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [triggeringAgent, setTriggeringAgent] = useState(false);
  const [votingProposalId, setVotingProposalId] = useState<number | null>(null);
  const [submittingProposalForOrder, setSubmittingProposalForOrder] = useState<number | null>(null);

  // NEAR state
  const [orders, setOrders] = useState<ContractOrder[]>([]);
  const [proposals, setProposals] = useState<DaoProposal[]>([]);
  const [fills, setFills] = useState<AgentFill[]>([]);
  const [decisions, setDecisions] = useState<AgentDecision[]>([]);
  const [contractId, setContractId] = useState("fx-budget.chilliroger-operator.testnet");
  const [daoId, setDaoId] = useState("chilliroger-dao.sputnik-v2.testnet");
  const [tokens, setTokens] = useState({
    usdcId: "usdc.chilliroger-operator.testnet",
    eureId: "eure.chilliroger-operator.testnet",
    userUsdc: 0,
    userEure: 0,
    vaultEure: 0,
  });
  const [limits, setLimits] = useState<ContractLimits>({
    auto_cap_in: "100000000",
    max_chunk_in: "20000000",
    min_interval_ns: 60000000000,
    max_horizon_ns: 604800000000000,
  });

  // Order intake & supplier invoice inputs
  const [orderAmount, setOrderAmount] = useState("50");
  const [maxChunk, setMaxChunk] = useState("20");
  const [maxDevBps, setMaxDevBps] = useState("120");
  const [deadlineHours, setDeadlineHours] = useState("4");
  const [recipientAccount, setRecipientAccount] = useState("");
  const [targetEure, setTargetEure] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");

  const autoCapUsdc = Number(limits.auto_cap_in || "100000000") / 1e6;
  const maxChunkLimitUsdc = Number(limits.max_chunk_in || "20000000") / 1e6;
  const numAmount = parseFloat(orderAmount) || 0;
  const isAboveCap = numAmount > autoCapUsdc;

  const loadData = useCallback(async () => {
    try {
      const url = accountId ? `/api/near?account=${encodeURIComponent(accountId)}` : "/api/near";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.tokens) {
          setTokens(data.tokens);
        }
        if (data.contract?.orders) {
          setOrders(data.contract.orders);
        }
        if (data.contract?.limits) {
          setLimits(data.contract.limits);
        }
        if (data.contract?.id) {
          setContractId(data.contract.id);
        }
        if (data.dao?.id) {
          setDaoId(data.dao.id);
        }
        if (data.dao?.proposals) {
          setProposals(data.dao.proposals);
        }
        if (data.agent?.fills) {
          setFills(data.agent.fills);
        }
        if (data.agent?.decisions) {
          setDecisions(data.agent.decisions);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch NEAR state:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accountId]);

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 12000);
    return () => clearInterval(timer);
  }, [loadData]);

  // Handle Order Creation
  const handleCreateOrder = async () => {
    if (!accountId) {
      showToast("Please connect your testnet wallet first", "error");
      return;
    }
    const amtNum = parseFloat(orderAmount);
    if (!amtNum || amtNum <= 0) {
      showToast("Please enter a valid amount", "error");
      return;
    }

    setSubmittingOrder(true);
    try {
      const totalIn = BigInt(Math.round(amtNum * 1e6)).toString();
      const chunkIn = BigInt(Math.round(parseFloat(maxChunk || "20") * 1e6)).toString();
      const devBps = parseInt(maxDevBps || "120", 10);
      const hours = parseFloat(deadlineHours || "4");
      const deadlineNs = Date.now() * 1_000_000 + Math.round(hours * 3600 * 1_000_000_000);
      const trimmedRecipient = recipientAccount.trim();
      const targetEureNum = parseFloat(targetEure);
      const targetOutAtomic =
        targetEureNum > 0 ? BigInt(Math.round(targetEureNum * 1e6)).toString() : undefined;
      const trimmedInvoiceRef = invoiceRef.trim();

      const res = await signAndSendTransaction({
        receiverId: contractId,
        methodName: "create_order",
        args: {
          pair_label: "USDC/EURe",
          total_in: totalIn,
          max_chunk_in: chunkIn,
          deadline_ns: deadlineNs,
          max_dev_bps: devBps,
          ...(trimmedRecipient ? { recipient: trimmedRecipient } : {}),
          ...(targetOutAtomic ? { target_out: targetOutAtomic } : {}),
          ...(trimmedInvoiceRef ? { invoice_ref: trimmedInvoiceRef } : {}),
        },
      });

      const label = amtNum <= autoCapUsdc ? "Active (Within Auto-Cap)" : "Pending (Needs Sputnik DAO Approval)";
      showToast(`Order created successfully: ${amtNum} USDC [${label}]`, {
        type: "success",
        explorerUrl: res.explorerUrl,
      });

      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Order creation failed: ${msg}`, "error");
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Handle Sputnik DAO Proposal Creation for Pending Order
  const handleSubmitProposalForOrder = async (orderId: number, orderTotal: number, pairLabel: string) => {
    setSubmittingProposalForOrder(orderId);
    try {
      const approveArgsBase64 = btoa(JSON.stringify({ id: orderId }));
      const pairTarget = pairLabel.includes("/") ? pairLabel.split("/")[1] : "EURe";
      const res = await signAndSendTransaction({
        receiverId: daoId,
        methodName: "add_proposal",
        args: {
          proposal: {
            description: `Approve Treasury FX Order #${orderId} (${orderTotal.toFixed(2)} USDC -> ${pairTarget})`,
            kind: {
              FunctionCall: {
                receiver_id: contractId,
                actions: [
                  {
                    method_name: "approve_order",
                    args: approveArgsBase64,
                    deposit: "0",
                    gas: "30000000000000",
                  },
                ],
              },
            },
          },
        },
        depositNear: "0.1 NEAR",
        gasUnits: "100.0 Tgas",
      });

      showToast(`Sputnik DAO Proposal created for Order #${orderId}`, {
        type: "success",
        explorerUrl: res.explorerUrl,
      });

      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Failed to create proposal: ${msg}`, "error");
    } finally {
      setSubmittingProposalForOrder(null);
    }
  };

  // Handle Sputnik DAO Vote
  const handleVote = async (proposalId: number, action: "VoteApprove" | "VoteReject") => {
    if (!accountId) {
      showToast("Please connect a Council wallet first", "error");
      return;
    }
    if (!councilAccounts.includes(accountId)) {
      showToast(`Account "${accountId}" is the Treasury Operator and cannot vote. Switch to Council 1, 2, or 3.`, "error");
      return;
    }
    setVotingProposalId(proposalId);
    try {
      const res = await signAndSendTransaction({
        receiverId: daoId,
        methodName: "act_proposal",
        args: {
          id: proposalId,
          action,
        },
      });

      showToast(`Voted ${action} on Proposal #${proposalId}`, {
        type: "success",
        explorerUrl: res.explorerUrl,
      });

      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Voting failed: ${msg}`, "error");
    } finally {
      setVotingProposalId(null);
    }
  };

  // Handle Agent Trigger
  const handleTriggerAgent = async () => {
    setTriggeringAgent(true);
    try {
      const res = await fetch("/api/agent/trigger", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("Autonomous agent tick triggered successfully", "success");
        await loadData();
      } else {
        showToast(data.error || "Agent trigger returned error", "error");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Agent trigger failed: ${msg}`, "error");
    } finally {
      setTriggeringAgent(false);
    }
  };

  const councilAccounts = availableAccounts.filter((a) => a.includes("council"));
  const isCouncil = Boolean(accountId && councilAccounts.includes(accountId));

  return (
    <div className="space-y-4">
      {/* 1. System Status & Security Banner */}
      <div className="rounded-xl border border-border bg-surface p-3 text-xs">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-accent-blue" />
            <span className="font-semibold text-foreground">NEAR Testnet FX Treasury Agent</span>
          </div>
          <button
            onClick={() => {
              setRefreshing(true);
              loadData();
            }}
            disabled={refreshing}
            className="flex items-center gap-1 text-muted hover:text-foreground text-[11px]"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <span className="text-muted">Contract: </span>
            <a
              href={explorerAccountUrl(contractId)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-accent-blue hover:underline inline-flex items-center gap-0.5"
            >
              <span>{contractId.slice(0, 16)}...</span>
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
          <div>
            <span className="text-muted">Sputnik DAO: </span>
            <a
              href={explorerAccountUrl(daoId)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-accent-blue hover:underline inline-flex items-center gap-0.5"
            >
              <span>{daoId.slice(0, 16)}...</span>
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
          <div>
            <span className="text-muted">Auto-Cap: </span>
            <span className="font-mono font-medium text-foreground">{autoCapUsdc.toFixed(2)} USDC</span>
          </div>
          <div>
            <span className="text-muted">Max Chunk: </span>
            <span className="font-mono font-medium text-foreground">{maxChunkLimitUsdc.toFixed(2)} USDC</span>
          </div>
        </div>
      </div>

      {/* 2. Rate Discovery & Timing Score Card */}
      <LiveQuoteCard />

      {/* 2b. Testnet Stablecoin Balances & Faucet */}
      <TokenBalanceCard
        accountId={accountId}
        userUsdc={tokens.userUsdc}
        userEure={tokens.userEure}
        vaultEure={tokens.vaultEure}
        usdcId={tokens.usdcId}
        eureId={tokens.eureId}
        onRefresh={loadData}
      />

      {/* 3. Interactive Order Intake Card */}
      <Card title="Create FX Goal (NEAR Testnet)" subtitle="Auto-executes small orders, requires DAO 2-of-3 approval above $100">
        <div className="space-y-3 pt-1">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setOrderAmount("20");
                setMaxChunk("5");
                setMaxDevBps("120");
                setDeadlineHours("4");
                showToast("Preset loaded: $20 USDC (Auto-Active). Click Submit Order below when ready.", "info");
              }}
              className={`flex-1 py-1.5 px-2.5 rounded-lg border text-xs font-medium transition-colors text-left ${
                orderAmount === "20"
                  ? "border-accent-green bg-accent-green/10 text-foreground"
                  : "border-border bg-surface-hover text-foreground hover:border-accent-green"
              }`}
            >
              <div className="font-semibold text-accent-green">Preset: $20 USDC</div>
              <div className="text-[10px] text-muted">Auto-Active (Below $100 cap)</div>
            </button>
            <button
              type="button"
              onClick={() => {
                setOrderAmount("250");
                setMaxChunk("20");
                setMaxDevBps("120");
                setDeadlineHours("4");
                showToast("Preset loaded: $250 USDC (Requires DAO Approval). Click Submit Order below when ready.", "info");
              }}
              className={`flex-1 py-1.5 px-2.5 rounded-lg border text-xs font-medium transition-colors text-left ${
                orderAmount === "250"
                  ? "border-amber-500 bg-amber-500/10 text-foreground"
                  : "border-border bg-surface-hover text-foreground hover:border-amber-500"
              }`}
            >
              <div className="font-semibold text-amber-400">Preset: $250 USDC</div>
              <div className="text-[10px] text-muted">Pending (Needs DAO 2-of-3)</div>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-[11px] text-muted block mb-1">Total Amount (USDC)</label>
              <input
                type="number"
                value={orderAmount}
                onChange={(e) => setOrderAmount(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground focus:border-accent-blue focus:outline-none"
                placeholder="50"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted block mb-1">Max Chunk (USDC)</label>
              <input
                type="number"
                value={maxChunk}
                onChange={(e) => setMaxChunk(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground focus:border-accent-blue focus:outline-none"
                placeholder="20"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted block mb-1">Max Deviation (bps)</label>
              <input
                type="number"
                value={maxDevBps}
                onChange={(e) => setMaxDevBps(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground focus:border-accent-blue focus:outline-none"
                placeholder="120"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted block mb-1">Deadline (Hours)</label>
              <input
                type="number"
                value={deadlineHours}
                onChange={(e) => setDeadlineHours(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground focus:border-accent-blue focus:outline-none"
                placeholder="4"
              />
            </div>
          </div>

          {/* Supplier Invoice Settlement Fields */}
          <div className="rounded-lg border border-border bg-background/60 p-2.5 space-y-2">
            <div className="text-[11px] font-medium text-muted">
              Optional Supplier Invoice Payable (EURe settled via on-chain callback)
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="col-span-2">
                <label className="text-[10px] text-muted block mb-1">Supplier Account</label>
                <input
                  type="text"
                  value={recipientAccount}
                  onChange={(e) => setRecipientAccount(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:border-accent-blue focus:outline-none"
                  placeholder={accountId || "supplier.testnet"}
                />
              </div>
              <div>
                <label className="text-[10px] text-muted block mb-1">Target Due (EURe)</label>
                <input
                  type="number"
                  value={targetEure}
                  onChange={(e) => setTargetEure(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:border-accent-blue focus:outline-none"
                  placeholder="1000"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-1">Invoice Reference</label>
              <input
                type="text"
                value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:border-accent-blue focus:outline-none"
                placeholder="INV-2026-001"
              />
            </div>
          </div>

          {/* Dynamic Cap Badge */}
          <div
            className={`rounded-lg px-2.5 py-1.5 text-xs flex items-center justify-between ${
              isAboveCap
                ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                : "bg-green-500/10 border border-green-500/20 text-green-400"
            }`}
          >
            <div className="flex items-center gap-1.5">
              {isAboveCap ? <AlertCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              <span className="font-medium">
                {isAboveCap ? "Requires Sputnik DAO Approval" : "Auto-Active Order"}
              </span>
            </div>
            <span className="text-[10px] font-mono opacity-80">
              {isAboveCap ? `> $${autoCapUsdc} Auto-Cap` : `<= $${autoCapUsdc} Auto-Cap`}
            </span>
          </div>

          {!accountId ? (
            <button
              type="button"
              onClick={() => connect()}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-accent-blue/40 bg-accent-blue/15 py-2 text-xs font-semibold text-accent-blue hover:bg-accent-blue/25 transition-colors"
            >
              <Shield className="h-3.5 w-3.5" />
              <span>Connect Test Wallet to Submit Order</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCreateOrder}
              disabled={submittingOrder}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-accent-blue py-2 text-xs font-semibold text-white hover:bg-accent-blue/90 disabled:opacity-50 transition-colors"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>{submittingOrder ? "Submitting to NEAR Testnet..." : "Submit Order to Testnet"}</span>
            </button>
          )}
        </div>
      </Card>

      {/* 4. On-Chain Active Orders List */}
      <Card title={`Active & Recent Orders (${orders.length})`} subtitle="On-chain orders retrieved from fx-budget contract views">
        {loading ? (
          <div className="py-6 text-center text-xs text-muted">Loading orders from NEAR testnet...</div>
        ) : orders.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted">No orders found on testnet. Create one above to test.</div>
        ) : (
          <div className="space-y-2.5 pt-1">
            {orders.map((o) => {
              const total = Number(o.total_in) / 1e6;
              const executed = Number(o.executed_in) / 1e6;
              const pct = total > 0 ? Math.min(100, Math.round((executed / total) * 100)) : 0;
              const targetOutEur = Number(o.target_out || "0") / 1e6;
              const settledOutEur = Number(o.settled_out || "0") / 1e6;
              const pendingOutEur = Number(o.pending_out || "0") / 1e6;
              const remainingDueEur = Math.max(0, targetOutEur - settledOutEur);
              const invoicePct = targetOutEur > 0 ? Math.min(100, Math.round((settledOutEur / targetOutEur) * 100)) : 0;
              const isPending = o.status === "Pending";
              const isActive = o.status === "Active";

              return (
                <div key={o.id} className="rounded-xl border border-border bg-background p-3 text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-foreground">Order #{o.id}</span>
                      <span className="font-mono text-[11px] text-muted">{o.pair_label}</span>
                      {o.invoice_ref && (
                        <span className="rounded bg-surface border border-border px-1.5 py-0.5 text-[10px] font-mono text-zinc-300">
                          {o.invoice_ref}
                        </span>
                      )}
                    </div>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        isPending
                          ? "bg-amber-500/15 text-amber-400"
                          : isActive
                          ? "bg-green-500/15 text-green-400"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {o.status}
                    </span>
                  </div>

                  {/* Callback-Confirmed Invoice Balance Panel */}
                  {targetOutEur > 0 && (
                    <div className="mb-2.5 rounded-lg border border-border bg-surface p-2 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-muted">
                        <span>
                          Supplier:{" "}
                          <strong className="font-mono text-foreground">{o.recipient || o.requester}</strong>
                        </span>
                        <span className="font-mono">{invoicePct}% settled</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <div>
                          <div className="text-[10px] text-muted">Invoice Target</div>
                          <div className="font-mono font-semibold text-foreground">{targetOutEur.toFixed(2)} EURe</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted">Confirmed Paid</div>
                          <div className="font-mono font-semibold text-emerald-400">{settledOutEur.toFixed(2)} EURe</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted">Amount Due</div>
                          <div className="font-mono font-bold text-amber-400">{remainingDueEur.toFixed(2)} EURe</div>
                        </div>
                      </div>
                      {pendingOutEur > 0 && (
                        <div className="text-[10px] font-mono text-accent-blue">
                          In-Flight Settlement Callback: {pendingOutEur.toFixed(2)} EURe
                        </div>
                      )}
                    </div>
                  )}

                  {/* Budget Execution Progress Bar */}
                  <div className="mb-2">
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-muted">
                        Budget Settled: <strong className="text-foreground">{executed.toFixed(2)}</strong> / {total.toFixed(2)} USDC
                      </span>
                      <span className="font-mono font-medium text-foreground">{pct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          pct === 100 ? "bg-green-500" : "bg-accent-blue"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-muted">
                    <span>Confirmed Chunks: {o.chunks_count}</span>
                    <span>Agent-Reported Dev Cap: {o.max_dev_bps} bps</span>
                  </div>

                  {/* Governance & Sputnik DAO Approval Panel for Pending Orders */}
                  {isPending && (
                    <div className="mt-2.5 pt-2.5 border-t border-border bg-surface/50 -mx-3 -mb-3 p-3 rounded-b-xl">
                      {(() => {
                        const relatedProp = proposals.find(
                          (p) =>
                            p.description.includes(`Order #${o.id}`) ||
                            p.description.includes(`order #${o.id}`)
                        );
                        const approveVotes = relatedProp
                          ? Object.values(relatedProp.votes).filter((v) => v === "Approve").length
                          : 0;

                        return (
                          <>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5">
                                <Shield className="h-3.5 w-3.5" />
                                Requires Sputnik DAO 2-of-3 Approval
                              </span>
                              {relatedProp && (
                                <span className="text-[10px] font-mono text-zinc-300">
                                  Proposal #{relatedProp.id}: {relatedProp.status} ({approveVotes}/2 votes)
                                </span>
                              )}
                            </div>

                            {!relatedProp ? (
                              <button
                                onClick={() => handleSubmitProposalForOrder(o.id, total, o.pair_label)}
                                disabled={submittingProposalForOrder === o.id}
                                className="w-full py-1.5 px-3 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/20 font-semibold hover:bg-amber-500/25 disabled:opacity-50 transition-colors text-xs flex items-center justify-center gap-1"
                              >
                                {submittingProposalForOrder === o.id
                                  ? "Submitting Proposal (0.1 NEAR)..."
                                  : "Submit Approval Proposal to Sputnik DAO (0.1 NEAR)"}
                              </button>
                            ) : relatedProp.status === "InProgress" ? (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="text-muted">Council Voters:</span>
                                  <div className="flex gap-1.5">
                                    {councilAccounts.map((acc, idx) => {
                                      const isCurrent = acc === accountId;
                                      const hasVotedThis = relatedProp.votes[acc];
                                      return (
                                        <button
                                          key={acc}
                                          onClick={() => connect(acc)}
                                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors border ${
                                            isCurrent
                                              ? "bg-accent-blue/20 border-accent-blue text-accent-blue"
                                              : hasVotedThis
                                              ? "bg-green-500/10 border-green-500/30 text-green-400"
                                              : "bg-surface border-border text-muted hover:text-foreground"
                                          }`}
                                        >
                                          Council {idx + 1} {hasVotedThis ? "✓" : ""}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {!accountId ? (
                                  <button
                                    onClick={() => connect(councilAccounts[0])}
                                    className="w-full py-1.5 rounded-lg bg-accent-blue/15 text-accent-blue border border-accent-blue/20 font-semibold hover:bg-accent-blue/25 transition-colors text-xs"
                                  >
                                    Connect Council Wallet to Vote
                                  </button>
                                ) : !isCouncil ? (
                                  <div className="rounded-lg bg-surface border border-border p-2 space-y-1.5">
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-amber-400 font-medium">Connected as Operator</span>
                                      <span className="text-[10px] text-muted">Council only</span>
                                    </div>
                                    <div className="text-[11px] text-zinc-400">
                                      Operator cannot vote on DAO proposals. Switch to a Council member:
                                    </div>
                                    <div className="flex gap-2">
                                      {councilAccounts.slice(0, 2).map((acc, idx) => (
                                        <button
                                          key={acc}
                                          onClick={() => connect(acc)}
                                          className="flex-1 py-1 px-2 rounded-lg border border-accent-blue/30 bg-accent-blue/15 text-accent-blue text-xs font-semibold hover:bg-accent-blue/25 transition-colors font-mono"
                                        >
                                          Switch to Council {idx + 1} &rarr;
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ) : relatedProp.votes[accountId] === "Approve" ? (
                                  <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2 space-y-1.5">
                                    <div className="text-xs text-green-400 font-medium flex items-center justify-between">
                                      <span>Council {councilAccounts.indexOf(accountId) + 1} voted Approve ✓</span>
                                      <span className="text-[10px] text-muted font-mono">{approveVotes}/2 votes</span>
                                    </div>
                                    <div className="text-[11px] text-zinc-300">
                                      Switch to the next Council member to cast the 2nd approval vote:
                                    </div>
                                    <div className="flex gap-2">
                                      {councilAccounts
                                        .filter((acc) => !relatedProp.votes[acc])
                                        .map((acc) => {
                                          const idx = councilAccounts.indexOf(acc);
                                          return (
                                            <button
                                              key={acc}
                                              onClick={() => connect(acc)}
                                              className="flex-1 py-1 px-2 rounded-lg border border-accent-blue/40 bg-accent-blue/15 text-accent-blue text-xs font-semibold hover:bg-accent-blue/25 transition-colors font-mono"
                                            >
                                              Switch to Council {idx + 1} & Vote &rarr;
                                            </button>
                                          );
                                        })}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleVote(relatedProp.id, "VoteApprove")}
                                      disabled={votingProposalId === relatedProp.id}
                                      className="flex-1 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/20 font-semibold hover:bg-green-500/25 disabled:opacity-50 transition-colors text-xs"
                                    >
                                      {votingProposalId === relatedProp.id
                                        ? "Casting Vote..."
                                        : approveVotes === 1
                                        ? "Vote Approve (2nd Vote -> Automatically Activates Order!)"
                                        : "Vote Approve (1st Vote)"}
                                    </button>
                                    <button
                                      onClick={() => handleVote(relatedProp.id, "VoteReject")}
                                      disabled={votingProposalId === relatedProp.id}
                                      className="py-1.5 px-3 rounded-lg bg-red-500/15 text-red-400 border border-red-500/20 font-semibold hover:bg-red-500/25 disabled:opacity-50 transition-colors text-xs"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-[11px] text-green-400 font-medium">
                                Proposal #{relatedProp.id} {relatedProp.status} — Sputnik DAO approved order.
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 5. Sputnik DAO Council Approvals Card */}
      <Card
        title={`Sputnik DAO Council Approvals (${proposals.length})`}
        subtitle="2-of-3 multisig votes required for orders above $100 auto-cap"
      >
        <div className="mb-3 pb-2 border-b border-border flex items-center justify-between text-xs">
          <span className="text-muted">Active Signer: <strong className="text-accent-blue font-mono">{accountId}</strong></span>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted mr-1">Switch:</span>
            {councilAccounts.map((acc, idx) => (
              <button
                key={acc}
                onClick={() => connect(acc)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                  acc === accountId
                    ? "bg-accent-blue/20 border-accent-blue text-accent-blue font-bold"
                    : "bg-surface border-border text-muted hover:text-foreground"
                }`}
              >
                C{idx + 1}
              </button>
            ))}
          </div>
        </div>

        {proposals.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted">No pending DAO proposals on testnet.</div>
        ) : (
          <div className="space-y-2.5 pt-1">
            {[...proposals]
              .sort((a, b) => {
                if (a.status === "InProgress" && b.status !== "InProgress") return -1;
                if (a.status !== "InProgress" && b.status === "InProgress") return 1;
                return b.id - a.id;
              })
              .map((p) => {
                const approveVotes = Object.values(p.votes).filter((v) => v === "Approve").length;
                const isApproved = p.status === "Approved";
                const isVoting = votingProposalId === p.id;
                const hasVoted = accountId ? p.votes[accountId] : undefined;

                return (
                  <div key={p.id} className="rounded-xl border border-border bg-background p-3 text-xs">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Vote className="h-3.5 w-3.5 text-accent-blue" />
                        <span className="font-mono font-semibold text-foreground">Proposal #{p.id}</span>
                      </div>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          isApproved ? "bg-green-500/15 text-green-400" : "bg-amber-500/15 text-amber-400"
                        }`}
                      >
                        {p.status} ({approveVotes}/2 votes)
                      </span>
                    </div>

                    <p className="text-[11px] text-muted mb-2 font-mono break-all">{p.description}</p>

                    <div className="text-[10px] text-muted mb-2">
                      Votes cast:{" "}
                      {Object.keys(p.votes).length === 0 ? (
                        <span>None yet</span>
                      ) : (
                        Object.entries(p.votes).map(([voter, vote]) => (
                          <span key={voter} className="inline-block mr-2 text-foreground font-mono">
                            {voter.slice(0, 15)}... ({vote})
                          </span>
                        ))
                      )}
                    </div>

                    {!isApproved && (
                      <div className="pt-2 border-t border-border">
                        {!accountId ? (
                          <button
                            onClick={() => connect(councilAccounts[0])}
                            className="w-full py-1.5 rounded-lg bg-accent-blue/15 text-accent-blue border border-accent-blue/20 font-semibold hover:bg-accent-blue/25 transition-colors text-xs"
                          >
                            Connect Council Wallet to Vote
                          </button>
                        ) : !isCouncil ? (
                          <div className="rounded-lg bg-surface border border-border p-2 space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-amber-400 font-medium">Connected as Operator</span>
                              <span className="text-[10px] text-muted">Council only</span>
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              Operator cannot vote on DAO proposals. Switch to a Council member:
                            </div>
                            <div className="flex gap-2">
                              {councilAccounts.slice(0, 2).map((acc, idx) => (
                                <button
                                  key={acc}
                                  onClick={() => connect(acc)}
                                  className="flex-1 py-1 px-2 rounded-lg border border-accent-blue/30 bg-accent-blue/15 text-accent-blue text-xs font-semibold hover:bg-accent-blue/25 transition-colors font-mono"
                                >
                                  Switch to Council {idx + 1} &rarr;
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : hasVoted === "Approve" ? (
                          <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2 space-y-1.5">
                            <div className="text-xs text-green-400 font-medium flex items-center justify-between">
                              <span>Council {councilAccounts.indexOf(accountId) + 1} voted Approve ✓</span>
                              <span className="text-[10px] text-muted font-mono">{approveVotes}/2 votes</span>
                            </div>
                            <div className="text-[11px] text-zinc-300">
                              Switch to the next Council member to cast the 2nd approval vote:
                            </div>
                            <div className="flex gap-2">
                              {councilAccounts
                                .filter((acc) => !p.votes[acc])
                                .map((acc) => {
                                  const idx = councilAccounts.indexOf(acc);
                                  return (
                                    <button
                                      key={acc}
                                      onClick={() => connect(acc)}
                                      className="flex-1 py-1 px-2 rounded-lg border border-accent-blue/40 bg-accent-blue/15 text-accent-blue text-xs font-semibold hover:bg-accent-blue/25 transition-colors font-mono"
                                    >
                                      Switch to Council {idx + 1} & Vote &rarr;
                                    </button>
                                  );
                                })}
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleVote(p.id, "VoteApprove")}
                              disabled={isVoting}
                              className="flex-1 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/20 font-semibold hover:bg-green-500/25 disabled:opacity-50 transition-colors text-xs"
                            >
                              {isVoting
                                ? "Broadcasting vote..."
                                : approveVotes === 1
                                ? "Vote Approve (2nd Vote -> Automatically Activates Order!)"
                                : "Vote Approve (1st Vote)"}
                            </button>
                            <button
                              onClick={() => handleVote(p.id, "VoteReject")}
                              disabled={isVoting}
                              className="py-1.5 px-3 rounded-lg bg-red-500/15 text-red-400 border border-red-500/20 font-semibold hover:bg-red-500/25 disabled:opacity-50 transition-colors text-xs"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </Card>

      {/* 6. Agent Ops & Callback-Verified Settlement Log */}
      <Card
        title="Agent Runner & Settlement Log"
        subtitle="Callback-verified NEP-141 EURe transfers (1Click dry:true indicative quotes + agent-reported deviation check)"
      >
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
          <div className="flex items-center gap-1.5 text-xs">
            <Activity className="h-3.5 w-3.5 text-green-400" />
            <span className="font-semibold text-foreground">Loop Status: Active</span>
          </div>
          <button
            onClick={handleTriggerAgent}
            disabled={triggeringAgent}
            className="flex items-center gap-1.5 rounded-lg bg-accent-blue/15 px-2.5 py-1 text-xs font-semibold text-accent-blue hover:bg-accent-blue/25 disabled:opacity-50 transition-colors"
          >
            <Play className={`h-3 w-3 ${triggeringAgent ? "animate-spin" : ""}`} />
            <span>{triggeringAgent ? "Executing..." : "Trigger Agent Tick"}</span>
          </button>
        </div>

        {/* Fills list */}
        {fills.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted">No fills executed yet.</div>
        ) : (
          <div className="space-y-1.5">
            {fills.slice(0, 8).map((f) => {
              const inAmt = (Number(f.amount_in) / 1e6).toFixed(2);
              const outAmtNum = f.settlement_out
                ? Number(f.settlement_out) / 1e6
                : Number(f.simulated_out) >= 1e14
                ? Number(f.simulated_out) / 1e18
                : Number(f.simulated_out) / 1e6;
              const outAmt = outAmtNum.toFixed(2);
              const status =
                f.settlement_status ||
                (!f.is_simulated && f.ft_transfer_tx_hash ? "CONFIRMED" : "UNVERIFIED_LEGACY");
              const isConfirmed = status === "CONFIRMED";
              const isFailed = status === "FAILED";
              const isInFlight = status === "IN_FLIGHT";

              return (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                      <span>Chunk #{f.chunk_index} · Order #{f.order_id}</span>
                      {isConfirmed ? (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 uppercase">
                          Confirmed On-Chain
                        </span>
                      ) : isFailed ? (
                        <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold text-red-400 uppercase">
                          Failed · Balance Unchanged
                        </span>
                      ) : isInFlight ? (
                        <span className="rounded bg-accent-blue/15 px-1.5 py-0.5 text-[9px] font-bold text-accent-blue uppercase">
                          In-Flight Callback
                        </span>
                      ) : (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400 uppercase">
                          Simulated / Unverified
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted font-mono mt-0.5">
                      {inAmt} USDC (budget) &rarr; {outAmt} EURe {f.recipient ? `to ${f.recipient}` : ""} ({f.deviation_bps} bps agent-reported)
                    </div>
                    {f.failure_reason && (
                      <div className="text-[10px] text-red-400 font-mono mt-0.5 truncate">
                        {f.failure_reason}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isConfirmed && f.ft_transfer_url && (
                      <a
                        href={f.ft_transfer_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 hover:underline"
                      >
                        <span>EURe Settlement</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {f.explorer_url && (
                      <a
                        href={f.explorer_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[11px] font-mono text-accent-blue hover:underline"
                      >
                        <span>execute_chunk</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Recent Strategy Decisions */}
        {decisions.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-border">
            <div className="text-[10px] text-muted uppercase tracking-wider mb-1.5 font-medium">
              Recent Strategy Decisions
            </div>
            <div className="space-y-1">
              {decisions.slice(0, 4).map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between text-[11px] font-mono text-zinc-400 py-0.5 gap-2"
                >
                  <span
                    className={
                      d.decision === "EXECUTE"
                        ? "text-green-400 font-semibold"
                        : d.decision.includes("FAILED")
                        ? "text-red-400 font-semibold"
                        : "text-amber-400"
                    }
                  >
                    [{d.decision}]
                  </span>
                  <span className="truncate max-w-[240px] text-zinc-300">{d.reason}</span>
                  <span className="text-zinc-500 text-[10px] shrink-0">Score: {d.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
