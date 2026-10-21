import { describe, expect, it } from "vitest";
import { acceptanceKey, clientRemittance, invoiceLinesFromQuote, remittanceApprovalBlocker, signBlocker, signerBlocker } from "@/lib/sales-acceptance-model";

describe("client sign & approve", () => {
  it("one acceptance key per record version, so signing twice yields one invoice", () => {
    expect(acceptanceKey("proposal", "d1", 2)).toBe(acceptanceKey("proposal", "d1", 2));
    expect(acceptanceKey("quote", "q1", 1)).toBe("quote:q1:1");
  });
  it("staff cannot sign for a client", () => {
    expect(signerBlocker({ isStaff: true, isClientMember: false, viaLink: true })).toMatch(/can't sign/);
    expect(signerBlocker({ isStaff: false, isClientMember: false, viaLink: true })).toBeNull();
  });
  it("only approved, current versions can be signed", () => {
    expect(signBlocker("rfp", "draft", null, 1)).not.toBeNull();
    expect(signBlocker("rfp", "sent", 2, 1)).not.toBeNull();
    expect(signBlocker("rfp", "sent", 2, 2)).toBeNull();
    expect(signBlocker("quote", "pending_approval", 1, 1)).not.toBeNull();
  });
  it("invoice lines use quote prices exactly", () => {
    const l = invoiceLinesFromQuote([{ service_key: "x", label: "Admin", quantity: 3, unit_cents: 100000, line_cents: 300000 }, { service_key: "y", label: "Free", quantity: 1, unit_cents: 0, line_cents: 0 }]);
    expect(l).toHaveLength(1);
    expect(l[0]!.amount_cents).toBe(300000);
  });
});

describe("payment instructions", () => {
  const row = { status: "approved", account_number: "123456789", routing_number: "021000021" };
  it("never returns unapproved details", () => {
    expect(clientRemittance({ ...row, status: "draft" }, true)).toBeNull();
  });
  it("masks until revealed", () => {
    expect(clientRemittance(row, false)!.account_number).toBe("••••6789");
    expect(clientRemittance(row, true)!.account_number).toBe("123456789");
  });
  it("needs a second person unless a Super Admin gives a reason", () => {
    expect(remittanceApprovalBlocker({ approverId: "a", preparedBy: "a", isSuperAdmin: false })).not.toBeNull();
    expect(remittanceApprovalBlocker({ approverId: "a", preparedBy: "a", isSuperAdmin: true, reason: "CFO out" })).toBeNull();
    expect(remittanceApprovalBlocker({ approverId: "b", preparedBy: "a", isSuperAdmin: false })).toBeNull();
  });
});
