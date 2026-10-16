import { describe, expect, it } from "vitest";
import { accessOpen, entitlementKeys, filterByEntitlements, priceOrder, requiredEntitlement } from "./saas-order-model";

const base = { funds: 1, servicing: "self_serve" as const, capTable: "none" as const, alaCarte: {} };

describe("SaaS self-serve orders", () => {
  it("prices yearly and quarterly only from the rate card", () => {
    expect(priceOrder(base, "annual").recurring).toBe(3125);
    expect(priceOrder(base, "quarterly").recurring).toBe(Math.round((3125 / 4) * 1.1));
  });
  it("fund documents are $500 each, one-time", () => {
    const p = priceOrder({ ...base, alaCarte: { harmonious_fund_documents_oa_ppm_subscription_agreement: 3 } }, "annual");
    expect(p.oneTime).toBe(1500);
  });
  it("adds Core servicing at the fund price", () => {
    expect(priceOrder({ ...base, servicing: "core" }, "annual").recurring).toBe(3125 + 3000);
  });
  it("access opens only when signed, paid, KYC and KYB all pass", () => {
    const o = { payment_status: "paid", kyb_status: "approved", msa_accepted_at: "2026-10-16" };
    expect(accessOpen(o, true)).toBe(true);
    expect(accessOpen(o, false)).toBe(false);
    expect(accessOpen({ ...o, payment_status: "unpaid" }, true)).toBe(false);
    expect(accessOpen({ ...o, kyb_status: "review" }, true)).toBe(false);
    expect(accessOpen({ ...o, msa_accepted_at: null }, true)).toBe(false);
  });
  it("gated clients only see purchased areas; legacy clients keep everything", () => {
    const links = [{ url: "/manager" }, { url: "/my-funds" }, { url: "/client/cap-table" }, { url: "/profile" }];
    const keys = entitlementKeys({ ...base, funds: 0, capTable: "starter" });
    expect(filterByEntitlements(links, keys).map((l) => l.url)).toEqual(["/manager", "/client/cap-table", "/profile"]);
    expect(filterByEntitlements(links, null)).toHaveLength(4);
  });

  it("cap-table-only buyer sees only Cap Table and basics", () => {
    const keys = entitlementKeys({ ...base, funds: 0, capTable: "starter" });
    const menu = ["/client/home", "/client/funds", "/client/cap-table", "/client/cap-table/investors", "/client", "/profile", "/my-funds", "/activity", "/investor-reporting", "/documents", "/tax", "/messages", "/professional"].map((url) => ({ url }));
    expect(filterByEntitlements(menu, keys).map((l) => l.url)).toEqual(["/client/home", "/client/cap-table", "/client/cap-table/investors", "/client", "/profile", "/messages"]);
    expect(requiredEntitlement("/client/documents-unknown")).toBe("__unpurchased");
    expect(requiredEntitlement("/ops/funds")).toBeNull();
    expect(requiredEntitlement("/client/agreements/msa")).toBeNull();
  });
});
