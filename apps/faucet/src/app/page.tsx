"use client";

import { useState, useEffect } from "react";
import {
  Coins,
  Droplets,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  RefreshCw,
  Wallet,
  ArrowRight,
  Clipboard,
  Activity,
} from "lucide-react";
import { useToast } from "@/components/toast";
import { FaucetGuideModal } from "@/components/faucet-guide-modal";

interface FaucetStatus {
  operatorId: string;
  operatorNearBalance: number;
  usdcContractId: string;
  eureContractId: string;
  usdcTotalSupply: number;
  eureTotalSupply: number;
  networkId: string;
}

interface DispensedToken {
  symbol: string;
  contractId: string;
  amount: number;
  txHash: string;
  explorerUrl: string;
}

export default function FaucetHome() {
  const { showToast } = useToast();

  const [accountId, setAccountId] = useState("");
  const [tokenChoice, setTokenChoice] = useState<"USDC" | "EURE" | "BOTH">("BOTH");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const [status, setStatus] = useState<FaucetStatus>({
    operatorId: "chilliroger-operator.testnet",
    operatorNearBalance: 0,
    usdcContractId: "usdc.chilliroger-operator.testnet",
    eureContractId: "eure.chilliroger-operator.testnet",
    usdcTotalSupply: 1000000,
    eureTotalSupply: 1000000,
    networkId: "testnet",
  });

  const [lastResult, setLastResult] = useState<{
    receiverId: string;
    tokens: DispensedToken[];
    balances: { usdc: number; eure: number };
  } | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const data = await res.json();
        if (data.status) setStatus(data.status);
      }
    } catch (err) {
      console.warn("Could not fetch status:", err);
    }
  };

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(label);
    showToast(`${label} copied to clipboard`, { type: "info" });
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setAccountId(text.trim().toLowerCase());
        showToast("Address pasted from clipboard", { type: "info" });
      }
    } catch {
      showToast("Unable to read clipboard", { type: "error" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAddress = accountId.trim().toLowerCase();

    if (!cleanAddress) {
      showToast("Please enter a NEAR testnet account ID", { type: "error" });
      return;
    }

    if (!cleanAddress.endsWith(".testnet")) {
      showToast("Account ID must end with .testnet", { type: "error" });
      return;
    }

    setIsSubmitting(true);
    setLastResult(null);

    try {
      const res = await fetch("/api/dispense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: cleanAddress,
          token: tokenChoice,
          amount: 500,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to dispense tokens");
      }

      setLastResult({
        receiverId: data.receiverId,
        tokens: data.dispensed,
        balances: data.balances,
      });

      showToast("Tokens Dispensed Successfully!", {
        type: "success",
        description: `Delivered to ${cleanAddress} with on-chain receipts`,
      });

      fetchStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error dispensing tokens";
      showToast("Faucet Request Failed", {
        type: "error",
        description: msg,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between p-4 sm:p-6 md:p-10 max-w-4xl mx-auto">
      {/* Top Navigation */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-950 border border-emerald-800 rounded-lg">
            <Coins className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-zinc-100 tracking-tight">
                NEAR Stablecoin Faucet
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-zinc-800 text-emerald-400 border border-zinc-700">
                TESTNET
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Official NEP-141 Testnet Dispenser for USDC & EURe
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <FaucetGuideModal
            usdcContractId={status.usdcContractId}
            eureContractId={status.eureContractId}
          />

          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-zinc-800 bg-zinc-900 text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-[11px]">RPC: Healthy</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="my-8 space-y-6">
        {/* Main Dispenser Card */}
        <div className="p-6 sm:p-8 rounded-xl border border-zinc-800 bg-zinc-900/60 shadow-xl space-y-6">
          <div>
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <Droplets className="w-4 h-4 text-emerald-400" />
              <span>Claim Testnet Stablecoins</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Enter any NEAR testnet address. The faucet automatically funds your NEP-145 storage deposit and mints standard fungible tokens.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Address Input */}
            <div className="space-y-1.5">
              <label htmlFor="near-account-input" className="block text-xs font-medium text-zinc-300">
                NEAR Testnet Account ID
              </label>
              <div className="relative">
                <input
                  id="near-account-input"
                  type="text"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value.toLowerCase())}
                  placeholder="your-wallet.testnet"
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={handlePaste}
                  className="absolute right-2 top-2 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 rounded flex items-center gap-1 transition-colors"
                >
                  <Clipboard className="w-3 h-3" />
                  <span>Paste</span>
                </button>
              </div>
              <p className="text-[11px] text-zinc-500">
                Supports Meteor Wallet, Sender, Here Wallet, MyNearWallet, or any testnet account.
              </p>
            </div>

            {/* Token Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">
                Select Token(s) to Receive
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setTokenChoice("BOTH")}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    tokenChoice === "BOTH"
                      ? "border-emerald-500 bg-emerald-950/40 text-emerald-200"
                      : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900"
                  }`}
                >
                  <div className="font-semibold text-xs flex items-center justify-between">
                    <span>Both (USDC + EURe)</span>
                    <span className="text-[10px] uppercase font-mono px-1 rounded bg-zinc-800 text-emerald-400">
                      Popular
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">500 USDC + 500 EURe</div>
                </button>

                <button
                  type="button"
                  onClick={() => setTokenChoice("USDC")}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    tokenChoice === "USDC"
                      ? "border-blue-500 bg-blue-950/40 text-blue-200"
                      : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900"
                  }`}
                >
                  <div className="font-semibold text-xs">USDC Only</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">500 Testnet USDC</div>
                </button>

                <button
                  type="button"
                  onClick={() => setTokenChoice("EURE")}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    tokenChoice === "EURE"
                      ? "border-emerald-500 bg-emerald-950/40 text-emerald-200"
                      : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900"
                  }`}
                >
                  <div className="font-semibold text-xs">EURe Only</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">500 Testnet EURe</div>
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || !accountId}
              className="w-full py-3 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Broadcasting On-Chain Transactions...</span>
                </>
              ) : (
                <>
                  <Droplets className="w-4 h-4" />
                  <span>
                    Dispense {tokenChoice === "BOTH" ? "1,000" : "500"} Testnet Tokens
                  </span>
                </>
              )}
            </button>
          </form>

          {/* Success Result Box */}
          {lastResult && (
            <div className="p-4 rounded-lg border border-emerald-800 bg-emerald-950/30 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                <Check className="w-4 h-4" />
                <span>Successfully Dispensed to {lastResult.receiverId}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {lastResult.tokens.map((t) => (
                  <div key={t.symbol} className="p-2.5 bg-zinc-950 border border-zinc-800 rounded">
                    <div className="flex justify-between font-semibold text-zinc-200">
                      <span>+{t.amount} {t.symbol}</span>
                      <a
                        href={t.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:underline inline-flex items-center gap-1 font-mono text-[11px]"
                      >
                        Receipt <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono mt-1 truncate">
                      Tx: {t.txHash.slice(0, 20)}...
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/60">
                <span>Updated Balances:</span>
                <span className="font-mono text-zinc-200">
                  {lastResult.balances.usdc.toLocaleString()} USDC | {lastResult.balances.eure.toLocaleString()} EURe
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Token Contracts & Faucet Reserves Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* USDC Box */}
          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="font-semibold text-zinc-200">USD Coin (USDC)</span>
              </div>
              <span className="text-[11px] font-mono text-zinc-400">6 Decimals</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-zinc-400">
              <span className="truncate max-w-[240px]">{status.usdcContractId}</span>
              <button
                onClick={() => handleCopy(status.usdcContractId, "USDC Contract ID")}
                className="hover:text-zinc-200 p-1"
                title="Copy Address"
              >
                {copiedToken === "USDC Contract ID" ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>
            <div className="flex justify-between text-[11px] text-zinc-500 pt-1">
              <span>Total Minted: {status.usdcTotalSupply.toLocaleString()} USDC</span>
              <a
                href={`https://testnet.nearblocks.io/address/${status.usdcContractId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1"
              >
                NEARBlocks <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>

          {/* EURe Box */}
          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="font-semibold text-zinc-200">Euro Stablecoin (EURe)</span>
              </div>
              <span className="text-[11px] font-mono text-zinc-400">6 Decimals</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-zinc-400">
              <span className="truncate max-w-[240px]">{status.eureContractId}</span>
              <button
                onClick={() => handleCopy(status.eureContractId, "EURe Contract ID")}
                className="hover:text-zinc-200 p-1"
                title="Copy Address"
              >
                {copiedToken === "EURe Contract ID" ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>
            <div className="flex justify-between text-[11px] text-zinc-500 pt-1">
              <span>Total Minted: {status.eureTotalSupply.toLocaleString()} EURe</span>
              <a
                href={`https://testnet.nearblocks.io/address/${status.eureContractId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1"
              >
                NEARBlocks <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Banner Link to GetNear */}
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-zinc-400">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>
              Claimed tokens can be swapped with automated TWAP scheduling on <strong className="text-zinc-200">GetNear Treasury FX Agent</strong>.
            </span>
          </div>
          <a
            href="https://github.com/ChilliRoger/GetNear"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-emerald-400 hover:underline font-medium text-xs whitespace-nowrap"
          >
            <span>Explore GetNear Platform</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="pt-6 border-t border-zinc-800 text-xs text-zinc-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div>
          <span>NEAR Testnet Stablecoin Faucet &bull; Built with standard NEP-141 / NEP-145 protocols</span>
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px]">
          <a
            href="https://testnet.nearblocks.io"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-300 transition-colors"
          >
            NEARBlocks Explorer
          </a>
          <a
            href="https://docs.near.org"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-300 transition-colors"
          >
            NEAR Docs
          </a>
        </div>
      </footer>
    </div>
  );
}
