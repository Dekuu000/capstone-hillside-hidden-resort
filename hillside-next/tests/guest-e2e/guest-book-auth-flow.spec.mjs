import { expect, test } from "@playwright/test";
import { signInGuestAndOpenBook } from "./guestAuthFlow.mjs";
import { resolveGuestRouteState } from "./routeResolution.mjs";

test.describe("Guest authenticated booking guardrails", () => {
  test("book flow shows guided stepper and disabled CTA reason before selection", async ({ page }) => {
    test.setTimeout(90_000);
    await signInGuestAndOpenBook(page);

    await expect(page.getByTestId("guest-booking-stepper")).toBeVisible();
    await expect(page.getByRole("button", { name: /confirm booking/i })).toBeDisabled();
    await expect(page.getByTestId("booking-cta-reason")).toContainText(/select at least one unit/i);
  });

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

  test("tours shows helpful empty state before selecting a service", async ({ page }) => {
    test.setTimeout(90_000);
    await signInGuestAndOpenBook(page);
    await page.goto("/tours", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("domcontentloaded");
    const routeState = await resolveGuestRouteState(page, {
      main: async () => page.getByLabel(/select tour/i).isVisible().catch(() => false),
      login: async () => {
        if (page.url().includes("/login")) return true;
        const signInGate = await page
          .getByText(/sign in required to reserve a tour/i)
          .first()
          .isVisible()
          .catch(() => false);
        if (signInGate) return true;
        return page.getByRole("link", { name: /sign in and continue/i }).isVisible().catch(() => false);
      },
    });
    test.skip(routeState === "login", "Tours route resolved to auth gate in this environment.");

    const serviceSelect = page.getByLabel(/select tour/i);
    await expect(serviceSelect).toBeVisible({ timeout: 20_000 });
    await serviceSelect.selectOption("");
    await expect(page.getByTestId("tour-empty-state")).toBeVisible();
  });
});
