import { test, expect } from "@playwright/test";

test.describe("Navigation — bottom tab bar click-through", () => {
  test("can navigate through all tabs via bottom nav", async ({ page }) => {
    // Start on dashboard
    await page.goto("/dashboard");
    await expect(page.locator("header")).toBeVisible({ timeout: 10_000 });

    // Navigate to Trade via bottom nav link
    await page.click('nav a[href="/trade"]');
    await expect(page).toHaveURL(/\/trade/);
    await expect(page.locator("input").first()).toBeVisible({ timeout: 10_000 });

    // Navigate to Approve
    await page.click('nav a[href="/approve"]');
    await expect(page).toHaveURL(/\/approve/);
    await expect(page.locator("main")).toBeVisible();

    // Navigate to Settings
    await page.click('nav a[href="/settings"]');
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.locator("input").first()).toBeVisible({ timeout: 10_000 });

    // Back to Dashboard
    await page.click('nav a[href="/dashboard"]');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("landing page Launch App button navigates to dashboard", async ({
    page,
  }) => {
    await page.goto("/");
    const launchBtn = page.locator('a[href="/dashboard"]').first();
    await expect(launchBtn).toBeVisible({ timeout: 10_000 });
    await launchBtn.click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("header")).toBeVisible({ timeout: 10_000 });
  });

  test("active tab is visually highlighted", async ({ page }) => {
    await page.goto("/dashboard");
    // The active nav link should have the accent-blue text color class
    const dashboardLink = page.locator('nav a[href="/dashboard"]');
    await expect(dashboardLink).toBeVisible({ timeout: 10_000 });
    await expect(dashboardLink).toHaveClass(/text-accent-blue/);

    // Trade link should NOT have the active class
    const tradeLink = page.locator('nav a[href="/trade"]');
    await expect(tradeLink).not.toHaveClass(/text-accent-blue/);
  });
});
