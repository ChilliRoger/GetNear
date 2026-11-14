import { NextRequest, NextResponse } from "next/server";
import { OneClickQuoteSource, FrankfurterReferenceSource, computeDeviationBps, bpsToPercent } from "@getnear/shared";

export const dynamic = "force-dynamic";

const ORACLE_URL = (process.env.ORACLE_URL || "http://localhost:38174").replace(/\/+$/, "");

const quoteSource = new OneClickQuoteSource();
const refSource = new FrankfurterReferenceSource();

/**
 * When the oracle service is not reachable (e.g. the dashboard is deployed on its own), the headline rate is
 * still answered live: one 1Click dry quote next to the ECB reference. History and the market score need the
 * oracle's recorded samples, so they report "unavailable" instead.
 */
async function livePrice() {
  const quote = await quoteSource.getQuote({ fromToken: "USDC", toToken: "EURe", amountIn: "10000000", dry: true });
  const ref = await refSource.getReferenceRate("USD/EUR");
  const devBps = computeDeviationBps(quote.rate, ref.rate);
  return {
    "USDC/EURe": {
      quotePrice: quote.rate,
      refPrice: ref.rate,
      deviationBps: devBps,
      deviationPercent: bpsToPercent(devBps),
      timestamp: Math.floor(Date.now() / 1000),
      quoteId: quote.quoteId,
      provenance: "1Click dry-quote & ECB via Frankfurter (live, oracle offline)",
    },
  };
}

/** Read-only proxy to the oracle's market endpoints. The oracle holds no orders and signs nothing. */
export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.map(encodeURIComponent).join("/");
  const search = new URL(req.url).search;
  try {
    const res = await fetch(`${ORACLE_URL}/${path}${search}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
    });
  } catch {
    if (path === "prices/current") {
      try {
        return NextResponse.json(await livePrice());
      } catch {
        /* fall through to the offline answer */
      }
    }
    return NextResponse.json({ error: "Oracle unavailable" }, { status: 502 });
  }
}
