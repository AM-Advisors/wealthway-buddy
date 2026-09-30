import { expect, test } from "@playwright/test";

import { SESSIONS, refuseProduction, signInAs } from "./helpers";

test.beforeAll(() => refuseProduction());

const STAFF_ONLY = ["/ops", "/ops/financial-reviews", "/ops/email-health", "/ops/webhook-log", "/ops/tax"];

test.describe("signed-out visitors", () => {
  for (const path of [...STAFF_ONLY, "/manager/financial-reviews"]) {
    test(`${path} sends you to sign-in without showing content`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/auth/);
      await expect(page.getByText(/Webhook log|Email delivery|Financial reviews/)).toHaveCount(0);
    });
  }
});

test.describe("public pages", () => {
  for (const path of ["/", "/solutions", "/resources", "/resources/ein-for-llc", "/resources/reg-d-506b-vs-506c", "/resources/pe-software-buyers-guide"]) {
    test(`${path} loads`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBeLessThan(400);
      await expect(page.locator("h1").first()).toBeVisible();
    });
  }
});

test.describe("non-staff are refused staff screens", () => {
  test.skip(!SESSIONS.investor, "E2E_INVESTOR_SESSION not set");
  for (const path of ["/ops/email-health", "/ops/webhook-log", "/ops/system-status"]) {
    test(path, async ({ page }) => {
      await signInAs(page, SESSIONS.investor);
      await page.goto(path);
      await expect(page.getByText(/Responding|Received|Recipient/)).toHaveCount(0);
    });
  }
});

test.describe("fund manager scope", () => {
  test.skip(!SESSIONS.manager, "E2E_MANAGER_SESSION not set");
  test("sees only their own funds' financial reviews", async ({ page }) => {
    await signInAs(page, SESSIONS.manager);
    await page.goto("/manager/financial-reviews");
    await expect(page.getByRole("heading", { name: "Financial reviews" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New package" })).toHaveCount(0);
  });
});

test.describe("staff", () => {
  test.skip(!SESSIONS.staff, "E2E_STAFF_SESSION not set");
  test("can open the health screens", async ({ page }) => {
    await signInAs(page, SESSIONS.staff);
    await page.goto("/ops/system-status");
    await expect(page.getByRole("heading", { name: "System status" })).toBeVisible();
  });
});
