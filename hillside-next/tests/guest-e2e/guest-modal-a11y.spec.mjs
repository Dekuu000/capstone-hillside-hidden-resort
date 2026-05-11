import { expect, test } from "@playwright/test";

async function signInAsGuest(page) {
  const email = process.env.GUEST_E2E_EMAIL;
  const password = process.env.GUEST_E2E_PASSWORD;

  test.skip(!email || !password, "Set GUEST_E2E_EMAIL and GUEST_E2E_PASSWORD to run modal keyboard checks.");

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded");
  const emailInput = page.getByPlaceholder(/enter your email/i);
  await emailInput.click();
  await emailInput.fill("");
  await emailInput.pressSequentially(email, { delay: 15 });
  await expect(emailInput).toHaveValue(email, { timeout: 10_000 });

  const passwordInput = page.getByPlaceholder(/enter your password/i);
  await passwordInput.click();
  await passwordInput.fill("");
  await passwordInput.pressSequentially(password, { delay: 15 });
  await expect(passwordInput).toHaveValue(password, { timeout: 10_000 });
  const rememberMe = page.getByRole("checkbox", { name: /remember me/i });
  await rememberMe.check();
  await expect(rememberMe).toBeChecked();
  const signIn = page.getByRole("button", { name: /sign in/i });
  await expect(signIn).toBeEnabled({ timeout: 10_000 });
  await signIn.click();

  await page.goto("/book", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded");
  const stillLoggedOut = await page
    .getByText(/please sign in first to create a booking/i)
    .isVisible()
    .catch(() => false);
  test.skip(stillLoggedOut, "Guest credentials did not authenticate in this environment; skipping modal auth guardrail.");
}

test.describe("Guest modal accessibility guardrails", () => {
  test("book gallery modal keeps dialog semantics and keyboard containment", async ({ page }) => {
    test.setTimeout(90_000);
    await signInAsGuest(page);
    await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });

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
