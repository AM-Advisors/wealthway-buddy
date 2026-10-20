import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/fund-setup.server", () => ({ setupActor: vi.fn(), forbid: vi.fn() }));
import { approvedForSigning } from "@/lib/investor-document-review.server";

function fixture(options: { source?: string; manager?: boolean; decision?: string; version?: number; docFund?: string; errorTable?: string } = {}) {
  const rows: Record<string, unknown> = {
    investor_onboardings: { id: "calvin", offering_id: "erebor", entry_source: options.source ?? "fund_manager", created_by: "dustin" },
    offering_documents: { offering_id: options.docFund ?? "erebor", active_version: 2, requires_signature: true },
    investor_document_approvals: options.decision ? [{ onboarding_id: "calvin", offering_document_id: "subscription", version: options.version ?? 2, decision: options.decision }] : [],
    fund_managers: options.manager === false ? null : { user_id: "dustin" },
  };
  return { from(table: string) {
    const result = { data: rows[table], error: options.errorTable === table ? { message: "unavailable" } : null };
    const chain: any = { select: () => chain, eq: () => chain, is: () => chain, maybeSingle: async () => result, order: async () => result };
    return chain;
  } };
}

describe("manager-added subscription admission", () => {
  it("allows Calvin's manager-added Erebor subscription without duplicate approval", async () => {
    expect(await approvedForSigning(fixture(), "application", "subscription")).toBe(true);
  });
  it("does not grant admission to investor-created records", async () => {
    expect(await approvedForSigning(fixture({ source: "investor" }), "application", "subscription")).toBe(false);
  });
  it("requires the creator to manage the exact fund", async () => {
    expect(await approvedForSigning(fixture({ manager: false }), "application", "subscription")).toBe(false);
  });
  it("refuses documents from a different fund", async () => {
    expect(await approvedForSigning(fixture({ docFund: "other" }), "application", "subscription")).toBe(false);
  });
  it("honors an explicit return for the current version", async () => {
    expect(await approvedForSigning(fixture({ decision: "returned" }), "application", "subscription")).toBe(false);
  });
  it("preserves explicit approval for self-entered investors", async () => {
    expect(await approvedForSigning(fixture({ source: "investor", decision: "approved" }), "application", "subscription")).toBe(true);
  });
  it("never carries an old approval to a new version for self-entered investors", async () => {
    expect(await approvedForSigning(fixture({ source: "investor", decision: "approved", version: 1 }), "application", "subscription")).toBe(false);
  });
  it("fails closed rather than overriding an unreadable return decision", async () => {
    await expect(approvedForSigning(fixture({ errorTable: "investor_document_approvals" }), "application", "subscription")).rejects.toThrow("could not be checked");
  });
});