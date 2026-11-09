"use client";

import { useState, useEffect } from "react";
import {
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Clipboard,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/components/toast";
import { FaucetGuideModal } from "@/components/faucet-guide-modal";
import { NearToken3D } from "@/components/near-token-3d";

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
  const [tokenChoice, setTokenChoice] = useState<"BOTH" | "USDC" | "EURE">("BOTH");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [showContracts, setShowContracts] = useState(false);

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
    <div className="min-h-screen near-grid-bg text-white flex flex-col justify-between selection:bg-[#00ec97] selection:text-black">
      {/* Top Navbar */}
      <header className="w-full max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-4 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#00ec97] flex items-center justify-center p-1.5 shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-black stroke-current stroke-[2.5]">
              <path d="M4 19V5l12 14V5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg font-bold tracking-tight text-white">
              NEAR Faucet
            </span>
            <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-[#13151b] text-[#00ec97] border border-[#222634]">
              TESTNET
            </span>
          </div>
        </div>

        {/* Right Actions: How it Works */}
        <div className="flex items-center gap-3">
          <FaucetGuideModal
            usdcContractId={status.usdcContractId}
            eureContractId={status.eureContractId}
            trigger={
              <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-[#222634] bg-[#13151b] text-zinc-300 hover:text-white hover:border-zinc-600 transition-colors cursor-pointer">
                <span>How it Works</span>
              </button>
            }
          />
        </div>
      </header>

      {/* Hero Section: Two-Column Split */}
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 md:py-12 flex-1 flex items-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left Column: Floating Faucet Card */}
          <div className="lg:col-span-7">
            <div className="bg-[#13151b] border border-[#222634] rounded-2xl p-6 sm:p-8 md:p-9 shadow-2xl space-y-6">
              {/* Card Header */}
              <div>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                  NEAR Faucet
                </h1>
                <p className="text-xs sm:text-sm text-zinc-400 mt-2 leading-relaxed">
                  Get free testnet USDC &amp; EURe to build and test your dApps.
                </p>
              </div>

              {/* Faucet Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Account ID Input */}
                <div className="space-y-2">
                  <label htmlFor="account-address" className="block text-xs font-medium text-zinc-300">
                    Enter your Account ID or Address
                  </label>
                  <div className="relative">
                    <input
                      id="account-address"
                      type="text"
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value.toLowerCase())}
                      placeholder="e.g., wallet.testnet or 0x..."
                      className="w-full bg-[#0c0e13] border border-[#222634] focus:border-[#00ec97] rounded-xl px-4 py-3.5 text-sm text-zinc-100 placeholder-[#525866] font-mono focus:outline-none transition-colors"
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      onClick={handlePaste}
                      className="absolute right-2.5 top-2.5 px-2.5 py-1 text-xs text-zinc-400 hover:text-white bg-[#1a1d26] border border-[#262a38] rounded-md flex items-center gap-1 transition-colors cursor-pointer"
                      title="Paste from clipboard"
                    >
                      <Clipboard className="w-3 h-3" />
                      <span>Paste</span>
                    </button>
                  </div>
                </div>

                {/* Token Selector Dropdown */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="block text-xs font-medium text-zinc-300">
                      Select Token
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00ec97]" />
                  </div>
                  <div className="relative">
                    <select
                      value={tokenChoice}
                      onChange={(e) => setTokenChoice(e.target.value as "BOTH" | "USDC" | "EURE")}
                      className="w-full appearance-none bg-[#0c0e13] border border-[#222634] focus:border-[#00ec97] rounded-xl px-4 py-3.5 text-sm text-zinc-200 font-medium focus:outline-none transition-colors cursor-pointer"
                    >
                      <option value="BOTH">Both (500 USDC + 500 EURe)</option>
                      <option value="USDC">USD Coin (500 USDC)</option>
                      <option value="EURE">Euro Stablecoin (500 EURe)</option>
                    </select>
                    <div className="absolute right-4 top-4 pointer-events-none text-zinc-400">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {/* Main Bright Green CTA Button */}
                <button
                  type="submit"
                  disabled={isSubmitting || !accountId}
                  className="w-full py-4 px-4 rounded-xl bg-[#00ec97] hover:bg-[#00c980] disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#00ec97]/10 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-black" />
                      <span>Broadcasting On-Chain Transactions...</span>
                    </>
                  ) : (
                    <span>
                      Request {tokenChoice === "BOTH" ? "1,000 (USDC + EURe)" : tokenChoice === "USDC" ? "500 USDC" : "500 EURe"}
                    </span>
                  )}
                </button>

                {/* Cooldown Note */}
                <p className="text-[11px] text-zinc-500 text-center">
                  Note: Limited to one request per address every 10 minutes.
                </p>
              </form>

              {/* On-Chain Success Receipt Box */}
              {lastResult && (
                <div className="p-4 rounded-xl border border-[#00ec97]/30 bg-[#0c1712] space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 text-[#00ec97] font-semibold text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Successfully Dispensed to {lastResult.receiverId}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    {lastResult.tokens.map((t) => (
                      <div key={t.symbol} className="p-2.5 bg-[#090b0e] border border-[#1e2330] rounded-lg">
                        <div className="flex justify-between font-semibold text-zinc-200">
                          <span>+{t.amount} {t.symbol}</span>
                          <a
                            href={t.explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#00ec97] hover:underline inline-flex items-center gap-1 font-mono text-[11px]"
                          >
                            Receipt <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono mt-1 truncate">
                          Tx: {t.txHash.slice(0, 18)}...
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-2 border-t border-[#1c2420]">
                    <span>Updated Balances:</span>
                    <span className="font-mono text-zinc-200" suppressHydrationWarning>
                      {lastResult.balances.usdc.toLocaleString("en-US")} USDC | {lastResult.balances.eure.toLocaleString("en-US")} EURe
                    </span>
                  </div>
                </div>
              )}

              {/* Collapsible Token Contract IDs for Wallet Import */}
              <div className="pt-2 border-t border-[#1d222e]">
                <button
                  type="button"
                  onClick={() => setShowContracts(!showContracts)}
                  className="flex items-center justify-between w-full text-xs text-zinc-400 hover:text-zinc-200 transition-colors py-1 cursor-pointer"
                >
                  <span className="font-medium">NEP-141 Token Contracts &amp; Explorer</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      showContracts ? "rotate-180 text-[#00ec97]" : ""
                    }`}
                  />
                </button>

                {showContracts && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs animate-in fade-in duration-150">
                    {/* USDC Mini Card */}
                    <div className="p-3 bg-[#0c0e13] border border-[#222634] rounded-lg space-y-1.5">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="font-semibold text-zinc-200">USD Coin (USDC)</span>
                        <span className="font-mono text-zinc-500">6 decimals</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 bg-[#13151b] p-1.5 rounded">
                        <span className="truncate max-w-[150px]">{status.usdcContractId}</span>
                        <button
                          onClick={() => handleCopy(status.usdcContractId, "USDC Contract ID")}
                          className="hover:text-white p-0.5 cursor-pointer"
                          title="Copy Address"
                        >
                          {copiedToken === "USDC Contract ID" ? (
                            <Check className="w-3 h-3 text-[#00ec97]" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      <div className="flex justify-between text-[10px] text-zinc-500 pt-0.5">
                        <span suppressHydrationWarning>
                          Supply: {status.usdcTotalSupply.toLocaleString("en-US")}
                        </span>
                        <a
                          href={`https://testnet.nearblocks.io/address/${status.usdcContractId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#00ec97] hover:underline inline-flex items-center gap-0.5"
                        >
                          NEARBlocks <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>

                    {/* EURe Mini Card */}
                    <div className="p-3 bg-[#0c0e13] border border-[#222634] rounded-lg space-y-1.5">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="font-semibold text-zinc-200">Euro Stablecoin (EURe)</span>
                        <span className="font-mono text-zinc-500">6 decimals</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 bg-[#13151b] p-1.5 rounded">
                        <span className="truncate max-w-[150px]">{status.eureContractId}</span>
                        <button
                          onClick={() => handleCopy(status.eureContractId, "EURe Contract ID")}
                          className="hover:text-white p-0.5 cursor-pointer"
                          title="Copy Address"
                        >
                          {copiedToken === "EURe Contract ID" ? (
                            <Check className="w-3 h-3 text-[#00ec97]" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      <div className="flex justify-between text-[10px] text-zinc-500 pt-0.5">
                        <span suppressHydrationWarning>
                          Supply: {status.eureTotalSupply.toLocaleString("en-US")}
                        </span>
                        <a
                          href={`https://testnet.nearblocks.io/address/${status.eureContractId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#00ec97] hover:underline inline-flex items-center gap-0.5"
                        >
                          NEARBlocks <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Interactive 3D NEAR Token Model */}
          <div className="lg:col-span-5 hidden lg:flex items-center justify-center pl-4">
            <NearToken3D className="w-full max-w-[440px]" />
          </div>
        </div>
      </main>

      {/* Bottom Status Bar Ticker */}
      <footer className="w-full border-t border-[#1a1d26] py-3.5 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-400">
          {/* Ticker items */}
          <div className="flex flex-wrap items-center gap-5 sm:gap-7">
            {/* Status Online */}
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00ec97] animate-pulse" />
              <span>Status: <strong className="text-zinc-200 font-medium">Online</strong></span>
            </div>

            {/* Faucet Reserves */}
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00ec97]" />
              <span suppressHydrationWarning>
                Faucet Balance: <strong className="text-zinc-200 font-mono font-medium">{status.usdcTotalSupply.toLocaleString("en-US")} USDC</strong>
              </span>
            </div>

            {/* Network */}
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00ec97]" />
              <span>Network: <strong className="text-zinc-200 font-medium">NEAR Testnet</strong></span>
            </div>

            {/* Operator Account */}
            <div className="hidden md:flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00ec97]" />
              <span>Operator: <strong className="text-zinc-200 font-mono font-normal">{status.operatorId}</strong></span>
            </div>
          </div>

          {/* Right Decorative 4-Point Sparkle Star */}
          <div className="hidden sm:block text-zinc-700">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M12 2L14.2 9.8L22 12L14.2 14.2L12 22L9.8 14.2L2 12L9.8 9.8L12 2Z" />
            </svg>
          </div>
        </div>
      </footer>
    </div>
  );
}
