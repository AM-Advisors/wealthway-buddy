import { beforeEach, expect, it, vi } from "vitest";
import JSZip from "jszip";

const state = vi.hoisted(() => ({ type: "Private equity", approved: true, archived: false, legalName: "Synthetic Equity LP", gp: null as string | null, output: null as Uint8Array | null, activated: 0, created: 0, feeStatus: "", feeError: false, fixedTerms: false }));
vi.mock("@/lib/fund-setup.server", () => ({ setupActor: async () => ({ isStaff: true, offeringIds: [] }), forbid: (m: string) => { throw new Error(m); } }));
vi.mock("@/lib/offering-document-setup.server", () => ({
  createSetupDocument: async () => { state.created++; return { id: "document" }; },
  uploadDocumentVersion: async () => ({ version: 1 }),
  activateDocumentVersion: async () => { state.activated++; },
  saveSigningConfig: async () => ({}), setDocumentUsage: async () => ({}),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    const rows: Record<string, unknown> = {
      document_templates: { id: "template", title: "Equity fund terms", category: "ppm", fund_types: ["Private equity"], archived_at: state.archived ? "2026-01-01" : null },
      document_template_versions: { version: 1, status: state.approved ? "approved" : "pending_approval", file_name: "model.docx", file_path: "model.docx" },
      offerings: { fund_type: state.type, name: "Display name", legal_entity_name: state.legalName, gp_entity_name: state.gp },
      offering_documents: { active_version: null, usage: "reference" },
      fund_fee_terms: { management_fee_pct: 6, management_fee_basis: "Committed capital", carry_pct: 15, hurdle_pct: null },
    };
    const q: any = { select: () => q, eq: (key: string, value: string) => { if (table === "fund_fee_terms" && key === "status") state.feeStatus = value; return q; }, in: () => q, order: () => q, limit: () => q, insert: () => q, maybeSingle: async () => ({ data: rows[table] ?? null, error: table === "fund_fee_terms" && state.feeError ? { code: "read_failed" } : null }), then: (resolve: (x: unknown) => void) => resolve({ data: null, error: null }) };
    return q;
  },
  storage: { from: () => ({
    download: async () => {
      const zip = new JSZip();
      zip.file("word/document.xml", `<w:document><w:p><w:r><w:t>{{Fund Legal Name}} [name of general partner]${state.fixedTerms ? ' The Manager will not receive a management fee.' : ''}</w:t></w:r></w:p></w:document>`);
      const bytes = await zip.generateAsync({ type: "uint8array" });
      return { data: { arrayBuffer: async () => bytes.buffer }, error: null };
    },
    upload: async (_path: string, bytes: Uint8Array) => { state.output = bytes; return { error: null }; },
  }) },
} }));

import { fundTemplateValues, useTemplateInFund } from "./fund-doc-templates.server";
const input = { templateId: "template", version: 1, offeringId: "fund" };
beforeEach(() => Object.assign(state, { type: "Private equity", approved: true, archived: false, legalName: "Synthetic Equity LP", gp: null, output: null, activated: 0, created: 0, feeStatus: "", feeError: false, fixedTerms: false }));
it("generates from canonical legal name and reads the saved synthetic file back without publishing unresolved terms", async () => {
  const r = await useTemplateInFund("staff", input);
  expect(r.autofill?.filled).toEqual(["Fund Legal Name"]);
  expect(r.autofill?.open).toContain("name of general partner");
  if (!state.output) throw new Error("No generated file");
  const saved = await JSZip.loadAsync(state.output);
  expect(await saved.file("word/document.xml")?.async("string")).toContain("Synthetic Equity LP");
  expect(state.activated).toBe(0);
});
it("rejects an equity template for a debt fund before creating a document", async () => {
  state.type = "Private credit";
  await expect(useTemplateInFund("staff", input)).rejects.toThrow("not assigned");
  expect(state.created).toBe(0);
});
it("rejects a pending legal model before creating a document", async () => {
  state.approved = false;
  await expect(useTemplateInFund("staff", input)).rejects.toThrow("Only an approved");
  expect(state.created).toBe(0);
});
it("rejects archived templates before generation", async () => {
  state.archived = true;
  await expect(useTemplateInFund("staff", input)).rejects.toThrow("Template not found");
  expect(state.created).toBe(0);
});
it("reads only active fee terms and includes the recorded management fee basis", async () => {
  const values = await fundTemplateValues("fund");
  expect(state.feeStatus).toBe("active");
  expect(values["Management Fee"]).toBe("6%");
  expect(values["Carry Percent"]).toBe("15%");
  expect(values["Management Fee Basis"]).toBe("Committed capital");
  expect(values["Investor Subscription Amount"]).toBeNull();
});
it("does not generate documents from a failed fee-term read", async () => {
  state.feeError = true;
  await expect(useTemplateInFund("staff", input)).rejects.toThrow("Could not load the recorded parties or fee terms");
  expect(state.output).toBeNull();
  expect(state.activated).toBe(0);
});
it("does not automatically activate a template with a fixed no-fee clause", async () => {
  state.gp = "Example GP LLC";
  state.fixedTerms = true;
  const result = await useTemplateInFund("staff", input);
  expect(result.autofill?.open).toContain("Review: fixed no-management-fee clause conflicts with the recorded management fee");
  expect(state.activated).toBe(0);
});