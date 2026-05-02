import { expect, test } from "@playwright/test";

const guestSmokeRoutes = [
  { path: "/book", title: /book your stay/i },
  { path: "/tours", title: /book a tour/i },
  { path: "/guest/map", title: /resort navigation/i },
];

test.describe("Guest UX smoke", () => {
  for (const route of guestSmokeRoutes) {
    test(`renders ${route.path}`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { name: route.title })).toBeVisible();
      await expect(page.locator("main")).toBeVisible();
    });
  }

  test("my-bookings route is reachable and shows session gate or content", async ({ page }) => {
    await page.goto("/my-bookings");
    const bookingHeading = page.getByRole("heading", { name: /my stay/i });
    const loginHeading = page.getByRole("heading", { name: /sign in|welcome back|login/i }).first();
    const noSessionText = page.getByText(/no active session found/i);
    const bookingCards = page.locator("article").filter({ hasText: /pending|confirmed|tour|stay/i }).first();
    const bookStayButton = page.getByRole("link", { name: /book a stay/i });

    const hasBookingHeading = await bookingHeading.isVisible().catch(() => false);
    if (!hasBookingHeading) {
      await expect(loginHeading).toBeVisible();
      return;
    }
    const showsNoSession = await noSessionText.isVisible().catch(() => false);
    if (!showsNoSession) {
      const hasBookingCards = await bookingCards.isVisible().catch(() => false);
      if (!hasBookingCards) {
        await expect(bookStayButton).toBeVisible();
      }
    }
  });

  test("guest sync route resolves to sync center or auth gate", async ({ page }) => {
    await page.goto("/guest/sync");
    const syncHeading = page.getByRole("heading", { name: /sync center|my sync center/i });
    const loginHeading = page.getByRole("heading", { name: /sign in|welcome back|login/i });

    if (await syncHeading.isVisible().catch(() => false)) {
      await expect(syncHeading).toBeVisible();
    } else {
      await expect(loginHeading).toBeVisible();
    }
  });
});
