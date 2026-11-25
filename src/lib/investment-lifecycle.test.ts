import { describe, it, expect } from "vitest";
import { signingPhase, signingTurn } from "@/lib/investment-lifecycle";

describe("signingPhase", () => {
  it("unsigned is the investor's turn", () => {
    const p = signingPhase({ investorSigned: false });
    expect(p).toBe("investor_to_sign");
    expect(signingTurn(p)).toBe("investor");
  });
  it("signed, not approved, awaits manager approval", () => expect(signingPhase({ investorSigned: true })).toBe("awaiting_approval"));
  it("approved awaits countersignature", () => expect(signingPhase({ investorSigned: true, approved: true })).toBe("awaiting_countersign"));
  it("fully executed is nobody's turn", () => expect(signingTurn(signingPhase({ investorSigned: true, fullyExecuted: true }))).toBe("none"));
});
