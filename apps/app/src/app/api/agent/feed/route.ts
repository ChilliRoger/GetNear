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
interface OracleDecision {
  id: number;
  timestamp: number; // seconds
  order_id: string | null;
  score: number;
  action: string;
  reason: string;
}

async function getJson<T>(url: string, ms = 4000): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ms) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Read-only merge of the on-chain agent's decision log and the oracle simulator's decisions. */
export async function GET() {
  const agentBase = (process.env.AGENT_TRIGGER_URL || "http://127.0.0.1:38175").replace(/\/+$/, "");
  const oracleBase = (process.env.ORACLE_URL || "http://localhost:38174").replace(/\/+$/, "");

  const [status, decisions, oracle] = await Promise.all([
    getJson<NonNullable<unknown> & Record<string, unknown>>(`${agentBase}/status`),
    getJson<{ decisions: AgentDecision[] }>(`${agentBase}/decisions?limit=30`),
    getJson<OracleDecision[]>(`${oracleBase}/api/strategy/decisions?limit=12`),
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
  for (const d of oracle ?? []) {
    if (d.order_id === null) continue; // ignore idle "no active orders" evaluations
    events.push({
      id: `o${d.id}`,
      ts: d.timestamp * 1000,
      tag: "SCORE",
      text: `Strategy ${d.action}: ${d.reason}`,
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
