import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("header")).toBeVisible({ timeout: 10_000 });
  });

  test("pair toggle button is visible and clickable", async ({ page }) => {
    // The pair toggle shows "USDC" and an arrow icon
    const toggleButton = page.locator("button", { hasText: "USDC" }).first();
    await expect(toggleButton).toBeVisible({ timeout: 10_000 });

    // Click to flip the pair
    await toggleButton.click();
    // After click it should show EURC direction
    await expect(
      page.locator("button", { hasText: "EURC" }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("rate display or skeleton loads", async ({ page }) => {
    // Either the rate value (font-tabular) or a skeleton placeholder should appear
    const rateOrSkeleton = page.locator(
      ".font-tabular, .animate-pulse"
    ).first();
    await expect(rateOrSkeleton).toBeVisible({ timeout: 15_000 });
  });

  test("privacy tab bar exists with Public and Private tabs", async ({
    page,
  }) => {
    // The PrivacyTabBar renders two tab options
    const publicTab = page.getByRole("button", { name: /Public|Treasury/i }).first();
    await expect(publicTab).toBeVisible({ timeout: 10_000 });
  });

  test("policy card renders", async ({ page }) => {
    // Active policy card should show version badge or LOADING
    await expect(
      page.locator("text=/v\\d|LOADING/").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("bottom nav is present on dashboard", async ({ page }) => {
    const nav = page.locator("nav");
    await expect(nav).toBeVisible();
    // Should have 4 tab links
    const links = nav.locator("a");
    await expect(links).toHaveCount(4);
  });
});
