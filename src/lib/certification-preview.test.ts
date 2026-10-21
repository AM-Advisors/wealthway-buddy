import { describe, expect, it } from "vitest";
import { certificationPreview } from "./certification-preview";

const row = (key: string, status: string, version = 1) => ({ id: `${key}-${version}`, requirement_key: `certification:${key}`, title: key, wording: `${key} v${version}`, version, status, effective_date: "2026-01-01" });
const rows = [row("accuracy", "approved"), row("accuracy", "draft", 2), row("electronic_records", "approved"), row("privacy_terms", "draft"), row("authority_capacity", "approved")];

describe("certification preview", () => {
  it("individuals see three statements, businesses four", () => {
    const p = certificationPreview({ rows, today: "2026-10-21", includeDrafts: false, offeringRepresentations: false });
    expect(p.find((x) => x.key === "individual")!.statements.map((s) => s.key)).toEqual(["accuracy", "electronic_records", "privacy_terms"]);
    expect(p.find((x) => x.key === "entity")!.statements.map((s) => s.key)).toEqual(["accuracy", "authority_capacity", "electronic_records", "privacy_terms"]);
  });

  it("approved-only view marks unapproved statements missing and blocks", () => {
    const ind = certificationPreview({ rows, today: "2026-10-21", includeDrafts: false, offeringRepresentations: false })[0]!;
    expect(ind.statements.find((s) => s.key === "privacy_terms")!.source).toBe("missing");
    expect(ind.statements.find((s) => s.key === "accuracy")!.wording).toBe("accuracy v1");
    expect(ind.blocked).toBe(true);
  });

  it("draft preview shows the newer draft wording", () => {
    const ind = certificationPreview({ rows, today: "2026-10-21", includeDrafts: true, offeringRepresentations: false })[0]!;
    expect(ind.statements.find((s) => s.key === "accuracy")!.wording).toBe("accuracy v2");
    expect(ind.blocked).toBe(false);
  });

  it("offering representations adds a statement for every type", () => {
    const p = certificationPreview({ rows, today: "2026-10-21", includeDrafts: true, offeringRepresentations: true });
    expect(p.every((t) => t.statements.some((s) => s.key === "offering_representations"))).toBe(true);
  });
});
