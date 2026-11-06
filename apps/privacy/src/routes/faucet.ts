import { Hono } from "hono";
import {
  getUnlinkClient,
  getUnlinkStatus,
  getWalletClient,
  getPublicClient,
  UNLINK_TEST_TOKEN,
} from "../unlink-client.js";
import db from "../db.js";
import { randomUUID } from "node:crypto";
import { parseAbi, maxUint256 } from "viem";

const ULNKM_TOKEN = "0x7501de8ea37a21e20e6e65947d2ecab0e9f061a7";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const FAUCET_AMOUNT = "100000000000000000000"; // 100 ULNKm (18 decimals)

const erc20Abi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

const app = new Hono();

/**
 * POST /api/privacy/faucet
 *
 * The Unlink docs describe `unlink.faucet.requestTestTokens()` and
 * `unlink.faucet.requestPrivateTokens()`, but these methods are NOT present
 * in SDK v0.0.2-canary.0.
 *
 * Workaround: Mints ULNKm testnet tokens via the token's public mint(),
 * approves Permit2, and deposits into the Unlink privacy pool -- all in one
 * step.  This achieves the same end result (private balance) while the faucet
 * API is unavailable.
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

  const wallet = getWalletClient();
  const pub = getPublicClient();
  if (!wallet || !pub) {
    return c.json({ error: "EVM clients not available" }, 503);
  }

  const txId = randomUUID();
  db.prepare(
    `INSERT INTO privacy_transactions (tx_id, type, token, amount, status)
     VALUES (?, 'faucet', ?, ?, 'pending')`
  ).run(txId, ULNKM_TOKEN, FAUCET_AMOUNT);

  try {
    const deployer = wallet.account.address;

    // Step 1: Mint ULNKm testnet tokens (public mint)
    const mintTx = await wallet.writeContract({
      address: ULNKM_TOKEN as `0x${string}`,
      abi: erc20Abi,
      functionName: "mint",
      args: [deployer, BigInt(FAUCET_AMOUNT)],
    });
    await pub.waitForTransactionReceipt({ hash: mintTx });

    // Step 2: Approve Permit2 if needed
    const allowance = await pub.readContract({
      address: ULNKM_TOKEN as `0x${string}`,
      abi: erc20Abi,
      functionName: "allowance",
      args: [deployer, PERMIT2 as `0x${string}`],
    });

    let approveTx: string | null = null;
    if ((allowance as bigint) < BigInt(FAUCET_AMOUNT)) {
      approveTx = await wallet.writeContract({
        address: ULNKM_TOKEN as `0x${string}`,
        abi: erc20Abi,
        functionName: "approve",
        args: [PERMIT2 as `0x${string}`, maxUint256],
      });
      await pub.waitForTransactionReceipt({ hash: approveTx });
    }

    // Step 3: Deposit into Unlink privacy pool
    const depositResult = await unlink.deposit({
      token: ULNKM_TOKEN,
      amount: FAUCET_AMOUNT,
    });

    // Step 4: Poll until relayed
    let finalStatus = depositResult;
    if (depositResult.txId) {
      finalStatus = await unlink.pollTransactionStatus(depositResult.txId, {
        timeoutMs: 120_000,
        intervalMs: 5_000,
      });
    }

    db.prepare(
      `UPDATE privacy_transactions
       SET status = ?, tx_id = ?, updated_at = ?
       WHERE tx_id = ?`
    ).run(finalStatus.status || 'confirmed', mintTx, Date.now(), txId);

    return c.json({
      txId,
      status: "confirmed",
      mintTx,
      approveTx,
      depositTxId: depositResult.txId,
      depositStatus: finalStatus.status,
      token: ULNKM_TOKEN,
      amount: FAUCET_AMOUNT,
      note: "Deposited tokens into privacy pool (faucet API not available in SDK canary build)",
    });
  } catch (err: any) {
    db.prepare(
      `UPDATE privacy_transactions
       SET status = 'failed', error = ?, updated_at = unixepoch()
       WHERE tx_id = ?`
    ).run(err.message, txId);

    return c.json({ error: "Faucet request failed", detail: err.message }, 500);
  }
});

export default app;
