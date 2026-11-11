"use client";

import { useState } from "react";
import {
  HelpCircle,
  X,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Wallet,
  ArrowRight,
  Info,
  Clock,
  AlertCircle,
} from "lucide-react";

interface FaucetGuideModalProps {
  usdcContractId: string;
  eureContractId: string;
  trigger?: React.ReactNode;
}

export function FaucetGuideModal({
  usdcContractId,
  eureContractId,
  trigger,
}: FaucetGuideModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(label);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <>
      {trigger ? (
        <div onClick={() => setIsOpen(true)} className="cursor-pointer inline-flex">
          {trigger}
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
          <span>How to Use & Wallet Setup</span>
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/60">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-emerald-950/80 border border-emerald-800 rounded">
                  <Info className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">
                    NEAR Testnet Stablecoin Faucet Guide
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Standard NEP-141 tokens with automated NEP-145 storage registration
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 space-y-5 overflow-y-auto text-xs text-zinc-300">
              {/* Step 1: Claiming Tokens */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-semibold text-zinc-100 text-sm">
                  <span className="flex items-center justify-center w-5 h-5 rounded bg-zinc-800 text-emerald-400 text-xs">
                    1
                  </span>
                  <span>How to Claim Testnet Stablecoins</span>
                </div>
                <div className="pl-7 space-y-1.5 text-zinc-400 leading-relaxed">
                  <p>
                    1. Open your NEAR wallet (Meteor, Sender, Here Wallet, or MyNearWallet) and copy your testnet account ID (for example, <code className="text-zinc-200 font-mono">alice.testnet</code>).
                  </p>
                  <p>
                    2. Paste the address into the faucet input box, select your token (<strong>USDC</strong> or <strong>EURe</strong>), and specify your desired amount (up to 500 tokens).
                  </p>
                  <p>
                    3. Click <strong>Request Tokens</strong>. The faucet sponsors your NEP-145 storage deposit, tops up first-time zero/low-NEAR wallets to 0.16 NEAR for gas &amp; wallet token import, and mints your requested tokens.
                  </p>
                </div>
              </div>

              {/* Faucet Limitations & Safety Rules */}
              <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    <span>Per-User Rate Limits &amp; Allocation Rules</span>
                  </div>
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-zinc-800 text-emerald-400 border border-zinc-700">
                    24h Cooldown
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px] text-zinc-400">
                  <div className="p-3 bg-zinc-950 rounded border border-zinc-800/80 space-y-1">
                    <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>Per-Account Limit</span>
                    </div>
                    <div className="text-zinc-400 leading-relaxed">
                      1 claim per NEAR testnet address every 24 hours. Entering a cooled-down account displays an active countdown timer.
                    </div>
                  </div>

                  <div className="p-3 bg-zinc-950 rounded border border-zinc-800/80 space-y-1">
                    <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>Per-IP Protection</span>
                    </div>
                    <div className="text-zinc-400 leading-relaxed">
                      Network-level rate limiting prevents multi-account automated scripts from exhausting operator gas reserves.
                    </div>
                  </div>

                  <div className="p-3 bg-zinc-950 rounded border border-zinc-800/80 space-y-1">
                    <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>Wallet Holding Cap</span>
                    </div>
                    <div className="text-zinc-400 leading-relaxed">
                      Max 2,500 tokens per wallet. If you hold 2,500+ tokens, trade them on GetNear before claiming more.
                    </div>
                  </div>

                  <div className="p-3 bg-zinc-950 rounded border border-zinc-800/80 space-y-1">
                    <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>Sponsored Storage &amp; Gas</span>
                    </div>
                    <div className="text-zinc-400 leading-relaxed">
                      Operator pays 0.00125 NEAR NEP-145 storage automatically, plus a one-time top-up to 0.16 NEAR (up to 2 new wallets per IP / 24h) so Meteor Wallet imports succeed on zero-balance accounts.
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2: Custom Token Importing */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-semibold text-zinc-100 text-sm">
                  <span className="flex items-center justify-center w-5 h-5 rounded bg-zinc-800 text-emerald-400 text-xs">
                    2
                  </span>
                  <span>How to View Tokens in Meteor / Browser Wallets</span>
                </div>
                <div className="pl-7 space-y-2 text-zinc-400">
                  <p>
                    Because these are standard NEP-141 tokens deployed for testnet simulation, import them into your wallet to monitor your balance:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* USDC Contract Box */}
                    <div className="p-3 bg-zinc-900 border border-zinc-800 rounded">
                      <div className="flex items-center justify-between font-semibold text-zinc-200 mb-1">
                        <span>USD Coin (USDC)</span>
                        <span className="text-[11px] text-zinc-500 font-mono">6 decimals</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 bg-zinc-950 p-1.5 rounded border border-zinc-800/80">
                        <span className="truncate max-w-[170px]">{usdcContractId}</span>
                        <button
                          onClick={() => handleCopy(usdcContractId, "USDC")}
                          className="p-1 hover:text-zinc-100 transition-colors"
                          title="Copy Contract Address"
                        >
                          {copiedToken === "USDC" ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* EURe Contract Box */}
                    <div className="p-3 bg-zinc-900 border border-zinc-800 rounded">
                      <div className="flex items-center justify-between font-semibold text-zinc-200 mb-1">
                        <span>Euro Stablecoin (EURe)</span>
                        <span className="text-[11px] text-zinc-500 font-mono">6 decimals</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 bg-zinc-950 p-1.5 rounded border border-zinc-800/80">
                        <span className="truncate max-w-[170px]">{eureContractId}</span>
                        <button
                          onClick={() => handleCopy(eureContractId, "EURe")}
                          className="p-1 hover:text-zinc-100 transition-colors"
                          title="Copy Contract Address"
                        >
                          {copiedToken === "EURe" ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 bg-zinc-900/50 border border-zinc-800/60 rounded text-[11px] text-zinc-400">
                    <strong className="text-zinc-200">Meteor Wallet:</strong> Go to <code className="text-zinc-300">Assets</code> &rarr; scroll down &rarr; click <code className="text-zinc-300">+ Add Custom Token</code> &rarr; paste the Contract ID above &rarr; Click Add.
                  </div>
                </div>
              </div>

              {/* Step 3: Testing on GetNear */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-semibold text-zinc-100 text-sm">
                  <span className="flex items-center justify-center w-5 h-5 rounded bg-zinc-800 text-emerald-400 text-xs">
                    3
                  </span>
                  <span>Use Tokens with GetNear Treasury Agent</span>
                </div>
                <div className="pl-7 space-y-2 text-zinc-400 leading-relaxed">
                  <p>
                    Once funded, you can create automated FX swap goals on GetNear. The autonomous agent runner reads 1Click/ECB rates, executes chunks, and settles real EURe directly into your wallet.
                  </p>
                  <a
                    href="https://testnet.nearblocks.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-emerald-400 hover:underline font-medium text-xs pt-0.5"
                  >
                    <span>View testnet transactions on NEARBlocks</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-zinc-800 bg-zinc-900/40 flex items-center justify-between text-xs text-zinc-500">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>NEP-141 / NEP-145 Compliant Faucet</span>
              </span>
              <button
                onClick={() => setIsOpen(false)}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
