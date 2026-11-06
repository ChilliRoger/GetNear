import { Hono } from "hono";
import {
  getUnlinkClient,
  getUnlinkStatus,
  getWalletClient,
  getPublicClient,
  UNLINK_TEST_TOKEN,
} from "../unlink-client.js";
import db from "../db.js";
import { parseAbi, maxUint256 } from "viem";

const ULNKM_TOKEN = "0x7501de8ea37a21e20e6e65947d2ecab0e9f061a7";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const erc20Abi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

const app = new Hono();

/**
 * POST /api/privacy/demo -- kick off the full automated flow.
 *
 * Demonstrates the Unlink privacy-preserving lifecycle using only methods
 * available in SDK v0.0.2-canary.0:
 *
 *   1. ensureRegistered()     -- register the Unlink account if needed
 *   2. ensureErc20Approval()  -- approve Permit2 for the input token
 *   3. deposit()              -- move tokens into the privacy pool
 *   4. (execute skipped)      -- unlink.execute() not in canary SDK
 *   5. withdraw()             -- move tokens out to a fresh address
 *
 * The key privacy property: the on-chain withdraw tx comes from the Unlink
 * pool address, NOT the original depositor's EOA.
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

  const body = await c.req
    .json<{
      inputToken?: string;
      outputToken?: string;
      token?: string;
      amount?: string;
      recipient?: string;
    }>()
    .catch(() => ({}));

  // Default to ULNKm testnet token with 1 token (18 decimals)
  const token = body.token || body.inputToken || ULNKM_TOKEN;
  const amount = body.amount || "1000000000000000000";
  const recipient = body.recipient || process.env.DEPLOYER_ADDRESS || "";

  // Create demo run record
  const result = db
    .prepare(
      `INSERT INTO demo_runs (step, input_token, output_token, input_amount)
       VALUES ('init', ?, ?, ?)`
    )
    .run(token, token, amount);

  const runId = Number(result.lastInsertRowid);

  // Run the full flow asynchronously so caller can poll
  runDemo(unlink, runId, token, amount, recipient).catch((err) => {
    console.error(`[demo ${runId}] unhandled error:`, err);
  });

  return c.json({ runId, status: "started" });
});

/** GET /api/privacy/demo/:id -- poll demo run status */
app.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = db.prepare(`SELECT * FROM demo_runs WHERE id = ?`).get(id);

  if (!row) {
    return c.json({ error: "Demo run not found" }, 404);
  }

  return c.json(row);
});

// ---------------------------------------------------------------------------

async function runDemo(
  unlink: any,
  runId: number,
  token: string,
  amount: string,
  recipient: string
) {
  const updateStep = db.prepare(
    `UPDATE demo_runs SET step = ? WHERE id = ?`
  );
  const failRun = db.prepare(
    `UPDATE demo_runs SET step = 'failed', error = ?, completed_at = unixepoch() WHERE id = ?`
  );

  try {
    const wallet = getWalletClient();
    const pub = getPublicClient();

    // --- Step 1: Mint + Approve + Deposit ---
    updateStep.run("depositing", runId);
    console.log(
      `[demo ${runId}] minting and depositing ${amount} of ${token}...`
    );

    if (wallet && pub) {
      const deployer = wallet.account.address;

      // Mint tokens
      const mintTx = await wallet.writeContract({
        address: token as `0x${string}`,
        abi: erc20Abi,
        functionName: "mint",
        args: [deployer, BigInt(amount)],
      });
      await pub.waitForTransactionReceipt({ hash: mintTx });
      console.log(`[demo ${runId}] minted, tx: ${mintTx}`);

      // Approve Permit2 if needed
      const allowance = await pub.readContract({
        address: token as `0x${string}`,
        abi: erc20Abi,
        functionName: "allowance",
        args: [deployer, PERMIT2 as `0x${string}`],
      });

      if ((allowance as bigint) < BigInt(amount)) {
        const approveTx = await wallet.writeContract({
          address: token as `0x${string}`,
          abi: erc20Abi,
          functionName: "approve",
          args: [PERMIT2 as `0x${string}`, maxUint256],
        });
        await pub.waitForTransactionReceipt({ hash: approveTx });
        console.log(`[demo ${runId}] approved Permit2, tx: ${approveTx}`);
      }
    }

    // Deposit into Unlink privacy pool
    const depositResult = await unlink.deposit({ token, amount });

    // Poll deposit until relayed
    if (depositResult.txId) {
      await unlink.pollTransactionStatus(depositResult.txId, {
        timeoutMs: 120_000,
        intervalMs: 5_000,
      });
    }

    db.prepare(`UPDATE demo_runs SET deposit_tx_id = ? WHERE id = ?`).run(
      depositResult?.txId ?? null,
      runId
    );
    console.log(`[demo ${runId}] deposit done`, depositResult);

    // --- Step 2: Execute (skipped -- not in SDK canary) ---
    updateStep.run("executing", runId);
    console.log(
      `[demo ${runId}] execute step skipped (not available in SDK v0.0.2-canary.0)`
    );

    db.prepare(`UPDATE demo_runs SET execute_tx_id = ? WHERE id = ?`).run(
      "skipped-not-in-canary-sdk",
      runId
    );

    // --- Step 3: Withdraw (private -> public) ---
    updateStep.run("withdrawing", runId);
    console.log(`[demo ${runId}] withdrawing to ${recipient}...`);

    if (recipient) {
      console.log(`[demo ${runId}] withdrawing to ${recipient}...`);
      const withdrawResult = await unlink.withdraw({
        recipientEvmAddress: recipient,
        token,
        amount,
      });

      // Poll withdraw until relayed
      if (withdrawResult.txId) {
        await unlink.pollTransactionStatus(withdrawResult.txId, {
          timeoutMs: 120_000,
          intervalMs: 5_000,
        });
      }

      db.prepare(
        `UPDATE demo_runs SET withdraw_tx_id = ?, output_amount = ? WHERE id = ?`
      ).run(withdrawResult?.txId ?? null, amount, runId);

      console.log(
        `[demo ${runId}] withdraw done`, withdrawResult
      );
    }

    // --- Complete ---
    db.prepare(
      `UPDATE demo_runs SET step = 'complete', completed_at = unixepoch() WHERE id = ?`
    ).run(runId);

    console.log(`[demo ${runId}] complete`);
  } catch (err: any) {
    console.error(`[demo ${runId}] failed:`, err);
    failRun.run(err.message, runId);
  }
}

export default app;
