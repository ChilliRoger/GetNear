"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/card";
import { useToast } from "@/components/toast-provider";
import { useNearWallet } from "@/lib/near-wallet";
import { explorerAccountUrl } from "@getnear/shared";
import { RefreshCw, ExternalLink, ShieldCheck } from "lucide-react";

interface DaoProposal {
  id: number;
  proposer: string;
  description: string;
  kind: Record<string, unknown>;
  status: "InProgress" | "Approved" | "Rejected" | "Removed" | "Expired" | "Moved";
  votes: Record<string, "Approve" | "Reject" | "Remove">;
  submission_time: string;
}

export default function ApprovePage() {
  const { accountId, signAndSendTransaction, availableAccounts, connect } = useNearWallet();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [votingId, setVotingId] = useState<number | null>(null);
  const [proposals, setProposals] = useState<DaoProposal[]>([]);
  const [daoId, setDaoId] = useState("chilliroger-dao.sputnik-v2.testnet");

  const loadProposals = useCallback(async () => {
    try {
      const res = await fetch("/api/near");
      if (res.ok) {
        const data = await res.json();
        if (data.dao?.proposals) {
          setProposals(data.dao.proposals);
        }
        if (data.dao?.id) {
          setDaoId(data.dao.id);
        }
      }
    } catch (err) {
      console.warn("Failed to load proposals:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadProposals();
    const interval = setInterval(loadProposals, 10000);
    return () => clearInterval(interval);
  }, [loadProposals]);

  const handleVote = async (proposalId: number, action: "VoteApprove" | "VoteReject") => {
    setVotingId(proposalId);
    try {
      const res = await signAndSendTransaction({
        receiverId: daoId,
        methodName: "act_proposal",
        args: {
          id: proposalId,
          action,
        },
      });

      showToast(`Vote cast successfully: ${action} on Proposal #${proposalId}`, {
        type: "success",
        explorerUrl: res.explorerUrl,
      });

      await loadProposals();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Vote failed: ${msg}`, "error");
    } finally {
      setVotingId(null);
    }
  };

  const councilAccounts = availableAccounts.filter((a) => a.includes("council"));

  return (
    <div className="space-y-4">
      {/* 1. Header & Council Switcher */}
      <Card
        title="Sputnik DAO Multisig Governance"
        subtitle="2-of-3 council approval required for orders exceeding 100 USDC auto-cap"
      >
        <div className="space-y-3 pt-1 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div>
              <span className="text-muted">DAO Account: </span>
              <a
                href={explorerAccountUrl(daoId)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-accent-blue hover:underline inline-flex items-center gap-0.5"
              >
                <span>{daoId}</span>
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
            <button
              onClick={() => {
                setRefreshing(true);
                loadProposals();
              }}
              disabled={refreshing}
              className="flex items-center gap-1 text-muted hover:text-foreground text-[11px]"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>

          <div>
            <div className="text-[11px] text-muted mb-1 font-medium">Switch Council Voter:</div>
            <div className="grid grid-cols-3 gap-2">
              {councilAccounts.map((acc, idx) => {
                const isCurrent = acc === accountId;
                return (
                  <button
                    key={acc}
                    onClick={() => connect(acc)}
                    className={`rounded-lg py-1.5 px-2 text-center text-xs font-semibold transition-colors border ${
                      isCurrent
                        ? "border-accent-blue bg-accent-blue/15 text-accent-blue"
                        : "border-border bg-background text-muted hover:text-foreground hover:border-zinc-700"
                    }`}
                  >
                    Council {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* 2. Proposals List */}
      <Card
        title={`DAO Proposals (${proposals.length})`}
        subtitle="FunctionCall proposals to execute approve_order on fx-budget"
      >
        {loading ? (
          <div className="py-6 text-center text-xs text-muted">Loading proposals from NEAR testnet...</div>
        ) : proposals.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted">No proposals found on Sputnik DAO.</div>
        ) : (
          <div className="space-y-3 pt-1">
            {[...proposals]
              .sort((a, b) => {
                if (a.status === "InProgress" && b.status !== "InProgress") return -1;
                if (a.status !== "InProgress" && b.status === "InProgress") return 1;
                return b.id - a.id;
              })
              .map((p) => {
                const approveVotes = Object.values(p.votes).filter((v) => v === "Approve").length;
                const isApproved = p.status === "Approved";
                const isProcessing = votingId === p.id;
                const hasVoted = accountId && p.votes[accountId];

              return (
                <div key={p.id} className="rounded-xl border border-border bg-background p-3 text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-accent-blue" />
                      <span className="font-mono font-bold text-foreground">Proposal #{p.id}</span>
                    </div>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        isApproved
                          ? "bg-green-500/15 text-green-400"
                          : "bg-amber-500/15 text-amber-400"
                      }`}
                    >
                      {p.status} ({approveVotes}/2 Approved)
                    </span>
                  </div>

                  <div className="rounded-lg bg-surface p-2 mb-2 font-mono text-[11px] text-zinc-300 break-all border border-border">
                    {p.description}
                  </div>

                  <div className="mb-3 text-[11px] text-muted">
                    <span className="font-medium text-foreground">Signatures: </span>
                    {Object.keys(p.votes).length === 0 ? (
                      <span>No votes cast yet</span>
                    ) : (
                      <div className="mt-1 space-y-0.5">
                        {Object.entries(p.votes).map(([voter, vote]) => (
                          <div key={voter} className="flex items-center justify-between font-mono text-[10px]">
                            <span className="text-zinc-400">{voter}</span>
                            <span
                              className={`font-semibold ${
                                vote === "Approve" ? "text-green-400" : "text-red-400"
                              }`}
                            >
                              {vote}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {!isApproved && (
                    <div className="flex gap-2 pt-2 border-t border-border">
                      <button
                        onClick={() => handleVote(p.id, "VoteApprove")}
                        disabled={isProcessing}
                        className="flex-1 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/20 font-semibold hover:bg-green-500/25 disabled:opacity-50 transition-colors"
                      >
                        {isProcessing ? "Submitting..." : hasVoted ? "Change Vote to Approve" : "Vote Approve (2-of-3)"}
                      </button>
                      <button
                        onClick={() => handleVote(p.id, "VoteReject")}
                        disabled={isProcessing}
                        className="py-1.5 px-3 rounded-lg bg-red-500/15 text-red-400 border border-red-500/20 font-semibold hover:bg-red-500/25 disabled:opacity-50 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
