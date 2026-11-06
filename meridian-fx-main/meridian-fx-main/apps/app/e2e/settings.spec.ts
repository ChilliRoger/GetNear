import { test, expect } from "@playwright/test";

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("header")).toBeVisible({ timeout: 10_000 });
  });

  test("page renders with heading", async ({ page }) => {
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 10_000 });
  });

  test("current policy card shows on-chain data or loading", async ({
    page,
  }) => {
    // Policy card has a version badge ("v1 ON-CHAIN" or "LOADING")
    await expect(
      page.locator("text=/ON-CHAIN|LOADING/").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("threshold input exists and is editable", async ({ page }) => {
    const thresholdInput = page.locator('input[type="number"]').first();
    await expect(thresholdInput).toBeVisible({ timeout: 10_000 });
    // Clear and enter a new value
    await thresholdInput.fill("20");
    await expect(thresholdInput).toHaveValue("20");
  });

  test("rate band inputs exist", async ({ page }) => {
    // There should be at least 3 number inputs: threshold, rate min, rate max
    const inputs = page.locator('input[type="number"]');
    const count = await inputs.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("rate band visual indicator renders", async ({ page }) => {
    // The rate band visualization has min/max labels
    await expect(
      page.locator("text=/0\\.6000|1\\.4000/").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("update policy button is present", async ({ page }) => {
    const updateBtn = page.locator("button", { hasText: /Update Policy|Submitting/i });
    await expect(updateBtn).toBeVisible({ timeout: 10_000 });
  });
});
