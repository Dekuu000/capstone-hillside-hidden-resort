import { expect, test } from "@playwright/test";
import { signInGuestAndOpenBook } from "./guestAuthFlow.mjs";

// Read-only guardrails for the redesigned booking flow: the tests stop at the
// Reserve action and never submit, so no reservation is created.
test.describe("Guest authenticated booking guardrails", () => {
  test("stay search shows date and guest controls for a signed-in guest", async ({ page }) => {
    test.setTimeout(90_000);
    await signInGuestAndOpenBook(page);

    await expect(page).toHaveURL(/\/(book|stays)/);
    await expect(page.getByRole("heading", { name: /stays at hillside hidden resort/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /check-in/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /check-out/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /increase guests/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^search$/i })).toBeVisible();
    // Signed-in guests see the guest navigation, not the public Sign in link.
    await expect(page.getByRole("link", { name: /^sign in$/i })).toHaveCount(0);
  });

  test("stay detail reaches the Reserve step without submission", async ({ page }) => {
    test.setTimeout(90_000);
    await signInGuestAndOpenBook(page);

    const stayLinks = page.locator('a[href^="/stays/"]');
    const hasStay = await expect
      .poll(async () => stayLinks.count(), { timeout: 20_000 })
      .toBeGreaterThan(0)
      .then(() => true)
      .catch(() => false);
    test.skip(!hasStay, "No stays are listed for the current dataset.");

    await stayLinks.first().click();
    await expect(page).toHaveURL(/\/stays\/[0-9a-f-]+/);
    const reserve = page.getByRole("button", { name: /^reserve$/i });
    await expect(reserve).toBeVisible({ timeout: 20_000 });
    await expect(reserve).toBeEnabled();
  });

  test("tour detail reaches the Reserve step without submission", async ({ page }) => {
    test.setTimeout(90_000);
    await signInGuestAndOpenBook(page);
    await page.goto("/tours", { waitUntil: "domcontentloaded" });

    const tourLinks = page.locator('a[href^="/tours/"]');
    const hasTour = await expect
      .poll(async () => tourLinks.count(), { timeout: 20_000 })
      .toBeGreaterThan(0)
      .then(() => true)
      .catch(() => false);
    test.skip(!hasTour, "No tours are listed for the current dataset.");

    await tourLinks.first().click();
    await expect(page).toHaveURL(/\/tours\/[0-9a-f-]+/);
    const reserve = page.getByRole("button", { name: /^reserve$/i });
    await expect(reserve).toBeVisible({ timeout: 20_000 });
    await expect(reserve).toBeEnabled();
  });
});
