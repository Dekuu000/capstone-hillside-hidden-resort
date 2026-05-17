import { expect, test } from "@playwright/test";
import { signInGuestAndOpenBook } from "./guestAuthFlow.mjs";

test.describe("Guest modal accessibility guardrails", () => {
  test("book gallery modal keeps dialog semantics and keyboard containment", async ({ page }) => {
    test.setTimeout(90_000);
    await signInGuestAndOpenBook(page);

    const galleryButtons = page.locator("button", { hasText: /view photos/i });
    const hasGalleryTrigger = await expect
      .poll(async () => galleryButtons.count(), { timeout: 20_000 })
      .toBeGreaterThan(0)
      .then(() => true)
      .catch(() => false);
    test.skip(!hasGalleryTrigger, "No gallery trigger found on /book for this seed dataset; seed at least one available unit.");
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
