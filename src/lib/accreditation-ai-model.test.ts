import { describe, expect, it } from "vitest";
import { criteriaFor, deriveVerdict, overallVerdict } from "./accreditation-ai-model";

const met = (label = "x") => ({ label, status: "met" as const, note: "" });

describe("accreditation AI verdict", () => {
  it("all criteria met and no warnings reads as looks complete", () => {
    expect(deriveVerdict("looks_complete", [met(), met()], [])).toBe("looks_complete");
  });
  it("any warning sign blocks looks complete", () => {
    expect(deriveVerdict("looks_complete", [met()], ["Name differs"])).toBe("needs_review");
  });
  it("any unmet criterion blocks looks complete", () => {
    expect(deriveVerdict("looks_complete", [met(), { label: "y", status: "not_met", note: "" }], [])).toBe("needs_review");
  });
  it("nothing met reads as mismatch", () => {
    expect(deriveVerdict("needs_review", [{ label: "y", status: "not_met", note: "" }], [])).toBe("mismatch");
  });
  it("no criteria never reads as complete", () => {
    expect(deriveVerdict("looks_complete", [], [])).toBe("needs_review");
  });
  it("missing result shows unavailable, worst document wins", () => {
    expect(overallVerdict([])).toBe("unavailable");
    expect(overallVerdict(["looks_complete", "needs_review"])).toBe("needs_review");
  });
  it("letter criteria include the 90-day date", () => {
    expect(criteriaFor("third_party_letter").join(" ")).toMatch(/90 days/);
  });
});
