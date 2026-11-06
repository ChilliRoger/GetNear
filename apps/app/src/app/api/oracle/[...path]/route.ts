import { NextRequest, NextResponse } from "next/server";

const ORACLE_URL = process.env.ORACLE_URL || "http://localhost:38174";

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join("/");
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
