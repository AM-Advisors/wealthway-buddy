import { describe, it, expect } from "vitest";
import { syncInvestorApplications } from "./investor-status-sync";

const sb = (persons: any[]) => ({
  from: (t: string) => ({
    select: () => ({ in: async () => ({ data: t === "persons" ? persons : [] }) }),
  }),
});

describe("syncInvestorApplications", () => {
  const app = { id: "a", kyc_status: "not_started", aml_status: "not_started", funding_status: "not_started" };

  it("uses the approved person result for a regular investor", async () => {
    const [out] = await syncInvestorApplications(sb([{ user_id: "u1", kyc_status: "approved", aml_status: "approved" }]), [app], "u1");
    expect(out.kyc_status).toBe("approved");
    expect(out.aml_status).toBe("approved");
  });

  it("leaves apoorva@harmonious.co unchanged", async () => {
    const id = "7ba9caee-11bd-43b4-930c-3650af3d6f78";
    const [out] = await syncInvestorApplications(sb([{ user_id: id, kyc_status: "review", aml_status: "approved" }]), [app], id);
    expect(out.kyc_status).toBe("not_started");
  });

  it("leaves the walkthrough investor unchanged", async () => {
    const id = "9bf16b0e-4ead-4ba1-8906-687efed81e99";
    const [out] = await syncInvestorApplications(sb([{ user_id: id, kyc_status: "declined", aml_status: null }]), [app], id);
    expect(out.kyc_status).toBe("not_started");
  });
});
