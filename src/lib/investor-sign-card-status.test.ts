import { describe, expect, it } from "vitest";

import { investorSignCardStatus } from "@/lib/document-signing";

describe("investor document card after their own signature", () => {
  it("shows awaiting countersignature, not Review & Sign, once the investor signed", () => {
    expect(
      investorSignCardStatus({ requiresSignature: true, state: "partially_signed", yourStatus: "signed" }),
    ).toBe("awaiting_others");
  });

  it("still asks the investor to sign when only the countersigner has signed", () => {
    expect(
      investorSignCardStatus({ requiresSignature: true, state: "partially_signed", yourStatus: "viewed" }),
    ).toBe("your_signature");
  });

  it("asks for a signature before anyone has signed", () => {
    expect(
      investorSignCardStatus({ requiresSignature: true, state: "out_for_signature", yourStatus: "sent" }),
    ).toBe("your_signature");
  });

  it("shows signed only when every required signer has signed", () => {
    expect(
      investorSignCardStatus({ requiresSignature: true, state: "executed", yourStatus: "signed" }),
    ).toBe("executed");
  });
});

import { investorSideSigned } from "@/lib/document-signing";

describe("investment checklist after the investor's own signature", () => {
  it("counts the investor as signed while the fund manager's countersignature is pending", () => {
    expect(investorSideSigned({
      providerStatus: "out_for_signature",
      signers: [{ roleKey: "investor", status: "signed" }, { roleKey: "fund_manager", status: "viewed" }],
    })).toBe(true);
  });

  it("still asks the investor to sign when only the fund manager has signed", () => {
    expect(investorSideSigned({
      providerStatus: "out_for_signature",
      signers: [{ roleKey: "investor", status: "viewed" }, { roleKey: "fund_manager", status: "signed" }],
    })).toBe(false);
  });

  it("ignores a cancelled signing request", () => {
    expect(investorSideSigned({
      providerStatus: "cancelled",
      signers: [{ roleKey: "investor", status: "signed" }],
    })).toBe(false);
  });

  it("waits for every investor-side signer, such as a second authorized signer", () => {
    expect(investorSideSigned({
      providerStatus: "out_for_signature",
      signers: [{ roleKey: "investor", status: "signed" }, { roleKey: "named_signer", status: "sent" }, { roleKey: "fund_manager", status: "waiting" }],
    })).toBe(false);
  });
});
