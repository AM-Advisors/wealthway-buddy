import { describe, expect, it } from "vitest";
import { capacityForProfileType, recordedCommitmentCents } from "./signing-commitment";

describe("recorded commitment for signing", () => {
  it("uses the investment's recorded amount ($20,000) so the investor is not asked again", () => {
    expect(recordedCommitmentCents({ onboardingRequestedCents: 2_000_000, applicationCommitmentCents: null })).toBe(2_000_000);
  });
  it("falls back to the application amount when the investment has none", () => {
    expect(recordedCommitmentCents({ onboardingRequestedCents: null, applicationCommitmentCents: "500000" })).toBe(500_000);
  });
  it("never invents an amount when nothing is recorded", () => {
    expect(recordedCommitmentCents({ onboardingRequestedCents: 0, applicationCommitmentCents: null })).toBeNull();
  });
});

describe("signer capacity from investing party type", () => {
  it("entities sign through an authorized signatory, trusts through a trustee", () => {
    expect(capacityForProfileType("llc")).toBe("authorized_signatory");
    expect(capacityForProfileType("trust")).toBe("trustee");
    expect(capacityForProfileType("individual")).toBe("individual");
  });
});
