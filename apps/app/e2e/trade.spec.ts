import { test, expect } from "@playwright/test";

test.describe("Trade page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/trade");
    await expect(page.locator("header")).toBeVisible({ timeout: 10_000 });
  });

  test("trade form renders with amount input", async ({ page }) => {
    const input = page.locator('input[type="number"]').first();
    await expect(input).toBeVisible({ timeout: 10_000 });
  });

  test("can enter an amount", async ({ page }) => {
    const input = page.locator('input[type="number"]').first();
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill("25");
    await expect(input).toHaveValue("25");
  });

  test("quick-amount buttons work", async ({ page }) => {
    // The trade form has preset amount buttons: $1M, $5M, $10M, $50M
    const btn5 = page.locator("button", { hasText: "$5M" });
    await expect(btn5).toBeVisible({ timeout: 10_000 });
    await btn5.click();
    const input = page.locator('input[type="number"]').first();
    await expect(input).toHaveValue("5");
  });

  test("direction toggle shows currency pair", async ({ page }) => {
    // Verify the currency pair button is rendered
    const usdcBtn = page.locator("button", { hasText: "USDC" }).first();
    await expect(usdcBtn).toBeVisible({ timeout: 10_000 });
  });

  test("mode toggle between input/output exists", async ({ page }) => {
    // There should be two mode buttons for INPUT and OUTPUT modes
    // They use i18n keys, so look for the mode card buttons
    const modeButtons = page.locator("button").filter({
      has: page.locator("text=/send|receive|input|output/i"),
    });
    // Assert we have at least 2 mode toggle buttons rendered
    await expect
      .poll(async () => modeButtons.count(), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(2);
  });

  test("submit button is present", async ({ page }) => {
    // The submit button is the main CTA — match by text or by accent-blue class
    const submitBtn = page
      .locator("button")
      .filter({ has: page.locator("text=/Submit|Order|Submitting/i") })
      .first();
    const fallbackBtn = page.locator("button.bg-accent-blue").first();
    // Use .or() to wait for whichever renders first, avoiding racey isVisible()
    const btn = submitBtn.or(fallbackBtn).first();
    await expect(btn).toBeVisible({ timeout: 10_000 });
  });

  test("deadline selector has options", async ({ page }) => {
    // Deadline buttons: 1h, 4h, 24h
    const btn4h = page.getByRole("button", { name: "4h", exact: true });
    await expect(btn4h).toBeVisible({ timeout: 10_000 });
  });

  test("preview card shows estimate", async ({ page }) => {
    // The preview card has an ESTIMATE badge
    await expect(
      page.locator("text=/ESTIMATE/i").first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
