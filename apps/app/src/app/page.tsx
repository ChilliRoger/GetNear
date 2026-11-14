"use client";

import Link from "next/link";
import { GetNearLogo } from "@/components/getnear-logo";
import { AsciiArt } from "@/components/ascii-art";
import { AsciiTickerBar } from "@/components/ascii-ticker-bar";
import { SavingsCalculator } from "@/components/savings-calculator";
import { TerminalReplay } from "@/components/terminal-replay";
import { useI18n } from "@/lib/i18n";

const sponsors = [
  { name: "NEAR Protocol", letter: "N", role: "Smart Contract & Fast Finality", chain: "NEAR TESTNET" },
  { name: "1Click API", letter: "1", role: "Live Dry-Quote Aggregator", chain: "1CLICK INTENTS" },
  { name: "Sputnik DAO", letter: "S", role: "2-of-3 Multi-Sig Guardrail", chain: "SPUTNIK V2" },
  { name: "Circle USDC", letter: "C", role: "Canonical Native Testnet USDC", chain: "TESTNET CIRCLE" },
  { name: "Demo EURe", letter: "E", role: "Prefunded Vault & Supplier Payout", chain: "TESTNET NEP-141" },
];

const steps = [
  { num: "01", title: "Monitor & Probe", desc: "Live 1Click dry-quotes sampled continuously alongside ECB reference rates to identify optimal execution windows.", tag: "ORACLE PROBE" },
  { num: "02", title: "Algorithm Decision", desc: "Adaptive TWAP scores timing based on price deviation, urgency, and volatility before dispatching chunks.", tag: "STRATEGY SCORE" },
  { num: "03", title: "Restricted Execution", desc: "Agent dispatches execute_chunk via restricted function-call key within contract spending limits.", tag: "ON-CHAIN AGENT" },
  { num: "04", title: "Multi-Sig & Callback", desc: "Orders over $100 require Sputnik DAO 2-of-3 voting. Supplier payout settles via verified on-chain callback.", tag: "DAO & SETTLEMENT" },
];

export default function LandingPage() {
  const { t } = useI18n();

  return (
    <div className="relative min-h-screen bg-[#090a0f] text-[#f0f3f6] font-mono selection:bg-[#00ec97] selection:text-[#090a0f]">
      {/* ─── Top Provenance Bar ─── */}
      <div className="border-b border-border bg-[#11131b] px-4 py-1.5 text-center text-[11px] text-amber-400">
        <span>[ TESTNET · CALLBACK-VERIFIED EURe PAYOUT · SIMULATED USDC FX LEG (1Click dry:true) ]</span>
      </div>

      {/* ─── Live Market ASCII Ticker ─── */}
      <AsciiTickerBar />

      {/* ─── Header Navigation ─── */}
      <nav className="border-b border-border bg-[#090a0f]/90 sticky top-0 z-40 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <GetNearLogo size={34} cropped />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-wider text-foreground">
                  GETNEAR
                </span>
                <span className="border border-[#00ec97] bg-[#00ec97]/10 px-1 py-0.2 text-[9px] font-bold text-[#00ec97]">
                  TREASURY FX
                </span>
              </div>
              <p className="text-[10px] text-muted tracking-widest uppercase">
                STABLECOIN ERA TREASURY ENGINE
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 border border-border bg-surface px-2.5 py-1 text-[11px] text-muted">
              <span className="h-1.5 w-1.5 bg-[#00ec97]" />
              <span>AGENT: CHILLIROGER-AGENT.TESTNET</span>
            </div>
            <Link
              href="/dashboard"
              className="border border-[#00ec97] bg-[#00ec97]/10 px-3.5 py-1.5 text-xs font-semibold text-[#00ec97] transition-colors hover:bg-[#00ec97]/20 flex items-center gap-1.5"
            >
              <span>[ LAUNCH TERMINAL ]</span>
              <span>&rarr;</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════
          HERO SECTION (ASCII Command Center)
      ═══════════════════════════════════════════ */}
      <section className="px-4 py-12 sm:py-16 border-b border-border">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Left: Terminal Headline & CTA */}
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 border border-[#00ec97]/40 bg-[#00ec97]/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-[#00ec97]">
                <span className="h-1.5 w-1.5 bg-[#00ec97]" />
                <span>NEAR TESTNET // AUTONOMOUS FX ENGINE</span>
              </div>

              <div>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-[1.1]">
                  AUTONOMOUS TREASURY FX FOR THE STABLECOIN ERA
                </h1>
                <p className="mt-4 text-xs sm:text-sm text-muted leading-relaxed">
                  Replacing $120B/year in predatory bank FX spreads with autonomous goal-driven execution on NEAR testnet. Adaptive TWAP chunking, live 1Click dry-quotes, and Sputnik DAO 2-of-3 multi-sig guardrails.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href="/dashboard"
                  className="border border-[#00ec97] bg-[#00ec97] px-5 py-3 text-xs font-bold text-[#090a0f] hover:bg-[#00ec97]/90 transition-colors flex items-center gap-2"
                >
                  <span>[ 01 ENTER TREASURY DESK ]</span>
                  <span>&rarr;</span>
                </Link>
                <Link
                  href="/trade"
                  className="border border-border bg-surface px-5 py-3 text-xs font-semibold text-foreground hover:border-[#00ec97] hover:text-[#00ec97] transition-colors"
                >
                  <span>[ 02 CREATE FX GOAL ]</span>
                </Link>
                <a
                  href="https://github.com/ChilliRoger/GetNear"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-border bg-transparent px-4 py-3 text-xs text-muted hover:text-foreground hover:border-zinc-700 transition-colors"
                >
                  <span>[ GITHUB REPO ]</span>
                </a>
              </div>

              {/* Stats Box */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4 border-t border-border/60">
                <div className="border border-border bg-surface p-2.5">
                  <div className="text-base sm:text-lg font-bold text-[#00ec97]">$120B</div>
                  <div className="text-[10px] text-muted">ANNUAL BANK FX SPREAD</div>
                </div>
                <div className="border border-border bg-surface p-2.5">
                  <div className="text-base sm:text-lg font-bold text-[#00ec97]">0.05%</div>
                  <div className="text-[10px] text-muted">GETNEAR AVG SPREAD</div>
                </div>
                <div className="border border-border bg-surface p-2.5">
                  <div className="text-base sm:text-lg font-bold text-[#00ec97]">24 / 7</div>
                  <div className="text-[10px] text-muted">AUTONOMOUS TWAP</div>
                </div>
                <div className="border border-border bg-surface p-2.5">
                  <div className="text-base sm:text-lg font-bold text-[#00ec97]">T+0 SEC</div>
                  <div className="text-[10px] text-muted">CALLBACK SETTLEMENT</div>
                </div>
              </div>
            </div>

            {/* Right: ASCII Magic Art Terminal (Harbour Neon Skyline) */}
            <div className="lg:col-span-6">
              <div className="border border-border bg-[#0b0d14] overflow-hidden">
                {/* Terminal Window Header */}
                <div className="flex items-center justify-between border-b border-border bg-[#11131b] px-3 py-2 text-[11px] text-muted select-none">
                  <div className="flex items-center gap-2">
                    <span className="text-[#00ec97]">●</span>
                    <span className="font-semibold text-foreground uppercase tracking-wider">
                      TERMINAL FEED: NEON HARBOUR FERRY
                    </span>
                  </div>
                  <div className="text-[10px] text-muted">
                    <span>[ 192x108 · HALFTONE DOTS · 15 FPS ]</span>
                  </div>
                </div>

                {/* ASCII Art Piece */}
                <div className="p-2 sm:p-4 bg-[#06070e] flex items-center justify-center overflow-x-auto">
                  <AsciiArt
                    piece="harbour-neon-skyline"
                    size={6}
                    look="dots"
                    speed={1}
                    className="max-w-full"
                    title="Neon Harbour Ferry ASCII Art"
                  />
                </div>

                {/* Terminal Window Footer */}
                <div className="border-t border-border bg-[#11131b] px-3 py-2 flex items-center justify-between text-[10px] text-muted">
                  <div className="flex items-center gap-2">
                    <span className="text-[#00ec97] font-semibold">[LIVE]</span>
                    <span>METROPOLIS LIQUIDITY RADAR // ACTIVE</span>
                  </div>
                  <span className="text-muted/60">SOURCE: ASCII MAGIC ART</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          SYSTEM ARCHITECTURE (ASCII Diagram)
      ═══════════════════════════════════════════ */}
      <section className="px-4 py-14 border-b border-border">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-8">
            <span className="text-[10px] uppercase tracking-widest text-[#00ec97]">
              [ VERIFIABLE TESTNET ARCHITECTURE ]
            </span>
            <h2 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight">
              ON-CHAIN AUTONOMOUS CONVERSION FLOW
            </h2>
          </div>

          <div className="border border-border bg-[#0d0f17] p-4 sm:p-6 overflow-x-auto text-xs leading-relaxed">
            <pre className="text-muted/90 whitespace-pre font-mono">
{`┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        TREASURY OPERATOR (chilliroger-operator.testnet)                │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ creates order / locks Circle USDC
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      FXBUDGET SMART CONTRACT (fx-budget.chilliroger-operator.testnet)  │
│  Auto-Cap: $100 USDC | Max Chunk: $20 USDC | Min Interval: 60s | Prefunded EURe Vault  │
└───────────────────▲───────────────────────────────────────────────────┬────────────────┘
                    │                                                   │
  execute_chunk()   │ (restricted function-call key)                    │ on_chunk_settled()
                    │                                                   ▼
┌───────────────────┴───────────────────────┐         ┌─────────────────────────────────┐
│     AUTONOMOUS AGENT RUNNER               │         │ ON-CHAIN CALLBACK SETTLEMENT    │
│     (chilliroger-agent.testnet)           │         │ Supplier receives demo EURe     │
├───────────────────────────────────────────┤         │ Unspent USDC refunded at expiry │
│ 1. 1Click Dry-Quote (dry:true)            │         └─────────────────────────────────┘
│ 2. ECB Reference Rate (USD/EUR)           │
│ 3. Timing Score: Price vs Urgency (0-100) │
│ 4. If > $100 -> Sputnik DAO 2-of-3 Vote   │
└───────────────────────────────────────────┘`}
            </pre>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          HOW IT WORKS (4 Terminal Steps)
      ═══════════════════════════════════════════ */}
      <section className="px-4 py-14 border-b border-border">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-10">
            <span className="text-[10px] uppercase tracking-widest text-[#00ec97]">
              [ EXECUTION PROTOCOL ]
            </span>
            <h2 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight">
              HOW GETNEAR EXECUTES TREASURY GOALS
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((st) => (
              <div
                key={st.num}
                className="border border-border bg-surface p-4 transition-colors hover:border-[#00ec97]"
              >
                <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
                  <span className="text-xl font-bold text-[#00ec97]">{st.num}</span>
                  <span className="border border-border bg-[#090a0f] px-1.5 py-0.5 text-[9px] text-muted uppercase">
                    {st.tag}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-foreground mb-1.5">
                  {st.title}
                </h3>
                <p className="text-[11px] text-muted leading-relaxed">
                  {st.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          SAVINGS CALCULATOR & COMPARISON
      ═══════════════════════════════════════════ */}
      <section className="px-4 py-14 border-b border-border">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-8">
            <span className="text-[10px] uppercase tracking-widest text-[#00ec97]">
              [ COST EFFICIENCY ANALYSIS ]
            </span>
            <h2 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight">
              TRADITIONAL BANKS VS GETNEAR
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {/* Bank Card */}
            <div className="border border-border bg-surface p-5">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
                <span className="font-bold text-xs uppercase text-muted">LEGACY BANK FX</span>
                <span className="border border-red-500/40 bg-red-500/10 text-red-400 px-1.5 py-0.5 text-[9px]">
                  HIGH SPREAD
                </span>
              </div>
              <div className="text-3xl font-extrabold text-foreground mb-4">
                1.50% – 3.00%
              </div>
              <div className="space-y-2 text-xs text-muted">
                <div className="flex justify-between border-b border-border/40 pb-1">
                  <span>Settlement:</span>
                  <span className="text-foreground">T+2 to T+5 Banking Days</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-1">
                  <span>Transparency:</span>
                  <span className="text-foreground">Opaque Markups</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-1">
                  <span>Availability:</span>
                  <span className="text-foreground">Mon–Fri 9am–5pm</span>
                </div>
                <div className="flex justify-between">
                  <span>Audit Trail:</span>
                  <span className="text-foreground">Monthly Paper Statements</span>
                </div>
              </div>
            </div>

            {/* GetNear Card */}
            <div className="border border-[#00ec97] bg-[#00ec97]/5 p-5">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#00ec97]/20">
                <span className="font-bold text-xs uppercase text-[#00ec97]">GETNEAR ALGORITHMIC FX</span>
                <span className="border border-[#00ec97] bg-[#00ec97]/15 text-[#00ec97] px-1.5 py-0.5 text-[9px]">
                  0.05% SPREAD
                </span>
              </div>
              <div className="text-3xl font-extrabold text-[#00ec97] mb-4">
                ~0.05%
              </div>
              <div className="space-y-2 text-xs text-muted">
                <div className="flex justify-between border-b border-border/40 pb-1">
                  <span>Settlement:</span>
                  <span className="text-[#00ec97]">T+0 Real-Time Callback</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-1">
                  <span>Transparency:</span>
                  <span className="text-[#00ec97]">1Click Dry-Quote + ECB Ref</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-1">
                  <span>Availability:</span>
                  <span className="text-[#00ec97]">24/7/365 Autonomous</span>
                </div>
                <div className="flex justify-between">
                  <span>Audit Trail:</span>
                  <span className="text-[#00ec97]">Verifiable On-Chain NEARBlocks</span>
                </div>
              </div>
            </div>
          </div>

          <SavingsCalculator />
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          LIVE TERMINAL REPLAY
      ═══════════════════════════════════════════ */}
      <section className="px-4 py-14 border-b border-border">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-8">
            <span className="text-[10px] uppercase tracking-widest text-[#00ec97]">
              [ VERIFIABLE AUDIT LOG ]
            </span>
            <h2 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight">
              AGENT STRATEGY & CHUNK DISPATCH LOG
            </h2>
          </div>
          <TerminalReplay />
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          TECHNOLOGY STACK & INTEGRATIONS
      ═══════════════════════════════════════════ */}
      <section className="px-4 py-14 border-b border-border">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-8">
            <span className="text-[10px] uppercase tracking-widest text-[#00ec97]">
              [ ARCHITECTURAL COMPONENTS ]
            </span>
            <h2 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight">
              POWERED BY DECENTRALIZED INFRASTRUCTURE
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {sponsors.map((s) => (
              <div key={s.name} className="border border-border bg-surface p-4 text-center">
                <div className="w-8 h-8 mx-auto mb-2.5 flex items-center justify-center border border-[#00ec97] bg-[#00ec97]/10 text-xs font-bold text-[#00ec97]">
                  {s.letter}
                </div>
                <div className="text-xs font-bold text-foreground">{s.name}</div>
                <div className="text-[10px] text-muted mt-1 leading-snug">{s.role}</div>
                <div className="mt-2 border-t border-border/40 pt-1 text-[9px] text-[#00ec97]">
                  [{s.chain}]
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          TERMINAL FOOTER
      ═══════════════════════════════════════════ */}
      <footer className="px-4 py-8 bg-[#07080c] text-xs text-muted">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <GetNearLogo size={24} cropped />
            <span className="font-bold text-foreground">GETNEAR // TESTNET TREASURY</span>
            <span className="text-border">::</span>
            <span className="text-[10px]">CONTRACT: fx-budget.chilliroger-operator.testnet</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <Link href="/dashboard" className="text-[#00ec97] hover:underline">
              [ 01 DASHBOARD ]
            </Link>
            <Link href="/trade" className="text-[#00ec97] hover:underline">
              [ 02 TRADE ]
            </Link>
            <Link href="/analytics" className="text-[#00ec97] hover:underline">
              [ 03 ANALYTICS ]
            </Link>
            <a
              href="https://testnet.nearblocks.io/address/fx-budget.chilliroger-operator.testnet"
              target="_blank"
              rel="noreferrer"
              className="text-[#38bdf8] hover:underline"
            >
              [ NEARBLOCKS ↗ ]
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
