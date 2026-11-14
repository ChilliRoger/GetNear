import { NextRequest, NextResponse } from "next/server";

const ORACLE_URL = process.env.ORACLE_URL || "http://localhost:38174";

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join("/");

  // Read-only by default. The only writes the dashboard may proxy are the demo clock and simulated order
  // intake; strategy config, approvals and cancellations are reachable only from the local dev console.
  if (req.method !== "GET" && req.method !== "HEAD") {
    const writable = req.method === "POST" && (path === "api/demo/speed" || path === "api/trades");
    if (!writable) {
      return NextResponse.json({ error: "Not allowed through the dashboard proxy" }, { status: 403 });
    }
  }
  const search = new URL(req.url).search;
  const url = `${ORACLE_URL}/${path}${search}`;

  const headers: Record<string, string> = {
    "Content-Type": req.headers.get("Content-Type") || "application/json",
  };

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }

  try {
    const res = await fetch(url, init);
    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
    });
  } catch {
    return NextResponse.json(
      { error: "Oracle unavailable" },
      { status: 502 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
