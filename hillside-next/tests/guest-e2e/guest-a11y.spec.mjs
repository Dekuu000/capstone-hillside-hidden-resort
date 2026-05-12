import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { resolveGuestRouteState } from "./routeResolution.mjs";

const a11yRoutes = [
  { path: "/book", allowAuthGate: false },
  { path: "/tours", allowAuthGate: false },
  { path: "/guest/services", allowAuthGate: true },
  { path: "/guest/map", allowAuthGate: false },
];

test.describe("Guest UX accessibility smoke", () => {
  for (const route of a11yRoutes) {
    test(`axe scan: ${route.path}`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto(route.path);
      await page.waitForLoadState("domcontentloaded");
      const main = page.locator("main");
      if (route.allowAuthGate) {
        const resolvedState = await resolveGuestRouteState(page, {
          main: async () => main.isVisible().catch(() => false),
          login: async () => {
            if (page.url().includes("/login")) return true;
            return page
              .getByRole("heading", { name: /sign in|welcome back|login/i })
              .first()
              .isVisible()
              .catch(() => false);
          },
        });
        if (resolvedState === "login") {
          return;
        }
      }
      await expect(main).toBeVisible({ timeout: 20_000 });

      const builder = new AxeBuilder({ page })
        .disableRules(["landmark-one-main"])
        .withTags(["wcag2a", "wcag2aa"])
      const results = await builder.analyze();

      const blocking = results.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact || ""),
      );
      expect(
        blocking,
        blocking
          .map((v) => `${v.id} (${v.impact}): ${v.help}`)
          .join("\n"),
      ).toEqual([]);
    });
  }
});
