import { Hono } from "hono";
import { getUnlinkClient, getUnlinkStatus, UNLINK_TEST_TOKEN } from "../unlink-client.js";
import db from "../db.js";
import { randomUUID } from "node:crypto";

const app = new Hono();

/**
 * POST /api/privacy/deposit
 *
 * SDK method: unlink.deposit({ token, amount, deadline?, nonce?, evm? })
 *   -> Promise<TransactionResult>  where TransactionResult = { txId, status }
 *
 * Before depositing, we call ensureErc20Approval() to handle the on-chain
 * Permit2 approval.  The SDK's deposit() then executes a two-phase flow:
 *   1. POST /transactions/deposit/prepare  -> { tx_id, notes_hash }
 *   2. Sign Permit2 witness typed data
 *   3. POST /transactions/deposit/{tx_id}/submit
 *
 * Body: { token: string, amount: string }
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

  const body = await c.req.json<{ token?: string; amount: string }>();
  const token = body.token || UNLINK_TEST_TOKEN;
  const { amount } = body;

  if (!amount) {
    return c.json({ error: "amount is required" }, 400);
  }

  const txId = randomUUID();

  db.prepare(
    `INSERT INTO privacy_transactions (tx_id, type, token, amount, status)
     VALUES (?, 'deposit', ?, ?, 'pending')`
  ).run(txId, token, amount);

  try {
    // Step 1: Ensure ERC-20 approval for Permit2
    const approval = await unlink.ensureErc20Approval({ token, amount });
    console.log("[deposit] approval:", approval.status);

    // Step 2: Deposit into the privacy pool
    const result = await unlink.deposit({ token, amount });

    // Step 3: Poll until relayed
    let finalStatus = result;
    if (result.txId) {
      finalStatus = await unlink.pollTransactionStatus(result.txId, {
        timeoutMs: 120_000,
        intervalMs: 5_000,
      });
    }

    db.prepare(
      `UPDATE privacy_transactions
       SET status = ?, tx_id = ?, updated_at = ?
       WHERE tx_id = ?`
    ).run(finalStatus.status || 'confirmed', finalStatus.txId || result.txId, Date.now(), txId);

    return c.json({
      txId,
      unlinkTxId: finalStatus.txId || result.txId,
      depositTxId: result.txId,
      status: finalStatus.status,
    });
  } catch (err: any) {
    db.prepare(
      `UPDATE privacy_transactions
       SET status = 'failed', error = ?, updated_at = unixepoch()
       WHERE tx_id = ?`
    ).run(err.message, txId);

    return c.json({ error: "Deposit failed", detail: err.message }, 500);
  }
});

export default app;
