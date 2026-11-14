import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ORACLE_URL = (process.env.ORACLE_URL || "http://localhost:38174").replace(/\/+$/, "");

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
    return NextResponse.json({ error: "Oracle unavailable" }, { status: 502 });
  }
}
