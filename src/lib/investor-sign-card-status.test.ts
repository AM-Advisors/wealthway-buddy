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
