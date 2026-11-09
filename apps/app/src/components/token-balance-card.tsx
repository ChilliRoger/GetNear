"use client";

import { useState } from "react";
import { Card } from "@/components/card";
import { useToast } from "@/components/toast-provider";
import { Coins, Copy, Check, Droplets, ExternalLink, ArrowRight, ShieldCheck } from "lucide-react";

interface TokenBalanceCardProps {
  accountId: string | null;
  userUsdc: number;
  userEure: number;
  vaultEure: number;
  usdcId: string;
  eureId: string;
  onRefresh: () => void;
}

export function TokenBalanceCard({
  accountId,
  userUsdc,
  userEure,
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
        headers: { "Content-Type": "application/json" },
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-emerald-400" />
          <span className="text-xs text-zinc-300">
            Automated liquidity reserves & user balances
          </span>
        </div>

        <button
          onClick={handleClaimFaucet}
          disabled={isClaiming || !accountId}
          className="flex items-center justify-center gap-1.5 px-3 py-1 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
        >
          <Droplets className="w-3.5 h-3.5" />
          {isClaiming ? "Dispensing 500 USDC..." : "Claim 500 Testnet USDC"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4">
        <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span>Your USDC Balance</span>
            <span className="text-blue-400 font-mono">6 decimals</span>
          </div>
          <div className="text-xl font-bold font-mono text-zinc-100">
            {userUsdc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-xs ml-1.5 text-zinc-400 font-normal">USDC</span>
          </div>
          <div className="mt-2 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs">
            <span className="text-zinc-500 font-mono text-[11px] truncate max-w-[140px]">{usdcId}</span>
            <button
              onClick={() => handleCopy(usdcId, "USDC")}
              className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
              title="Copy Contract ID"
            >
              {copiedToken === "USDC" ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>

        <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span>Your EURe Balance</span>
            <span className="text-emerald-400 font-mono">6 decimals</span>
          </div>
          <div className="text-xl font-bold font-mono text-zinc-100">
            {userEure.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-xs ml-1.5 text-zinc-400 font-normal">EURe</span>
          </div>
          <div className="mt-2 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs">
            <span className="text-zinc-500 font-mono text-[11px] truncate max-w-[140px]">{eureId}</span>
            <button
              onClick={() => handleCopy(eureId, "EURe")}
              className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
              title="Copy Contract ID"
            >
              {copiedToken === "EURe" ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>

        <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span>Protocol Vault Reserve</span>
            <ShieldCheck className="w-3.5 h-3.5 text-zinc-500" />
          </div>
          <div className="text-xl font-bold font-mono text-zinc-100">
            {vaultEure.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-xs ml-1.5 text-zinc-400 font-normal">EURe</span>
          </div>
          <div className="mt-2 pt-2 border-t border-zinc-800/80 text-xs text-zinc-500">
            Automated liquidity reserve for chunk settlements
          </div>
        </div>
      </div>

      <div className="p-3 bg-zinc-900/60 border border-zinc-800/70 rounded text-xs text-zinc-400 flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ArrowRight className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span>
            To view balances in <strong className="text-zinc-200 font-semibold">Meteor Wallet</strong>: Assets &rarr; Add Custom Token &rarr; paste the contract IDs above.
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px]">
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

