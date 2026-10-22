import { describe, expect, it } from "vitest";
import { canEnterMigratedBilling, canPushToCommissions } from "./migrated-billing-model";

describe("migrated billing", () => {
  it("lets the CEO enter migrated billing", () => expect(canEnterMigratedBilling(["executive"])).toBe(true));
  it("lets the CRO enter migrated billing", () => expect(canEnterMigratedBilling(["cro"])).toBe(true));
  it("blocks other staff", () => expect(canEnterMigratedBilling(["finance", "sales"])).toBe(false));
  it("blocks the person who entered the invoice from sending it to commissions", () =>
    expect(canPushToCommissions({ actorId: "a", recordedBy: "a", isSuperAdmin: false })).not.toBeNull());
  it("allows a different person to send it to commissions", () =>
    expect(canPushToCommissions({ actorId: "b", recordedBy: "a", isSuperAdmin: false })).toBeNull());
});
