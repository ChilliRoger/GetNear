import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    proof,
    nullifier_hash,
    merkle_root,
    credential_type,
    action,
    signal,
  } = body;

  const app_id = process.env.WORLD_ID_APP_ID || process.env.NEXT_PUBLIC_WORLD_ID_APP_ID;

  if (!app_id) {
    // Demo mode — no app_id configured, simulate verification with delay
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return NextResponse.json({
      success: true,
      demo: true,
      message: "World ID verification simulated (demo mode)",
      action,
      signal,
    });
  }

  // Real verification against World ID backend
  const verifyRes = await fetch(
    `https://developer.worldcoin.org/api/v2/verify/${app_id}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nullifier_hash,
        merkle_root,
        proof,
        credential_type,
        action,
        signal,
      }),
    }
  );

  if (verifyRes.ok) {
    const result = await verifyRes.json();
    return NextResponse.json({ success: true, ...result });
  } else {
    const error = await verifyRes.json().catch(() => ({}));
    return NextResponse.json(
      {
        success: false,
        error: (error as Record<string, string>).detail || "Verification failed",
      },
      { status: 400 }
    );
  }
}
