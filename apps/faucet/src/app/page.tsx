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
  Clock,
} from "lucide-react";
import { useToast } from "@/components/toast";
import { FaucetGuideModal } from "@/components/faucet-guide-modal";
import { NearToken3D } from "@/components/near-token-3d";
import { ErrorBoundary } from "@/components/error-boundary";

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
  const [tokenChoice, setTokenChoice] = useState<"USDC" | "EURE">("USDC");
  const [amount, setAmount] = useState<string>("500");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [showContracts, setShowContracts] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState<number | null>(null);

  const numAmount = Number(amount);
  const isAmountValid = !isNaN(numAmount) && numAmount >= 1 && numAmount <= 500 && Number.isInteger(numAmount);

  const formatCooldown = (seconds: number): string => {
    if (seconds <= 0) return "0s";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  // Check cooldown when accountId changes
  useEffect(() => {
    const clean = accountId.trim().toLowerCase();
    if (!clean || !clean.endsWith(".testnet")) {
      setCooldownSeconds(null);
      return;
    }

    // 1. Optimistic check from local storage cache
    try {
      const stored = localStorage.getItem(`getnear_faucet_cooldown_${clean}`);
      if (stored) {
        const expiresAt = Number(stored);
        const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
        if (remaining > 0) {
          setCooldownSeconds(remaining);
        } else {
          localStorage.removeItem(`getnear_faucet_cooldown_${clean}`);
        }
      }
    } catch {}

    // 2. Authoritative check from server for this specific account
    const controller = new AbortController();
    fetch(`/api/cooldown?accountId=${encodeURIComponent(clean)}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.remainingSeconds === "number" && data.remainingSeconds > 0 && !data.allowed) {
          setCooldownSeconds(data.remainingSeconds);
          try {
            localStorage.setItem(
              `getnear_faucet_cooldown_${clean}`,
              (Date.now() + data.remainingSeconds * 1000).toString()
            );
          } catch {}
        } else {
          // Account is allowed: clear cooldown state and remove any stale local storage key
          setCooldownSeconds(null);
          try {
            localStorage.removeItem(`getnear_faucet_cooldown_${clean}`);
          } catch {}
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, [accountId]);

  // Cooldown countdown tick
  useEffect(() => {
    if (cooldownSeconds === null || cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev === null || prev <= 1) return null;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

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

    if (!isAmountValid) {
      showToast("Invalid Token Amount", {
        type: "error",
        description: "Please specify an integer amount between 1 and 500 tokens.",
      });
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
          amount: numAmount,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        if (res.status === 429 && typeof data.remainingSeconds === "number" && !data.error?.toLowerCase().includes("rapid")) {
          setCooldownSeconds(data.remainingSeconds);
          try {
            localStorage.setItem(
              `getnear_faucet_cooldown_${cleanAddress}`,
              (Date.now() + data.remainingSeconds * 1000).toString()
            );
          } catch {}
        }
        throw new Error(data.error || "Failed to dispense tokens");
      }

      setLastResult({
        receiverId: data.receiverId,
        tokens: data.dispensed,
        balances: data.balances,
      });

      // Record 24-hour cooldown on successful claim
      setCooldownSeconds(24 * 3600);
      try {
        localStorage.setItem(
          `getnear_faucet_cooldown_${cleanAddress}`,
          (Date.now() + 24 * 3600 * 1000).toString()
        );
      } catch {}

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
                      onChange={(e) => setTokenChoice(e.target.value as "USDC" | "EURE")}
                      className="w-full appearance-none bg-[#0c0e13] border border-[#222634] focus:border-[#00ec97] rounded-xl px-4 py-3.5 text-sm text-zinc-200 font-medium focus:outline-none transition-colors cursor-pointer"
                    >
                      <option value="USDC">USD Coin (USDC)</option>
                      <option value="EURE">Euro Stablecoin (EURe)</option>
                    </select>
                    <div className="absolute right-4 top-4 pointer-events-none text-zinc-400">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {/* Token Amount Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <label htmlFor="token-amount" className="block text-xs font-medium text-zinc-300">
                        Token Amount
                      </label>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00ec97]" />
                    </div>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      Max: 500 {tokenChoice}
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      id="token-amount"
                      type="number"
                      min="1"
                      max="500"
                      step="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="e.g., 500"
                      className="w-full bg-[#0c0e13] border border-[#222634] focus:border-[#00ec97] rounded-xl px-4 py-3.5 pr-20 text-sm text-zinc-100 placeholder-[#525866] font-mono focus:outline-none transition-colors"
                      disabled={isSubmitting}
                    />
                    <div className="absolute right-3 top-2.5 flex items-center px-2.5 py-1 rounded bg-[#1a1d26] border border-[#262a38] text-xs font-mono font-semibold text-zinc-300 pointer-events-none">
                      {tokenChoice}
                    </div>
                  </div>

                  {/* Preset Amount Pills */}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Presets:</span>
                    {[50, 100, 250, 500].map((preset) => {
                      const isActive = Number(amount) === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setAmount(preset.toString())}
                          className={`px-2.5 py-1 text-xs rounded-lg font-mono transition-colors border cursor-pointer ${
                            isActive
                              ? "bg-[#00ec97]/15 border-[#00ec97] text-[#00ec97] font-semibold"
                              : "bg-[#0e1117] border-[#222634] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                          }`}
                        >
                          {preset === 500 ? "500 (Max)" : preset}
                        </button>
                      );
                    })}
                  </div>

                  {/* Inline Validation Error Message */}
                  {amount !== "" && !isAmountValid && (
                    <p className="text-[11px] text-rose-400 font-medium">
                      {numAmount > 500
                        ? `Maximum claim limit is 500 ${tokenChoice} per request.`
                        : `Please enter an integer between 1 and 500.`}
                    </p>
                  )}
                </div>

                {/* Active Rate Limit Cooldown Warning Box */}
                {cooldownSeconds !== null && cooldownSeconds > 0 && (
                  <div className="p-3.5 rounded-xl border border-amber-900/60 bg-amber-950/20 text-amber-300 text-xs space-y-1 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between font-semibold">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-amber-400" />
                        <span>Rate Limit Active</span>
                      </div>
                      <span className="font-mono text-amber-200 text-[11px] px-2 py-0.5 rounded bg-amber-900/50 border border-amber-700/60">
                        {formatCooldown(cooldownSeconds)} remaining
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-400/80 leading-relaxed">
                      This account is currently on cooldown. Faucet is limited to 1 request per address every 24 hours.
                    </p>
                  </div>
                )}

                {/* Main Bright Green CTA Button */}
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    !accountId ||
                    !isAmountValid ||
                    (cooldownSeconds !== null && cooldownSeconds > 0)
                  }
                  className="w-full py-4 px-4 rounded-xl bg-[#00ec97] hover:bg-[#00c980] disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#00ec97]/10 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-black" />
                      <span>Broadcasting On-Chain Transactions...</span>
                    </>
                  ) : cooldownSeconds !== null && cooldownSeconds > 0 ? (
                    <span className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-black" />
                      <span>Cooldown Active ({formatCooldown(cooldownSeconds)})</span>
                    </span>
                  ) : (
                    <span>
                      Request {isAmountValid ? numAmount : 500} {tokenChoice}
                    </span>
                  )}
                </button>

                {/* Cooldown & Limitation Note */}
                <div className="space-y-1 text-center">
                  <p className="text-[11px] text-zinc-400">
                    Note: Limited to one request per address every 24 hours.
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    Max allocation: 500 tokens/asset &bull; Wallet holding cap: 2,500 tokens
                  </p>
                </div>
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

          {/* Right Column: Interactive 3D NEAR Token Model with Error Boundary */}
          <div className="lg:col-span-5 hidden lg:flex items-center justify-center pl-4">
            <ErrorBoundary>
              <NearToken3D className="w-full max-w-[440px]" />
            </ErrorBoundary>
          </div>
        </div>
      </main>
    </div>
  );
}
