import { describe, expect, it, vi } from "vitest";

import { investmentApplicationForFund, linkedApplicationForInvestment, NO_APPLICATION } from "@/lib/active-application";

/** Minimal chainable stand-in: every query on a table resolves to the given rows. */
function fakeDb(tables: Record<string, any[]>, rpcResult: { data: unknown; error: unknown } = { data: "new-app", error: null }) {
  const rpc = vi.fn(async () => rpcResult);
  const from = (table: string) => {
    const rows = tables[table] ?? [];
    const q: any = {
      select: () => q, eq: () => q, is: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: rows[0] ?? null }),
      then: (resolve: any) => resolve({ data: rows }),
    };
    return q;
  };
  return { from, rpc };
}

describe("investment's own application", () => {
  it("uses the investment's linked application, never an older same-fund one", async () => {
    const db = fakeDb({
      investor_onboardings: [{ id: "inv", application_id: "linked-app", stage: "signature", closed_at: null }],
      investor_applications: [{ id: "older-app" }],
    });
    expect(await investmentApplicationForFund(db, "u", "fund", { link: true })).toBe("linked-app");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("links a missing application on save for the one open investment", async () => {
    const db = fakeDb({
      investor_onboardings: [{ id: "inv", application_id: null, stage: "verification", closed_at: null }],
      investor_applications: [{ id: "older-app" }],
    });
    expect(await investmentApplicationForFund(db, "u", "fund", { link: true })).toBe("new-app");
    expect(db.rpc).toHaveBeenCalledWith("ensure_exact_investment_application", { p_onboarding_id: "inv" });
  });

  it("reads never create a record", async () => {
    const db = fakeDb({ investor_onboardings: [{ id: "inv", application_id: null, stage: "verification", closed_at: null }] });
    expect(await investmentApplicationForFund(db, "u", "fund")).toBe(NO_APPLICATION);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("keeps the older lookup when there is no open investment in the fund", async () => {
    const db = fakeDb({
      investor_onboardings: [{ id: "inv", application_id: null, stage: "closed", closed_at: "2026-10-01" }],
      investor_applications: [{ id: "legacy-app" }],
      profiles: [],
      investor_personas: [],
    });
    expect(await investmentApplicationForFund(db, "u", "fund", { link: true })).toBe("legacy-app");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("fails clearly when the record can't be linked", async () => {
    const db = fakeDb({}, { data: null, error: { message: "Exact investing person required" } });
    await expect(linkedApplicationForInvestment(db, { id: "inv", application_id: null }, { link: true })).rejects.toThrow(/couldn't link this step/);
  });
});
