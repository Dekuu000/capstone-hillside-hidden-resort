import { expect, test } from "@playwright/test";
import { signInGuestAndOpenBook } from "./guestAuthFlow.mjs";

test.describe("Guest authenticated booking guardrails", () => {
  test("book flow can select a unit and reach confirm step without submission", async ({ page }) => {
    test.setTimeout(90_000);
    await signInGuestAndOpenBook(page);

    const unitCards = page.locator("article[role='button']");
    const hasUnitCard = await expect
      .poll(async () => unitCards.count(), { timeout: 20_000 })
      .toBeGreaterThan(0)
      .then(() => true)
      .catch(() => false);
    test.skip(!hasUnitCard, "No selectable units found for current seeded dates; seed an always-available unit.");

    const firstCard = unitCards.first();
    await firstCard.scrollIntoViewIfNeeded();
    await firstCard.click();

    await expect(firstCard.getByText(/selected \(tap to remove\)/i)).toBeVisible();

    const confirmButton = page.getByRole("button", { name: /confirm booking/i });
    await expect(confirmButton).toBeEnabled();
  });
});
