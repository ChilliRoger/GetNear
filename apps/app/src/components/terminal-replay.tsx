"use client";

import { useState, useEffect, useRef } from "react";

const SIMULATION_LINES = [
  { text: "$ getnear agent monitor --network=testnet --pair=USDC/EURe", type: "command" as const, delay: 0 },
  { text: "", type: "blank" as const, delay: 300 },
  { text: "[AGENT] Initializing GetNear Autonomous Treasury Runner...", type: "system" as const, delay: 600 },
  { text: "[AGENT] Connected to NEAR RPC: https://testnet.nearblocks.io", type: "system" as const, delay: 900 },
  { text: "[AGENT] Verified restricted function-call key: chilliroger-agent.testnet", type: "success" as const, delay: 1200 },
  { text: "[CONTRACT] Reading limits from fx-budget.chilliroger-operator.testnet", type: "system" as const, delay: 1600 },
  { text: "[CONTRACT] Limits: auto_cap=$100 USDC | max_chunk=$20 USDC | min_interval=60s", type: "data" as const, delay: 2000 },
  { text: "", type: "blank" as const, delay: 2300 },
  { text: "[ORACLE] Querying 1Click API (dry: true) for USDC → EURe quote...", type: "sim" as const, delay: 2600 },
  { text: "[ORACLE] 1Click quote rate = 0.90354 EURe per USDC", type: "data" as const, delay: 3100 },
  { text: "[ORACLE] Querying European Central Bank reference rate via Frankfurter...", type: "sim" as const, delay: 3500 },
  { text: "[ORACLE] ECB reference rate = 0.90481 EUR per USD", type: "data" as const, delay: 4000 },
  { text: "[STRATEGY] Calculating price divergence: dev = -14 bps (Max allowed: 120 bps)", type: "highlight" as const, delay: 4500 },
  { text: "[STRATEGY] Timing Score = 85 / 100 [ACTION: EXECUTE_CHUNK]", type: "decision" as const, delay: 5000 },
  { text: "", type: "blank" as const, delay: 5300 },
  { text: "[DISPATCH] Calling execute_chunk on fx-budget.chilliroger-operator.testnet", type: "action" as const, delay: 5600 },
  { text: "[CHAIN] Transaction signed with restricted agent key ✓", type: "success" as const, delay: 6200 },
  { text: "[SETTLEMENT] On-chain cross-contract callback on_chunk_settled() triggered", type: "sim" as const, delay: 6800 },
  { text: "[VAULT] 2.16 EURe transferred to supplier-eu.chilliroger-operator.testnet ✓", type: "success" as const, delay: 7400 },
  { text: "[ESCROW] Circle testnet USDC accounted / debited from escrow pool ✓", type: "success" as const, delay: 8000 },
  { text: "[NEARBLOCKS] Tx confirmed: 8xKq3W...9z2L (Gas: 0.0008 NEAR)", type: "data" as const, delay: 8600 },
  { text: "", type: "blank" as const, delay: 8900 },
  { text: "┌────────────────────────────────────────────────────────┐", type: "box" as const, delay: 9200 },
  { text: "│ [✓] CHUNK EXECUTION VERIFIED ON NEAR TESTNET           │", type: "box" as const, delay: 9200 },
  { text: "│     Invoice target: 5.00 EURe · Settled: 2.16 EURe     │", type: "box" as const, delay: 9200 },
  { text: "└────────────────────────────────────────────────────────┘", type: "box" as const, delay: 9200 },
];

const typeColors: Record<string, string> = {
  command: "text-[#00ec97] font-bold",
  system: "text-muted",
  success: "text-[#00ec97]",
  sim: "text-[#38bdf8]",
  log: "text-muted/80",
  data: "text-[#38bdf8] font-medium",
  highlight: "text-amber-400 font-bold",
  decision: "text-[#00ec97] font-bold",
  action: "text-foreground font-semibold",
  result: "text-[#00ec97] font-bold text-base",
  box: "text-[#00ec97]",
  blank: "",
};

export function TerminalReplay() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [started, setStarted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

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

  useEffect(() => {
    if (containerRef.current) {
      const el = containerRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [visibleLines]);

  return (
    <div className="border border-border bg-[#07080c] text-xs font-mono select-none">
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between border-b border-border bg-[#11131b] px-3 py-2 text-[11px] text-muted">
        <div className="flex items-center gap-2">
          <span className="text-[#00ec97]">●</span>
          <span className="text-foreground font-semibold uppercase tracking-wider">
            GETNEAR AUTONOMOUS AGENT CONSOLE // TESTNET REPLAY
          </span>
        </div>
        <span className="text-[10px] text-muted">PID: 38175 · PORT: 38174</span>
      </div>

      {/* Terminal Output */}
      <div
        ref={containerRef}
        className="h-80 overflow-y-auto p-4 space-y-1 font-mono text-[11px] leading-relaxed"
      >
        {SIMULATION_LINES.slice(0, visibleLines).map((line, idx) => (
          <div key={idx} className={typeColors[line.type] || "text-foreground"}>
            {line.text}
          </div>
        ))}
        {visibleLines < SIMULATION_LINES.length && (
          <span className="inline-block h-3.5 w-2 bg-[#00ec97] animate-pulse align-middle" />
        )}
      </div>

      {/* Terminal Footer */}
      <div className="border-t border-border bg-[#11131b] px-3 py-1.5 flex items-center justify-between text-[10px] text-muted">
        <span>STATUS: AUTONOMOUS TWAP VERIFIED</span>
        <button
          onClick={() => setVisibleLines(SIMULATION_LINES.length)}
          className="text-[#38bdf8] hover:underline"
        >
          [ SHOW FULL LOG ]
        </button>
      </div>
    </div>
  );
}
