import { Hono } from "hono";
import db from "../db.js";
import type { ShieldHistoryResponse, ShieldTransaction } from "@meridian/shared";

const app = new Hono();

/**
 * GET /api/privacy/shield/history?limit=50
 *
 * Returns recent shield/unshield transactions from the shield_transactions table.
 */
app.get("/", async (c) => {
  const rawLimit = parseInt(c.req.query("limit") || "50", 10);
  const parsedLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 50;
  const limit = Math.min(Math.max(1, parsedLimit), 200);

  const rows = db
    .prepare(
      `SELECT * FROM shield_transactions ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as Array<Record<string, unknown>>;

  const transactions: ShieldTransaction[] = rows.map((row) => ({
    id: row.id as number,
    direction: row.direction as "shield" | "unshield",
    token: row.token as string,
    tokenSymbol: row.token_symbol as string,
    amount: row.amount as string,
    displayAmount: row.display_amount as string,
    txHash: (row.tx_hash as string) || null,
    unlinkTxId: (row.unlink_tx_id as string) || null,
    explorerUrl: (row.explorer_url as string) || null,
    status: row.status as "pending" | "confirmed" | "failed",
    createdAt: row.created_at as number,
  }));

  return c.json({ transactions } satisfies ShieldHistoryResponse);
});

export default app;
