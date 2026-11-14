"use client";

import { demoAuthHeaders } from "@/lib/near-wallet";

import { useState } from "react";
import { Card } from "@/components/card";
import { useToast } from "@/components/toast-provider";
import { Coins, Copy, Check, Droplets, ExternalLink, ArrowRight, ShieldCheck } from "lucide-react";

interface TokenBalanceCardProps {
  accountId: string | null;
  userUsdc: number;
  userDemoUsdc?: number;
  userEure: number;
  vaultUsdc?: number;
  vaultEure: number;
  usdcId: string;
  eureId: string;
  onRefresh: () => void;
}

export function TokenBalanceCard({
  accountId,
  userUsdc,
  userDemoUsdc = 0,
  userEure,
  vaultUsdc = 0,
  vaultEure,
  usdcId,
  eureId,
  onRefresh,
}: TokenBalanceCardProps) {
  const { showToast } = useToast();
  const [isClaiming, setIsClaiming] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(label);
    showToast(`${label} contract ID copied to clipboard`, "success");
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleClaimFaucet = async () => {
    if (!accountId) {
      showToast("Connect your testnet wallet to claim testnet USDC", "error");
      return;
    }

    setIsClaiming(true);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...demoAuthHeaders() },
        body: JSON.stringify({ accountId, amount: 500 }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Faucet claim failed");
      }

      showToast(`Successfully minted 500 USDC to ${accountId}`, {
        type: "success",
        explorerUrl: data.explorerUrl,
      });
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to claim faucet tokens";
      showToast(msg, "error");
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <Card
      title="Testnet Stablecoin Vault"
      subtitle="Live NEP-141 tokens on NEAR testnet with direct wallet settlement"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-brand" />
          <span className="text-xs text-muted">
            Automated liquidity reserves & user balances
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="https://faucet.circle.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 px-3 py-1 text-xs font-semibold border border-info bg-info/10 hover:bg-info/20 text-info transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Circle USDC Faucet ↗</span>
          </a>
          <button
            onClick={handleClaimFaucet}
            disabled={isClaiming || !accountId}
            className="flex items-center justify-center gap-1.5 px-3 py-1 text-xs font-semibold bg-brand hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed text-background transition-colors"
          >
            <Droplets className="w-3.5 h-3.5" />
            {isClaiming ? "Dispensing Demo USDC..." : "[ CLAIM 500 DEMO USDC ]"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-3">
        <div className="p-3 bg-background border border-border">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span>Circle Testnet USDC</span>
            <span className="text-info ">[Canonical]</span>
          </div>
          <div className="text-xl font-bold text-foreground" suppressHydrationWarning>
            {userUsdc.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-xs ml-1.5 text-muted font-normal">USDC</span>
          </div>
          {userDemoUsdc > 0 && (
            <div className="text-[10px] text-muted mt-0.5" suppressHydrationWarning>
              + {userDemoUsdc.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Demo Faucet USDC
            </div>
          )}
          <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-xs">
            <span className="text-muted text-[11px] truncate max-w-[140px]" title={usdcId}>{usdcId}</span>
            <button
              onClick={() => handleCopy(usdcId, "Circle USDC")}
              className="text-muted hover:text-foreground transition-colors p-1"
              title="Copy Contract ID"
            >
              {copiedToken === "Circle USDC" ? (
                <Check className="w-3 h-3 text-brand" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>

        <div className="p-3 bg-background border border-border">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span>Your EURe Balance</span>
            <span className="text-brand ">[6 decimals]</span>
          </div>
          <div className="text-xl font-bold text-foreground" suppressHydrationWarning>
            {userEure.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-xs ml-1.5 text-muted font-normal">EURe</span>
          </div>
          <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-xs">
            <span className="text-muted text-[11px] truncate max-w-[140px]">{eureId}</span>
            <button
              onClick={() => handleCopy(eureId, "EURe")}
              className="text-muted hover:text-foreground transition-colors p-1"
              title="Copy Contract ID"
            >
              {copiedToken === "EURe" ? (
                <Check className="w-3 h-3 text-brand" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>

        <div className="p-3 bg-background border border-border">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span>Protocol Vault Reserve</span>
            <ShieldCheck className="w-3.5 h-3.5 text-muted" />
          </div>
          <div className="text-xl font-bold text-foreground" suppressHydrationWarning>
            {vaultEure.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-xs ml-1.5 text-muted font-normal">EURe</span>
          </div>
          <div className="mt-2 pt-2 border-t border-border text-[11px] text-muted" suppressHydrationWarning>
            Circle USDC Escrowed: <span className="text-info font-semibold">{vaultUsdc.toFixed(2)} USDC</span>
          </div>
        </div>
      </div>

      <div className="p-3 bg-zinc-900/60 border border-zinc-800/70 rounded text-xs text-zinc-400 flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ArrowRight className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span>
            <strong className="text-zinc-200 font-semibold">Circle Native USDC</strong> appears automatically in NEAR wallets without import. Import <code className="text-zinc-300 ">{eureId}</code> only for custom testnet EURe.
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <a
            href={`https://testnet.nearblocks.io/address/${usdcId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1 transition-colors"
          >
            USDC Explorer <ExternalLink className="w-2.5 h-2.5" />
          </a>
          <a
            href={`https://testnet.nearblocks.io/address/${eureId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1 transition-colors"
          >
            EURe Explorer <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>
    </Card>
  );
}

