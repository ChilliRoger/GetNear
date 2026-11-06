import { Hono } from "hono";
import { getWalletClient, getPublicClient } from "../unlink-client.js";
import { SEPOLIA_TOKENS, SEPOLIA_TOKEN_META } from "@meridian/shared";
import type { MintRequest, MintResponse } from "@meridian/shared";
import { parseAbi } from "viem";

const erc20MintAbi = parseAbi([
  "function mint(address to, uint256 amount)",
]);

const app = new Hono();

/**
 * POST /api/privacy/mint
 *
 * Calls the public mint() function on the specified mock token contract.
 * These are Base Sepolia testnet tokens with open minting for demo purposes.
 */
app.post("/", async (c) => {
  const wallet = getWalletClient();
  const pub = getPublicClient();

  if (!wallet) {
    return c.json({ error: "Wallet not configured -- set DEPLOYER_PRIVATE_KEY" }, 503);
  }

  const body = await c.req.json<MintRequest>();
  const { token: tokenKey, amount } = body;

  if (!tokenKey || !amount) {
    return c.json({ error: "token and amount are required" }, 400);
  }

  const tokenAddress = SEPOLIA_TOKENS[tokenKey];
  if (!tokenAddress) {
    return c.json({ error: `Unknown or undeployed token: ${tokenKey}` }, 400);
  }

  const meta = SEPOLIA_TOKEN_META[tokenKey];

  try {
    const deployer = wallet.account.address;

    const txHash = await wallet.writeContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20MintAbi,
      functionName: "mint",
      args: [deployer, BigInt(amount)],
    });

    // Wait for the transaction to be mined
    await pub.waitForTransactionReceipt({ hash: txHash });

    return c.json({
      ok: true,
      txHash,
      token: meta.symbol,
      amount,
    } satisfies MintResponse);
  } catch (err: any) {
    return c.json(
      { error: "Mint failed", detail: err.message },
      500
    );
  }
});

export default app;
