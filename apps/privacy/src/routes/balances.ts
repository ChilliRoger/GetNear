import { Hono } from "hono";
import { getUnlinkClient, getUnlinkStatus } from "../unlink-client.js";

const app = new Hono();

/**
 * GET /api/privacy/balances
 *
 * Calls unlink.getBalances() which returns { balances: Balance[] }
 * where Balance = { token: string (EVM address), amount: string }.
 *
 * Optional query param ?token=0x... to filter by a single token.
 */
app.get("/", async (c) => {
  const status = getUnlinkStatus();
  if (!status.configured) {
    return c.json({
      balances: [],
      note: "Unlink SDK not configured -- set UNLINK_API_KEY, UNLINK_MNEMONIC, and DEPLOYER_PRIVATE_KEY",
    });
  }

  const unlink = await getUnlinkClient();
  if (!unlink) {
    return c.json({ balances: [], note: "Unlink SDK failed to initialize" });
  }

  try {
    // ensureRegistered() is called lazily by getBalances, but we call it
    // explicitly so any registration error surfaces cleanly.
    await unlink.ensureRegistered();

    const tokenFilter = c.req.query("token");
    const data = await unlink.getBalances(
      tokenFilter ? { token: tokenFilter } : undefined
    );

    // SDK returns { balances: Array<{ token, amount }> }
    // Frontend expects Array<{ token, publicBalance, poolBalance }>
    const balances = (data.balances || []).map((b: { token: string; amount: string }) => ({
      token: b.token,
      publicBalance: "0", // Public EVM balance not tracked by Unlink SDK
      poolBalance: b.amount,
    }));

    return c.json({
      address: await unlink.getAddress(),
      balances,
    });
  } catch (err: any) {
    return c.json(
      { error: "Failed to fetch balances", detail: err.message },
      500
    );
  }
});

export default app;
