import { describe, expect, it } from "vitest";
import { filterDiagnostic, diagnosticText } from "./diagnostic-filter";

describe("recursive diagnostic filtering", () => {
  it("withholds nested bank and tax identifiers across arrays", () => {
    expect(filterDiagnostic({ rows: [{ status: "approved", bank_account: "123456789", tax_id: "123-45-6789", routing_number: "987654321" }] })).toEqual({ rows: [{ status: "approved", bank_account: "[withheld]", tax_id: "[withheld]", routing_number: "[withheld]" }] });
  });
  it("withholds credentials, contact details and unrestricted free text", () => {
    const result = diagnosticText({ status: "complete", nested: { access_token: "secret-value", email: "private@example.test", note: "unrestricted private text", unknown: "unexpected sensitive text" } });
    expect(result).not.toContain("secret-value");
    expect(result).not.toContain("private@example.test");
    expect(result).not.toContain("unrestricted private text");
    expect(result).not.toContain("unexpected sensitive text");
    expect(result).toContain("complete");
  });
  it("withholds identifiers embedded in otherwise allowed labels", () => {
    expect(diagnosticText("person@example.test", "name")).toBe("[withheld]");
    expect(diagnosticText("bearer private-key", "status")).toBe("[withheld]");
    expect(diagnosticText("123-45-6789", "label")).toBe("[withheld]");
  });
  it("retains safe structured facts without mutating originals", () => {
    const input = { amount_cents: 1500, qualifies: true, status: "approved", note: "private" };
    expect(filterDiagnostic(input)).toEqual({ amount_cents: 1500, qualifies: true, status: "approved", note: "[withheld]" });
    expect(input.note).toBe("private");
  });
  it("handles cycles and bounds diagnostic arrays", () => {
    const cycle: Record<string, unknown> = { status: "approved" }; cycle.self = cycle;
    expect(diagnosticText(cycle)).toContain("[withheld]");
    expect((filterDiagnostic(Array.from({ length: 60 }, () => ({ status: "ok" }))) as unknown[]).length).toBe(50);
  });
});