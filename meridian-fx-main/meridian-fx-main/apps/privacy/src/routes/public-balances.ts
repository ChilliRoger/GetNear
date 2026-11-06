import { Hono } from "hono";
import { getPublicClient } from "../unlink-client.js";
import {
  SEPOLIA_TOKEN_META,
  DEPLOYER_ADDRESS,
} from "@meridian/shared";
import type { PublicBalancesResponse } from "@meridian/shared";
import { parseAbi, formatUnits } from "viem";

const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
]);

const app = new Hono();

/**
 * GET /api/privacy/balances/public
 *
 * Reads on-chain ERC-20 balances for the deployer wallet on Base Sepolia
 * for every token in SEPOLIA_TOKEN_META.
 */
app.get("/", async (c) => {
  const pub = getPublicClient();

  const entries = Object.entries(SEPOLIA_TOKEN_META) as Array<
    [string, { address: string; decimals: number; symbol: string }]
  >;

  const balances: PublicBalancesResponse["balances"] = [];

  for (const [key, meta] of entries) {
    // Skip tokens with empty addresses (not yet deployed)
    if (!meta.address) {
      balances.push({
        token: key as keyof typeof import("@meridian/shared").SEPOLIA_TOKENS,
        symbol: meta.symbol,
        balance: "0",
        decimals: meta.decimals,
        displayBalance: "0",
      });
      continue;
    }

    try {
      const raw = await pub.readContract({
        address: meta.address as `0x${string}`,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [DEPLOYER_ADDRESS as `0x${string}`],
      });

      const balance = (raw as bigint).toString();
      const displayBalance = formatUnits(raw as bigint, meta.decimals);

      balances.push({
        token: key as keyof typeof import("@meridian/shared").SEPOLIA_TOKENS,
        symbol: meta.symbol,
        balance,
        decimals: meta.decimals,
        displayBalance,
      });
    } catch (err: any) {
      // If a contract call fails (e.g. not deployed), return zero
      balances.push({
        token: key as keyof typeof import("@meridian/shared").SEPOLIA_TOKENS,
        symbol: meta.symbol,
        balance: "0",
        decimals: meta.decimals,
        displayBalance: "0",
      });
    }
  }

  return c.json({
    address: DEPLOYER_ADDRESS,
    balances,
  } satisfies PublicBalancesResponse);
});

export default app;
