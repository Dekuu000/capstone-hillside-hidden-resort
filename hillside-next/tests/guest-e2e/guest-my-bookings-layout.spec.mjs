import { expect, test } from "@playwright/test";
import { signInGuestAndOpenBook } from "./guestAuthFlow.mjs";

test.describe("Guest My Trips shell", () => {
  test("desktop layout shows My Trips sections and empty-state CTA navigation", async ({ page }) => {
    test.setTimeout(90_000);
    await signInGuestAndOpenBook(page);
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto("/my-bookings", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: /my trips/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("main").getByTestId("guest-hero")).toBeVisible();
    await expect(page.getByRole("main").getByTestId("guest-tabs").first()).toBeVisible();
    await expect(page.getByRole("main").getByTestId("guest-search").first()).toBeVisible();

    const search = page.getByRole("main").getByTestId("guest-search").first().locator("input").first();
    await search.fill(`zzz-no-booking-${Date.now()}`);
    await expect(page.getByRole("main").getByTestId("guest-empty-state").first()).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("book-stay-cta").click();
    await expect(page).toHaveURL(/\/(book|stays)/);

    await page.goto("/my-bookings", { waitUntil: "domcontentloaded" });
    await page.getByRole("main").getByTestId("guest-search").first().locator("input").first().fill(`zzz-no-booking-${Date.now()}`);
    await expect(page.getByRole("main").getByTestId("guest-empty-state").first()).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("browse-tours-cta").click();
    await expect(page).toHaveURL(/\/tours/);
  });

  test("mobile layout shows compact shell, bottom nav, and no horizontal overflow at 320", async ({ page }) => {
    test.setTimeout(90_000);
    await signInGuestAndOpenBook(page);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/my-bookings", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: /my trips/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("main").getByTestId("guest-hero")).toBeVisible();
    await expect(page.getByRole("main").getByTestId("guest-tabs").first()).toBeVisible();
    await expect(page.getByTestId("guest-bottom-nav")).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
