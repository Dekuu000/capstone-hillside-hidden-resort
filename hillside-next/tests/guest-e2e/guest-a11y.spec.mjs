import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const a11yRoutes = ["/book", "/tours"];

test.describe("Guest UX accessibility smoke", () => {
  for (const path of a11yRoutes) {
    test(`axe scan: ${path}`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

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
