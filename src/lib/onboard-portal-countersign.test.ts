import { describe, expect, it } from "vitest";
import { portalSteps } from "@/lib/onboard-portal-model";

const v = (key: string) => ({ key, label: key, state: "valid" }) as any;
const base = ["investment_profile", "identity_verification", "aml", "accreditation", "tax_documentation", "subscription_documents"].map(v);

describe("documents step after the investor signs", () => {
  it("shows waiting on fund, not To do, when only the countersignature is left", () => {
    const docs = portalSteps([...base, { key: "signature", label: "s", state: "missing", awaitingCountersign: true } as any]).find((s) => s.key === "documents")!;
    expect(docs.state).toBe("in_review");
    expect(docs.waitingOnFund).toBe(true);
  });
  it("still asks the investor to sign when they have not signed", () => {
    const docs = portalSteps([...base, { key: "signature", label: "s", state: "missing" } as any]).find((s) => s.key === "documents")!;
    expect(docs.state).toBe("action_required");
    expect(docs.waitingOnFund).toBeUndefined();
  });
});
