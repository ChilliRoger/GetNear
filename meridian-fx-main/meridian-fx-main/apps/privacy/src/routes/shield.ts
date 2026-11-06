import { Hono } from "hono";
import {
  getUnlinkClient,
  getUnlinkStatus,
  getPublicClient,
} from "../unlink-client.js";
import db from "../db.js";
import {
  SEPOLIA_TOKENS,
  SEPOLIA_TOKEN_META,
  BASE_SEPOLIA_EXPLORER,
} from "@meridian/shared";
import type { ShieldRequest, ShieldResponse } from "@meridian/shared";
import { formatUnits, parseUnits } from "viem";

const app = new Hono();

/**
 * POST /api/privacy/shield
 *
 * 1. Approve token for Unlink Permit2
 * 2. Deposit into Unlink privacy pool
 * 3. Poll for confirmation
 * 4. Write to shield_transactions table
 * 5. Return ShieldResponse
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

  const body = await c.req.json<ShieldRequest>();
  const { token: tokenKey, amount } = body;

  if (!tokenKey || !amount) {
    return c.json({ error: "token and amount are required" }, 400);
  }

  const tokenAddress = SEPOLIA_TOKENS[tokenKey];
  if (!tokenAddress) {
    return c.json({ error: `Unknown or undeployed token: ${tokenKey}` }, 400);
  }

  const meta = SEPOLIA_TOKEN_META[tokenKey];

  // Convert human-readable amount to raw units, or validate if already raw
  let rawAmount: string;
  let displayAmount: string;
  try {
    // If amount contains a decimal point, treat as human-readable and convert
    if (amount.includes(".")) {
      rawAmount = parseUnits(amount, meta.decimals).toString();
      displayAmount = amount;
    } else {
      // Validate it's a valid positive integer string
      const bi = BigInt(amount);
      if (bi <= 0n) throw new Error("Amount must be positive");
      rawAmount = bi.toString();
      displayAmount = formatUnits(bi, meta.decimals);
    }
  } catch {
    return c.json({ error: "Invalid amount — must be a positive number" }, 400);
  }

  // Insert pending record
  const insertStmt = db.prepare(
    `INSERT INTO shield_transactions
       (direction, token, token_symbol, amount, display_amount, status)
     VALUES ('shield', ?, ?, ?, ?, 'pending')`
  );
  const result = insertStmt.run(tokenAddress, meta.symbol, rawAmount, displayAmount);
  const rowId = result.lastInsertRowid;

  try {
    // Step 1: Ensure ERC-20 approval for Permit2
    const approval = await unlink.ensureErc20Approval({
      token: tokenAddress,
      amount: rawAmount,
    });
    console.log(`[shield] approval for ${meta.symbol}:`, approval.status);

    // Step 2: Deposit into the privacy pool
    const depositResult = await unlink.deposit({
      token: tokenAddress,
      amount: rawAmount,
    });

    const shieldTxId = depositResult.txId;
    const evmTxHash = depositResult.evmTxHash || approval.txHash || "";

    // Step 3: Poll until confirmed
    let finalStatus = depositResult;
    if (shieldTxId) {
      finalStatus = await unlink.pollTransactionStatus(shieldTxId, {
        timeoutMs: 120_000,
        intervalMs: 5_000,
      });
    }

    const rawStatus = (finalStatus.status || "").toUpperCase();
    const confirmedStatus = rawStatus === "FAILED" ? "failed" : "confirmed";

    const explorerUrl = evmTxHash
      ? `${BASE_SEPOLIA_EXPLORER}/tx/${evmTxHash}`
      : "";

    // Step 4: Update DB
    db.prepare(
      `UPDATE shield_transactions
       SET status = ?, tx_hash = ?, unlink_tx_id = ?, explorer_url = ?
       WHERE id = ?`
    ).run(confirmedStatus, evmTxHash, shieldTxId, explorerUrl, rowId);

    // Step 5: Return response
    return c.json({
      ok: true,
      shieldTxId: shieldTxId || "",
      evmTxHash: evmTxHash || "",
      explorerUrl,
      status: confirmedStatus,
    } satisfies ShieldResponse);
  } catch (err: any) {
    db.prepare(
      `UPDATE shield_transactions SET status = 'failed' WHERE id = ?`
    ).run(rowId);

    return c.json(
      { error: "Shield failed", detail: err.message },
      500
    );
  }
});

export default app;
