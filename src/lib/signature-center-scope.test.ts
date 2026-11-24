import { describe, expect, it, vi } from "vitest";

const records: Record<string, Record<string, unknown>[]> = {
  fund_file_signatures: [{ id: "laasy-signer", file_id: "laasy-file", offering_id: "laasy", signer_user_id: "viewer", signer_role: "investor", signer_name: "Fictional Investor", status: "sent", signing_order: 1 }],
  fund_files: [{ id: "laasy-file", title: "Subscription Agreement" }],
  investor_onboardings: [
    { id: "laasy-investment", offering_id: "laasy", investor_user_id: "viewer", stage: "signature", application_id: "laasy-app" },
    { id: "laasy-not-started", offering_id: "laasy", investor_user_id: "viewer", stage: "signature", application_id: "laasy-new-app" },
  ],
  document_signatures: [{ id: "laasy-subscription", application_id: "laasy-app", offering_document_id: "laasy-doc" }],
  document_signature_signers: [{ id: "laasy-sub-signer", signature_id: "laasy-subscription", signer_user_id: "viewer", role_key: "investor", status: "sent", required: true }],
  offering_documents: [{ id: "laasy-doc", title: "Subscription Agreement", doc_type: "subscription_agreement" }],
  offerings: [{ id: "laasy", name: "Corps LaaSy" }, { id: "upper90", name: "Upper90" }],
};

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      let rows = [...(records[table] ?? [])];
      const query = {
        select: () => query,
        order: () => query,
        limit: () => query,
        eq: (key: string, value: unknown) => { rows = rows.filter((r) => r[key] === value); return query; },
        neq: (key: string, value: unknown) => { rows = rows.filter((r) => r[key] !== value); return query; },
        is: (key: string, value: unknown) => { rows = rows.filter((r) => (r[key] ?? null) === value); return query; },
        in: (key: string, values: unknown[]) => { rows = rows.filter((r) => values.includes(r[key])); return query; },
        then: (resolve: (result: { data: Record<string, unknown>[] }) => unknown) => Promise.resolve(resolve({ data: rows })),
      };
      return query;
    },
  },
}));
vi.mock("@/lib/fund-tabs.server", () => ({ isStaff: async () => true }));
vi.mock("@/lib/signing-reminder.server", () => ({ lastRemindersByKeys: async () => ({}) }));

import { loadSignatureCenter } from "./signature-center.server";

describe("fund-specific signature reader", () => {
  const viewer = { userId: "viewer", email: null };
  it("does not return the viewer's LaaSy file or subscription requests for Upper90", async () => {
    const result = await loadSignatureCenter(viewer, { offeringId: "upper90" });
    expect(result.items).toEqual([]);
    expect(result.funds).toEqual([]);
  });
  it("keeps those requests on LaaSy and in the all-fund view", async () => {
    const fund = await loadSignatureCenter(viewer, { offeringId: "laasy" });
    expect(fund.items.map((r) => r.source).sort()).toEqual(["fund_file", "subscription", "subscription_not_started"]);
    expect(fund.items.every((r) => r.offeringId === "laasy")).toBe(true);
    const all = await loadSignatureCenter(viewer, { everything: true });
    expect(all.items.map((r) => r.id).sort()).toEqual(fund.items.map((r) => r.id).sort());
  });
});