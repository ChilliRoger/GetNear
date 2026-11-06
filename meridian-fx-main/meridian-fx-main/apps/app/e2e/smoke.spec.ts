import { test, expect } from "@playwright/test";

test.describe("Smoke tests — every page loads without crash", () => {
  test("landing page renders", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Meridian/);
    // The landing page has a "Launch App" link pointing to /dashboard
    await expect(page.locator('a[href="/dashboard"]').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("dashboard page renders", async ({ page }) => {
    await page.goto("/dashboard");
    // The app layout header should be visible
    await expect(page.locator("header")).toBeVisible({ timeout: 10_000 });
    // Bottom nav should be present
    await expect(page.locator("nav")).toBeVisible();
  });

  test("trade page renders", async ({ page }) => {
    await page.goto("/trade");
    await expect(page.locator("header")).toBeVisible({ timeout: 10_000 });
    // Trade page always has at least one input for the amount
    await expect(page.locator("input")).toBeVisible({ timeout: 10_000 });
  });

  test("approve page renders", async ({ page }) => {
    await page.goto("/approve");
    await expect(page.locator("header")).toBeVisible({ timeout: 10_000 });
    // Approve page always renders body content (pending trades or all-clear)
    await expect(page.locator("main")).toBeVisible();
  });

  test("settings page renders", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("header")).toBeVisible({ timeout: 10_000 });
    // Settings page has policy-related inputs (threshold, rate min, rate max)
    await expect(page.locator("input").first()).toBeVisible({ timeout: 10_000 });
  });
});
