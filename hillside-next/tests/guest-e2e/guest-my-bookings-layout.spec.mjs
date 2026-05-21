import { expect, test } from "@playwright/test";
import { signInGuestAndOpenBook } from "./guestAuthFlow.mjs";

test.describe("Guest my-bookings redesigned shell", () => {
  test("desktop layout shows premium guest sections and CTA navigation", async ({ page }) => {
    await signInGuestAndOpenBook(page);
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto("/my-bookings", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("guest-header")).toBeVisible();
    await expect(page.getByTestId("guest-hero")).toBeVisible();
    await expect(page.getByTestId("stay-snapshot-card")).toBeVisible();
    await expect(page.getByTestId("booking-status-tabs")).toBeVisible();
    await expect(page.getByTestId("guest-booking-search")).toBeVisible();
    await expect(page.getByTestId("sync-center-card")).toBeVisible();

    await expect(page.getByRole("link", { name: /my bookings/i })).toHaveAttribute("aria-current", "page");

    const searchField = page.getByLabel(/search reservations/i);
    await searchField.fill(`zzz-no-booking-${Date.now()}`);
    await expect(page.getByTestId("guest-empty-state")).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("book-stay-cta").click();
    await expect(page).toHaveURL(/\/book/);

    await page.goto("/my-bookings", { waitUntil: "domcontentloaded" });
    await page.getByLabel(/search reservations/i).fill(`zzz-no-booking-${Date.now()}`);
    await expect(page.getByTestId("guest-empty-state")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("browse-tours-cta").click();
    await expect(page).toHaveURL(/\/tours/);
  });

  test("mobile layout shows compact shell, bottom nav, and no horizontal overflow at 320", async ({ page }) => {
    await signInGuestAndOpenBook(page);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/my-bookings", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("guest-header")).toBeVisible();
    await expect(page.getByTestId("guest-hero")).toBeVisible();
    await expect(page.getByTestId("stay-snapshot-card")).toBeVisible();
    await expect(page.getByTestId("booking-status-tabs")).toBeVisible();
    await expect(page.getByTestId("guest-booking-search")).toBeVisible();
    await expect(page.getByTestId("sync-center-card")).toBeVisible();
    await expect(page.getByTestId("guest-bottom-nav")).toBeVisible();

    const overflow = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const scrollWidth = document.documentElement.scrollWidth;
      return scrollWidth - width;
    });
    expect(overflow).toBeLessThanOrEqual(1);

    const avatarTrigger = page.getByRole("button", { name: /open guest profile menu/i });
    await avatarTrigger.click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
  });
});

