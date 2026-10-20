import { describe, expect, it } from "vitest";
import { documentReadSource } from "./offering-document-reader";

const doc = { body: "", file_path: "old.docx", active_version: 2 };
const versions = [1, 2, 3].map((version) => ({ id: `v${version}`, version, file_path: `agreement-v${version}.docx`, file_name: `agreement-v${version}.docx`, target_onboarding_id: null as string | null, rollout_scope: "new_only" }));
describe("authoritative offering document reading", () => {
  it("reads the active uploaded Word file instead of its empty body or latest draft", () => {
    expect(documentReadSource(doc, versions, "investor", null)).toEqual({ kind: "file", path: "agreement-v2.docx", filename: "agreement-v2.docx" });
  });
  it("keeps a sent investor on the pinned version", () => {
    expect(documentReadSource(doc, versions, "investor", "v1")).toMatchObject({ path: "agreement-v1.docx" });
  });
  it("uses only that investor's individual version", () => {
    const individual = { id: "v3", version: 3, file_path: "agreement-v3.docx", file_name: "agreement-v3.docx", target_onboarding_id: "other", rollout_scope: "single" };
    expect(documentReadSource(doc, [...versions.slice(0, 2), individual], "investor", null)).toMatchObject({ path: "agreement-v2.docx" });
    expect(documentReadSource(doc, [...versions.slice(0, 2), individual], "other", null)).toMatchObject({ path: "agreement-v3.docx" });
  });
  it("never exposes an unactivated PPM upload", () => {
    expect(() => documentReadSource({ ...doc, active_version: null }, versions, "investor", null)).toThrow("activate a version");
  });
  it("does not fabricate a blank PDF when an active file is missing", () => {
    expect(() => documentReadSource(doc, [], null, null)).toThrow("active document file");
  });
  it("preserves legacy text documents and uploaded files", () => {
    expect(documentReadSource({ body: "PPM text", file_path: null, active_version: null }, [], null, null)).toEqual({ kind: "text", body: "PPM text" });
    expect(documentReadSource({ ...doc, active_version: null }, [], null, null)).toMatchObject({ kind: "file", path: "old.docx" });
  });
  it("reports an absent document rather than marking empty text reviewed", () => {
    expect(() => documentReadSource({ body: "", file_path: null, active_version: null }, [], null, null)).toThrow("not been uploaded");
  });
});