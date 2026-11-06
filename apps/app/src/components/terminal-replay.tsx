"use client";

import { useState, useEffect, useRef } from "react";

const SIMULATION_LINES = [
  { text: "$ cre workflow simulate treasury --broadcast", type: "command" as const, delay: 0 },
  { text: "", type: "blank" as const, delay: 300 },
  { text: "Initializing...", type: "system" as const, delay: 600 },
  { text: "Loading settings...", type: "system" as const, delay: 900 },
  { text: "Checking RPC connectivity...", type: "system" as const, delay: 1200 },
  { text: "Compiling workflow...", type: "system" as const, delay: 1800 },
  { text: "✓ Workflow compiled", type: "success" as const, delay: 2400 },
  { text: "✓ Simulation limits enabled", type: "success" as const, delay: 2700 },
  { text: "", type: "blank" as const, delay: 3000 },
  { text: "[SIMULATION] Simulator Initialized", type: "sim" as const, delay: 3300 },
  { text: "", type: "blank" as const, delay: 3600 },
  { text: "[SIMULATION] Running trigger trigger=cron-trigger@1.0.0", type: "sim" as const, delay: 3900 },
  { text: "[USER LOG] Running CronTrigger", type: "log" as const, delay: 4200 },
  { text: "[USER LOG] === Meridian Treasury Workflow Start ===", type: "highlight" as const, delay: 4500 },
  { text: "[USER LOG] Fetching quote from Uniswap Trade API", type: "log" as const, delay: 4800 },
  { text: "[USER LOG] Quote: rate=0.8682 EURC/USDC  in=5.00 USDC  out=4.34 EURC", type: "data" as const, delay: 5400 },
  { text: "[USER LOG] Reading policy from TreasuryVault on Arc", type: "log" as const, delay: 5900 },
  { text: "[USER LOG] Policy: threshold=$10  band=[0.80, 1.10]  v2", type: "data" as const, delay: 6400 },
  { text: "[USER LOG] Reading balances from SwapExecutor on Base", type: "log" as const, delay: 6900 },
  { text: "[USER LOG] Balances: USDC=$9.00  EURC=$0.87", type: "data" as const, delay: 7400 },
  { text: "[USER LOG] Decision: EXECUTE (amount=$5.00 ≤ threshold=$10)", type: "decision" as const, delay: 8000 },
  { text: "", type: "blank" as const, delay: 8300 },
  { text: "[USER LOG] Executing auto-trade on Base via Uniswap V3", type: "action" as const, delay: 8600 },
  { text: "[USER LOG] executeSwap tx succeeded ✓", type: "success" as const, delay: 9400 },
  { text: "[USER LOG] Logging execution on Arc", type: "action" as const, delay: 9900 },
  { text: "[USER LOG] logExecution tx succeeded ✓", type: "success" as const, delay: 10400 },
  { text: "", type: "blank" as const, delay: 10700 },
  { text: "[USER LOG] === AUTO EXECUTE complete ===", type: "highlight" as const, delay: 11000 },
  { text: "", type: "blank" as const, delay: 11300 },
  { text: '✓ Workflow Simulation Result: "EXECUTED"', type: "result" as const, delay: 11600 },
  { text: "", type: "blank" as const, delay: 11900 },
  { text: "╭──────────────────────────────────────────────────────╮", type: "box" as const, delay: 12200 },
  { text: "│ Simulation complete! Ready to deploy your workflow.  │", type: "box" as const, delay: 12200 },
  { text: "╰──────────────────────────────────────────────────────╯", type: "box" as const, delay: 12200 },
];

const typeColors: Record<string, string> = {
  command: "text-accent-green font-bold",
  system: "text-muted",
  success: "text-accent-green",
  sim: "text-accent-blue/70",
  log: "text-muted/80",
  data: "text-accent-blue font-medium",
  highlight: "text-accent-amber font-bold",
  decision: "text-accent-green font-bold",
  action: "text-foreground",
  result: "text-accent-green font-bold text-lg",
  box: "text-accent-blue",
  blank: "",
};

export function TerminalReplay() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [started, setStarted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Start animation when component scrolls into view
  useEffect(() => {
    if (!containerRef.current) return;

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
        }
      },
      { threshold: 0.3 }
    );

    observerRef.current.observe(containerRef.current);

    return () => observerRef.current?.disconnect();
  }, [started]);

  // Animate lines appearing
  useEffect(() => {
    if (!started) return;

    const timers: NodeJS.Timeout[] = [];
    SIMULATION_LINES.forEach((line, i) => {
      timers.push(
        setTimeout(() => {
          setVisibleLines((prev) => Math.max(prev, i + 1));
        }, line.delay)
      );
    });

    return () => timers.forEach(clearTimeout);
  }, [started]);

  // Auto-scroll to bottom as lines appear
  useEffect(() => {
    if (containerRef.current) {
      const el = containerRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [visibleLines]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-[#0c0c0c]">
      {/* Terminal header */}
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2.5">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-accent-red/60" />
          <div className="h-3 w-3 rounded-full bg-accent-amber/60" />
          <div className="h-3 w-3 rounded-full bg-accent-green/60" />
        </div>
        <span className="ml-2 text-[11px] font-medium text-muted/60">
          CRE Workflow Simulation — Live Demo
        </span>
      </div>

      {/* Terminal body */}
      <div
        ref={containerRef}
        className="h-[380px] overflow-y-auto px-4 py-3 font-mono text-[12px] leading-[1.7]"
      >
        {SIMULATION_LINES.slice(0, visibleLines).map((line, i) => (
          <div
            key={i}
            className={`${typeColors[line.type] || ""} ${
              line.type === "blank" ? "h-[1.7em]" : ""
            } animate-fade-in`}
          >
            {line.text}
          </div>
        ))}
        {visibleLines < SIMULATION_LINES.length && started && (
          <span className="inline-block h-4 w-2 animate-pulse bg-accent-green/80" />
        )}
      </div>
    </div>
  );
}
