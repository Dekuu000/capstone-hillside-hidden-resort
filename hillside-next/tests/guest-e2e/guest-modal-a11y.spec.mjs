import { expect, test } from "@playwright/test";
import { signInGuestAndOpenBook } from "./guestAuthFlow.mjs";

test.describe("Guest modal accessibility guardrails", () => {
  test("book gallery modal keeps dialog semantics and keyboard containment", async ({ page }) => {
    test.setTimeout(90_000);
    await signInGuestAndOpenBook(page);

    // The photo gallery now lives on the stay detail page.
    const stayLinks = page.locator('a[href^="/stays/"]');
    const hasStay = await expect
      .poll(async () => stayLinks.count(), { timeout: 20_000 })
      .toBeGreaterThan(0)
      .then(() => true)
      .catch(() => false);
    test.skip(!hasStay, "No stays are listed for the current dataset.");
    await stayLinks.first().click();
    await expect(page).toHaveURL(/\/stays\/[0-9a-f-]+/);

    const galleryButtons = page.getByRole("button", { name: /view photo/i });
    const hasGalleryTrigger = await expect
      .poll(async () => galleryButtons.count(), { timeout: 20_000 })
      .toBeGreaterThan(0)
      .then(() => true)
      .catch(() => false);
    test.skip(!hasGalleryTrigger, "The first stay has no photos in this dataset.");
    const galleryTrigger = galleryButtons.first();

    await galleryTrigger.scrollIntoViewIfNeeded();
    await galleryTrigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    const closeButton = dialog.getByRole("button", { name: /close/i }).first();
    await expect(closeButton).toBeVisible();
    await closeButton.focus();

    await page.keyboard.press("Tab");
    const tabStayedInDialog = await dialog.evaluate((node) => node.contains(document.activeElement));
    expect(tabStayedInDialog).toBeTruthy();

    await page.keyboard.press("Shift+Tab");
    const shiftTabStayedInDialog = await dialog.evaluate((node) => node.contains(document.activeElement));
    expect(shiftTabStayedInDialog).toBeTruthy();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(galleryTrigger).toBeFocused();
  });
});
