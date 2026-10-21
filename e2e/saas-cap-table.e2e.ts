import { expect, test } from "@playwright/test";
import { refuseProduction, signInAs } from "./helpers";

/**
 * A synthetic self-serve client who bought only a Cap Table plan (SOW signed,
 * paid via Stripe test card 4242 4242 4242 4242, KYC + KYB approved by a second
 * staff member) must see only Cap Table plus the always-on basics.
 */
const CAP_ONLY = process.env["E2E_CAPTABLE_SESSION"];
const UNPAID = process.env["E2E_CAPTABLE_UNPAID_SESSION"];

test.beforeAll(() => refuseProduction());

test("cap-table-only client sees only Cap Table", async ({ page }) => {
  await signInAs(page, CAP_ONLY);
  await page.goto("/client/home");
  const menu = page.getByTestId("client-sidebar");
  await expect(menu.getByRole("link", { name: "Cap Table" }).first()).toBeVisible();
  for (const hidden of ["Funds", "My Funds", "Documents", "Tax", "Activity", "Reports"]) {
    await expect(menu.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
  }
  for (const path of ["/my-funds", "/documents", "/tax", "/client/funds"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Not in your plan" })).toBeVisible();
  }
  await page.screenshot({ path: "test-results/cap-table-only-menu.png" });
});

test("unpaid order keeps the menu locked", async ({ page }) => {
  await signInAs(page, UNPAID);
  await page.goto("/client/cap-table");
  await expect(page.getByRole("heading", { name: "Not in your plan" })).toBeVisible();
});
