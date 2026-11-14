"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/card";
import { useToast } from "@/components/toast-provider";
import { useNearWallet } from "@/lib/near-wallet";
import { explorerAccountUrl } from "@getnear/shared";
import { RefreshCw, ExternalLink, ShieldCheck, CheckCircle2, Clock } from "lucide-react";

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
    if (!accountId) {
      showToast("Please connect a Council wallet first", "error");
      return;
    }
    if (!councilAccounts.includes(accountId)) {
      showToast(`Account "${accountId}" is the Treasury Operator and cannot vote. Switch to Council 1, 2, or 3.`, "error");
      return;
    }
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
  const isCouncil = Boolean(accountId && councilAccounts.includes(accountId));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* 1. Header & Council Switcher */}
      <Card
        title="Sputnik DAO governance (2 of 3)"
        subtitle="2-of-3 council approval required for orders exceeding 100 USDC auto-cap"
      >
        <div className="space-y-3 pt-1 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div>
              <span className="text-muted">DAO Contract: </span>
              <a
                href={explorerAccountUrl(daoId)}
                target="_blank"
                rel="noreferrer"
                className="text-info hover:underline inline-flex items-center gap-0.5"
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
              className="flex items-center gap-1 text-muted hover:text-brand text-[11px] transition-colors"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              <span>[REFRESH]</span>
            </button>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">
              Active Voting Council Member:
            </div>
            <div className="grid grid-cols-3 gap-2">
              {councilAccounts.map((acc, idx) => {
                const isCurrent = acc === accountId;
                return (
                  <button
                    key={acc}
                    onClick={() => connect(acc)}
                    className={`py-1.5 px-2 text-center text-xs font-semibold transition-colors border ${
                      isCurrent
                        ? "border-brand bg-brand/15 text-brand"
                        : "border-border bg-background text-muted hover:text-foreground hover:border-zinc-700"
                    }`}
                  >
                    <span>Seat {idx + 1}</span>
                    {isCurrent && <span className="block text-[9px] text-brand">ACTIVE VOTER</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* 2. Proposals List */}
      <Card
        title={`DAO PROPOSALS (${proposals.length})`}
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
                const hasVoted = accountId ? p.votes[accountId] : undefined;

              return (
                <div key={p.id} className="border border-border bg-background p-3 text-xs ">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-border/60">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-info" />
                      <span className="font-bold text-foreground">PROPOSAL #{p.id}</span>
                    </div>
                    <span
                      className={`border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        isApproved
                          ? "border-brand bg-brand/10 text-brand"
                          : "border-amber-400 bg-amber-400/10 text-amber-400"
                      }`}
                    >
                      {p.status} ({approveVotes}/2 VOTES)
                    </span>
                  </div>

                  <div className="bg-[#05060a] p-2 mb-2 text-[11px] text-zinc-300 break-all border border-border">
                    {p.description}
                  </div>

                  <div className="mb-3 text-[11px] text-muted">
                    <span className="font-semibold text-foreground">COUNCIL SIGNATURES: </span>
                    {Object.keys(p.votes).length === 0 ? (
                      <span>No votes cast yet</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {Object.entries(p.votes).map(([voter, v]) => (
                          <span
                            key={voter}
                            className={`border px-1.5 py-0.5 text-[10px] ${
                              v === "Approve"
                                ? "border-brand text-brand bg-brand/10"
                                : "border-red-400 text-red-400 bg-red-400/10"
                            }`}
                          >
                            [ {voter.replace("chilliroger-", "").replace(".testnet", "")} : {v.toUpperCase()} ]
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions for InProgress proposals */}
                  {!isApproved && p.status === "InProgress" && (
                    <div className="pt-2 border-t border-border">
                      {!isCouncil ? (
                        <div className="space-y-1.5">
                          <p className="text-[11px] text-amber-400">
                            Current account ({accountId ? accountId.slice(0, 16) + "..." : "none"}) cannot vote. Connect a Council Member seat above to sign:
                          </p>
                          <div className="flex gap-2">
                            {councilAccounts.map((acc, idx) => (
                              <button
                                key={acc}
                                onClick={() => connect(acc)}
                                className="flex-1 py-1.5 px-2 border border-info bg-info/10 text-info text-[11px] font-semibold hover:bg-info/20 transition-colors"
                              >
                                Vote as council {idx + 1} &rarr;
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : hasVoted ? (
                        <div className="text-[11px] text-brand font-semibold">
                          [✓] You already voted &quot;{hasVoted}&quot; on this proposal with {accountId}.
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleVote(p.id, "VoteApprove")}
                            disabled={isProcessing}
                            className="flex-1 py-2 bg-brand text-background border border-brand font-bold hover:bg-brand/90 disabled:opacity-50 transition-colors text-xs"
                          >
                            {isProcessing
                              ? "Casting vote..."
                              : approveVotes === 1
                              ? "Cast 2nd approval vote (activates order) →"
                              : "Cast approval vote →"}
                          </button>
                          <button
                            onClick={() => handleVote(p.id, "VoteReject")}
                            disabled={isProcessing}
                            className="py-2 px-4 bg-red-500/10 text-red-400 border border-red-500/30 font-bold hover:bg-red-500/20 disabled:opacity-50 transition-colors text-xs"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {isApproved && (
                    <div className="pt-2 border-t border-border text-[11px] text-brand font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>SPUTNIK DAO APPROVED // ORDER ACTIVATED ON FXBUDGET CONTRACT</span>
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
