import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { getUnlinkStatus } from "./unlink-client.js";

import balancesRoute from "./routes/balances.js";
import faucetRoute from "./routes/faucet.js";
import depositRoute from "./routes/deposit.js";
import executeSwapRoute from "./routes/execute-swap.js";
import withdrawRoute from "./routes/withdraw.js";
import transactionsRoute from "./routes/transactions.js";
import demoRoute from "./routes/demo.js";

// v2 routes
import publicBalancesRoute from "./routes/public-balances.js";
import shieldedBalancesRoute from "./routes/shielded-balances.js";
import shieldRoute from "./routes/shield.js";
import unshieldRoute from "./routes/unshield.js";
import mintRoute from "./routes/mint.js";
import shieldHistoryRoute from "./routes/shield-history.js";
import swapEstimateRoute from "./routes/swap-estimate.js";

const app = new Hono();

// CORS — allow the Next.js frontend and local dev
app.use(
  "*",
  cors({
    origin: ["http://localhost:3000", "http://localhost:5173", "*"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Health check
app.get("/api/privacy/health", (c) => {
  const unlinkStatus = getUnlinkStatus();
  return c.json({
    service: "@meridian-fx/privacy",
    status: "ok",
    uptime: process.uptime(),
    unlink: unlinkStatus,
  });
});
app.get("/health", (c) => {
  const unlinkStatus = getUnlinkStatus();
  return c.json({
    service: "@meridian-fx/privacy",
    status: "ok",
    uptime: process.uptime(),
    unlink: unlinkStatus,
  });
});

// Privacy API routes (v2 — Private Treasury)
// Registered before v1 so more-specific paths like /balances/public
// and /shield/history match before the shorter /balances and /shield prefixes.
app.route("/api/privacy/balances/public", publicBalancesRoute);
app.route("/api/privacy/balances/shielded", shieldedBalancesRoute);
app.route("/api/privacy/shield/history", shieldHistoryRoute);
app.route("/api/privacy/shield", shieldRoute);
app.route("/api/privacy/unshield", unshieldRoute);
app.route("/api/privacy/mint", mintRoute);
app.route("/api/privacy/swap/estimate", swapEstimateRoute);

// Privacy API routes (v1 — legacy)
app.route("/api/privacy/balances", balancesRoute);
app.route("/api/privacy/faucet", faucetRoute);
app.route("/api/privacy/deposit", depositRoute);
app.route("/api/privacy/execute-swap", executeSwapRoute);
app.route("/api/privacy/withdraw", withdrawRoute);
app.route("/api/privacy/transactions", transactionsRoute);
app.route("/api/privacy/demo", demoRoute);

const PORT = Number(process.env.PRIVACY_PORT || 38175);

console.log(`[privacy] starting on port ${PORT}…`);
serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[privacy] listening on http://localhost:${info.port}`);
  console.log(`[privacy] unlink status:`, getUnlinkStatus());
});
