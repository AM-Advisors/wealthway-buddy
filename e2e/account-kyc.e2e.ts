import { expect, test } from "@playwright/test";

import { SESSIONS, refuseProduction, signInAs } from "./helpers";

test.beforeAll(() => refuseProduction());

// A synthetic non-staff account that has accepted policies but never passed the identity check.
test.describe("unverified accounts are stopped at Verify your identity", () => {
  test.skip(!SESSIONS.unverified, "E2E_UNVERIFIED_SESSION not set");
  for (const path of ["/home", "/client/funds", "/investor", "/manager/financial-reviews"]) {
    test(`${path} shows the identity check, not portal content`, async ({ page }) => {
      await signInAs(page, SESSIONS.unverified);
      await page.goto(path);
      await expect(page.getByText(/Verify your identity|checking your details|under review/i).first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("tab", { name: "Investors" })).toHaveCount(0);
    });
  }
});

test.describe("staff skip the identity check", () => {
  test.skip(!SESSIONS.staff, "E2E_STAFF_SESSION not set");
  test("/ops loads without the identity screen", async ({ page }) => {
    await signInAs(page, SESSIONS.staff);
    await page.goto("/ops");
    await expect(page.getByText(/Verify your identity/i)).toHaveCount(0);
  });
});
