import { Hono } from "hono";
import {
  getUnlinkClient,
  getUnlinkStatus,
} from "../unlink-client.js";
import db from "../db.js";
import {
  SEPOLIA_TOKEN_META,
  BASE_SEPOLIA_EXPLORER,
  DEPLOYER_ADDRESS,
} from "@meridian/shared";
import type { UnshieldRequest, UnshieldResponse } from "@meridian/shared";
import { formatUnits, parseUnits } from "viem";

const app = new Hono();

// Reverse lookup: lowercase address -> meta
const tokenLookup = new Map<
  string,
  { symbol: string; decimals: number }
>();
for (const meta of Object.values(SEPOLIA_TOKEN_META)) {
  if (meta.address) {
    tokenLookup.set(meta.address.toLowerCase(), {
      symbol: meta.symbol,
      decimals: meta.decimals,
    });
  }
}

/**
 * POST /api/privacy/unshield
 *
 * 1. Withdraw from Unlink privacy pool to deployer address (or specified recipient)
 * 2. Poll for confirmation
 * 3. Write to shield_transactions table
 * 4. Return UnshieldResponse
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

  const body = await c.req.json<UnshieldRequest>();
  const { token, amount, recipientAddress } = body;

  if (!token || !amount) {
    return c.json({ error: "token and amount are required" }, 400);
  }

  const recipient = recipientAddress || DEPLOYER_ADDRESS;
  const meta = tokenLookup.get(token.toLowerCase());
  const symbol = meta?.symbol ?? "UNKNOWN";
  const decimals = meta?.decimals ?? 18;

  // Convert human-readable amount to raw units, or validate if already raw
  let rawAmount: string;
  let displayAmount: string;
  try {
    if (amount.includes(".")) {
      rawAmount = parseUnits(amount, decimals).toString();
      displayAmount = amount;
    } else {
      const bi = BigInt(amount);
      if (bi <= 0n) throw new Error("Amount must be positive");
      rawAmount = bi.toString();
      displayAmount = formatUnits(bi, decimals);
    }
  } catch {
    return c.json({ error: "Invalid amount — must be a positive number" }, 400);
  }

  // Insert pending record
  const insertStmt = db.prepare(
    `INSERT INTO shield_transactions
       (direction, token, token_symbol, amount, display_amount, status)
     VALUES ('unshield', ?, ?, ?, ?, 'pending')`
  );
  const result = insertStmt.run(token, symbol, rawAmount, displayAmount);
  const rowId = result.lastInsertRowid;

  try {
    // Step 1: Withdraw from Unlink pool
    const withdrawResult = await unlink.withdraw({
      recipientEvmAddress: recipient,
      token,
      amount: rawAmount,
    });

    const unshieldTxId = withdrawResult.txId;

    // Step 2: Poll for confirmation
    const confirmed = await unlink.pollTransactionStatus(unshieldTxId, {
      timeoutMs: 120_000,
    });

    const evmTxHash = confirmed.evmTxHash || "";
    const rawStatus = (confirmed.status || "").toUpperCase();
    const confirmedStatus = rawStatus === "FAILED" ? "failed" : "confirmed";
    const explorerUrl = evmTxHash
      ? `${BASE_SEPOLIA_EXPLORER}/tx/${evmTxHash}`
      : "";

    // Step 3: Update DB
    db.prepare(
      `UPDATE shield_transactions
       SET status = ?, tx_hash = ?, unlink_tx_id = ?, explorer_url = ?
       WHERE id = ?`
    ).run(confirmedStatus, evmTxHash, unshieldTxId, explorerUrl, rowId);

    // Step 4: Return response
    return c.json({
      ok: true,
      unshieldTxId: unshieldTxId || "",
      evmTxHash: evmTxHash || "",
      explorerUrl,
      status: confirmedStatus,
    } satisfies UnshieldResponse);
  } catch (err: any) {
    db.prepare(
      `UPDATE shield_transactions SET status = 'failed' WHERE id = ?`
    ).run(rowId);

    return c.json(
      { error: "Unshield failed", detail: err.message },
      500
    );
  }
});

export default app;
