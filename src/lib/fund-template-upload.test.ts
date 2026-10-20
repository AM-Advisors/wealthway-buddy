import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ staff: true, writes: [] as { table: string; value: any }[], failUpload: false }));
vi.mock("@/lib/fund-setup.server", () => ({ setupActor: async () => ({ isStaff: state.staff }), forbid: (message: string) => { throw new Error(message); } }));
vi.mock("@/lib/upload-validation", () => ({ validateUpload: (bytes: Uint8Array, name: string) => { if (!name.endsWith(".docx") && !name.endsWith(".pdf")) throw new Error("Unsupported file"); if (!bytes.length) throw new Error("Empty file"); return { contentType: "application/pdf" }; } }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    const q: any = {
      insert: (value: any) => { state.writes.push({ table, value }); return q; },
      update: (value: any) => { state.writes.push({ table, value }); return q; },
      eq: () => q, select: () => q, order: () => q, limit: () => q,
      single: async () => ({ data: { id: "template-1" }, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: any) => resolve({ data: null, error: null }),
    };
    return q;
  },
  storage: { from: () => ({ upload: async () => ({ error: state.failUpload ? { message: "Unavailable" } : null }) }) },
} }));

import { createUploadedTemplate } from "./fund-doc-templates.server";
const input = { title: "Debt fund PPM", category: "ppm" as const, fundTypes: ["Private credit"], fileName: "credit.docx", base64: "UEsDBA==" };
beforeEach(() => Object.assign(state, { staff: true, writes: [], failUpload: false }));
it("creates an assigned debt template without approving it", async () => {
  await expect(createUploadedTemplate("staff", input)).resolves.toEqual({ id: "template-1", version: 1 });
  expect(state.writes[0].value.fund_types).toEqual(["Private credit"]);
  const version = state.writes.find((x) => x.table === "document_template_versions");
  expect(version?.value.version).toBe(1);
  expect(version?.value.status).toBeUndefined(); // Database default remains pending_approval.
});
it("does not allow a fund manager to upload library templates", async () => {
  state.staff = false;
  await expect(createUploadedTemplate("manager", input)).rejects.toThrow("only Harmonious");
  expect(state.writes).toEqual([]);
});
it("rejects unsupported files before creating metadata", async () => {
  await expect(createUploadedTemplate("staff", { ...input, fileName: "credit.exe" })).rejects.toThrow("Unsupported");
  expect(state.writes).toEqual([]);
});
it("archives failed uploads rather than showing an empty usable template", async () => {
  state.failUpload = true;
  await expect(createUploadedTemplate("staff", input)).rejects.toThrow("Upload failed");
  expect(state.writes.some((x) => x.table === "document_templates" && x.value.archived_at)).toBe(true);
  expect(state.writes.some((x) => x.table === "document_template_versions")).toBe(false);
});