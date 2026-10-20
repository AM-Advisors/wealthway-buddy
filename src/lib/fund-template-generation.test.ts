import { beforeEach, expect, it, vi } from "vitest";
import JSZip from "jszip";

const state = vi.hoisted(() => ({ type: "Private equity", approved: true, archived: false, legalName: "Synthetic Equity LP", gp: null as string | null, output: null as Uint8Array | null, activated: 0, created: 0 }));
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
    };
    const q: any = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, insert: () => q, maybeSingle: async () => ({ data: rows[table] ?? null, error: null }), then: (resolve: (x: unknown) => void) => resolve({ data: null, error: null }) };
    return q;
  },
  storage: { from: () => ({
    download: async () => {
      const zip = new JSZip();
      zip.file("word/document.xml", '<w:document><w:p><w:r><w:t>{{Fund Legal Name}} [name of general partner]</w:t></w:r></w:p></w:document>');
      const bytes = await zip.generateAsync({ type: "uint8array" });
      return { data: { arrayBuffer: async () => bytes.buffer }, error: null };
    },
    upload: async (_path: string, bytes: Uint8Array) => { state.output = bytes; return { error: null }; },
  }) },
} }));

import { useTemplateInFund } from "./fund-doc-templates.server";
const input = { templateId: "template", version: 1, offeringId: "fund" };
beforeEach(() => Object.assign(state, { type: "Private equity", approved: true, archived: false, legalName: "Synthetic Equity LP", gp: null, output: null, activated: 0, created: 0 }));
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