import { describe, expect, it } from "vitest";
import { archivedApplicability } from "./archived-document-applicability";

const docs = [
  { id: "oa", title: "Operating Agreement", active_version: 3, removed_at: null, removed_reason: null },
  { id: "gp", title: "GP Operating Agreement", active_version: 1, removed_at: "2026-02-01", removed_reason: "Not needed" },
];
const versions = [
  { offering_document_id: "oa", version: 2, file_name: "oa2.pdf", created_at: "2026-01-01", superseded_at: "2026-03-01" },
  { offering_document_id: "oa", version: 3, file_name: "oa3.pdf", created_at: "2026-03-01", superseded_at: null },
  { offering_document_id: "gp", version: 1, file_name: "gp.pdf", created_at: "2026-01-01", superseded_at: null },
];

describe("archived document applicability", () => {
  it("lists investors who signed an earlier version", () => {
    const r = archivedApplicability(docs, versions, [{ offering_document_id: "oa", version: 2, onboarding_id: "ob1", at: "2026-01-05", kind: "signed" }], { ob1: "John Doe" });
    const v2 = r.find((x) => x.documentId === "oa")!;
    expect(v2.version).toBe(2);
    expect(v2.replacedBy).toBe(3);
    expect(v2.investors.map((i) => i.name)).toEqual(["John Doe"]);
  });
  it("excludes the active version and shows no investors for unsigned archived docs", () => {
    const r = archivedApplicability(docs, versions, [{ offering_document_id: "oa", version: 3, onboarding_id: "ob1", at: null, kind: "signed" }], {});
    expect(r.some((x) => x.documentId === "oa" && x.version === 3)).toBe(false);
    expect(r.find((x) => x.documentId === "gp")!.investors).toEqual([]);
  });
});
