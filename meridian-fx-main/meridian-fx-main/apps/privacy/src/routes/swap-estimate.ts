import { Hono } from "hono";
import { SEPOLIA_TOKEN_META } from "@meridian/shared";
import type { SwapEstimateResponse } from "@meridian/shared";
// parseUnits no longer needed — using BigInt-scaled rate math
// formatUnits no longer needed — removed float conversion

const app = new Hono();

const ORACLE_URL =
  process.env.ORACLE_URL || "http://localhost:38174";

// Build reverse lookup: lowercase address -> { symbol, decimals }
const tokenByAddress = new Map<
  string,
  { symbol: string; decimals: number }
>();
for (const meta of Object.values(SEPOLIA_TOKEN_META)) {
  if (meta.address) {
    tokenByAddress.set(meta.address.toLowerCase(), {
      symbol: meta.symbol,
      decimals: meta.decimals,
    });
  }
}

/**
 * GET /api/privacy/swap/estimate?tokenIn=<addr>&tokenOut=<addr>&amountIn=<raw>
 *
 * Fetches the current EURC/USD rate from the Oracle's /api/prices/comparison
 * endpoint and computes estimated output.
 *
 * For the hackathon, EURC<->USDC is the primary pair.  The oracle tracks
 * EURC/USD, so:
 *   - EURC -> USDC: output = amountIn * rate
 *   - USDC -> EURC: output = amountIn / rate
 *
 * Returns SwapEstimateResponse.
 */
app.get("/", async (c) => {
  const tokenIn = c.req.query("tokenIn") || "";
  const tokenOut = c.req.query("tokenOut") || "";
  const amountIn = c.req.query("amountIn") || "";

  if (!tokenIn || !tokenOut || !amountIn) {
    return c.json(
      { error: "tokenIn, tokenOut, and amountIn are required query params" },
      400
    );
  }

  const inMeta = tokenByAddress.get(tokenIn.toLowerCase());
  const outMeta = tokenByAddress.get(tokenOut.toLowerCase());

  if (!inMeta || !outMeta) {
    return c.json({ error: "Unknown token address" }, 400);
  }

  try {
    // Fetch current rates from oracle
    const res = await fetch(`${ORACLE_URL}/api/prices/comparison`);
    if (!res.ok) {
      return c.json(
        { error: "Oracle unavailable", detail: `HTTP ${res.status}` },
        502
      );
    }

    const oracle = (await res.json()) as {
      chainlink: { price: number; updatedAt: number };
      fynd: { price: number; updatedAt: number };
      uniswap: { price: number; updatedAt: number };
      divergenceBps: number;
      avg24h: number;
    };

    // Compute average rate from available sources
    const prices = [
      oracle.chainlink?.price,
      oracle.fynd?.price,
      oracle.uniswap?.price,
    ].filter((p): p is number => typeof p === "number" && p > 0);

    if (prices.length === 0) {
      return c.json({ error: "No price data available from oracle" }, 502);
    }

    const eurcUsdRate =
      prices.reduce((a, b) => a + b, 0) / prices.length;

    // Determine direction and compute output
    const inSymbol = inMeta.symbol.toUpperCase();
    const outSymbol = outMeta.symbol.toUpperCase();

    let rate: number;
    if (inSymbol === "EURC" && outSymbol === "USDC") {
      // EURC -> USDC: multiply by rate (EURC/USD ≈ 1.08)
      rate = eurcUsdRate;
    } else if (inSymbol === "USDC" && outSymbol === "EURC") {
      // USDC -> EURC: divide by rate
      rate = 1 / eurcUsdRate;
    } else {
      // For other pairs, use 1:1 as a fallback for the hackathon
      rate = 1;
    }

    // Convert using BigInt-scaled rate to avoid JS float precision loss.
    // Scale rate to 18-decimal fixed-point, multiply, then adjust decimals.
    const RATE_SCALE = 10n ** 18n;
    const scaledRate = BigInt(Math.round(rate * Number(RATE_SCALE)));
    const rawIn = BigInt(amountIn);

    // rawOut = rawIn * scaledRate / RATE_SCALE, adjusted for decimal difference
    let estimatedRaw: bigint;
    if (inMeta.decimals === outMeta.decimals) {
      estimatedRaw = (rawIn * scaledRate) / RATE_SCALE;
    } else if (inMeta.decimals > outMeta.decimals) {
      const decimalDiff = 10n ** BigInt(inMeta.decimals - outMeta.decimals);
      estimatedRaw = (rawIn * scaledRate) / (RATE_SCALE * decimalDiff);
    } else {
      const decimalDiff = 10n ** BigInt(outMeta.decimals - inMeta.decimals);
      estimatedRaw = (rawIn * scaledRate * decimalDiff) / RATE_SCALE;
    }
    const estimatedOutput = estimatedRaw.toString();

    return c.json({
      estimatedOutput,
      rate,
      source: "mainnet-oracle",
      priceImpactBps: oracle.divergenceBps ?? null,
    } satisfies SwapEstimateResponse);
  } catch (err: any) {
    return c.json(
      { error: "Swap estimate failed", detail: err.message },
      500
    );
  }
});

export default app;
