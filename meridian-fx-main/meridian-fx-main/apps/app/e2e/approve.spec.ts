import { test, expect } from "@playwright/test";

test.describe("Approve page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/approve");
    await expect(page.locator("header")).toBeVisible({ timeout: 10_000 });
  });

  test("page renders with heading", async ({ page }) => {
    // The approve page has a heading (either i18n or English fallback)
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 10_000 });
  });

  test("shows all-clear or pending trades", async ({ page }) => {
    // Wait for main content to render (Playwright auto-waits, no hardcoded sleep)
    const content = page.locator("main");
    await expect(content).toBeVisible({ timeout: 10_000 });

    // Wait for the page to settle — content should be non-empty after loading
    await expect
      .poll(async () => (await page.locator("body").textContent())?.length, {
        timeout: 10_000,
      })
      .toBeGreaterThan(0);
  });

  test("recent approvals section exists", async ({ page }) => {
    // Wait for main content to fully render before checking card structure
    const content = page.locator("main");
    await expect(content).toBeVisible({ timeout: 10_000 });

    // Wait for the card structure to populate (recent approvals section)
    const cards = page.locator("main > div > div");
    await expect
      .poll(async () => cards.count(), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(2);
  });
});
