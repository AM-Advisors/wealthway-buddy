import { describe, expect, it } from "vitest";
import { appliesEvergreenDefault, nextAnniversary } from "./contract-renewal-default";
import { computeLifecycle } from "./contract-intelligence";

const doc = (o: Record<string, unknown>) => ({ id: "d", client_id: "c", doc_type: "sow", title: "SOW", review_status: "approved", execution_status: "executed_confirmed", effective_date: "2025-03-15", expiration_date: null, ...o }) as any;

describe("MSA/SOW with no renewal date", () => {
  it("renews every year on the effective-date anniversary", () => expect(nextAnniversary("2025-03-15", "2026-11-24")).toBe("2027-03-15"));
  it("SOW with no dates is ongoing with annual renewal", () => {
    const lc = computeLifecycle(doc({}), [], "2026-11-24");
    expect(lc.autoRenews).toBe(true); expect(lc.evergreenDefault).toBe(true); expect(lc.renewalDate).toBe("2027-03-15"); expect(lc.expirationDate).toBeNull();
  });
  it("an explicit end date wins", () => expect(computeLifecycle(doc({ expiration_date: "2026-12-31" }), [], "2026-11-24").evergreenDefault).toBeUndefined());
  it("does not apply when the contract says it doesn't renew", () => expect(appliesEvergreenDefault("msa", { endDate: null, autoRenews: false })).toBe(false));
  it("a side letter with no dates is unchanged", () => expect(computeLifecycle(doc({ doc_type: "side_letter" }), [], "2026-11-24").evergreenDefault).toBeUndefined());
});
