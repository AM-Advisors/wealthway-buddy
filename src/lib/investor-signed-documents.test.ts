import { describe, expect, it } from "vitest";
import { investorSignedCopy, investorSignedDocuments } from "./investor-signed-documents.server";

function database(overrides: Record<string, any> = {}) {
  const tables: Record<string, any[]> = {
    investor_onboardings: [{ id: "investment", investor_user_id: "owner", application_id: "application", executed_snapshot: { submitted: true }, removed_at: null }],
    document_signatures: [
      { id: "signed", application_id: "application", offering_document_id: "document", signature_template_version: 3, snapshot_version: 2, provider: "esign", provider_status: "completed", provider_completed_at: "2026-10-21T14:00:00Z", pdf_path: "private/signed.pdf" },
      { id: "pending", application_id: "application", offering_document_id: "document", provider: "esign", provider_status: "sent", signed_at: "2026-10-20" },
      { id: "other", application_id: "other-application", provider_status: "completed", pdf_path: "other.pdf" },
    ],
    offering_documents: [{ id: "document", title: "Subscription Agreement" }],
    ...overrides,
  };
  return { from(table: string) {
    let rows = tables[table] ?? [];
    const query: any = { select: () => query, order: () => query,
      eq: (key: string, value: unknown) => { rows = rows.filter((r) => r[key] === value); return query; },
      in: (key: string, values: unknown[]) => { rows = rows.filter((r) => values.includes(r[key])); return query; },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: any) => resolve({ data: rows, error: null }),
    }; return query;
  }, storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://example.test/private-copy" }, error: null }) }) } };
}
describe("investor submitted signed copies", () => {
  it("shows the recorded signed version, not the current fund template", async () => {
    expect(await investorSignedDocuments(database(), "owner", "investment")).toEqual([{ id: "signed", title: "Subscription Agreement", version: 3, snapshotVersion: 2, signedAt: "2026-10-21T14:00:00Z", hasCopy: true, replaced: false }]);
  });
  it("does not expose signed copies before submission", async () => {
    expect(await investorSignedDocuments(database({ investor_onboardings: [{ id: "investment", investor_user_id: "owner", application_id: "application", executed_snapshot: null }] }), "owner", "investment")).toEqual([]);
  });
  it("refuses any other account, including staff", async () => {
    await expect(investorSignedDocuments(database(), "staff", "investment")).rejects.toThrow("not available to this account");
  });
  it("downloads only a completed copy belonging to the submitted investment", async () => {
    await expect(investorSignedCopy(database(), "owner", { onboardingId: "investment", signatureId: "other" })).rejects.toThrow("not available for this investment");
    expect(await investorSignedCopy(database(), "owner", { onboardingId: "investment", signatureId: "signed" })).toEqual({ url: "https://example.test/private-copy" });
  });
  it("preserves prior completed signed versions marked replaced", async () => {
    const docs = await investorSignedDocuments(database({ document_signatures: [{ id: "old", application_id: "application", offering_document_id: "document", signature_template_version: 1, provider_status: "completed", pdf_path: "old.pdf", superseded_by: "new" }] }), "owner", "investment");
    expect(docs[0]?.version).toBe(1); expect(docs[0]?.replaced).toBe(true);
  });
});