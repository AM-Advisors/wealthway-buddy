import { describe, expect, it } from "vitest";
import { renderTemplate } from "./fund-doc-templates";
import { missingGoverningDocs } from "./side-letter-governing.server";

const values = { fund: "Example Fund I", manager: "Jane Doe", date: "2026-01-01", investor: "John Smith", include_sl_management_fee: "true", management_rate: "1%" };
const g = {
  operatingAgreement: { title: "Operating Agreement", version: 3, date: "2026-01-01" },
  subscriptionAgreement: { title: "Subscription Agreement", version: 4, date: null },
  baseline: { managementFee: "6% of committed capital", carry: "15%", minimum: "$500,000" },
  investorSubscription: { amount: "$250,000", date: null },
};

describe("side letters cite governing documents", () => {
  it("names the OA and subscription versions and the current term", () => {
    const { body } = renderTemplate("sl_combined", values, g);
    expect(body).toContain("Operating Agreement (version 3, dated 2026-01-01)");
    expect(body).toContain("Subscription Agreement (version 4)");
    expect(body).toContain("Current term: 6% of committed capital");
    expect(body).toContain("subscription of $250,000");
  });
  it("still renders without governing docs for legacy callers", () => {
    expect(renderTemplate("sl_combined", values).body).not.toContain("Governing documents.");
  });
  it("reports missing agreements", () => {
    expect(missingGoverningDocs([{ document_category: "operating_agreement", doc_type: null, removed_at: null, active_version: 1 }])).toEqual(["an active Subscription Agreement"]);
    expect(missingGoverningDocs([{ document_category: "operating_agreement", doc_type: null, removed_at: "2026-01-01", active_version: 1 }]).length).toBe(2);
  });
});
