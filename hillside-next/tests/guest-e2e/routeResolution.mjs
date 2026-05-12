import { expect } from "@playwright/test";

export async function resolveGuestRouteState(page, checks, timeout = 20_000) {
  let state = "pending";

  await expect
    .poll(async () => {
      if (await checks.main()) {
        state = "main";
        return state;
      }
      if (await checks.login()) {
        state = "login";
        return state;
      }
      state = "pending";
      return state;
    }, { timeout })
    .toMatch(/^(main|login)$/);

  return state;
}
