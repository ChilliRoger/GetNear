import { test, expect } from "@playwright/test";

/**
 * API proxy tests.
 *
 * These hit the Next.js API routes that proxy to the Oracle sidecar.
 * If the Oracle is not running, the proxy returns 502 with
 * { error: "Oracle unavailable" } — we treat that as a known state
 * rather than a test failure, since the Oracle is an external dependency.
 */
test.describe("API proxies", () => {
  test("oracle price comparison endpoint responds", async ({ request }) => {
    const res = await request.get("/api/oracle/api/prices/comparison");
    if (res.ok()) {
      const data = await res.json();
      expect(data.chainlink).toBeDefined();
      expect(data.fynd).toBeDefined();
    } else {
      // Oracle offline — proxy returns 502
      expect(res.status()).toBe(502);
      const data = await res.json();
      expect(data.error).toBe("Oracle unavailable");
    }
  });

  test("oracle strategy decisions endpoint responds", async ({ request }) => {
    const res = await request.get("/api/oracle/api/strategy/decisions?limit=5");
    if (res.ok()) {
      const data = await res.json();
      expect(Array.isArray(data)).toBeTruthy();
    } else {
      expect(res.status()).toBe(502);
      const data = await res.json();
      expect(data.error).toBe("Oracle unavailable");
    }
  });

  test("oracle trades endpoint responds", async ({ request }) => {
    const res = await request.get("/api/oracle/api/trades");
    if (res.ok()) {
      const data = await res.json();
      expect(Array.isArray(data)).toBeTruthy();
    } else {
      expect(res.status()).toBe(502);
      const data = await res.json();
      expect(data.error).toBe("Oracle unavailable");
    }
  });

  test("price history with encoded pair responds", async ({ request }) => {
    const res = await request.get(
      "/api/oracle/prices/history?pair=EURC%2FUSD&hours=1"
    );
    if (res.ok()) {
      const data = await res.json();
      expect(data.pair).toBe("EURC/USD");
      expect(data.points).toBeDefined();
    } else {
      expect(res.status()).toBe(502);
      const data = await res.json();
      expect(data.error).toBe("Oracle unavailable");
    }
  });
});
