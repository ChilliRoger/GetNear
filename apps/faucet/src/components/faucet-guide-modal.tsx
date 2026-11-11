"use client";

import { useEffect, useRef, useState } from "react";
import { animate, createScope, createTimeline, stagger } from "animejs";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  HelpCircle,
  Info,
  ShieldCheck,
  X,
} from "lucide-react";

type ModalMode = "guide" | "tutorial";

interface FaucetGuideModalProps {
  usdcContractId: string;
  eureContractId: string;
  trigger?: React.ReactNode;
}

interface TutorialStep {
  title: string;
  summary: string;
  bullets: string[];
  actionLabel?: string;
  actionHref?: string;
  showContracts?: boolean;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: "Create or Open a Testnet Wallet",
    summary: "Set up a .testnet account so the faucet has an address to fund.",
    bullets: [
      "Open Meteor Wallet and switch your network to Testnet.",
      "Create a new account (for example, yourname.testnet) and copy the Account ID.",
      "New testnet wallets start at 0 NEAR — you do not need to pre-fund gas manually.",
    ],
    actionLabel: "Open Meteor Wallet",
    actionHref: "https://wallet.meteorwallet.app/",
  },
  {
    title: "Request Tokens from This Faucet",
    summary: "Submit your address, token, and amount in the faucet form.",
    bullets: [
      "Paste your .testnet Account ID, select USDC or EURe, and choose 1 to 500 tokens.",
      "Click Request. On your first claim, the faucet sponsors 0.00125 NEAR token storage plus a one-time ~0.45 NEAR import/gas stipend.",
      "Tokens are sent via ft_transfer so wallets and indexers detect your balance.",
    ],
  },
  {
    title: "Copy the Token Contract ID",
    summary: "Copy the contract address for the asset you just claimed.",
    bullets: [
      "Use one of the contract IDs below before switching back to your wallet.",
    ],
    showContracts: true,
  },
  {
    title: "Import Token in Meteor Wallet",
    summary: "Register the custom testnet token inside Meteor Wallet.",
    bullets: [
      "Open Meteor Wallet, click Import Token, and paste the contract ID.",
      "Wait for your token balance to load, then click Add Selected Token and approve.",
      "Approval locks ~0.43 NEAR upfront for NEP-642 gas and Ref registration, then refunds ~0.33 NEAR afterward.",
    ],
    actionLabel: "Go to Meteor Wallet",
    actionHref: "https://wallet.meteorwallet.app/wallet",
  },
  {
    title: "Refresh Assets and Verify",
    summary: "Confirm your balance appears in My Assets and on-chain.",
    bullets: [
      "Return to My Assets in Meteor Wallet and click Refresh to display your token.",
      "About ~0.35 NEAR remains in your wallet for swaps and transaction fees.",
      "Inspect full transaction receipts anytime on Testnet NEARBlocks.",
    ],
    actionLabel: "Open NEARBlocks Testnet",
    actionHref: "https://testnet.nearblocks.io",
  },
];

const LIMIT_RULES = [
  { label: "Per Request", value: "1 - 500 USDC / EURe" },
  { label: "Cooldown", value: "1 claim / 24h per account" },
  { label: "Wallet Cap", value: "2,500 tokens max balance" },
  { label: "Gas Stipend", value: "~0.45 NEAR once per new wallet (2 / IP / 24h)" },
];

interface TokenContractCardsProps {
  usdcContractId: string;
  eureContractId: string;
  copiedToken: string | null;
  onCopy: (text: string, label: string) => void;
}

function TokenContractCards({
  usdcContractId,
  eureContractId,
  copiedToken,
  onCopy,
}: TokenContractCardsProps) {
  const tokens = [
    { symbol: "USDC", name: "USD Coin (USDC)", contractId: usdcContractId },
    { symbol: "EURe", name: "Euro Stablecoin (EURe)", contractId: eureContractId },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {tokens.map((item) => (
        <div
          key={item.symbol}
          className="p-3 bg-[#13151b] border border-[#222634] rounded-lg space-y-2"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
            <span>{item.name}</span>
            <span className="text-[11px] font-mono font-normal text-zinc-500">6 decimals</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-zinc-300 bg-[#0b0c10] px-2.5 py-1.5 rounded border border-[#222634]">
            <span className="truncate">{item.contractId}</span>
            <button
              type="button"
              onClick={() => onCopy(item.contractId, item.symbol)}
              className="p-1 text-zinc-400 hover:text-[#00ec97] transition-colors shrink-0 cursor-pointer"
              title={`Copy ${item.symbol} Contract ID`}
              aria-label={`Copy ${item.symbol} Contract ID`}
            >
              {copiedToken === item.symbol ? (
                <Check className="w-3.5 h-3.5 text-[#00ec97]" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          <a
            href={`https://testnet.nearblocks.io/address/${item.contractId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-[#00ec97] hover:underline"
          >
            <span>NEARBlocks Explorer</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      ))}
    </div>
  );
}

export function FaucetGuideModal({
  usdcContractId,
  eureContractId,
  trigger,
}: FaucetGuideModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<ModalMode>("guide");
  const [tutorialStep, setTutorialStep] = useState(0);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const openModal = (initialMode: ModalMode) => {
    setMode(initialMode);
    if (initialMode === "tutorial") {
      setTutorialStep(0);
    }
    setIsOpen(true);
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(label);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scope = createScope({ root: panelRef.current }).add(() => {
      animate(".modal-panel", {
        opacity: [0, 1],
        translateY: reduced ? [0, 0] : [12, 0],
        scale: reduced ? [1, 1] : [0.98, 1],
        duration: reduced ? 1 : 320,
        ease: reduced ? "linear" : "outExpo",
      });

      animate(".reveal-item", {
        opacity: [0, 1],
        translateY: reduced ? [0, 0] : [8, 0],
        delay: reduced ? 0 : stagger(45),
        duration: reduced ? 1 : 340,
        ease: reduced ? "linear" : "outExpo",
      });
    });

    return () => scope.revert();
  }, [isOpen, mode]);

  useEffect(() => {
    if (!isOpen || mode !== "tutorial" || !panelRef.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scope = createScope({ root: panelRef.current }).add(() => {
      const tl = createTimeline({
        defaults: {
          duration: reduced ? 1 : 260,
          ease: reduced ? "linear" : "outExpo",
        },
      });
      tl.add(".tutorial-step-card", {
        opacity: [0, 1],
        translateX: reduced ? [0, 0] : [10, 0],
      });
    });

    return () => scope.revert();
  }, [isOpen, mode, tutorialStep]);

  const activeStep = TUTORIAL_STEPS[tutorialStep];
  const isLastStep = tutorialStep === TUTORIAL_STEPS.length - 1;

  return (
    <>
      {trigger ? (
        <div onClick={() => openModal("guide")} className="cursor-pointer inline-flex">
          {trigger}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openModal("tutorial")}
            className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium rounded-lg border border-[#00ec97]/40 bg-[#13151b] text-[#00ec97] hover:bg-[#191c26] hover:border-[#00ec97] transition-colors whitespace-nowrap cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Tutorial</span>
          </button>

          <button
            type="button"
            onClick={() => openModal("guide")}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-medium rounded-lg border border-[#222634] bg-[#13151b] text-zinc-200 hover:text-white hover:border-zinc-500 transition-colors whitespace-nowrap cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 text-[#00ec97]" />
            <span>How it Works</span>
          </button>
        </div>
      )}

      {isOpen && (
        <div
          ref={panelRef}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
          role="dialog"
          aria-modal="true"
          aria-labelledby="faucet-help-title"
        >
          <div className="modal-panel relative w-full max-w-xl bg-[#0b0c10] border border-[#222634] rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#222634] bg-[#13151b]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#0b0c10] border border-[#222634] rounded-lg text-[#00ec97]">
                  {mode === "tutorial" ? (
                    <BookOpen className="w-4 h-4" />
                  ) : (
                    <Info className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h3 id="faucet-help-title" className="text-sm font-semibold text-zinc-100">
                    {mode === "tutorial"
                      ? "New User Setup Tutorial"
                      : "NEAR Testnet Faucet Guide"}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    {mode === "tutorial"
                      ? `Step ${tutorialStep + 1} of ${TUTORIAL_STEPS.length} — zero balance to wallet ready`
                      : "Quick steps, limits, and token contract addresses"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (mode === "guide") {
                      setMode("tutorial");
                      setTutorialStep(0);
                    } else {
                      setMode("guide");
                    }
                  }}
                  className="px-2.5 py-1 text-[11px] font-medium rounded border border-[#222634] bg-[#0b0c10] text-[#00ec97] hover:border-[#00ec97] transition-colors cursor-pointer"
                >
                  {mode === "guide" ? "Tutorial" : "Guide"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-[#222634] transition-colors cursor-pointer"
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto text-xs text-zinc-300 space-y-5">
              {mode === "guide" ? (
                <>
                  {/* Quick Steps */}
                  <div className="reveal-item space-y-2.5">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      3-Step Claim
                    </h4>
                    <ol className="space-y-2 text-zinc-300 leading-relaxed">
                      <li className="flex gap-2.5 p-2.5 bg-[#13151b] border border-[#222634] rounded-lg">
                        <span className="font-mono font-bold text-[#00ec97]">1.</span>
                        <span>
                          Paste your <code className="text-zinc-100 font-mono">.testnet</code> wallet ID, pick <strong>USDC</strong> or <strong>EURe</strong>, and enter an amount (1–500).
                        </span>
                      </li>
                      <li className="flex gap-2.5 p-2.5 bg-[#13151b] border border-[#222634] rounded-lg">
                        <span className="font-mono font-bold text-[#00ec97]">2.</span>
                        <span>
                          Click <strong>Request</strong>. First-time low/zero-NEAR wallets receive 0.00125 NEAR token storage, ~0.45 NEAR upfront gas/import support (NEP-642), and your tokens via <code className="text-zinc-100 font-mono">ft_transfer</code>.
                        </span>
                      </li>
                      <li className="flex gap-2.5 p-2.5 bg-[#13151b] border border-[#222634] rounded-lg">
                        <span className="font-mono font-bold text-[#00ec97]">3.</span>
                        <span>
                          In Meteor Wallet: open <strong>Import Token</strong>, paste a contract ID below, click <strong>Add Selected Token</strong>, then click <strong>Refresh</strong>.
                        </span>
                      </li>
                    </ol>
                  </div>

                  {/* Essential Limits */}
                  <div className="reveal-item space-y-2.5">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Limits &amp; Rules
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {LIMIT_RULES.map((rule) => (
                        <div
                          key={rule.label}
                          className="p-3 bg-[#13151b] border border-[#222634] rounded-lg flex flex-col gap-0.5"
                        >
                          <span className="text-[11px] font-medium text-zinc-400">{rule.label}</span>
                          <span className="text-xs font-semibold text-zinc-100">{rule.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Contracts */}
                  <div className="reveal-item space-y-2.5">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      NEP-141 Token Contracts
                    </h4>
                    <TokenContractCards
                      usdcContractId={usdcContractId}
                      eureContractId={eureContractId}
                      copiedToken={copiedToken}
                      onCopy={handleCopy}
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* Step Navigation Pills */}
                  <div className="reveal-item flex items-center gap-2">
                    {TUTORIAL_STEPS.map((step, index) => {
                      const isActive = index === tutorialStep;
                      const isDone = index < tutorialStep;
                      return (
                        <button
                          key={step.title}
                          type="button"
                          onClick={() => setTutorialStep(index)}
                          className={`flex-1 py-1.5 px-2 rounded-lg border text-[11px] font-mono font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                            isActive
                              ? "border-[#00ec97] bg-[#13151b] text-[#00ec97]"
                              : isDone
                              ? "border-[#222634] bg-[#13151b] text-zinc-200"
                              : "border-[#222634] bg-[#0c0e13] text-zinc-500 hover:text-zinc-300"
                          }`}
                          aria-label={`Step ${index + 1}: ${step.title}`}
                        >
                          {isDone ? <Check className="w-3 h-3 text-[#00ec97]" /> : <span>{index + 1}</span>}
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Tutorial Card */}
                  <div className="tutorial-step-card p-4 bg-[#13151b] border border-[#222634] rounded-xl space-y-3.5">
                    <div>
                      <span className="text-[11px] font-mono uppercase tracking-wider text-[#00ec97]">
                        Step {tutorialStep + 1}
                      </span>
                      <h4 className="text-base font-bold text-white mt-0.5">{activeStep.title}</h4>
                      <p className="text-xs text-zinc-400 mt-1">{activeStep.summary}</p>
                    </div>

                    <ul className="space-y-2 text-xs text-zinc-300 leading-relaxed">
                      {activeStep.bullets.map((bullet, idx) => (
                        <li key={idx} className="flex items-start gap-2.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#00ec97] mt-1.5 shrink-0" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>

                    {activeStep.showContracts && (
                      <div className="pt-1">
                        <TokenContractCards
                          usdcContractId={usdcContractId}
                          eureContractId={eureContractId}
                          copiedToken={copiedToken}
                          onCopy={handleCopy}
                        />
                      </div>
                    )}

                    {activeStep.actionHref && activeStep.actionLabel && (
                      <div className="pt-1">
                        <a
                          href={activeStep.actionHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#222634] bg-[#0b0c10] text-[#00ec97] hover:border-[#00ec97] text-xs font-medium transition-colors"
                        >
                          <span>{activeStep.actionLabel}</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[#222634] bg-[#13151b] flex items-center justify-between text-xs">
              {mode === "guide" ? (
                <>
                  <span className="flex items-center gap-1.5 text-zinc-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#00ec97]" />
                    <span>NEP-141 / NEP-145 Testnet Faucet</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMode("tutorial");
                        setTutorialStep(0);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-[#00ec97]/40 text-[#00ec97] hover:border-[#00ec97] font-medium transition-colors cursor-pointer"
                    >
                      Start Tutorial
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="px-3 py-1.5 bg-[#222634] hover:bg-zinc-700 text-zinc-100 rounded-lg font-medium transition-colors cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setTutorialStep((s) => Math.max(0, s - 1))}
                    disabled={tutorialStep === 0}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#222634] bg-[#0b0c10] text-zinc-200 hover:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>

                  <span className="text-[11px] font-mono text-zinc-500">
                    {tutorialStep + 1} / {TUTORIAL_STEPS.length}
                  </span>

                  {isLastStep ? (
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#00ec97] hover:bg-[#00d486] text-black font-semibold transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Done</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setTutorialStep((s) => Math.min(TUTORIAL_STEPS.length - 1, s + 1))}
                      className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-[#00ec97] hover:bg-[#00d486] text-black font-semibold transition-colors cursor-pointer"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
