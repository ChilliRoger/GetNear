import { Hono } from "hono";
import { getUnlinkClient, getUnlinkStatus, UNLINK_TEST_TOKEN } from "../unlink-client.js";
import db from "../db.js";
import { randomUUID } from "node:crypto";

const app = new Hono();

/**
 * POST /api/privacy/withdraw
 *
 * SDK method: unlink.withdraw({ recipientEvmAddress, token, amount })
 *   -> Promise<TransactionResult>  where TransactionResult = { txId, status }
 *
 * Internally the SDK does a three-phase flow:
 *   1. POST /transactions/prepare/withdraw  -> signing_request
 *   2. EdDSA-sign the message_hash
 *   3. POST /transactions/{tx_id}/submit
 *
 * Body: { token?: string, amount: string, recipient: string }
 */
app.post("/", async (c) => {
  const status = getUnlinkStatus();
  if (!status.configured) {
    return c.json(
      { error: "Unlink SDK not configured", status: getUnlinkStatus() },
      503
    );
  }

  const unlink = await getUnlinkClient();
  if (!unlink) {
    return c.json({ error: "Unlink SDK failed to initialize" }, 503);
  }

  const body = await c.req.json<{
    token?: string;
    amount: string;
    recipient: string;
  }>();

  const token = body.token || UNLINK_TEST_TOKEN;
  const { amount, recipient } = body;

  if (!amount || !recipient) {
    return c.json(
      { error: "amount and recipient are required" },
      400
    );
  }

  const txId = randomUUID();

  db.prepare(
    `INSERT INTO privacy_transactions (tx_id, type, token, amount, status)
     VALUES (?, 'withdraw', ?, ?, 'pending')`
  ).run(txId, token, amount);

  try {
    const result = await unlink.withdraw({
      recipientEvmAddress: recipient,
      token,
      amount,
    });

    // Poll until the transaction reaches a terminal status
    const confirmed = await unlink.pollTransactionStatus(result.txId, {
      timeoutMs: 120_000,
    });

    db.prepare(
      `UPDATE privacy_transactions
       SET status = ?, tx_id = ?, updated_at = ?
       WHERE tx_id = ?`
    ).run(confirmed.status || 'confirmed', confirmed.txId, Date.now(), txId);

    return c.json({
      txId,
      unlinkTxId: confirmed.txId,
      status: confirmed.status,
    });
  } catch (err: any) {
    db.prepare(
      `UPDATE privacy_transactions
       SET status = 'failed', error = ?, updated_at = unixepoch()
       WHERE tx_id = ?`
    ).run(err.message, txId);

    return c.json({ error: "Withdraw failed", detail: err.message }, 500);
  }
});

export default app;
