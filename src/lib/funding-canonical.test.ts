import { describe, expect, it } from "vitest";
import { canonicalizeApplicationFunding, canonicalizeOnboardingFunding } from "./funding-canonical";
const fake = (rows: any[]) => ({ from: () => ({ select: () => ({ in: async () => ({ data: rows }) }) }) });
describe("one funded state across both records", () => {
  it("application page shows Funded when the investment record is funded", async () => {
    const [a] = await canonicalizeApplicationFunding(fake([{ application_id: "a1", funding_status: "funded" }]), [{ id: "a1", funding_status: "not_started" }]);
    expect(a?.funding_status).toBe("funded");
  });
  it("investment page shows Funded when the application recorded settled money", async () => {
    const [o] = await canonicalizeOnboardingFunding(fake([{ id: "a1", funding_status: "settled" }]), [{ id: "o1", application_id: "a1", funding_status: "not_funded" }]);
    expect(o?.funding_status).toBe("funded");
  });
  it("keeps the row's own value when the lookup fails", async () => {
    const broken = { from: () => { throw new Error("x"); } };
    const [o] = await canonicalizeOnboardingFunding(broken, [{ id: "o1", application_id: "a1", funding_status: "not_funded" }]);
    expect(o?.funding_status).toBe("not_funded");
  });
});
