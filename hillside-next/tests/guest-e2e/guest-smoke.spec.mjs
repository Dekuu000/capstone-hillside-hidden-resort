import { expect, test } from "@playwright/test";
import { resolveGuestRouteState } from "./routeResolution.mjs";

const guestSmokeRoutes = [
  { path: "/book", title: /book your stay/i },
  { path: "/tours", title: /book a tour/i },
  { path: "/guest/map", title: /resort map|resort navigation/i },
];

test.describe("Guest UX smoke", () => {
  for (const route of guestSmokeRoutes) {
    test(`renders ${route.path}`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto(route.path);
      await page.waitForLoadState("domcontentloaded");
      await expect(page.getByRole("heading", { name: route.title })).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
    });
  }

  test("my-bookings route is reachable and shows session gate or content", async ({ page }) => {
    await page.goto("/my-bookings");
    const bookingHeading = page.getByRole("heading", { name: /my stay/i });
    const noSessionText = page.getByText(/no active session found/i);
    const bookingCards = page.locator("article").filter({ hasText: /pending|confirmed|tour|stay/i }).first();
    const bookStayButton = page.getByRole("link", { name: /book a stay/i });

    const state = await resolveGuestRouteState(page, {
      main: async () => bookingHeading.isVisible().catch(() => false),
      login: async () => {
        if (page.url().includes("/login")) return true;
        return page
          .getByRole("heading", { name: /sign in|welcome back|login/i })
          .first()
          .isVisible()
          .catch(() => false);
      },
    });

    if (state === "login") {
      return;
    }

    await expect(bookingHeading).toBeVisible();
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
    const state = await resolveGuestRouteState(page, {
      main: async () => syncHeading.isVisible().catch(() => false),
      login: async () => {
        if (page.url().includes("/login")) return true;
        return page
          .getByRole("heading", { name: /sign in|welcome back|login/i })
          .first()
          .isVisible()
          .catch(() => false);
      },
    });

    if (state === "main") {
      await expect(syncHeading).toBeVisible();
    }
  });

  test("guest map pin selection updates destination details", async ({ page }) => {
    await page.goto("/guest/map");
    await expect(page.getByTestId("guest-map")).toBeVisible();
    const lobbyPin = page.getByTestId("map-pin-lobby");
    await expect(lobbyPin).toBeVisible();
    await lobbyPin.click();
    await expect(page.getByText(/destination:\s*lobby/i)).toBeVisible();
  });
});
