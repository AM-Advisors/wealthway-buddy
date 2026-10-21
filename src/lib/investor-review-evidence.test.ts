import { describe, expect, it, vi } from "vitest";
import { investorReviewEvidence, managerInvestorSignedCopy } from "./investor-review-evidence.server";

function fixture(overrides: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = {
    user_roles: [], fund_managers: [{ id: "manager", user_id: "manager", offering_id: "fund" }],
    investor_onboardings: [{ id: "investment", offering_id: "fund", application_id: "application", executed_snapshot: {}, questionnaire_version: 1, questionnaire_submitted_at: "2026-10-21", questionnaire_responses: { name: "Synthetic investor", parent: "No", child: "Hidden answer", tax_id: "private", unknown: "not projected" } }],
    offering_questionnaires: [{ offering_id: "fund", version: 1, questions: [{ key: "name", label: "Subscriber name", type: "text" }, { key: "parent", label: "Parent answer", type: "text" }, { key: "child", label: "Conditional answer", type: "text", showWhen: { key: "parent", equals: ["Yes"] } }, { key: "tax_id", label: "Taxpayer ID", type: "text" }] }],
    document_signatures: [{ id: "signature", application_id: "application", offering_document_id: "subscription", signature_template_version: 3, provider: "esign", provider_status: "completed", provider_completed_at: "2026-10-21", pdf_path: "signed.pdf" }, { id: "other-signature", application_id: "another-application", provider_status: "completed", pdf_path: "other.pdf" }],
    offering_documents: [{ id: "subscription", title: "Subscription Agreement" }, { id: "ppm", title: "PPM" }],
    investment_document_acknowledgments: [{ id: "ack", onboarding_id: "investment", offering_document_id: "ppm", version: 1, acknowledged_at: "2026-10-21" }],
    ...overrides,
  };
  const download = vi.fn(async () => ({ data: { signedUrl: "https://synthetic.test/signed-copy" }, error: null }));
  const db = { from(table: string) {
    let rows = tables[table] ?? [];
    const query: any = { select: () => query, order: () => query,
      eq: (key: string, value: unknown) => { rows = rows.filter((r) => r[key] === value); return query; },
      in: (key: string, values: unknown[]) => { rows = rows.filter((r) => values.includes(r[key])); return query; },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: any) => resolve({ data: rows, error: null }),
    }; return query;
  }, storage: { from: () => ({ createSignedUrl: download }) } };
  return { db, download };
}

describe("private investor review evidence", () => {
  it("shows the submitted questionnaire, signed version and acknowledgment to the exact fund manager", async () => {
    const evidence = await investorReviewEvidence(fixture().db, "manager", "fund", "investment");
    expect(evidence?.signedDocuments[0]?.version).toBe(3);
    expect(evidence?.acknowledgments[0]?.title).toBe("PPM");
    expect(evidence?.questionnaire).toEqual([{ key: "name", label: "Subscriber name", answer: "Synthetic investor" }, { key: "parent", label: "Parent answer", answer: "No" }]);
  });
  it("does not grant private review access through general client fund membership", async () => {
    expect(await investorReviewEvidence(fixture().db, "client-member", "fund", "investment")).toBeNull();
  });
  it("does not grant another fund's manager access", async () => {
    expect(await investorReviewEvidence(fixture().db, "manager", "another-fund", "investment")).toBeNull();
  });
  it("refuses an investment outside the authorized fund", async () => {
    const { db } = fixture({ investor_onboardings: [{ id: "investment", offering_id: "other-fund" }] });
    await expect(investorReviewEvidence(db, "manager", "fund", "investment")).rejects.toThrow("not available in this fund");
  });
  it("does not present draft answers or pre-submission signed copies as submitted", async () => {
    const { db } = fixture({ investor_onboardings: [{ id: "investment", offering_id: "fund", application_id: "application", executed_snapshot: null, questionnaire_submitted_at: null }] });
    const evidence = await investorReviewEvidence(db, "manager", "fund", "investment");
    expect(evidence?.questionnaire).toEqual([]);
    expect(evidence?.signedDocuments).toEqual([]);
  });
  it("downloads only the selected investment's completed copy for an authorized manager", async () => {
    const { db, download } = fixture();
    await expect(managerInvestorSignedCopy(db, "manager", { fundId: "fund", onboardingId: "investment", signatureId: "other-signature" })).rejects.toThrow("not available");
    expect(download).not.toHaveBeenCalled();
    expect(await managerInvestorSignedCopy(db, "manager", { fundId: "fund", onboardingId: "investment", signatureId: "signature" })).toEqual({ url: "https://synthetic.test/signed-copy" });
    expect(download).toHaveBeenCalledWith("signed.pdf", 300, { download: true });
  });
});
import { currentTaxForms } from "./investor-review-evidence.server";
describe("manager tax form list", () => {
  it("shows the latest certified W-9 and drops expired W-8s", () => {
    const out = currentTaxForms([
      { id: "a", form_type: "w9", certified_at: "2026-10-20", document_path: "p" },
      { id: "b", form_type: "w9", certified_at: "2026-01-01", document_path: "p" },
      { id: "c", form_type: "w8ben", certified_at: "2020-01-01", expires_on: "2023-12-31", document_path: "p" },
    ], "2026-10-21");
    expect(out.map((f) => [f.id, f.label])).toEqual([["a", "W-9"]]);
    expect(out[0]).not.toHaveProperty("document_path");
  });
});
