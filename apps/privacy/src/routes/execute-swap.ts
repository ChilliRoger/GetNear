import { Hono } from "hono";
import { getUnlinkClient, getUnlinkStatus, UNLINK_TEST_TOKEN } from "../unlink-client.js";
import db from "../db.js";
import { randomUUID } from "node:crypto";

const app = new Hono();

/**
 * POST /api/privacy/execute-swap
 *
 * NOTE: The Unlink docs describe unlink.execute() for calling external
 * smart contracts from a private balance (adapter pattern), but this method
 * is NOT present in SDK v0.0.2-canary.0.
 *
 * Workaround for the hackathon demo: we simulate the privacy-preserving
 * swap by performing a withdraw -> (swap would happen here) -> deposit
 * sequence.  The key privacy property still holds: the on-chain withdraw
 * comes from the Unlink pool address, not the user's EOA.
 *
 * When execute() ships in a future SDK release, this route should be
 * updated to use:
 *   const result = await unlink.execute({
 *     withdrawals: [{ token: tokenIn, amount }],
 *     calls: [{ to, data, value }],
 *     outputs: [{ npk, token: tokenOut, min_amount }],
 *     deadline,
 *   });
 *
 * Body: { tokenIn?: string, tokenOut?: string, amount: string, recipient?: string }
 */
app.post("/", async (c) => {
  // Host header guard removed — the Next.js proxy sets Host to localhost
  // which caused 403 errors in production. CORS middleware handles access control.

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
    tokenIn?: string;
    tokenOut?: string;
    amount: string;
    recipient?: string;
  }>();

  const tokenIn = body.tokenIn || UNLINK_TEST_TOKEN;
  const tokenOut = body.tokenOut || UNLINK_TEST_TOKEN;
  const amount = body.amount || (body as any).amountIn;
  const recipient =
    body.recipient || process.env.DEPLOYER_ADDRESS || "";

  if (!amount) {
    return c.json({ error: "amount is required" }, 400);
  }

  const txId = randomUUID();

  db.prepare(
    `INSERT INTO privacy_transactions (tx_id, type, token, amount, status)
     VALUES (?, 'execute', ?, ?, 'pending')`
  ).run(txId, `${tokenIn}->${tokenOut}`, amount);

  try {
    // --- Phase 1: Withdraw from privacy pool to the deployer address ---
    // The on-chain sender is the Unlink pool, NOT our wallet -- this is
    // the core privacy property we're demonstrating.
    const withdrawResult = await unlink.withdraw({
      recipientEvmAddress: recipient,
      token: tokenIn,
      amount,
    });

    const withdrawConfirmed = await unlink.pollTransactionStatus(
      withdrawResult.txId,
      { timeoutMs: 120_000 }
    );

    console.log(
      `[execute-swap] withdraw done: ${withdrawConfirmed.txId} (${withdrawConfirmed.status})`
    );

    // --- Phase 2: In a real implementation, an on-chain swap would happen
    // here (e.g. Uniswap). For the hackathon demo, we skip the actual swap
    // since there is no liquid DEX on Base Sepolia for the test token. ---

    // --- Phase 3: Deposit the output tokens back into the privacy pool ---
    const approval = await unlink.ensureErc20Approval({
      token: tokenOut,
      amount,
    });
    console.log("[execute-swap] approval:", approval.status);

    const depositResult = await unlink.deposit({
      token: tokenOut,
      amount,
    });

    const depositConfirmed = await unlink.pollTransactionStatus(
      depositResult.txId,
      { timeoutMs: 120_000 }
    );

    console.log(
      `[execute-swap] deposit done: ${depositConfirmed.txId} (${depositConfirmed.status})`
    );

    db.prepare(
      `UPDATE privacy_transactions
       SET status = ?, tx_id = ?, updated_at = ?
       WHERE tx_id = ?`
    ).run('confirmed', withdrawConfirmed.txId, Date.now(), txId);

    return c.json({
      txId,
      withdrawTxId: withdrawConfirmed.txId,
      depositTxId: depositConfirmed.txId,
      status: "confirmed",
      privacyNote:
        "On-chain sender for the withdraw is the Unlink pool -- your wallet address is NOT linked to the transaction",
      sdkNote:
        "Used withdraw+deposit workaround; unlink.execute() not available in SDK v0.0.2-canary.0",
    });
  } catch (err: any) {
    db.prepare(
      `UPDATE privacy_transactions
       SET status = 'failed', error = ?, updated_at = unixepoch()
       WHERE tx_id = ?`
    ).run(err.message, txId);

    return c.json(
      { error: "Execute swap failed", detail: err.message },
      500
    );
  }
});

export default app;
