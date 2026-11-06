import { Hono } from "hono";
import db from "../db.js";

const app = new Hono();

app.get("/", async (c) => {
  const rawLimit = parseInt(c.req.query("limit") || "50", 10);
  // Treat limit=0 or NaN as "use default 50"; guarantee minimum of 1
  const parsedLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 50;
  const limit = Math.min(Math.max(1, parsedLimit), 200);

  const rows = db
    .prepare(
      `SELECT * FROM privacy_transactions ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as Array<Record<string, unknown>>;

  // Map DB columns to the shape the frontend expects
  const transactions = rows.map((row) => ({
    id: row.tx_id,
    type: row.type,
    amount: row.amount,
    token: row.token,
    status: row.status === "confirmed" ? "complete" : row.status,
    txHash: row.evm_tx_hash || undefined,
    timestamp: row.created_at,
    error: row.error || undefined,
  }));

  return c.json({ transactions, count: transactions.length });
});

export default app;
