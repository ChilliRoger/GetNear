import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface AgentDecision {
  id: number;
  order_id: number;
  timestamp: number;
  score: number;
  decision: string;
  reason: string;
  chunk_size: string;
  deviation_bps?: number | null;
}
async function getJson<T>(url: string, ms = 4000): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ms) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Read-only view of the on-chain agent's status and decision log (the agent binds to loopback only). */
export async function GET() {
  const agentBase = (process.env.AGENT_API_URL || process.env.AGENT_TRIGGER_URL || "http://127.0.0.1:38175").replace(/\/+$/, "");

  const [status, decisions] = await Promise.all([
    getJson<NonNullable<unknown> & Record<string, unknown>>(`${agentBase}/status`),
    getJson<{ decisions: AgentDecision[] }>(`${agentBase}/decisions?limit=30`),
  ]);

  const events: {
    id: string;
    ts: number;
    tag: string;
    text: string;
    score?: number;
    href?: string;
  }[] = [];

  for (const d of decisions?.decisions ?? []) {
    const settled = d.reason?.startsWith("CHUNK_SETTLED_ONCHAIN");
    const failed = d.decision === "SETTLEMENT_FAILED_BALANCE_UNCHANGED";
    events.push({
      id: `a${d.id}`,
      ts: d.timestamp,
      tag: settled ? "SETTLED" : failed ? "FAILED" : d.decision === "EXECUTE" ? "EXECUTE" : "WAIT",
      text: `Order #${d.order_id}: ${d.reason}`,
      score: d.score,
    });
  }
  events.sort((a, b) => b.ts - a.ts);

  const s = status as Record<string, unknown> | null;
  return NextResponse.json({
    online: Boolean(s),
    agent: s
      ? {
          lastStatus: s.lastStatus,
          strategyMode: s.strategyMode,
          totalChunksExecuted: s.totalChunksExecuted,
          isRunning: s.isRunning,
        }
      : null,
    events: events.slice(0, 40),
  });
}
