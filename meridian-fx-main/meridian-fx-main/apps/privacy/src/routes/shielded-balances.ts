import { Hono } from "hono";
import { getUnlinkClient, getUnlinkStatus } from "../unlink-client.js";
import { SEPOLIA_TOKEN_META } from "@meridian/shared";
import type { ShieldedBalancesResponse } from "@meridian/shared";
import { formatUnits } from "viem";

const app = new Hono();

// Build a reverse lookup: lowercase token address -> { symbol, decimals }
const tokenLookup = new Map<string, { symbol: string; decimals: number }>();
for (const meta of Object.values(SEPOLIA_TOKEN_META)) {
  if (meta.address) {
    tokenLookup.set(meta.address.toLowerCase(), {
      symbol: meta.symbol,
      decimals: meta.decimals,
    });
  }
}

/**
 * GET /api/privacy/balances/shielded
 *
 * Calls Unlink SDK getBalances() and maps the result to ShieldedBalancesResponse.
 */
app.get("/", async (c) => {
  const status = getUnlinkStatus();
  if (!status.configured) {
    return c.json(
      {
        error: "Unlink SDK not configured",
        detail: "Set UNLINK_API_KEY, UNLINK_MNEMONIC, and DEPLOYER_PRIVATE_KEY",
      },
      503
    );
  }

  const unlink = await getUnlinkClient();
  if (!unlink) {
    return c.json({ error: "Unlink SDK failed to initialize" }, 500);
  }

  try {
    await unlink.ensureRegistered();

    const data = await unlink.getBalances();
    const unlinkAddress = await unlink.getAddress();

    const balances: ShieldedBalancesResponse["balances"] = (
      data.balances || []
    ).map((b: { token: string; amount: string }) => {
      const meta = tokenLookup.get(b.token.toLowerCase());
      const decimals = meta?.decimals ?? 18;
      return {
        token: b.token,
        symbol: meta?.symbol ?? "UNKNOWN",
        amount: b.amount,
        displayAmount: formatUnits(BigInt(b.amount), decimals),
      };
    });

    return c.json({
      unlinkAddress,
      balances,
    } satisfies ShieldedBalancesResponse);
  } catch (err: any) {
    return c.json(
      { error: "Failed to fetch shielded balances", detail: err.message },
      500
    );
  }
});

export default app;
